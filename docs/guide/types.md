---
title: Types
description: Which TypeScript types go over the wire, how they are encoded and what the client gets back.
---

# Types

The contract is the TypeScript types of your router: procedure inputs, outputs and everything they
reach. `tbr generate` turns each type into a wire layout. A type it cannot send is an error that
names the file, line and field path:

```
src/router.ts:18:3  User.meta: type 'unknown' is not serializable
```

## Supported types

| TypeScript | On the wire | On the client |
|---|---|---|
| `boolean` | 1 byte | `boolean` |
| `number` | f64, 8 bytes | `number` |
| `u8` `i8` `u16` `i16` `u32` `i32` `f32` `f64` | 1–8 bytes | `number` |
| `u64` `i64`, `bigint` | 8 bytes (`bigint` is `i64`) | `bigint` |
| `string` | a string block per message | `string`, decoded on first read |
| `Date` | f64 milliseconds | `Date` |
| `'a' \| 'b' \| 'c'` | enum, u8 index (u16 past 256 values) | the literal |
| `Uint8Array` | bytes | `Uint8Array` over the response |
| `Float32Array`, `Float64Array`, `Int32Array` … | aligned block | the same typed array over the response |
| `T[]` | vector; arrays of objects are stored column by column | a real `Array` |
| interface or object literal | table with a field per property | a [view](./views.md) |
| `x?: T`, `T \| undefined` | the field is absent | `undefined` |
| `T \| null` | a null bit | `null` |
| `{ kind: 'a'; … } \| { kind: 'b'; … }` | tag + the variant's table | a view of the variant |
| generics (`Page<User>`) | one table per instantiation | a view |
| recursive types (`manager: User \| null`) | through references | a view |
| `'ok'` and other single literals | nothing, the value is known | the literal |

## Numeric brands

`number` is a 64-bit float, as in JavaScript. To send an integer in fewer bytes, or as a real
integer, use a brand:

```ts
import type { u8, u16, u32, i32, f32, u64 } from 'ts-bin-rpc';

interface Pixel {
  x: u16;
  y: u16;
  rgba: u32;
  depth: f32;
}
```

A brand is `number` with an optional, invisible tag, so assignments need no casts. You still write
`{ x: 1, y: 2, rgba: 0xff00ffff, depth: 0.5 }`. The tag survives aliases: `type UserId = u32` is
still a `u32`.

The range cannot be checked by types, so the encoder checks it at run time. `-1`, `1.5` or `5n` in
a `u32` field throws an `EncodeError` with the path to the value:

```
EncodeError: at [17].manager.age: expected u8, got 300
```

`u64` and `i64` are `bigint`. Plain `bigint` is `i64`.

## Scale and Delta

Two encodings make realtime feeds smaller without changing what your code reads:

```ts
import type { Delta, i32, Scale, u32 } from 'ts-bin-rpc';

interface Tick {
  t: Date & Delta;                   // time stamps as differences
  price: i32 & Scale<100> & Delta;   // cents in an i32, as differences
  size: u32;
  side: 'buy' | 'sell';
}
```

- **`Scale<N>`** on an integer brand stores `Math.round(value * N)` in it: `i32 & Scale<100>` keeps
  two decimals in 4 bytes, `i16 & Scale<100>` coordinates of ±327 in 2. You write and read plain
  numbers (`64250.25`); a value that does not fit the brand after scaling is an `EncodeError`, and
  a column of it in `columns()` is a `Float64Array` of the scaled-back values.
- **`Delta`** sends a column of an array of objects as its first value and the differences between
  neighbours, in 1, 2 or 4 bytes each, whichever fits. It works on 8–32 bit integer brands, scaled
  ones included, and on `Date`. It pays off on sorted or slowly changing values: time stamps,
  sequence numbers, prices. The encoder falls back to the plain column when differences would not
  be smaller.

The price is zero-copy: such a column is decoded into its own typed array when the view of the
array is created, instead of being a window into the message. That is one pass over the column,
which costs nothing next to the network on a feed, but `Delta` is not for a column you mostly do
not read.

16 ticks per message, 300 messages, deflate with a context for the whole stream
([deltas.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/deltas.md)):

