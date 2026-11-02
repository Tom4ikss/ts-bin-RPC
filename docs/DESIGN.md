# ts-bin-rpc: дизайн и архитектура

Статус: черновик v0, согласован 2026-11-02. Рабочее имя `ts-bin-rpc` (на npm свободно), CLI `tbr`.
Финальное имя выбирается перед публикацией.

Основания для решений: [исследование](../reports/Обзор%20TS%20RPC%20и%20бинарных%20форматов.md),
[замеры](../README.md), [спайк TS 7.1](../spikes/ts71/).

## 1. Цели и не-цели

**Цели**

1. **Code-first.** Контракт — обычные TS-интерфейсы и роутер из обычных async-функций. Без IDL, без
   схем-валидаторов, без цепочек билдеров.
2. **DX уровня tRPC.** Типы клиента выводятся из `typeof appRouter`: автокомплит, переход к
   определению и переименование работают сквозь клиент и сервер без шага сборки.
3. **Бинарный формат везде.** Ленивые views на клиенте, колонки `TypedArray` без копирования,
   верификация недоверенного входа на сервере.
4. **Эволюция схемы с первого релиза.** Lockfile со стабильными ID полей и проверка совместимости
   в CI.
5. **Работа в любом рантайме и сборщике.** Сервер на Fetch API (Node, Bun, Deno, Workers), клиент —
   обычный `.ts`, который не требует плагинов сборщика.

**Не-цели alpha**

- Паритет с tRPC по экосистеме: TanStack Query, подписки, батчинг, цепочки мидлваров. Это пост-alpha.
- Клиенты на других языках, экспорт в `.fbs` или Arrow.
- Совместимость по байтам с FlatBuffers.
- Победа над `JSON.parse` на строковых данных любой ценой. Цель — паритет по размеру после
  сжатия (см. §11) и выигрыш на числах и частичном чтении.

## 2. Как это выглядит для пользователя

**Типы**

```ts
// shared/types.ts
import type { u32, f32, u64 } from 'ts-bin-rpc';

export interface User {
  id: u32;
  name: string;
  email?: string;
  role: 'admin' | 'user';
  createdAt: Date;
  balance: u64;
}

// Колонки объявляются явно: что объявлено, то и приходит.
export interface Series {
  t: Float64Array;
  value: Float32Array;
}
```

**Сервер**

```ts
// server/router.ts
import type { Ctx } from './ctx';

export const appRouter = {
  user: {
    get: async (input: { id: u32 }, ctx: Ctx): Promise<User> => ctx.db.users.get(input.id),
    list: async (input: { limit: u32; cursor?: string }, ctx: Ctx): Promise<User[]> => ...,
  },
  metrics: {
    series: async (input: { from: Date; to: Date }): Promise<Series> => ...,
  },
};
export type AppRouter = typeof appRouter;

// server/main.ts
import { createHandler } from 'ts-bin-rpc/server';
import { serverCodecs } from './generated/server';

const handler = createHandler(appRouter, {
  codecs: serverCodecs,
  prefix: '/rpc',
  context: (req) => ({ db, user: auth(req) }),
});
// Bun.serve({ fetch: handler }) / Deno.serve(handler) / export default { fetch: handler }
```

**Клиент**

```ts
import { createClient } from 'ts-bin-rpc/client';
import { clientCodecs } from '../server/generated/client';
import type { AppRouter } from '../server/router';

const api = createClient<AppRouter>({ url: '/rpc', codecs: clientCodecs });

const user = await api.user.get({ id: 1 });   // ctx в сигнатуре клиента нет; user: User,
                                              // строки декодируются при первом чтении
const s = await api.metrics.series({ from, to });
uplot.setData([s.t, s.value]);                 // Float64Array/Float32Array поверх ответа, без копирования
```

**Кодоген**

```sh
tbr generate --watch     # src/server/router.ts#appRouter → src/server/generated/{client,server}.ts
tbr check                # CI: lockfile совместим с текущими типами
tbr decode resp.bin --proc user.get --response
```

## 3. Архитектура

```
 TS-исходники ──► TypeSource (TS 7.1 API) ──► Schema IR ──► Layout planner ◄──► tbr.lock.json
                                                                │
                                                                ▼
                                                            Emitters
                                         ┌──────────────────────┴──────────────────────┐
                                  generated/client.ts                          generated/server.ts
                                 encoders(in), views(out),              decoders+verifiers(in),
                                 verifiers(out, dev), proc table        encoders(out), proc table
                                         │                                             │
                                         ▼                                             ▼
                              ts-bin-rpc/client  ◄──── HTTP (Fetch) ────►  ts-bin-rpc/server
                                         └────────────── ts-bin-rpc (runtime) ─────────┘
```

