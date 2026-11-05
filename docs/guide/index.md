---
title: Introduction
description: Code-first TypeScript RPC with a binary wire format, lazy views and typed-array columns.
---

# Introduction

ts-bin-rpc is an RPC layer for TypeScript apps that talk to their own backend. You write a router of
plain async functions with plain TypeScript types. A CLI reads those types and generates codecs.
The client calls the server through a typed proxy, as with tRPC, but the bytes on the wire are
binary, and responses are read lazily, straight from the response buffer.

```ts
// server/router.ts
import type { u32, f32 } from 'ts-bin-rpc';

export interface User {
  id: u32;
  name: string;
  createdAt: Date;
}

export const appRouter = {
  user: {
    get: async (input: { id: u32 }): Promise<User> => db.users.find(input.id),
  },
  metrics: async (): Promise<{ t: Float64Array; cpu: Float32Array }> => readMetrics(),
};
```

```ts
// client
const user = await api.user.get({ id: 1 }); // User, read lazily from the response
const m = await api.metrics();
chart.setData([m.t, m.cpu]); // typed arrays over the response bytes, nothing copied
```

## What you get

- **Types from your code.** No IDL and no schema library. Interfaces, unions, `Date`, typed arrays
  and branded numbers (`u8`, `u32`, `f32`, `i64` …) describe the wire format.
- **Fast reads.** A response is verified once and then read on demand. Even with verification
  on, reading every field of 1000 objects is 2.6–3.7× faster than `JSON.parse` in browsers,
  and reading two fields of them is 4.9–7.0× faster. Numeric columns arrive as `Float32Array` or
  `Float64Array` with no parsing at all.
- **Schema evolution.** A committed lockfile gives every field a stable ID. `tbr check` in CI tells
  safe changes from breaking ones before you deploy.
- **Stale code cannot slip through.** If you change a type and forget to regenerate, `tsc` fails.
  `tbr generate --watch` regenerates in about 15 ms per save.
- **Streams.** A procedure can return a stream of rows. They arrive in batches over one HTTP
  response, with typed-array columns per batch, and need 2× less main-thread time than NDJSON
  at 20 000 rows/s. See [Streams](./streams.md).
- **Live state.** Rows by key that every client keeps in sync: a snapshot, then only the fields
  that changed, encoded once for all subscribers. See [Live state](./live.md).
- **Small client.** About 10 KB gzip for a real app, of which the runtime is 4.2 KB. The client
  bundle holds only input encoders and output decoders.
- **Any runtime.** The server is a Fetch API handler (Node, Bun, Deno, Workers). No `eval`, so
  strict CSP works.

## When not to use it

- **Your API is public**, or other languages call it. ts-bin-rpc is for a TypeScript client and
  a TypeScript server that ship together. Use JSON, OpenAPI or protobuf there.
- **You need to read bodies outside the browser.** They are binary: `curl | jq` won't work, and
  `tbr decode` prints a captured body instead. In the browser the [DevTools panel](./devtools.md)
  shows every call decoded, and `debug: true` logs them to the console.
- **The payloads are small and mostly text.** Twenty users with names and emails are about the
  same size as JSON after gzip, sometimes a few percent larger. The gain grows with numbers, with
  many objects, and when you read only some fields.
- **You need tRPC's ecosystem today:** WebSocket subscriptions, request batching. These are not
  there yet. [TanStack Query](./tanstack-query.md) is. See the [FAQ](./faq.md).

> [!WARNING]
> ts-bin-rpc is an alpha: `npm install ts-bin-rpc`. The wire format may still change before 1.0; such changes bump the minor version, so `^0.2.0` stays compatible.

Next: [Getting started](./getting-started.md).
