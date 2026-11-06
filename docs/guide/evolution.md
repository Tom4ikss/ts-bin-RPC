---
title: Schema evolution
description: The lockfile, which changes are safe, renames, and how stale generated code is caught.
---

# Schema evolution

Clients and servers don't update at the same moment. During a deploy, a browser tab opened an hour
ago still runs the old client. ts-bin-rpc makes it safe for both versions to talk, and tells you in
CI when a change would break that.

## The lockfile

`tbr generate` keeps `tbr.lock.json` next to your tsconfig. It gives every field a stable ID, and
every enum value and union variant a fixed index. The wire format uses these numbers, not names or
declaration order. Commit the lockfile. One line in it is one field, so its diff reads like a diff
of the contract:

```json
"User": {
  "fields": {
    "id": { "id": 0, "type": "u32" },
    "name": { "id": 1, "type": "string" },
    "email": { "id": 2, "type": "string" },
    "nick": { "id": 5, "type": "string | undefined", "retired": true }
  }
}
```

The lockfile only grows. A removed field is marked `retired`, and its ID is never given to another
field. You can bring the field back with the same type, and it gets its old ID. Bringing it back
with a different type is an error: old peers may still send the old type under that ID.

## Safe and breaking changes

Whether a change breaks old peers depends on the direction the type travels. A type in an
**input** is written by clients and read by the server. A type in an **output** is written by the
server and read by clients. A type used in both directions follows both sets of rules.

The table, and `tbr check`, take the usual order of a deploy: the server goes first, and old clients
(tabs opened before the deploy) call the new server.

| Change | Input type | Output type |
|---|---|---|
| Add an optional field | safe | safe |
| Add a required field | **breaking**: old clients don't send it | safe |
| Remove an optional field | safe | safe |
| Remove a required field | safe | **breaking**: old clients expect it |
| Make a field optional | safe | **breaking** |
| Make a field required | **breaking** | safe |
| Change a field's type | **breaking** | **breaking** |
| Rename with `@renamedFrom` | safe | safe |
| Rename without it | remove + add | remove + add |
| Reorder fields, enum values or variants | safe | safe |
| Add an enum value or union variant | safe | **breaking**: old clients can't read it |
| Remove an enum value or union variant | **breaking** | safe |
| Add values past the 256th to an enum | **breaking**: its index widens from 1 byte to 2 | **breaking** |
| Add a procedure | safe | safe |
| Remove a procedure | **breaking**: old clients still call it | |
| Remove `query()` from a procedure | **breaking**: old clients call it with GET | |
| Change a procedure's input or output type | **breaking** | **breaking** |

A field whose type changed with `--allow-breaking` gets a new ID, and the old one is retired: a peer
of the old version sees the field missing, not the new type's bytes read as the old type.

### New clients, old servers

When clients can be newer than the server they reach, for example a client deployed before the
server, servers of two versions behind one load balancer, or a rollback of the server, the
directions swap: a new client writes inputs that an old server reads, and reads outputs that an old
server wrote. Read the table with the columns swapped. Adding an optional field to an input stays
safe either way; adding a required field to an output, safe above, is breaking here: the new client
expects it, and the old server does not send it. If both orders can happen, only changes safe in
both columns are.

`tbr check` labels every change `safe`, `breaking` or `error`. `tbr generate` refuses to write
breaking changes unless you pass `--allow-breaking`. Pass it when you know no old peers are
around, for example before the first release, or when clients and server always deploy together.

```
$ tbr check
tbr.lock.json is out of date:
  breaking User.email: required field removed from a type used in output; old clients expect it
  safe     User.avatar: field added
the contract has breaking changes
```

## Renames

Without a hint, a rename looks like removing one field and adding another. `tbr check` notices
when both have the same type and suggests the tag. Add it to the field:

```ts
interface User {
  /** @renamedFrom mail */
  email: string;
}
```

`email` keeps the ID of `mail`. Old and new peers read each other's messages unchanged. You can
remove the tag once no peer has the old name in its generated code.

## In CI

```sh
pnpm exec tbr check --router src/router.ts --base origin/main
```

`tbr check` rebuilds the lockfile in memory and fails if it differs from the committed one: that
catches a forgotten `tbr generate` or a lockfile left out of the commit. With `--base` it also
compares the types with the lockfile of the base branch, which catches a breaking change committed
together with its lockfile after `--allow-breaking`. Breaking changes exit with code 3, so CI can
tell them from a stale lockfile; see [`tbr check`](./cli.md#tbr-check).

## Watch mode

`tbr generate --watch` regenerates on every save, but it compares your types with the lockfile as
it was **when watching started**, not with its last write. Otherwise every intermediate save would
become part of the contract. A field you added, saved, and renamed a minute later would stay in the
lockfile forever as `retired`, and the rename would be refused as breaking, although nobody had
seen the first name. If the lockfile changes on disk from outside (a checkout, a pull), the
watcher takes the new file as its base.

## Stale generated code

Four checks catch generated code that no longer matches the router or the runtime:

1. **Types.** The generated file exports a `Contract` type. It requires the generated input and
   output types of every procedure to be mutually assignable with the router's types, and the set
   of procedures to match. Change a type without regenerating, and `tsc` fails:

   ```
   Type 'StaleCodegen_RunTbrGenerate<"user.get output">' does not satisfy the constraint 'true'.
   ```

   Brands count: changing `u32` to `u16` is caught too.
2. **Server startup.** `createHandler` fails if the router and the generated table have different
   procedures.
3. **Runtime.** Each request carries a hash of the procedure's contract in the `x-tbr-schema`
   header. A server that sees another hash warns once per procedure, or answers
   `409 SCHEMA_MISMATCH` with `schemaMismatch: 'error'`. Clients with `debug: true` warn too. The
   hash covers what the wire depends on (field IDs, types, enum values, variants, `query()`), so a
   safe change such as an added field changes it only for the procedures whose types it touches.
4. **The runtime version.** Generated code checks at import that the installed `ts-bin-rpc` speaks
   the interface it was generated for. After an upgrade that changes it, importing an old
   `tbr.gen.ts` throws `the generated codecs (tbr.gen.ts) are for another version of ts-bin-rpc
   than the one installed: run tbr generate`.
