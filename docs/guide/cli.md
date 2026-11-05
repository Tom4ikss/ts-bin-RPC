---
title: CLI
description: tbr generate, check and decode, with every option.
---

# CLI

```
tbr generate | check [options]
tbr decode <file|-> (--proc <path> [--input] | --type <Name>) [options]
```

## `tbr generate`

Reads the router's types, updates `tbr.lock.json` and writes `tbr.gen.ts`.

```sh
pnpm exec tbr generate --router src/server/router.ts
```

It prints every change to the contract with its severity and refuses breaking ones unless you pass
`--allow-breaking` (see [Schema evolution](./evolution.md)). Files that are already up to date are
not rewritten, so tools watching them don't reload for nothing.

| Option | Default | |
|---|---|---|
| `--project <tsconfig>` | `tsconfig.json` | the TypeScript project that contains the router |
| `--router <file#export>` | `src/router.ts#appRouter` | the router module and the name of its export |
| `--lock <file>` | `tbr.lock.json` next to the tsconfig | the lockfile |
| `--out <file>` | `tbr.gen.ts` next to the router | the generated codecs |
| `--watch`, `-w` | | regenerate on every change to the project's files |
| `--allow-breaking` | | accept breaking changes |
| `--dry-run` | | print the schema and the lockfile instead of writing |

### Watch

```sh
pnpm exec tbr generate --watch --router src/server/router.ts
```

```
src/server/router.ts changed (snapshot 9 ms)
  safe     Host.uptime: field added  (src/server/router.ts:19:3)
updated tbr.lock.json
wrote src/server/tbr.gen.ts
regenerated in 11 ms
```

The watcher keeps one TypeScript project open and reuses the compiler's work between saves, so a
regeneration takes 10–20 ms. A type that cannot be sent is reported, and watching goes on. Ctrl+C
stops it. The watcher compares types with the lockfile as it was when watching started; see
[watch mode](./evolution.md#watch-mode) for why.

In a Vite app, the [Vite plugin](#vite-plugin) runs the watcher for you.

## Vite plugin

`ts-bin-rpc/vite` runs `tbr generate` inside Vite: once before `vite build`, and in the dev server
at start and on every save, as `--watch` does. Install `vite` (6 or later) next to `ts-bin-rpc`.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { tbr } from 'ts-bin-rpc/vite';

export default defineConfig({
  plugins: [tbr({ router: 'src/server/router.ts' })],
});
```

| Option | Default | |
| --- | --- | --- |
| `router` | `src/router.ts#appRouter` | the router, `file#export` |
| `project` | `tsconfig.json` | the TypeScript project, relative to Vite's root |
| `lock` | `tbr.lock.json` | the lockfile |
| `out` | `tbr.gen.ts` next to the router | the generated codecs |
| `allowBreaking` | `false` | accept breaking changes |

`router`, `lock` and `out` are relative to the tsconfig's directory, as on the command line.

A type that cannot be sent fails `vite build`. In the dev server it shows in the terminal and in
the browser's error overlay, and the last good codecs stay on disk; the overlay goes away with the
next save that generates. Breaking changes are not written unless `allowBreaking` is set, the same
as without `--allow-breaking`. Keep `tbr check` in CI: the plugin writes the lockfile, it does not
guard it.

The plugin only generates. To serve the router from the dev server, see the
[dashboard example](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/examples/dashboard/vite.config.ts),
which hands `/rpc/*` to the handler.

## `tbr check`

```sh
pnpm exec tbr check --router src/server/router.ts
```

Exits with 1 if the lockfile is missing or does not match the types, and prints the changes with
their severity. If the generated file exists, it must also be what `tbr generate` would write now:
a [validation rule](./validation.md) changes nothing else. It never writes. Run it in CI.

## `tbr decode`

Prints a captured message as JSON: save a request or response body from the Network tab, then
decode it with the generated codecs.

```sh
pnpm exec tbr decode response.bin --proc user.get           # output of user.get
pnpm exec tbr decode request.bin --proc user.get --input    # input of user.get
pnpm exec tbr decode body.bin --type User                   # a message holding one User
curl -s … | pnpm exec tbr decode - --proc user.get          # from stdin
```

An error response is printed as `{ "error": { code, message, data } }` without needing the
procedure. A message that fails verification prints why. `bigint` values print as strings and typed
arrays as arrays.

## Exit codes

| Code | |
|---|---|
| 0 | success |
| 1 | types that cannot be sent, blocked changes, an out-of-date lockfile, an invalid message |
| 2 | wrong usage |
