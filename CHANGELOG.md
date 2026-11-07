# Changelog

Until 1.0 the wire format and the generated code may change between versions. Every message
carries a format version in its header: a reader rejects a version it does not know with a
`VerifyError` instead of misreading it. `tbr check` compares the router with the committed
lockfile and reports breaking changes. The `tbr` command ships in the same package as the runtime,
so generated code and the runtime that reads it come from one version.

From 0.2.0, a change to the wire format or another breaking change bumps the minor version (0.2 →
0.3), and patch versions stay compatible: `^0.2.0` never picks up a new format. Versions before
0.2.0 were prereleases under the `alpha` dist-tag.

## Unreleased

- Smaller messages of objects with optional fields: an optional field that no element of a vector
  has leaves no column, where it used to cost a catalog entry, bitmaps and room for every element.
  A patch of 5 entities of live state that move went from 232 to 180 bytes and is encoded, decoded
  and applied 30–45% faster; a patch of one went from 164 to 80 bytes. The format allowed it from the start (FORMAT §6), so 0.6.0 reads these messages.

## 0.6.0

Not compatible with 0.5: messages are format 2, which 0.5 rejects with a `VerifyError` and 0.6
takes alone, and the generated code, the lockfile and the WebSocket protocol change too. These are
the fixes of an audit before the beta, all breaking changes in one release. To upgrade:

1. Update `ts-bin-rpc` on servers and clients together.
2. Run `tbr generate --allow-breaking` once and commit the lockfile: anonymous types are named after
   their place now, so their entries move, and the lockfile becomes format 1.
3. On Bun and Deno, accept the WebSocket subprotocol in the upgrade
   ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/websocket/#server)); `ws` on Node does it
   by itself.
4. If you set `context` nowhere while a procedure takes `ctx`, the types now ask for it.

Format 2 ([FORMAT.md](docs/FORMAT.md)):

- A union body carries its number of variants. With 0.5, a variant added to an input made an old
  server misread vectors of that union without an error.
- The width of an enum's indexes is fixed in the lockfile. With 0.5, the 257th value widened them
  from 1 byte to 2 and old peers misread every value; now that change is breaking.
- Header flags: bits 2–4 must be understood by a reader, bits 5–7 may be ignored. Column flags are
  checked strictly; a string in a column cannot start or end inside a surrogate pair; an empty
  typed list may have no child; a byte array counts as one element.
- A message gets at most `4096 + 8 × its length` elements: 84 bytes could claim 16M objects before.

Generated code and the lockfile:

- An anonymous type is named after its place in the contract (`user.list:input`), and a
  generic alias keeps its arguments (`Page<User>`): a procedure added or moved no longer renames
  types, and `Page<A>` and `Page<B>` no longer collide.
- `@renamedFrom` fails when the old field is still declared, claimed twice or does not exist. A
  field whose type changes gets a new ID, the old one is retired: an old peer sees the field missing
  instead of reading the new type's bytes as the old type.
- Classes (whose private fields went out with the rest) and TypeScript enums are rejected, and so
  are procedures and namespaces named `then` or after a method of `ts-bin-rpc/tanstack`.
- Lockfile format 1 records `query()`, so removing one is breaking. It keeps top-level keys it does
  not know, and explains merge conflict markers and lockfiles of a newer `tbr`. Format 0 is read and
  rewritten.
- The contract hash covers the contract, not the text of the lockfile.
- `tbr check --base <ref|file>` compares with the lockfile of another commit, which catches a
  breaking change committed with its lockfile; `--json` prints the result; exit code 3 means
  breaking. A lockfile with CRLF line ends is read as it is. `--lock` and `--out` are relative to the
  tsconfig, as documented.
- Generated code checks at import that the runtime is the one it was generated for, and says to run
  `tbr generate` if not. The shims for code of 0.1 and 0.2 are gone.
- `typescript` is a peer `>=7.1.0-beta <7.2.0`; with another version `tbr` says which it needs.
- `Contract` no longer reports a fresh file as stale for `x: T | undefined` and readonly arrays.

Protocol and security:

- WebSocket: subprotocol `tbr.2`; sockets only from the server's own origin or
  `socket.allowedOrigins`, since browsers send cookies with sockets from any site; at most
  `socket.maxSubscriptions` (256) subscriptions and `socket.maxCalls` (64) calls per socket; ID 0
  or an ID in use closes the socket, which a repeated ID used to leave running after close; an
  unknown operation gets an error reply.
