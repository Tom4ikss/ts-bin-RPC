---
title: Queries and HTTP caching
description: "query(): procedures without side effects, called with GET, cached by browsers and CDNs with ETag and 304."
---

# Queries and HTTP caching

Calls are `POST` by default, and HTTP caches do not keep POST responses. Mark a procedure without
side effects with `query()`, and the client calls it with `GET` instead. Then the browser cache,
CDNs and `304 Not Modified` work for it.

```ts
import { query, use } from 'ts-bin-rpc/server';

export const appRouter = {
  products: query(async (input: { category: string }) => db.products(input.category), { maxAge: 60 }),
  catalog: query({
    brands: async () => db.brands(),
    tags: async () => db.tags(),
  }, { public: true, maxAge: 300 }),
  account: use([authed], {
    profile: query(async (_, ctx) => ctx.db.profile(ctx.user.id)),
    rename: async (input: { name: string }, ctx) => ctx.db.rename(ctx.user.id, input.name),
  }),
};
```

`query(procedure, options?)` marks one procedure, `query(namespace, options?)` every procedure of
a namespace. The procedures stay the same functions, and inside `use()` their parameters still
take their types from the chain. Run `tbr generate` after adding or removing `query()`: the client
learns from the generated code which procedures to call with GET.

Only mark procedures that change nothing. A GET can be repeated by the browser, prefetched or
replayed from a cache, and unlike a POST it is not protected against cross-site requests by the
content type (see [Security](#security)).

## Options

| Option | Default | `Cache-Control` |
|---|---|---|
| none | | `private, no-cache` |
| `maxAge: 60` | | `private, max-age=60` |
| `public: true` | `false` | `public, no-cache` |
| `public: true, maxAge: 300` | | `public, max-age=300` |

- **`maxAge`**, in seconds: how long a response stays fresh. Within it, the browser answers the call
  from its cache and the server never sees it. Without `maxAge` the browser asks every time, but an
  unchanged response comes back as `304` without a body.
- **`public`** lets shared caches (CDNs, proxies) keep the response. Without it, only the user's
  browser does, because a response may depend on cookies or the `Authorization` header. Set
  `public` only on responses that are the same for everyone.

Every response of a query carries an `ETag`, a 64-bit hash of the body. A request with a matching
`If-None-Match` gets `304 Not Modified` with no body: the browser sends it by itself when it
revalidates. The procedure still runs, so a 304 saves bandwidth and decoding, not server work.

Errors of a GET are `Cache-Control: no-store`, so the next call reaches the procedure again.

## On the wire

```
GET /rpc/products?h=3f9aKc0dE1MeO2sW&i=DAAAAAgADAAEAAgABQAAAHNob2Vz
```

- **`i`** is the input, encoded as for a POST body, in base64url. A procedure without input has no
  `i`. One input always gives the same URL, so it is a cache key as is.
- **`h`** is the hash of the procedure's contract, which POST sends in the `x-tbr-schema` header.
  In the URL it also keys the caches: after a deploy that changes the contract, clients ask for
  new URLs, and a cache cannot answer them with a response in the old format.
- **No headers of ours.** The request has no content type and no `x-tbr-schema`, so a cross-origin
  GET is a simple request without a CORS preflight, unless you add headers yourself.
- **Long inputs go by POST.** When the base64url input is longer than 2 KB, the client sends a POST
  instead, as for any other procedure. Proxies and servers commonly refuse URLs past 8 KB. The
  server takes both methods for a query.

A GET to a procedure that is not a query gets `405` with `Allow: POST`.

## Cost

Measured in process, client and handler together, with no network, on an Apple M3 Pro in Node 22
([query.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/query.md)):

| Call | Time |
|---|---|
| POST, a `{ id: u32 }` input and a 7-field user | ~11 µs |
| the same as a query, GET | ~9 µs |
| the handler answering `304` | ~4 µs |

The base64url input and the ETag hash cost less than reading a request body does for a POST.

## Security

The content type of POST keeps cross-site forms and simple requests out. A GET has no body and no
such protection: any page can make the browser send it, with the user's cookies. That is safe only
when the procedure has no side effects, which is the contract of `query()`. The response itself
stays protected: without CORS headers another site cannot read it.

`private` is the default for the same reason: a response for one user must not land in a cache
shared with others. With `public: true`, the response must not depend on who asks.

## What it does not do

`query()` is HTTP caching. It does not keep responses in memory in your app, deduplicate calls or
invalidate anything. For that, use a client cache such as TanStack Query (see the
[FAQ](./faq.md)).