**Пакеты**

| Пакет | Содержимое | Зависимости |
|---|---|---|
| `ts-bin-rpc` | runtime кодека (`/`), `/server`, `/client`, типы брендов | нет |
| `ts-bin-rpc-cli` | `tbr`: generate, check, decode, rename | `typescript@7.1` |

CLI ставится в devDependencies: в рантайм-зависимости пользователя TypeScript и Go-бинарь не попадают.
Сгенерированные файлы коммитятся. Это переживает смену сборщиков, работает при type stripping в
Node и Bun и не требует CLI в production-сборке.

## 4. Извлечение типов (TypeSource)

Узкий интерфейс поверх TS API, единственное место, которое знает про TypeScript:

```ts
interface TypeSource {
  loadRouter(file: string, exportName: string): RouterNode;   // процедуры с типами in/out
  describe(type: TypeHandle): TypeDescriptor;                 // классификация одного типа
}
```

- Бэкенд alpha — `typescript/sync` из 7.1 (спайк: процедуры извлекаются за ~80 ms, бренды, unions,
  опциональные поля видны). Запросы группируются через `api.batch()` и `.gen`-варианты, кэш по
  id типа.
- Запасной путь — бэкенд на `@typescript/typescript6`, если 7.1 упрётся в баги беты.
- Процедура = свойство роутера с call signature. Вход — тип первого параметра (или `void`), выход —
  аргумент `Promise<T>` возвращаемого типа. Второй параметр — `ctx`, в схему не попадает.
- Вложенные объекты без call signature — namespaces. Имя процедуры — путь через точку: `user.get`.

## 5. Модель типов (Schema IR)

**Бренды** экспортирует runtime:

```ts
declare const tbr: unique symbol;
export type u8  = number & { readonly [tbr]?: 'u8' };
// u16, u32, i8, i16, i32, f32, f64; u64 и i64 — поверх bigint
```

Опциональный символьный ключ не мешает писать `{ id: 1 }` и не всплывает в автокомплите. Бренд
определяется по значению литерала у свойства, ключ которого — символ из пакета `ts-bin-rpc`, а не по
имени алиаса: так он сохраняется через `type UserId = u32`. Диапазон (`-1` в `u32`) типами не
проверить, его проверяет кодировщик (§8).

**Поддерживаемые типы (alpha)**

| TS | IR | На проводе | На клиенте |
|---|---|---|---|
| `boolean` | bool | 1 байт | `boolean` |
| `number` (без бренда) | f64 | 8 байт | `number` |
| `u8`…`i32`, `f32`, `f64` | scalar | 1–8 байт | `number` |
| `u64`, `i64` | scalar64 | 8 байт | `bigint` |
| `string` | string | ссылка → heap | `string`, мемоизация |
| `Date` | timestamp | f64 мс | `Date`, мемоизация |
| `'a' \| 'b'` | enum | u8/u16, индекс из lockfile | литерал |
| `Uint8Array` | bytes | ссылка → heap | `subarray` без копирования |
| `Float32Array` и др. `TypedArray` | column | выровненный блок | `TypedArray` без копирования |
| `T[]` | vector | длина + элементы | настоящий `Array` |
| интерфейс / объектный литерал | table | vtable + поля | view |
| `T \| undefined`, `x?: T` | optional | отсутствие в vtable | `undefined` |
| `T \| null` | nullable | бит null | `null` |
| discriminated union | union | u8-тег + table варианта | view варианта |
| дженерики (`Page<User>`) | инстанс | как table | view |
| рекурсивные типы | table | через ссылки | view |

**Отвергаются с понятной ошибкой:** `any`, `unknown`, функции, классы с методами, `Map`/`Set` и
`Record<string, T>` (пост-alpha), кортежи (пост-alpha), unions без дискриминанта (кроме `null`,
`undefined` и литералов), индексные сигнатуры, `symbol`. Ошибка указывает на файл, строку и путь
поля: `User.meta: type 'unknown' is not serializable`.

Принцип: **что объявлено, то и приходит**. `f32[]` — это массив чисел: на проводе компактно, на
клиенте копия в `Array`. `Float32Array` — это колонка без копирования. Никакой подмены типов, иначе
выведенные типы клиента разойдутся с рантаймом.

## 6. Формат на проводе (v0)

Спецификация — [FORMAT.md](FORMAT.md), зафиксирована фазой 0. Главные решения:

- **Одиночный объект — row table с vtable** (в стиле FlatBuffers): ID поля из lockfile → смещение,
  0 = поля нет. Цена косвенности — 3–18% на полном чтении, эволюция схемы бесплатна.