- The server's `limits.maxBytes` defaults to 1 MB (64 MB before), and a body is read only for a known
  procedure, against that limit as it arrives. `toNodeListener` streams the body into the request,
  keeps every `Set-Cookie` of a response (it kept the last one) and fails the body of an upload the
  client dropped.
- A bigint in `RpcError.data` no longer crashes the server: it goes out as a decimal string.
- New codes: `SLOW_CONSUMER` 429, `UNAVAILABLE` 503, `TIMEOUT` 504. A status outside 400–599 goes out
  as 500. 404 and 405 answers to GET are `no-store`. A query marked `public` that takes `ctx` fails
  `createHandler`: a shared cache would hand one user's response to another.
- Stream frames of kinds 128 and up may be skipped by clients that do not know them; kind 7 is
  reserved for a server going away. Live state has to start with a snapshot. An iterator that falls
  behind stops reading the response. The WebSocket backoff starts over only after a socket stayed
  open for 5 s.
- A batch with a repeated call ID is refused; a call of a batch that throws gets `500 INTERNAL`
  instead of breaking the batch.

API:

- Everything a call rejects with is an `RpcError`: a failed `fetch`, a closed socket or a broken
  batch response is `DISCONNECTED` or `BAD_RESPONSE`, where it was a `TypeError`. An abort rejects
  with the signal's reason.
- `BAD_INPUT` data and the issues of `inputSchema` share one shape, `InputIssue` (the type
  `Failure` is gone), with `path` as an array: `['guests', 1, 'email']`.
- Production clients verify every response that does not show the server has the same contract:
  another `x-tbr-schema`, or none, as over a WebSocket or in a batch.
- Renamed: `LiveOptions` of `ts-bin-rpc/server` → `LiveStateOptions`, `BatchOptions` of
  `ts-bin-rpc/server` → `RowBatchOptions`, `TbrOptions` of `ts-bin-rpc/vite` → `TbrPluginOptions`.
  `Live.subscribers` is a method, as `Channel.subscribers(topic)`.
- The stream content type is `application/vnd.tbr.stream` (was `vnd.tbr-stream`).
  `STREAM_CONTENT_TYPE` and `BATCH_CONTENT_TYPE` are exported from `ts-bin-rpc`, as are the types
  `Codec`, `Encoder`, `Decoder` and `Limits`. `ts-bin-rpc/runtime` is internal.
- `hashKey` tells maps, sets and typed arrays apart by their contents, so their query keys change.
- DevTools extension for Firefox.

## 0.5.1

Compatible with 0.5.0: the wire format and the generated code are unchanged.

- `ts-bin-rpc/tanstack`: `infiniteQueryOptions` for procedures whose input has a `cursor`, for
  `useInfiniteQuery`; the page param goes into `cursor`
  ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/tanstack-query/#infinite-queries)).
- Streams and live state as queries: `useQuery(rq.ticks.queryOptions(input))` gathers the rows as
  batches arrive, or folds them with `reducer`; live state gives its rows, kept up to date. Pass
  TanStack's `streamedQuery` once: `createQueryOptions(api, { streamedQuery: experimental_streamedQuery })`.
  Leaving the query stops the stream.
- `infiniteQueryOptions` and `infiniteQueryKey` join the names of `rq` methods: a procedure with one
  of these names is reachable only on the client.

## 0.5.0

Not compatible with 0.4: messages with packed or delta columns carry format version 1, which
clients and servers before 0.5.0 reject with a `VerifyError`. Update servers and clients together
and run `tbr generate`. Messages without such columns keep version 0 and are unchanged.

- `Scale<N>` on an integer brand: `price: i32 & Scale<100>` keeps two decimals in 4 bytes, and the
  code reads and writes plain numbers ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/types/#scale-and-delta)).
- `Delta` on a field of an array of objects sends its column as the first value and differences of
  1, 2 or 4 bytes, when that is smaller: for integer brands, scaled ones and `Date`. 16 ticks with
  `t: Date & Delta` and `price: i32 & Scale<100> & Delta`: 328 → 180 B raw, 144 → 77 B after deflate.
- Optional and nullable columns with values in at most half of the rows are packed: patches of live
  state for 100 entities, 5% moving, 345 → 244 B per frame raw.
- Such columns are decoded into arrays of their own when the view is created; other columns are
  read as before. The client runtime grows by about 120 B gzip.

