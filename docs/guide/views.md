---
title: Views
description: How responses are read lazily, and the few places where a view is not a plain object.
---

# Views

The client does not parse a response into objects. It checks the bytes once, then returns
**views**: objects whose getters read fields from the response buffer when you touch them.
Strings decode on first read; a field you never read costs nothing.

```ts
const users = await api.user.list();
users.length; // a real Array
users.filter((u) => u.role === 'admin').map((u) => u.name); // reads two columns, nothing else
```

In most code a view behaves like the plain object its type describes. This page lists where it
doesn't.

## What works as usual

- **Property reads, destructuring, `in`, optional chaining:** `const { id, name } = user`.
- **Arrays are real arrays:** `Array.isArray`, `map`, `filter`, `sort`, spread of the array
  itself (`[...users]`).
- **`JSON.stringify(view)`** gives the same JSON as for the plain object. Views implement
  `toJSON`.
- **`console.log(view)` in Node** prints the plain value.
- **Discriminated unions narrow:** `switch (shape.kind)`.
- **Repeated reads return the same nested object:** `users[0] === users[0]`, `user.tags === user.tags`.

## What does not

> [!WARNING]
> **Object spread and `Object.keys` don't see the fields.** The fields are getters on the prototype
> (typed arrays are non-enumerable own properties), so `{ ...user }` gives an object with no fields and `Object.keys(user)` gives `[]`. A spread
> element of an array of objects also carries two hidden symbol keys that point at the response
> columns, so the copy keeps the response bytes alive.

```ts
setUser({ ...user, name: 'Ada' }); // wrong: loses every field
setUser({ ...toPlain(user), name: 'Ada' }); // right
```

If a procedure's results always go to such code, ask the client for
[plain objects](#plain-objects) instead.

- **Views are read-only.** Assigning a field throws a `TypeError` in strict mode, which is all ES
  modules. To edit, copy with `toPlain` first.
- **`structuredClone`, `postMessage`, IndexedDB and React Server Components** copy own data
  properties, so they get `{}` instead of the fields. Pass `toPlain(view)` instead.
- **Don't rely on the identity of `Date` values.** In arrays of objects each read returns a new
  `Date`. Compare with `getTime()`.

## Plain objects

`toPlain` turns a view into plain data:

```ts
import { toPlain } from 'ts-bin-rpc';

const plain = toPlain(user); // User, made of plain objects, arrays, fresh Dates and typed array copies
```

`toPlain` makes a deep copy: it reads every field once and copies typed arrays. Use it at the edge
of code that needs plain data: state stores, workers, caches, mutations.

When a procedure's results always end up there, let the client do it. `decode: 'eager'` returns
what `toPlain` would, for the whole client, per procedure or per call:

```ts
const api = createClient<AppRouter>({ url: '/rpc', procedures: clientProcedures, decode: 'eager' });

createClient<AppRouter>({ url: '/rpc', procedures: clientProcedures, decode: { 'user.get': 'eager' } });

await api.user.list({ role: 'admin' }, { decode: 'lazy' }); // this call returns views
```

A call option wins over the procedure's entry, which wins over the client-wide mode. The default
is `'lazy'`. The map's keys are checked against the router, so a typo in a path is a type error.

Eager results are copies with nothing tied to the response buffer. The price is laziness: every
field is read, even the ones you never touch. See [Performance](./performance.md#reading).

## Typed arrays share the response

A `Float32Array` field is a view over the response buffer, which is why reading it is free. It is
a read-only property created with the view, not a getter, so a loop like
`for (let i = 0; i < s.t.length; i++) sum += s.t[i]` runs as fast as over a plain object. Two
consequences of sharing the buffer:

- **Writing into it changes the response.** Fine if that's what you want; otherwise `slice()` it.
- **It keeps the whole response alive.** If you keep one small typed array from a large response,
  the whole buffer stays in memory. `slice()` what you keep long-term.

## Verification

Before the first view is returned, the whole message is checked:

- offsets and lengths stay inside the buffer;
- strings are valid;
- enum indexes and union tags exist;
- required fields are present;
- nesting depth and the total number of elements stay within limits, so a message built with
  reused offsets cannot make a reader loop.

After that, reads do no bounds checks.

The server always verifies inputs. The client verifies responses by default in development and
skips verification in production builds, where `process.env.NODE_ENV` is `'production'`. Bundlers
such as Vite, webpack and esbuild with `define` replace that expression at build time; without a
bundler the client verifies. Set `verify` in `createClient` to choose explicitly:

```ts
createClient<AppRouter>({ url: '/rpc', procedures, verify: true }); // a server you do not control
```

A message that fails verification is a `400 BAD_INPUT` on the server and a `BAD_RESPONSE` error on
the client; it never crashes the process.

> [!CAUTION]
> Without verification the client trusts the bytes. A broken or hostile response can throw a
> `RangeError` on read, return wrong values or allocate large arrays. Keep verification on for a
> server you do not control.

## On the server

Inputs arrive as **plain objects**, not views. They are verified, then decoded in full: inputs are
usually small, and handlers often change what they receive. Outputs are encoded from whatever
your procedure returns, plain objects or views alike.
