# ts-bin-rpc

A code-first TypeScript RPC with a binary wire format. Your router's TypeScript types are the
schema: [`ts-bin-rpc-cli`](https://www.npmjs.com/package/ts-bin-rpc-cli) reads them and generates
codecs. The client gets lazy views over the response bytes, and numeric arrays arrive as
`TypedArray` columns with no parsing.

This package is the runtime: `ts-bin-rpc/server`, `ts-bin-rpc/client`, `ts-bin-rpc/node`, the
numeric brands and the codec runtime the generated code imports.

```sh
npm install ts-bin-rpc@alpha
npm install -D ts-bin-rpc-cli@alpha typescript@7.1.0-beta
```

**Alpha.** The wire format may change before 1.0. Docs: https://tom4ikss.github.io/ts-bin-RPC/.
Source and issues: https://github.com/Tom4ikss/ts-bin-RPC. MIT license.
