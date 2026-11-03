---
title: FAQ
description: Why not tRPC, protobuf or FlatBuffers, and answers about TanStack Query, SSR, compression and browsers.
---

# FAQ

## Why not tRPC?

tRPC is the model for the developer experience here: a router of functions, client types from
`typeof appRouter`, no IDL. Use tRPC if JSON is fine for you. It is mature, it has an ecosystem, and
for small text-heavy responses JSON is as compact as this format.

ts-bin-rpc is for apps where the payloads hurt: dashboards, tables of thousands of rows, telemetry,
maps, anything with numbers in bulk. There it reads several times faster, hands typed arrays to
your charts without copying, and checks schema evolution, which JSON APIs usually leave to luck.
What it lacks today: TanStack Query bindings, WebSocket subscriptions, request batching and
middleware. Server-to-client streams over HTTP are there, see [Streams](./streams.md).

## Why not protobuf, Connect or gRPC-web?

They start from a `.proto` file; ts-bin-rpc starts from your TypeScript. If other languages call
your API, protobuf is the right choice. With a TypeScript client and server only, an IDL is one more
source of truth to keep in sync. Protobuf in JavaScript also decodes eagerly into objects, and
repeated numbers can't arrive as a typed array without a copy.

## Why not FlatBuffers or Cap'n Proto?

The format borrows from them: tables with field IDs, zero-copy reads, verification. But their
schemas are written in an IDL, their JS readers make you call `user.name()` instead of reading
`user.name`, and their strings are UTF-8, which browsers decode slowly one field at a time.
ts-bin-rpc stores strings in two blocks per message, keeps arrays of objects in columns, and makes
views that look like your interfaces.

## Why not MessagePack or CBOR?

They are binary JSON: smaller than JSON uncompressed, but self-describing. Every message carries its
keys, so they gain little after gzip, and they decode eagerly. They also carry no schema, so nothing
checks evolution.

## Do I need a validation library like Zod?

Not for shape. The server verifies every input against the generated schema, so a handler never
sees a missing field, a string where a `u32` should be, or an out-of-range enum. Rules about
values, such as an email format or `from < to`, are yours: check them in the procedure and throw
`RpcError('BAD_INPUT', …)`.

## Does it work with TanStack Query?

Yes, call the client in `queryFn`:

```ts
const { data } = useQuery({ queryKey: ['user', id], queryFn: () => api.user.get({ id }) });
```

`data` is a view. Structural sharing treats views as new values on each fetch, which is correct, so
components re-render when data arrives. If you persist the cache, it is serialized through `toJSON`,
which works. First-class bindings are planned.

## SSR, React Server Components, workers?

Views are class instances over a buffer. When data crosses a boundary that copies it
(`structuredClone`, `postMessage`, RSC props, IndexedDB), pass `toPlain(view)`, or have the client
return plain objects with `decode: 'eager'`. See [Views](./views.md#plain-objects).

## Do I still need HTTP compression?

Yes, enable it as for JSON. Many servers and CDNs compress only known content types, so add
`application/vnd.tbr`, for example to `gzip_types` in nginx.

## Which runtimes and browsers?

- **Server:** Node 22+, Bun, Deno, Cloudflare Workers and anything else with the Fetch API.
- **Browsers:** current Chrome, Firefox and Safari. The runtime uses `String.prototype.isWellFormed`
  (Chrome 111, Firefox 119, Safari 16.4).
- **No `eval` or `new Function`**, so a strict Content Security Policy works.

## Which TypeScript version?

The CLI reads types through the TypeScript 7.1 compiler API, so `typescript@7.1` is its dev
dependency. The generated file is ordinary TypeScript without compiler-specific features, but it is
only tested with 7.1 so far.

## Can I see the requests in DevTools?

The bodies are binary, so the Network tab shows bytes. Pass `debug: true` to `createClient` to log
every call with its input and output as plain objects, or save a body and run
`tbr decode body.bin --proc user.get`.

## Is the format stable?

Not yet. Until 1.0 the format version in the header may change, and a client and server from
different versions refuse each other's messages with a clear error. After 1.0 the format and the
lockfile are versioned, and changes stay compatible.
