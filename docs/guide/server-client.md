---
title: Server and client
description: createHandler, createClient, errors, context, cancellation and the HTTP protocol.
---

# Server and client

## Server

```ts
import { createHandler } from 'ts-bin-rpc/server';
import { serverProcedures } from './tbr.gen.ts';

const handler = createHandler(appRouter, {
  procedures: serverProcedures,
  prefix: '/rpc',
  context: async (req) => ({ user: await auth(req) }),
});
```

`handler` is `(request: Request) => Promise<Response>`. It runs anywhere the Fetch API does:
`Bun.serve({ fetch: handler })`, `Deno.serve(handler)`, `export default { fetch: handler }` in
Workers. For `node:http`, wrap it:

```ts
import http from 'node:http';
import { toNodeListener } from 'ts-bin-rpc/node';

http.createServer(toNodeListener(handler, { maxBytes: 8 << 20 })).listen(3000);
```

The handler compares the router with the generated table at startup. A procedure that exists on one
side only throws an error that tells you to run `tbr generate`.

| Option | Default | |
|---|---|---|
| `procedures` | — | `serverProcedures` from the generated file (`procedures` works too) |
| `prefix` | `/` | path prefix of every procedure |
| `context` | — | `(request) => ctx`, once per request to a procedure that takes `ctx`; may be async and may throw `RpcError` |
| `schemaMismatch` | `'warn'` | the client was generated from another contract version: `'warn'` logs once per procedure, `'error'` answers 409, `'ignore'` |
| `limits` | 64 MB, depth 64, 16M elements | `{ maxBytes, maxDepth, maxNodes }` for verifying inputs |
| `onError` | `console.error` | `(error, { path, request })` for errors other than `RpcError` |

### Context

The second parameter of every procedure is the context, and its type comes from the procedures. If
`context` throws an `RpcError`, for example `UNAUTHORIZED`, the client gets that error and the
procedure does not run.

`context` runs only for procedures that declare `ctx`, directly or through middleware that needs
it: `tbr generate` marks them in `serverProcedures`. A public `ping` does not pay for a session
lookup. Keep `context` cheap anyway, and do the expensive part where it is needed:

```ts
context: (request) => ({ request, db }),        // no I/O here
const authed = middleware(async ({ ctx }: Call<{ request: Request; db: Db }>) => {
  const user = await ctx.db.session(ctx.request.headers.get('cookie'));
  if (!user) throw new RpcError('UNAUTHORIZED', 'sign in first');
  return { ...ctx, user };
});
```

See [Middleware](./middleware.md).

## Client

```ts
import { createClient } from 'ts-bin-rpc/client';
import type { AppRouter } from '../server/router.ts';
import { clientProcedures } from '../server/tbr.gen.ts';

export const api = createClient<AppRouter>({
  url: '/rpc',
  procedures: clientProcedures,
  headers: () => ({ authorization: `Bearer ${token()}` }),
});
```

| Option | Default | |
|---|---|---|
| `url` | — | base URL: `/rpc` or `https://api.example.com/rpc` |
| `procedures` | — | `clientProcedures` from the generated file |
| `headers` | — | sent with every call; a function is called before each one |
| `fetch` | `globalThis.fetch` | for tests, retries or instrumentation |
| `decode` | `'lazy'` | `'eager'` returns plain objects instead of [views](./views.md#plain-objects); a map like `{ 'user.get': 'eager' }` sets it per procedure |
| `verify` | `true`, `false` in production | verify responses before reading them; production means `process.env.NODE_ENV === 'production'` |
| `limits` | as on the server | limits for verifying responses |
| `debug` | `false` | log every call to the console |

Every procedure takes the input, if it has one, and then call options:

```ts
const abort = new AbortController();
const user = await api.user.get({ id: 1 }, { signal: abort.signal, headers: { 'x-trace': id } });
const me = await api.whoami({ signal: abort.signal }); // no input: options come first
const copy = await api.user.get({ id: 1 }, { decode: 'eager' }); // plain objects for this call
```

### Debugging

The [DevTools extension](./devtools.md) lists calls and streams with their inputs and decoded
responses.

`debug: true` logs one collapsed group per call: the procedure, status, time and sizes, followed
by the input and the output as plain objects. It also warns when the server's contract hash
differs from the client's.

```
▸ tbr user.get 200 3.1 ms, 12 B → 214 B
```

To look at a body captured from the Network tab, save it and decode it:

```sh
pnpm exec tbr decode response.bin --proc user.get        # the output of user.get
pnpm exec tbr decode request.bin --proc user.get --input # its input
```

## Errors

Throw `RpcError` from a procedure, or from `context`, to send an error to the client. The client
throws an `RpcError` with the same code, message and data:

```ts
// server
throw new RpcError('NOT_FOUND', `no user ${input.id}`, { id: input.id });

// client
try {
  await api.user.get({ id: 99 });
} catch (e) {
  if (e instanceof RpcError && e.code === 'NOT_FOUND') showNotFound(e.data);
}
```

`data` travels as JSON, so it must be JSON-serializable. Any other exception reaches `onError`;
the client gets `500 INTERNAL` without details.

| Code | Status | Raised by |
|---|---|---|
| `BAD_INPUT` | 400 | the server: input failed verification, or is missing |
| `UNAUTHORIZED` | 401 | your code |
| `FORBIDDEN` | 403 | your code |
| `NOT_FOUND` | 404 | your code, or the server: no such procedure |
| `METHOD_NOT_ALLOWED` | 405 | the server: not a POST, or not a GET or POST for a query |
| `CONFLICT` | 409 | your code |
| `SCHEMA_MISMATCH` | 409 | the server, with `schemaMismatch: 'error'` |
| `PAYLOAD_TOO_LARGE` | 413 | the server: over `limits.maxBytes` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | the server: wrong content type |
| `TOO_MANY_REQUESTS` | 429 | your code |
| `INTERNAL` | 500 | the server: a procedure threw something else |
| `BAD_OUTPUT` | 500 | the server: a procedure returned a value that does not match its type |
| `BAD_RESPONSE` | 502 | the client: the response is not a valid ts-bin-rpc message |

Codes not in the table are yours, and default to status 400. Pass `{ status }` as the fourth
argument to choose another: `new RpcError('PAYMENT_REQUIRED', '…', undefined, { status: 402 })`.

`BAD_OUTPUT` means a bug on the server, so the client gets no details. `onError` gets the
`EncodeError` with the path to the bad value, and the default handler prints it:

```
ts-bin-rpc: procedure 'user.list' returned an invalid value at [17].manager.age: expected u8, got 300
```

## Protocol

- **A call is `POST {prefix}/{procedure path}`** with the encoded input as the body. A procedure
  without input sends an empty body. A [query](./queries.md) is a `GET` with the input in the URL.
- **Requests and responses use `content-type: application/vnd.tbr`.** The server refuses anything
  else with 415. Browsers cannot send this content type from a form or a "simple" cross-origin
  request, which protects against CSRF.
- **A stream procedure answers with `content-type: application/vnd.tbr-stream`**, a sequence of
  frames over one response; see [Streams](./streams.md#wire).
- **Errors are a fixed envelope** with a flag in the header, so the client reads them without
  knowing the procedure.
- **The `x-tbr-schema` header** carries a hash of the procedure's contract in both directions. The
  hash covers the lockfile entries of every type the procedure reaches. When client and server
  differ, the server warns by default. Safe changes stay compatible, and old clients during a
  deploy are normal.

The byte layout is specified in
[FORMAT.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/docs/FORMAT.md) (in Russian).
