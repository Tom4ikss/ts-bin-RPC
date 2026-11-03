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
| Add a procedure | safe | safe |
| Remove a procedure | **breaking**: old clients still call it | |
| Change a procedure's input or output type | **breaking** | **breaking** |

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
pnpm exec tbr check --router src/router.ts
```

`tbr check` rebuilds the lockfile in memory and fails if it differs from the committed one. That
catches two mistakes: forgetting to commit `tbr.lock.json`, and committing a breaking change by
accident.

## Watch mode

`tbr generate --watch` regenerates on every save, but it compares your types with the lockfile as
it was **when watching started**, not with its last write. Otherwise every intermediate save would
become part of the contract. A field you added, saved, and renamed a minute later would stay in the
lockfile forever as `retired`, and the rename would be refused as breaking, although nobody had
seen the first name. If the lockfile changes on disk from outside (a checkout, a pull), the
watcher takes the new file as its base.

## Stale generated code

Three checks catch generated code that no longer matches the router:

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
   `409 SCHEMA_MISMATCH` with `schemaMismatch: 'error'`. Clients with `debug: true` warn too.