## 0.4.4

Compatible with 0.4.3: the wire format of calls and the generated code are unchanged. Batches are a
new request, which servers before 0.4.4 answer with `404`.

- Batching: `createClient({ batch: batch() })` sends the calls made in the same task in one request
  ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/batching/)). The server answers each call as
  it ends and builds the context once per batch. Queries keep GET, calls with their own `headers`
  go alone. 50 calls at once from Chromium: 9.3 → 1.2 ms over HTTP/1.1, 9.1 → 1.4 ms over HTTP/2;
  50 calls of 20 ms over HTTP/1.1: 207 → 26 ms. `batch()` adds about 1.1 KB gzip to a client that
  imports it.
- `toNodeListener` works with `node:http2` servers: HTTP/2 pseudo-headers made it fail.

## 0.4.3

Compatible with 0.4.2: the wire format is unchanged. `tbr generate` adds an export, `inputRules`, to
the generated code; bundles that do not use it do not change.

- Client validator: `inputSchema(inputRules.createUser, { checks: formats })` from
  `ts-bin-rpc/validate` is a Standard Schema of the input, for TanStack Form, react-hook-form and
  others ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/validation/#on-the-client)). It checks the
  shape, the rules, and the checks and refinements you pass, reports every issue with the texts of
  the server, and leaves checks without an implementation to the server. All of it adds about 2 KB
  gzip to a client that imports it, and nothing to one that does not.

## 0.4.2

Compatible with 0.4.1: the wire format and the generated code are unchanged.

- Live subscriptions take `order: 'asc' | 'desc' | (a, b) => number`: the state `Map` iterates by
  key, as an order book needs ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/live/#order)).

## 0.4.1

Compatible with 0.4.0: the HTTP wire format and the generated code are unchanged.

- WebSocket transport: `createClient({ socket: webSocket(url) })` sends subscriptions, and calls
  with `calls: true`, over one socket ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/websocket/)).
  Live subscriptions start again by themselves after a dropped connection, with a fresh snapshot;
  streams end with `DISCONNECTED`. Queries keep GET over HTTP.
- `createHandler` returns a handler with `socket(ws, request)` for any WebSocket with `send` and
  `close`, and `acceptWebSocket(handler)` in `ts-bin-rpc/node` serves sockets of the `ws` package.
  Examples for Bun and Deno are in the guide.
- `webSocket` adds about 0.9 KB gzip to the client, only when imported.

## 0.4.0

Compatible with 0.3.2 for routers without live state: their wire format and generated code are
unchanged. Live procedures use two new stream frames, which earlier clients reject.

- Live state: `live<T>().by(key)` on the server keeps rows by key, and every subscriber keeps a copy
  in a `Map` ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/live/)). A subscriber gets a
  snapshot, then once per window a delta with the rows set, the fields changed and the keys
  removed, encoded once for every subscriber. A client that falls behind gets a fresh snapshot
  instead of `SLOW_CONSUMER`. For 100 entities where 5% move per frame, a delta is 345 B against
  3 498 B for the whole state.
- `tbr generate` reads `LiveStream<T, K>` and records the procedure as `live object T by K`, with a
  `LiveDelta<T, "K">` type in the lockfile.
- DevTools show live subscriptions with their snapshots and deltas.

## 0.3.2

Compatible with 0.3.1: the wire format and the generated code are unchanged.

