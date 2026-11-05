---
title: Getting started
description: From a router to a working client in five steps.
---

# Getting started

This page takes you from an empty folder to a typed client calling a server. You need Node 22.6
or later.

## 1. Install

The package is published as an alpha:

```sh
npm install ts-bin-rpc
npm install -D typescript@7.1.0-beta @types/node
```

`ts-bin-rpc` provides `ts-bin-rpc/server`, `ts-bin-rpc/client`, `ts-bin-rpc/node`, the numeric
brands and the `tbr` command. `tbr` needs TypeScript 7.1, an optional peer dependency: install it
as a dev dependency, and production installs (`npm ci --omit=dev`) stay without the compiler.

`tbr` reads your types through a TypeScript project, so the folder needs a `tsconfig.json` that
includes the router. Any strict config works. Since TypeScript 6, installed `@types` packages are
not picked up unless `types` lists them, so a Node server needs `"types": ["node"]`:

```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

## 2. Write a router

A router is an object of async functions. Nested objects are namespaces: `user.get` below is
called as `api.user.get(...)`.

```ts
// src/router.ts
import { RpcError, type u8, type u32 } from 'ts-bin-rpc';

export type Role = 'admin' | 'user' | 'guest';

export interface User {
  id: u32;
  name: string;
  age: u8;
  role: Role;
  createdAt: Date;
  tags: string[];
}

type Ctx = { userId: string | null };

export const appRouter = {
  user: {
    get: async (input: { id: u32 }, ctx: Ctx): Promise<User> => {
      const user = await db.findUser(input.id);
      if (!user) throw new RpcError('NOT_FOUND', `no user ${input.id}`);
      return user;
    },
    list: async (input?: { role?: Role }): Promise<User[]> => db.listUsers(input?.role),
  },
  whoami: async (_: void, ctx: Ctx): Promise<string> => ctx.userId ?? 'anonymous',
};
```

Procedures follow a few rules:

- **The first parameter is the input** and may be optional (`input?:`). Use `_: void` when a
  procedure takes no input but needs the context. Behind [middleware](./middleware.md), `(_, ctx)`
  needs no types at all: they come from the chain.
- **The second parameter is the context.** The server builds it for every request. The client's
  signature does not have it.
- **The return type is the output**, with or without `Promise`. It may be `void`.

[Types](./types.md) lists what fields can be.

## 3. Generate

```sh
pnpm exec tbr generate --router src/router.ts
```

```
created tbr.lock.json
wrote src/tbr.gen.ts
```

- **`tbr.lock.json` is the contract.** It holds field IDs, enum indexes and union tags. Commit it.
- **`src/tbr.gen.ts` holds the codecs and the procedure tables.** It is generated, so you can keep
  it out of git. It imports your router only with `import type`.

While you work, keep the watcher running:

```sh
pnpm exec tbr generate --watch --router src/router.ts
```

In a Vite app, the [Vite plugin](./cli.md#vite-plugin) does this instead, and generates before
`vite build`.

## 4. Serve

`createHandler` returns a Fetch API handler: `(Request) => Promise<Response>`.

```ts
// src/server.ts
import { createHandler } from 'ts-bin-rpc/server';
import { appRouter } from './router.ts';
import { serverProcedures } from './tbr.gen.ts';

const handler = createHandler(appRouter, {
  procedures: serverProcedures,
  prefix: '/rpc',
  context: (req) => ({ userId: req.headers.get('authorization') }),
});

// Bun
Bun.serve({ fetch: handler });
// Deno
Deno.serve(handler);
// Node
import http from 'node:http';
import { toNodeListener } from 'ts-bin-rpc/node';
http.createServer(toNodeListener(handler)).listen(3000);
```

## 5. Call it

```ts
// src/client.ts
import { createClient } from 'ts-bin-rpc/client';
import type { appRouter } from './router.ts';
import { clientProcedures } from './tbr.gen.ts';

const api = createClient<typeof appRouter>({ url: '/rpc', procedures: clientProcedures });

const user = await api.user.get({ id: 1 });
user.name; // string, decoded on first read
const admins = await api.user.list({ role: 'admin' }); // User[]
const me = await api.whoami(); // no input, no ctx
```

The client imports the router only as a type, so no server code reaches the bundle.
`clientProcedures` holds input encoders and output decoders. Your bundler drops the rest of the
generated file.

`user` is a **view**: a read-only object whose getters read the response bytes on demand. In most
code it behaves like the plain object. [Views](./views.md) covers where it doesn't, for example
object spread.

## 6. Check in CI

```sh
pnpm exec tbr check --router src/router.ts
```

`tbr check` fails when the lockfile does not match the types. Its output labels every change
`safe`, `breaking` or `error`. `tbr generate` refuses breaking changes unless you pass
`--allow-breaking`. See [Schema evolution](./evolution.md).

If someone changes a type and does not regenerate, `tsc` fails on the generated file with an error
like `StaleCodegen_RunTbrGenerate<"user.get output">`.

## A full example

[`examples/dashboard`](https://github.com/Tom4ikss/ts-bin-RPC/tree/main/examples/dashboard) is a
metrics dashboard built with Vite, React and uPlot. It generates with the Vite plugin, serves the
router from the dev server, and the charts take typed-array columns straight from responses.