| `Tick` | Raw | Deflate |
|---|---|---|
| JSON | 979 B | 159 B |
| `t: number; price: f32` | 328 B | 144 B |
| `t: Date & Delta; price: i32 & Scale<100> & Delta` | 180 B | 77 B |

Without any of this, optional and nullable columns that are empty in most rows (patches of [live
state](live.md), sparse fields) are packed: only the rows that have a value take space.

Both are part of the field's type for `tbr check`: adding or removing `Delta` or changing `N` is a
breaking change, as changing the brand is.

## Objects

Interfaces, type aliases of object types and inline object literals all work. An inline type gets
a name from where it appears, for example `user.get:input`. The name shows up in errors and in
the lockfile.

An object may have up to 30 optional or nullable fields. An object with an index signature is a
[record](#maps-records-and-tuples).


## Unions

Three kinds of unions work:

- **String literal unions** (`'admin' | 'user'`) become enums. The index of each value is fixed in
  the lockfile, so reordering the union is safe.
- **Discriminated unions of objects.** Every variant needs a property with a distinct string
  literal; that property is the tag.

  ```ts
  type Shape =
    | { kind: 'circle'; r: f32 }
    | { kind: 'rect'; w: f32; h: f32 };
  ```

  The client gets a view of the variant, and `switch (shape.kind)` narrows as usual.
- **`T | null` and `T | undefined`**, with any `T` above.

Anything else is rejected with a message that says what is supported: numeric literal unions,
unions of unrelated objects, `string | number`.

## Typed arrays and arrays

> [!IMPORTANT]
> What you declare is what arrives. `f32[]` is an array of numbers: compact on the wire, copied into
> a normal `Array` on the client. `Float32Array` is a column: read without copying, but it is a
> typed array, with its methods and its fixed length.

Use typed arrays for series, coordinates, samples and pixels, anything you hand to a chart, WebGL
or WASM. Use `T[]` for lists you will `map`, `filter` and render.

Arrays of objects (`User[]`) are stored column by column: all `id`s together, then all `name`s,
and so on. This is why reading two fields of 1000 users is several times faster than reading all
of them. The client still gets a real `Array` of views.

## Maps, records and tuples

```ts
interface Inventory {
  stock: Record<string, u32>; // a plain object
  byId: Map<u32, Item>;       // a Map
  corner: [f32, f32];         // an array of two
  range: [Date, Date | null];
}
```

- `Record<string, T>` and `{ [key: string]: T }` arrive as plain objects, `Map<K, V>` and
  `ReadonlyMap<K, V>` as a `Map`. A record takes only string keys; for numeric keys use a `Map`.
- Map keys are strings, string literal unions, numbers, bigints or booleans. `Date` and object keys
  are rejected: a `Map` compares them by identity, so no key would match after a round trip.
- Values, like array elements, cannot be `null` or `undefined`. An object with an index signature
  cannot have other fields; move them to a field of their own.
- `Record<'a' | 'b', T>` is not a map: it is an object with the fields `a` and `b`.
- Tuples have a fixed length. Elements may be `T | null` or `T | undefined`; optional (`[a?: T]`)
  and rest (`[...T[]]`) elements are rejected. `readonly [A, B]` works.

On the wire a map is two arrays, its keys and its values. `Record<string, T>` and
`Map<string, T>` are the same bytes, so a field can change from one to the other without breaking
clients. The values of a map of objects are stored column by column, like any array of objects.

A view builds the map or the tuple when the field is read first, and keeps it: the keys are read
then, the values are views. The encoder checks the shape: a record must be a plain object (a `Map`
passed for one would lose its entries), a tuple must have its length. A `__proto__` key is an own
property of the record that arrives, not its prototype.

## Procedures

- **Input:** at most one parameter before the context. It may be optional; it may not be `null`.
- **Output:** any supported type, or `void`. It cannot be `null` or `undefined` at the top level:
  wrap it, as in `{ user: User | null }`.
- **Overloaded functions are rejected.**

## Not supported

| Type | Status |
|---|---|
| `any`, `unknown`, `never`, `object` | never: declare the fields |
| functions, classes with methods, `symbol` | never |
| `Set` | use an array |
| optional and rest elements of tuples | use an object or an array |
| `Record<number, T>`, symbol and template literal keys | use a `Map` or string keys |
| numeric literal unions (`1 \| 2`) | planned; use string literals or a brand |
