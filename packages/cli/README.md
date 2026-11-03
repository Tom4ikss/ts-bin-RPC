# ts-bin-rpc-cli

The `tbr` command for [ts-bin-rpc](https://www.npmjs.com/package/ts-bin-rpc): reads your router's
TypeScript types through TypeScript 7.1, keeps a lockfile of field IDs (`tbr.lock.json`) and
generates codecs (`tbr.gen.ts`).

```sh
npm install -D ts-bin-rpc-cli@alpha typescript@7.1.0-beta
npx tbr generate          # --watch to regenerate on save
npx tbr check             # in CI: fails on breaking changes against the lockfile
npx tbr decode response.bin --proc user.get
```

**Alpha.** Use the CLI of the same version as `ts-bin-rpc`. Docs:
https://tom4ikss.github.io/ts-bin-RPC/guide/cli/. MIT license.