- DevTools extension: a panel in Chrome DevTools with the page's calls and streams, inputs and
  decoded responses ([guide](https://tom4ikss.github.io/ts-bin-RPC/guide/devtools/)). Clients report
  to it when it is installed; without it a call costs one property lookup more. The client runtime
  grows by 47 B gz.

## 0.3.1

Compatible with 0.3.0: the wire format and the generated code are unchanged, so there is no need to
run `tbr generate` again.

- Vite plugin: `ts-bin-rpc/vite` runs `tbr generate` before `vite build`, and in the dev server at
  start and on every save. Errors show in the terminal and in the browser's error overlay.
  `vite` is an optional peer dependency.
- Hovers show numeric brands by name: `u32 & Min<1>` reads `number & Wire<"u32"> & Min<1>` instead
  of `number & { readonly [tbr]?: "u32" } & Min<1>`. Types only; no changes to generated code.

## 0.3.0

Compatible with 0.2.5: code generated by 0.2.5 reads with this runtime, and existing types keep
their wire format. A minor version for a new kind of types, so `^0.2` ranges do not pick it up.
Run `tbr generate` only to use them.

- `Record<string, T>`, index signatures, `Map<K, V>`, `ReadonlyMap<K, V>` and tuples, rejected
  until now. A record arrives as a plain object, a map as a `Map`, a tuple as an array. Map keys
  are strings, string literal unions, numbers, bigints and booleans. On the wire a map is its keys
  and its values, so `Record<string, T>` and `Map<string, T>` are interchangeable; a tuple is an
  object with the fields `0`, `1`, … Rules and checks apply to keys, values and elements.

## 0.2.5

Compatible with 0.2.4. No changes to generated code: `tbr generate` is not needed.

- `ts-bin-rpc/tanstack`: TanStack Query options from a client. `createQueryOptions(api)` mirrors the
  router: `rq.user.get.queryOptions(input, options)`, `mutationOptions()`, `queryKey(input)` typed
  for `getQueryData`, and `pathKey()` for invalidation by procedure or namespace. The cache holds
  plain objects; `tbr: { decode: 'lazy' }` keeps views. `hashKey` hashes keys with bigints.
  `@tanstack/query-core` is an optional peer dependency, used only for types.

## 0.2.4

Compatible with 0.2.3: code generated by 0.2.3 reads with this runtime. Run `tbr generate` to
get the faster reads and decoding.

- Arrays of objects read numeric, boolean and `Date` columns from one typed array per element
  type and message instead of a typed array per column. Viewing 10 rows is 25–40% faster, reading
  every field of them 3–10%; reading every field of 100–1000 rows is 1–6% slower. The client is
  0.3 KB gz larger. `columns()` creates its typed arrays on the first call. Run `tbr generate`:
  older generated code still works with this runtime, new generated code needs it.
- The server decodes arrays of objects straight from the columns, without a view per row, at the
  root (`T[]`) and in fields of objects (`{ items: T[] }`): 1000 rows decode 40–45% faster in Node,
  10–25% in browsers. The same path is in `procedures`; `clientProcedures` keeps the old decoder,
  since the client decodes only with `decode: 'eager'` and the path would add 0.2–0.4 KB gz.

## 0.2.3

Compatible with 0.2.2. Run `tbr generate` to use checks: the server table of older generated code
has no input descriptions, and `createHandler` with `checks` or `refine` asks for a new one.

- `Check<'name'>` on any type: a check the server runs on the decoded input, implemented in
  `createHandler({ checks })` as a function or a Standard Schema (Zod, Valibot…). A check without
  an implementation fails `createHandler`.
- Formats: `Email`, `Uuid`, `Url`, `IsoDate`, `IsoDateTime`, with implementations in
  `ts-bin-rpc/formats` (`checks: formats`).
- `createHandler({ refine })`: checks across the fields of a type, by type name, run after the
  checks of the fields.
- A failed check or refinement answers `400 BAD_INPUT` with
  `{ field, rule: 'check' | 'refine', name, path, message }`.

## 0.2.2

Compatible with 0.2.1: the wire format and the lockfile are the same. Code generated by 0.2.1
keeps working; run `tbr generate` to use rules.

- Validation rules in the types: `Min`, `Max`, `MinLength`, `MaxLength` and `Pattern`, combined
  with `&` (`string & MaxLength<64>`). `tbr generate` compiles them into the code that verifies the
  input, and the server checks them before calling the procedure. A broken rule answers
  `400 BAD_INPUT` with `{ field, rule, limit, index? }` as the error data. The client does not
  check outputs. A rule in a wrong place, such as `Min` on a string or an invalid regular
  expression, fails `tbr generate`. See the [validation guide](docs/guide/validation.md).
- `tbr check` also fails when the generated file exists and differs from what `tbr generate` would
  write. A rule changes nothing else, so this is the only way to see that a run was forgotten. A
  project that generates the file in the build is not affected.
- Decoder options take `rules: false` to skip the rules while verifying.
- The types never check rules: a value with some rules goes into a field with others without a
  cast. A bundle without rules does not carry the code that checks them.

## 0.2.1

Compatible with 0.2.0. Run `tbr generate`: code generated by 0.2.0 keeps working, but only newly
generated code reads faster.

- Arrays of row views are no longer keys of a `WeakMap`. In Firefox a `WeakMap` key survives every
  minor garbage collection, and the whole view with it: reading 10 users with verification took
  1.7 times longer than it should. On a Linux runner it ran at 0.67× the speed of `JSON.parse`
  before and 1.12× after.
- `columnsOf(rows)` finds the columns through the rows and returns them only while the array holds
  every row of the view in order. An array sorted in place used to keep the columns of the original
  order; now it gets `undefined`, as do filtered or sliced copies and empty arrays. A copy with
  every row in order gets the columns.
- Streams under `toNodeListener` write frames to the socket as they are pushed, without a
  `ReadableStream` in between: 7.5% less server CPU per frame with `window: 0`. A middleware that
  wraps the response body still gets it as a stream.

## 0.2.0

The first version under `latest` without a prerelease tag: `npm install ts-bin-rpc`. Compatible
with 0.1.0-alpha.3: the wire format is the same, and routers written for it compile as before.
Regenerate with `tbr generate`.

- Queries: `query(procedure, options?)` or `query(namespace, options?)` marks procedures without side
  effects. The client calls them with GET, the input in base64url in the URL (POST past 2 KB). The
  server sets `Cache-Control` from `maxAge` and `public` (`private, no-cache` by default), an
  `ETag`, and answers `304` to a matching `If-None-Match`; errors are `no-store`. Run `tbr generate`
  after adding `query()`. See the [queries guide](docs/guide/queries.md).
- Inside `use()`, procedure parameters without a type get them from the chain: `ctx` is the
  context the chain gives, and an untyped input means no input. `me: async (_, ctx) => ctx.user`
  replaces `me: async (_: void, ctx: Authed) => ctx.user`; annotated procedures work as before.
  A procedure that needs more context than its chain gives now gets the type error itself.
- Benchmarks run on GitHub Actions (`bench.yml`); the README tables and the landing page come from
  the latest published run.

## 0.1.0-alpha.3

- Middleware: `use([...], router)` runs a chain around the procedures of a router or namespace.
  `middleware(fn)` derives the context, `around(fn)` wraps the rest of the chain with `next()`.
  Types follow the chain: procedures declare the context they get, callers give the one the chain
  needs. Chains are composed once at startup. See the [middleware guide](docs/guide/middleware.md).
- `context` runs only for procedures that take `ctx`: generated server tables mark them. Tables
  generated by earlier versions have no mark, and the handler builds the context for every call
  as before; run `tbr generate` to skip it where it is not needed.

## 0.1.0-alpha.2

- Streams: a procedure that returns `stream<T>(setup)`, `channel<T>().subscribe(topic)`, an async
  iterable or a `ReadableStream` sends rows to the client over one HTTP response. The client
  subscribes with `api.x.subscribe(input, handler, options)`; batches carry typed-array `columns`.
  Batching (`window`, `maxRows`), a bounded queue per client (`maxBuffered`, `overflow`) and
  heartbeats are options. See the [streams guide](docs/guide/streams.md) and FORMAT §12.
- New error codes on the client: `SLOW_CONSUMER`, `DISCONNECTED`.
- `columnsOf(rows)` in `ts-bin-rpc`; `Stream`, `Batch`, `Subscription` and `Columns` types.
- Generated code: stream procedures are marked in the tables, and client tables of routers with
  streams import `subscribe` from `ts-bin-rpc/runtime`. Run `tbr generate` after upgrading.

## 0.1.0-alpha.1

- The `tbr` command moved into `ts-bin-rpc`. Replace `ts-bin-rpc-cli` with `ts-bin-rpc` and keep
  `typescript@7.1.0-beta` as a dev dependency; it is an optional peer dependency of `ts-bin-rpc`.
  `ts-bin-rpc-cli` is deprecated and gets no new versions.
- Published from GitHub Actions with npm provenance.

## 0.1.0-alpha.0

First published version.

- `ts-bin-rpc`: numeric brands, `RpcError`, `toPlain`; `createHandler` (Fetch API) in
  `ts-bin-rpc/server`, `toNodeListener` in `ts-bin-rpc/node`, `createClient` in
  `ts-bin-rpc/client`; the codec runtime for generated code in `ts-bin-rpc/runtime`.
- `ts-bin-rpc-cli`: `tbr generate` (with `--watch`), `tbr check`, `tbr decode`.
- Wire format v0: tables with field IDs, two string blocks per message, arrays of objects stored
  column by column, typed arrays read in place.
- Lazy views by default, `decode: 'eager'` for plain objects, per client, procedure or call.
- Responses are verified in development and not in production builds by default; requests always.
