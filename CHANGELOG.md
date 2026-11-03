# Changelog

Until 1.0 the wire format and the generated code may change between versions. Every message
carries a format version in its header: a reader rejects a version it does not know with a
`VerifyError` instead of misreading it. `tbr check` compares the router with the committed
lockfile and reports breaking changes. The `tbr` command ships in the same package as the runtime,
so generated code and the runtime that reads it come from one version.

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
