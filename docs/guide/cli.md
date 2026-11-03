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

In a Vite app you can start it from a plugin; the
[dashboard example](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/examples/dashboard/vite.config.ts)
does.

## `tbr check`

```sh
pnpm exec tbr check --router src/server/router.ts
```

Exits with 1 if the lockfile is missing or does not match the types, and prints the changes with
their severity. It never writes. Run it in CI.

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
