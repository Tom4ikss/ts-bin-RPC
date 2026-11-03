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
- **Small client.** About 9 KB gzip for a real app, of which the runtime is 4.0 KB. The client
  bundle holds only input encoders and output decoders.
- **Any runtime.** The server is a Fetch API handler (Node, Bun, Deno, Workers). No `eval`, so
  strict CSP works.

## When not to use it

- **Your API is public**, or other languages call it. ts-bin-rpc is for a TypeScript client and
  a TypeScript server that ship together. Use JSON, OpenAPI or protobuf there.
- **You need to debug in the Network tab.** Bodies are binary. `debug: true` on the client logs
  every call as plain objects, and `tbr decode` prints a captured body, but `curl | jq` won't work.
- **The payloads are small and mostly text.** Twenty users with names and emails are about the
  same size as JSON after gzip, sometimes a few percent larger. The gain grows with numbers, with
  many objects, and when you read only some fields.
- **You need tRPC's ecosystem today:** TanStack Query bindings, subscriptions, batching,
  middleware. These are not there yet. See the [FAQ](./faq.md).

> [!WARNING]
> ts-bin-rpc is an alpha: `npm install ts-bin-rpc@alpha`. The wire format may still change before 1.0.

Next: [Getting started](./getting-started.md).
