---
title: Middleware
description: "use(), middleware() and around(): auth, logging and transactions for a subtree of the router."
---

# Middleware

Middleware runs code before and around the procedures of a router subtree: check who calls,
derive the context, log, time, open a transaction. The router stays an object of plain functions:
`use()` wraps a namespace, and `tbr` reads the procedures through it as before.

```ts
import { around, middleware, use, type Call } from 'ts-bin-rpc/server';

interface Ctx { user: User | null; db: Db }
type Authed = Ctx & { user: User };

const authed = middleware(({ ctx }: Call<Ctx>): Authed => {
  if (!ctx.user) throw new RpcError('UNAUTHORIZED', 'sign in first');
  return { ...ctx, user: ctx.user };
});

const timed = around(async ({ path }, next) => {
  const t0 = performance.now();
  try {
    return await next();
  } finally {
    metrics.time(path, performance.now() - t0);
  }
});

export const appRouter = use([timed], {
  ping: async () => 'pong',
  account: use([authed], {
    me: async (_, ctx) => ctx.user,
    rename: async (input: { name: string }, ctx) => ctx.db.rename(ctx.user.id, input.name),
  }),
});
```

## Two kinds

**`middleware(fn)`** derives the context. `fn` gets the call and returns the context of the next
step and of the procedure; it may be async. Throwing ends the call with that error. This is the
kind for auth, tenants, feature flags: anything that checks or adds to `ctx`.

**`around(fn)`** wraps the rest of the chain. `fn(call, next)` calls `next()` to run the rest and
returns the procedure's result, or something else. It can also skip `next()` and answer by itself,
from a cache for example. To pass another context on, give the types and call `next(ctx)`:

```ts
const inTx = around<Ctx, Ctx & { tx: Tx }>(({ ctx }, next) => ctx.db.transaction((tx) => next({ ...ctx, tx })));
```

Both get the same `call` object: `{ path, input, ctx }`. `path` is the full procedure path,
`'account.rename'`, and `input` is the decoded and verified input. Middleware runs after the input
is checked, so it never sees malformed bytes.

## Order and types

`use([a, b, c], router)` runs `a` first and `c` last, then the procedure. `use()` inside `use()`
adds its steps after the outer ones. Errors from any step are handled as errors of the procedure:
an `RpcError` reaches the client as is, anything else goes to `onError` and arrives as
`INTERNAL`.

Types follow the chain. Inside `use()`, parameters without a type get them from the chain: `ctx`
is the context the chain gives, here `Authed`, and an input without a type is no input. Type the
input when there is one; reading an untyped input is a type error. Outside `use()` there is no
chain to take the context from, so procedures there declare it, as in `(_: void, ctx: Ctx)`.

From outside, `account.me` takes `Ctx`, so `createHandler`'s `context` option still produces
`Ctx`. A procedure may also declare its `ctx`. When it needs more than the chain gives, the error
is on the procedure: `Property 'db' is missing in type 'Authed'`. When the steps of a chain do not
fit each other, `use()` fails with `Expected 3 arguments, but got 2`; the missing argument,
`contextMismatch`, shows the context that was needed and the one the chain gives.

## Cost

Chains are composed once: `use()` builds a function per procedure, and `createHandler` flattens
nested `use()` and composes the whole chain at startup, with the full path. A request runs the
steps of its procedure, and nothing else: no lookup, no array of middleware, one `call` object.
A context step that returns a value, not a promise, goes on without waiting for a microtask.

Per call, on an Apple M3 Pro in Node 22
([middleware.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/middleware.md)):

| Chain | Added per call |
|---|---|
| a context step | ~20 ns |
| an async context step | ~75 ns |
| an `around` | ~120 ns |
| `around` and two context steps | ~160 ns |

A call through `createHandler` with no input and no output takes about 4 µs, so even the longest chain
here adds under 6% to the cheapest call.

## Where the context comes from

`createHandler`'s `context` builds the context a chain starts from, and only for procedures that
take one: those that declare `ctx`, or sit behind middleware that needs it. Keep it to what is
cheap and always there (the request, a database handle) and look up the user in a middleware step,
so that the lookup runs for the procedures that need a user and nowhere else.

## Notes

- **Streams.** For a stream procedure, the chain ends when the procedure returns the stream. An
  `around` times the setup, not the life of the stream, and a transaction opened around it closes
  before the first row. Do per-row work in the stream's source.
- **Direct calls.** Calling a function of a `use()` router yourself, in a test say, runs its chain
  too, with paths from the outermost `use()`.
- **Validation** of field formats and ranges is planned as part of the generated decoder, not as
  middleware, so that it costs no extra pass over the input.
