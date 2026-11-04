# ts-bin-rpc

A code-first TypeScript RPC with a binary wire format. Your router's TypeScript types are the
schema: the `tbr` command reads them, keeps a lockfile of field IDs and generates codecs. The
client gets lazy views over the response bytes, and numeric arrays arrive as `TypedArray` columns
with no parsing.

```sh
npm install ts-bin-rpc
npm install -D typescript@7.1.0-beta   # for tbr
npx tbr generate                       # --watch to regenerate on save; tbr check in CI
```

The package provides `ts-bin-rpc/server`, `ts-bin-rpc/client`, `ts-bin-rpc/node`, the numeric
brands, the codec runtime the generated code imports, and `tbr`. TypeScript is an optional peer
dependency that only `tbr` needs.

**Alpha.** The wire format may change before 1.0. Docs: https://tom4ikss.github.io/ts-bin-RPC/.
Source and issues: https://github.com/Tom4ikss/ts-bin-RPC. MIT license.