- **Вектор объектов — колоночный** (в стиле Arrow): по колонке на поле, каталог колонок по ID поля.
  Числовые колонки читаются как `TypedArray`. На строковом CRUD это и единственный найденный способ
  стать меньше JSON после сжатия (на 7–20%), и не медленнее row tables.
- **Строки — в двух блоках на сообщение** (ASCII и UTF-16LE), каждый декодируется одним вызовом
  `TextDecoder`, поля берут `substring`. Это быстрее `JSON.parse` во всех трёх браузерах. Строковые
  колонки хранят длины и обратные ссылки на повторы, а не смещения.
- **Ошибки** кодируются фиксированным конвертом, который читается без схемы процедуры.
- **Struct** (замороженная раскладка без vtable) — пост-alpha.

Итог по скорости в браузерах (1000 юзеров, относительно `JSON.parse(bytes)`): полное чтение в
2.4–3.1 раза быстрее, частичное — в 4.2–8.2 раза, кодирование — в 1.5–2.1 раза
([layout.md](../bench/results/layout.md)).

## 7. Сгенерированный код

**Клиент** (`generated/client.ts`): кодировщики входов, views выходов, верификаторы выходов
(подключаются в dev), таблица процедур.

```ts
class UserView implements User {          // implements ловит устаревший кодоген (§9)
  #b: Buf; #o: number;
  #name: string | undefined = undefined;  // кэш-слоты создаются в конструкторе: одна hidden class
  get id(): u32 { return this.#b.u32(this.#o, F_ID) as u32; }
  get name(): string { return this.#name ??= this.#b.str(this.#o, F_NAME); }
  toJSON() { return toPlainUser(this); }
}
```

- Views неизменяемы: присваивание полю бросает `TypeError`.
- Вложенные views и строки мемоизируются, поэтому `user.pos === user.pos`.
- Вектор tables декодируется в настоящий `Array` из views (сами поля ленивые). Поэтому `map`,
  `filter`, spread массива, `Array.isArray` работают.
- `toPlain(value)` из `ts-bin-rpc/client` даёт глубокую копию из обычных объектов для spread
  объекта, `structuredClone`, RSC и мутаций. Spread самого view (`{...user}`) даёт пустой объект,
  это задокументированное ограничение.
- Опция процедуры `decode: 'eager'` отдаёт обычные объекты вместо views. Это выход для мест, где
  views мешают.

**Сервер** (`generated/server.ts`): верификаторы и eager-декодеры входов, кодировщики выходов,
таблица процедур. На сервере вход декодируется в обычные объекты после верификации: входы обычно
маленькие, а хендлеры и будущие мидлвары получают обычные данные, которые можно менять.

**Кодировщик:** растущий буфер, запись вперёд, строки через `TextEncoder.encodeInto`, ASCII-путь с
проверкой по символам. Генерируется специализированная функция на каждый тип: урок protobuf-es —
специализация важнее формата.

## 8. Верификация

Сервер верифицирует каждый вход, клиент — в dev-режиме (в production по опции).

Проверки:
- смещения и длины в пределах буфера;
- корректность vtable;
- UTF-8 строк (`TextDecoder` с `fatal: true`);
- индексы enum и теги union;
- лимит глубины (по умолчанию 64);
- **лимит суммарного числа элементов** против раздувания через повторное использование смещений.

Кодировщик проверяет диапазоны чисел: `-1` или `1.5` в `u32` дают ошибку в dev и ошибку
кодирования в production.

Ошибка верификации даёт ответ `400 BAD_INPUT` и не роняет процесс и соединение. Рантайм не
использует `eval` и `new Function`: код генерируется на этапе сборки, поэтому строгий CSP и Workers
работают.

## 9. Lockfile, эволюция и устаревший кодоген

`tbr.lock.json` коммитится, генерирует его `tbr generate`:

```json
{
  "format": 0,
  "types": {
    "User": { "fields": {
      "id":    { "id": 1, "kind": "u32" },
      "name":  { "id": 2, "kind": "string" },
      "phone": { "id": 3, "kind": "string", "retired": "2026-11-20" }
    } }
  },
  "enums": { "User.role": ["admin", "user"] }
}
```

Правила (из исследования форматов):
1. Lockfile только дописывается. ID удалённых полей помечаются `retired` и не переиспользуются.
2. Переименование — только явно: JSDoc `@renamedFrom oldName` на поле или `tbr rename User.old new`.
   Без этого переименование выглядит как удаление плюс добавление, и `check` на это ругается.
