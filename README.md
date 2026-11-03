# ts-bin-rpc

A code-first TypeScript RPC with a binary wire format. Your router's TypeScript types are the
schema: `tbr` reads them, keeps a lockfile of field ids and generates codecs. The client gets lazy
views over the response bytes, and numeric arrays arrive as `TypedArray` columns with no parsing.

**Docs:** https://tom4ikss.github.io/ts-bin-RPC/ (sources in [docs/guide](docs/guide/index.md)).

**Status:** pre-alpha, not on npm yet. The format may still change; the
[getting started](docs/guide/getting-started.md) guide shows how to try it from a checkout.

```ts
// server: a router is a plain object of async functions
export const appRouter = {
  user: {
    get: async (input: { id: u32 }): Promise<User> => db.user(input.id),
  },
  metrics: async (): Promise<{ t: Float64Array; cpu: Float32Array }> => sample(),
};
Bun.serve({ fetch: createHandler(appRouter, { procedures: serverProcedures, prefix: '/rpc' }) });

// client: types come from the router, codecs from `tbr generate`
const api = createClient<typeof appRouter>({ url: '/rpc', procedures: clientProcedures });
const user = await api.user.get({ id: 1 }); // a view: fields are read from the bytes on access
const { t, cpu } = await api.metrics();     // Float64Array and Float32Array over the response
```

A whole app: [`examples/dashboard`](examples/dashboard), a Node server and a Vite + React client
drawing response columns with uPlot.

## Benchmarks

Generated codecs against `JSON.parse(new TextDecoder().decode(bytes))` and
`TextEncoder.encode(JSON.stringify(value))`, speed relative to JSON (higher is better). The read rows
include verification, which the client does by default in development and skips in production
builds, so they are the slower case. Apple M3 Pro, Node
22.13 and headless Chromium 156, Firefox 157 and WebKit 27.2 through Playwright, 2026-11-03.
Full tables, with times: [generated.md](bench/results/generated.md).

| Reading | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 1000 users, every field | 7.1× | 2.6× | 3.7× | 3.7× |
| 1000 users, 2 of 7 fields | 13× | 4.9× | 7.0× | 5.3× |
| 1000 users, numeric fields only | 18× | 7.3× | 14× | 7.2× |
| 100k points, every value | 136× | 18×¹ | 97× | 21×¹ |
| 10 users, every field | 3.3× | 1.4× | 1.5× | 1.4× |
| 500 products with long text | 4.0× | 1.6× | 2.7× | 2.1× |
| 1 user | 1.6× | **0.94×** | **0.74×** | **0.92×** |

| Encoding | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 1000 users | 2.4× | 1.9× | 1.7× | 2.3× |
| 500 products with long text | 1.4× | **0.93×** | 1.1× | **0.62×** |
| 100k points | 496× | 90× | 179× | 146× |

Users have 7 fields: three numbers, a boolean and three strings, 30% of names in Cyrillic. Products
have a 12–52 word description. Points are four columns, a `Float64Array` time and three
`Float32Array` values; JSON gets its best shape for them, an object of four number arrays.

¹ Measured alone, summing the 100k points through a view takes 74–159 µs in every engine, the same
as over a plain object. Next to the JSON case, which allocates about 13 MB per call, V8 and
JavaScriptCore run the same loop 3–6× slower; the table keeps that slower number.

### Where JSON wins

- **One small object in browsers.** Verifying a message and setting up a view cost more than
  parsing 150 bytes of JSON: 0.43–0.62 µs against 0.40–0.47 µs. Either way it is under a
  microsecond.
- **Encoding text in Chromium and WebKit.** On the products payload the generated encoder is 7%
  slower than `JSON.stringify` in Chromium and 1.6× slower in WebKit, whose `JSON.stringify` is
  2.5× faster than Chromium's here.
- **Size of small and numeric responses after compression**, see below.

### Size

Bytes against JSON compressed the same way
([generated-size.md](bench/results/generated-size.md)):

