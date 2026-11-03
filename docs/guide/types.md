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

## Objects

Interfaces, type aliases of object types and inline object literals all work. An inline type gets
a name from where it appears, for example `user.get:input`. The name shows up in errors and in
the lockfile.

An object may have up to 30 optional or nullable fields. Index signatures and `Record<string, T>`
are not supported yet.

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
| `Map`, `Set` | planned after alpha |
| tuples | planned; use an object or an array |
| `Record<string, T>`, index signatures | planned |
| numeric literal unions (`1 \| 2`) | planned; use string literals or a brand |
