# Changelog

Until 1.0 the wire format and the generated code may change between versions. Every message
carries a format version in its header: a reader rejects a version it does not know with a
`VerifyError` instead of misreading it. `tbr check` compares the router with the committed
lockfile and reports breaking changes. The `tbr` command ships in the same package as the runtime,
so generated code and the runtime that reads it come from one version.

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