| Payload | raw | gzip-6 | brotli-4 | brotli-6 | zstd-3 |
|---|---|---|---|---|---|
| 1000 users | −52% | −8% | −18% | −19% | −6% |
| 500 products with long text | −18% | 0% | −9% | −9% | −3% |
| 20 users | −37% | +10% | +13% | +10% | +9% |
| 100k points, JSON as number arrays | −51% | −1% | +9% | +12% | +2% |
| 100k points, JSON as an array of objects | −66% | −21% | −24% | −24% | −27% |

Small responses are 9–13% larger after compression: JSON's repeated keys compress well, and a
binary message carries its layout. Numbers in the test data are rounded to 1–3 decimals, which
compress well as text, while float32 mantissas look like noise to a compressor.

### Bundle

The client runtime is 4.0 KB min + gzip, and the client bundle of the dashboard example, codecs
and runtime, is 9.3 KB ([size.md](bench/results/size.md)). CI fails if the runtime grows past 5 KB.

### Caveats

- One machine. Run-to-run noise reaches 20–40% on some rows, marked `~` in the result tables.
- Synthetic data, codecs only: no network, `fetch` or `arrayBuffer()` time, and decompression is
  not measured.
- No comparison yet against protobuf-es, msgpackr, Apache Arrow JS or Colyseus.

## How the format was chosen

Phase 0 measured layout variants before any code generation
([layout.md](bench/results/layout.md), [strings.md](bench/results/strings.md),
[compression.md](bench/results/compression.md)):

- **Strings in two blocks per message** (ASCII and UTF-16LE), each decoded with one `TextDecoder`
  call, fields as `substring`. Per-field `TextDecoder` calls cost ~100 ns each in browsers and made
  full reads slower than JSON in Chromium.
- **Vectors of objects stored column by column**, string columns holding lengths and back-references
  instead of offsets. Per-row offsets were noise to compressors: row tables were 48–61% larger than
  JSON after compression.
- **Memoized strings and views**: repeated reads and sorting stay ahead of JSON.

Design notes, the wire format and the roadmap are in Russian: [design](docs/DESIGN.md),
[wire format v0](docs/FORMAT.md), [roadmap](docs/ROADMAP.md),
[landscape research](reports/Обзор%20TS%20RPC%20и%20бинарных%20форматов.md),
[string and verification optimizations](reports/Оптимизации%20строк%20и%20верификации.md).

## Repository

| Path | What |
|---|---|
| `packages/ts-bin-rpc/` | numeric brands (`u8` … `i64`), `RpcError`, `toPlain`; `/server` (`createHandler`, Fetch API), `/client` (`createClient`), `/node` (adapter for `node:http`), `/runtime` (codec runtime for generated code) |
| `packages/cli/` | `tbr`: reads the router's types through TypeScript 7.1, builds the schema IR, maintains `tbr.lock.json`, emits codecs |
| `e2e/` | fixture app tested in process, over HTTP under Node, Bun and Deno, and from Chromium |
| `examples/dashboard/` | Node server and a Vite + React client: a metrics dashboard drawing response columns with uPlot |
| `playground/` | a router to play with: `pnpm watch` regenerates on save, `pnpm demo` encodes and reads a message |
| `docs/guide/` | user guide; `site/` builds it into the docs website (Astro Starlight) |
| `bench/` | suites that run in Node and in Chromium, Firefox and WebKit (`suites/`), Node-only size and compression scripts (`node/`), hand-written phase-0 codecs (`lib/`), results (`results/`) |
| `spikes/ts71/` | checks that the TypeScript 7.1 API exposes what the codegen needs |

## Running

Node 22+, pnpm.

```sh
pnpm install
pnpm test                                   # golden, round-trip, fuzzing and end-to-end tests
pnpm --filter @tbr/bench exec playwright install chromium firefox webkit
pnpm --filter @tbr/bench gen && node bench/run.mjs generated   # the tables above; --quick for a smoke run
node bench/node/generated-size.mjs          # the size table; needs the zstd CLI for its column
node bench/size.mjs                         # bundle sizes
pnpm --filter tbr-site dev                  # the docs site at http://localhost:4321/ts-bin-RPC/
```

In `playground/`: `pnpm gen` writes `tbr.lock.json` and `src/tbr.gen.ts`, `pnpm watch` does it on
every save, `pnpm check` classifies changes against the lockfile. `tbr decode response.bin --proc
user.get` prints a captured message as JSON.