3. Смена типа поля — несовместимое изменение. Исключение — то, что не меняет байты (например,
   `u32` → `u32 | undefined`).
4. Значения enum только дописываются, их индексы фиксированы.
5. Новое обязательное поле для старых клиентов — отсутствующее. Клиент, собранный без него, его
   просто не видит.
6. `tbr check` сравнивает текущие типы с lockfile и падает на несовместимом изменении. Это шаг в CI.

**Устаревший кодоген ловится тремя слоями:**
1. `--watch` перегенерирует за доли секунды.
2. **На уровне типов:** сгенерированный код ссылается на исходные типы через `import type` и
   indexed access (`Parameters<AppRouter['user']['get']>[0]`). Views делают `implements User`, плюс
   проверка точного набора ключей и точного набора процедур. Добавил поле или процедуру и не
   перегенерировал — получаешь ошибку TS с подсказкой `run tbr generate`.
3. **В рантайме (dev):** клиент шлёт хеш схемы в заголовке `x-tbr-schema`. При расхождении сервер в
   dev отвечает понятной ошибкой, в production пишет предупреждение в лог и полагается на правила
   эволюции.

## 10. Протокол (HTTP, alpha)

- `POST {prefix}/{procedure}`, например `/rpc/user.get`. Имя процедуры остаётся в пути: это читаемо
  в Network tab, логах и роутинге CDN, а длина URL при HPACK ничего не стоит. Хеш-ID эндпоинтов из
  первоначального плана отброшен.
- Тело — сообщение (§6). `Content-Type: application/vnd.tbr` (имя рабочее).
- Ответ `200` — сообщение выхода. Ошибки — конверт ошибки с полями `code`, `message`, `data?` и
  HTTP-статусом:

  | Код | Статус |
  |---|---|
  | `BAD_INPUT` | 400 |
  | `NOT_FOUND` | 404 |
  | `UNAUTHORIZED` | 401 |
  | `SCHEMA_MISMATCH` | 409 |
  | `INTERNAL` | 500 |

- Пользовательские ошибки: `throw new RpcError('FORBIDDEN', 'msg', data)` в хендлере. На клиенте
  они превращаются в `RpcError` с тем же `code`.
- Сжатие отдаётся HTTP-слою: `Content-Encoding` ставит сервер или CDN, браузер распаковывает сам.
- Пост-alpha: GET для идемпотентных запросов (кэш), батчинг, WebSocket-транспорт со смешанными
  кадрами и snapshot + delta.

## 11. Сжатие

Проблема из первого бенча (на строковых данных бинарь после brotli-11 на 47% больше JSON) решена в
фазе 0 ([compression.md](../bench/results/compression.md)). Сжатие портили смещения на каждую строку
данных и стартовые смещения строк: монотонно растущие числа для компрессора — шум. Колоночные
векторы, у строк — длины вместо смещений, дедупликация повторов внутри колонки:

| Данные | gzip-6 | brotli-4 | brotli-6 | brotli-11 | zstd-3 |
|---|---|---|---|---|---|
| 1000 юзеров | −8% | −17% | −20% | −10% | −7% |
| 500 товаров с длинным текстом | +5% | −5% | −4% | +1% | +2% |
| 20 юзеров (маленький ответ) | +5% | +8% | +4% | +8% | +6% |

Цель «паритет на brotli-4/6» достигнута, поэтому JSON-режим процедуры остаётся в бэклоге после alpha,
а не страховкой alpha.

## 12. Отладка

- `tbr decode` — дамп сообщения в читаемый JSON по имени процедуры или типа.
- Клиентская опция `debug: true` пишет в консоль процедуру, время, размер и декодированное значение
  через `console.groupCollapsed`.
- `toJSON` у views: `console.log(JSON.stringify(user))` работает.
- Пост-alpha: расширение devtools для Network tab.

## 13. Риски

| Риск | Что делаем |
|---|---|
| Бета TS 7.1 ломается | адаптер `TypeSource`, запасной бэкенд TS 6, версия TS в CLI зафиксирована |
| Сжатие не дотягивает до паритета | фаза 0 до фиксации формата, JSON-режим как страховка |
| Цена vtable съедает выигрыш | замер в фазе 0, фиксированная раскладка как альтернатива |
| Views ломают чужой код (spread, клонирование) | `toPlain`, `decode: 'eager'`, `toJSON`, документация |
| В Safari и Firefox цифры хуже, чем в Node | браузерный бенч в фазе 0, пороги строк по браузерам |
| Размер клиентского бандла | бюджет: runtime ≤ 5 KB gz, проверка в CI |
| Проект одного человека | маленькое ядро, публичная спецификация, без лишних поверхностей |
