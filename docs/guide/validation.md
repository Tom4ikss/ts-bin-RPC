---
title: Validation
description: "Min, Max, MinLength, MaxLength and Pattern: rules in the types, checked by the server while it verifies the input."
---

# Validation

The types already reject a value of the wrong shape: a string where a `u32` should be, a missing
field, a `-1` in a `u8`. Rules go further and restrict the values. Write them in the type with `&`:

```ts
import type { Max, MaxLength, Min, MinLength, Pattern, u8 } from 'ts-bin-rpc';

type Slug = string & MinLength<2> & MaxLength<32> & Pattern<'^[a-z0-9-]+$'>;

interface CreateUser {
  name: string & MinLength<1> & MaxLength<64>;
  email: string & Pattern<'^[^@\\s]+@[^@\\s]+$'>;
  age?: u8 & Min<18>;
  tags: Slug[] & MaxLength<10>;
}

export const appRouter = {
  createUser: async (input: CreateUser) => db.users.insert(input),
};
```

A rule is an optional property with a symbol key that is never there, like a
[numeric brand](./types.md#numeric-brands). `string & MaxLength<64>` takes any string without a
cast, and `input.name` is a `string` in the procedure. The types never check the rules: a value
with any rules goes into a field with other rules, such as `input.name` into an output field of
`string & MaxLength<16>`.

`tbr generate` compiles the rules into the code that verifies the input. The server checks them
before it calls the procedure, as part of the same pass over the message.

## Rules

| Rule | Applies to | Passes when |
|---|---|---|
| `Min<N>` | numbers, `u64` and `i64` | value ≥ N |
| `Max<N>` | numbers, `u64` and `i64` | value ≤ N |
| `MinLength<N>` | `string`, `T[]`, `Uint8Array` and typed arrays | length ≥ N |
| `MaxLength<N>` | `string`, `T[]`, `Uint8Array` and typed arrays | length ≤ N |
| `Pattern<'re'>` | `string` | `new RegExp(re).test(value)` |

- Limits are inclusive. `NaN` fails both `Min` and `Max`.
- For `u64` and `i64`, write the limit as a `bigint` or an integer: `u64 & Max<10000000000000000000n>`.
- The length of a string is `string.length`: UTF-16 code units, as in JavaScript. `'🔥'` has length 2.
- `Pattern` is not anchored for you. Write `^` and `$` to match the whole string.
- Rules on an element apply to every element: in `Slug[]`, each string must match. Rules on the
  array type apply to the array: `Slug[] & MaxLength<10>`.
- Rules on an optional or nullable field apply when the value is there: `age?: u8 & Min<18>`
  accepts a missing `age`.

`tbr generate` rejects a rule that cannot work. Examples: `Min` on a string, an argument that is not
a literal (`MaxLength<number>`), an invalid regular expression, `Min<5> & Max<1>`, or rules on an
object or a union:

```
src/router.ts:12:3  CreateUser.name: Min applies to numbers and bigints
```

## Errors

An input that breaks a rule gets `400 BAD_INPUT`. The procedure is not called. `data` names the
field, the rule and its limit, so the client can show the error next to the field:

```ts
try {
  await api.createUser({ name: '', email: 'ann@example.com', tags: [] });
} catch (e) {
  if (e instanceof RpcError && e.code === 'BAD_INPUT' && e.data) {
    e.message; // 'CreateUser.name is shorter than 1'
    e.data;    // { field: 'CreateUser.name', rule: 'minLength', limit: 1 }
  }
}
```

| Field | |
|---|---|
| `field` | type and field, `CreateUser.name`; an element of an array field ends with `[]`, `CreateUser.tags[]` |
| `rule` | `'min'`, `'max'`, `'minLength'`, `'maxLength'` or `'pattern'` |
| `limit` | the rule's argument; a decimal string for `u64` and `i64`, the source for `Pattern` |
| `index` | the element of an array, or the row of an array of objects, when the value is in one |

The anonymous input type of `createUser` is named `createUser:input` in `field`.

The check stops at the first broken rule. The input is in a binary message, not in an object, and
the server does not decode it to collect every error. Check a form on the client first if you want
all the errors at once.

## Where rules are checked

Only the server checks rules, and only on procedure inputs, stream inputs included. The client does
not check the outputs it receives. A rule on an output type documents the value; nothing enforces
it. Code that verifies a message itself can switch the rules off:

```ts
codec.decode(bytes, { rules: false });
```

Rules are not part of the wire format or the lockfile. Adding, changing or removing one is not a
breaking change. A client generated before the change keeps working; it gets `BAD_INPUT` if it
sends a value the new rule rejects.

A rule takes effect only after `tbr generate`. The types do not show a forgotten run: a
`string & MaxLength<64>` accepts every `string`, which is what lets you assign without casts. If
you commit the generated file, `tbr check` compares it with what `tbr generate` would write, and
fails with `tbr.gen.ts is out of date`. If you generate it in the build, it is always current.

## Cost

A range or length check costs a few nanoseconds per value: the length of a string is in the
message, so checking it needs no decoding. `Pattern` costs more: the string is decoded and the
regular expression runs on it. A string sent several times in an array of objects is stored once,
and checked once.

Measured on an input with 1000 objects (Node 22, Apple M3). A verified view without rules takes
10 µs. Six range and length rules on each object add 23 µs, about 4 ns per check. A `Pattern` on
one more string of each object adds another 30 µs. Decoding the same input into plain objects
takes 90 µs.

## Not yet

- Formats (`Email`, `Uuid`, `Url`) as named checks.
- Rules across fields (`end > start`) and checks that need the database. Write them in the procedure
  for now, or in a [middleware](./middleware.md), and throw `RpcError('BAD_INPUT', …)`.
