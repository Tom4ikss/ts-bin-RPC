---
title: Validation
description: "Rules (Min, MaxLength, Pattern…), formats (Email, Uuid…), custom checks and refine: validation in the types, run by the server on every input."
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
the server does not decode it to collect every error. To show every error of a form at once, check
it [on the client](#on-the-client) first.

A failed check or refinement answers `400 BAD_INPUT` too, with the path of the value:

```ts
e.message; // 'guests[1].email is not a valid email'
e.data;    // { field: 'Guest.email', rule: 'check', name: 'email', path: 'guests[1].email', message: 'is not a valid email' }

e.message; // 'events[0].range: starts after it ends'
e.data;    // { field: 'DateRange', rule: 'refine', name: 'DateRange', path: 'events[0].range', message: 'starts after it ends' }
```

The rules run first, while the server verifies the message; checks and refinements after it has
decoded the input, in the order of the value: a field before the object that holds it.

## Formats and custom checks

`Check<'name'>` names a check that the rules above cannot express. The server runs it on the
decoded value, and you give the implementation to `createHandler`. The formats are checks with
names and implementations ready:

```ts
import type { Check, Email, IsoDate, u32, Url, Uuid } from 'ts-bin-rpc';

type Slug = string & Check<'slug'>;

interface Guest {
  email: Email; // string & Check<'email'>
  id: Uuid;
  site?: Url;
  tags: Slug[];
  seats: u32 & Check<'even'>;
}
```

```ts
import { formats } from 'ts-bin-rpc/formats';

createHandler(appRouter, {
  procedures: serverProcedures,
  checks: {
    ...formats,
    slug: (v: string) => /^[a-z0-9-]+$/.test(v),
    even: (v: number) => v % 2 === 0 || 'must be even',
  },
});
```

| Format | Accepts |
|---|---|
| `Email` | what `<input type="email">` accepts: `name@domain`, no quoted names or IP domains, at most 254 characters |
| `Uuid` | 8-4-4-4-12 hex digits, any version, either case |
| `Url` | an absolute URL that `new URL()` accepts, any scheme |
| `IsoDate` | `YYYY-MM-DD`, a date that exists |
| `IsoDateTime` | RFC 3339: `2026-11-04T18:00:00Z`, `…T18:00:00.5+03:00` |

A check is a function that returns `true` (or nothing) to pass, `false` to fail with "is not a
valid slug", or a string to fail with that message. It may be async. A
[Standard Schema](https://standardschema.dev) works in its place, so a Zod or Valibot schema you
already have plugs in: `checks: { slug: z.string().regex(/^[a-z-]+$/) }`.

`Check` goes on any type: strings, numbers, arrays, objects. Several checks run in the order they
are written. Formats are a module of their own, `ts-bin-rpc/formats`: a server that does not import
it does not carry them.

If an input uses a check that `checks` does not implement, `createHandler` throws when it starts:

```
check 'slug' on Guest.tags[] has no implementation; pass it in createHandler({ checks })
```

## Refine

Rules across the fields of a type go to `refine`, by the type's name:

```ts
interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

createHandler(appRouter, {
  procedures: serverProcedures,
  checks: formats,
  refine: {
    DateRange: (r: DateRange) => r.start <= r.end || 'starts after it ends',
  },
});
```

A refinement runs on every value of its type in an input, nested or in arrays, after the checks of
its fields: `r.start` is a valid date by then. It takes the same results as a check, a Standard
Schema included. A union is refined by its alias name, after the refinement of the variant.

Name the types you refine: an anonymous input type is named after its procedure, `createUser:input`.
A name that no input contains makes `createHandler` throw, so a typo does not switch a check off.

Checks and refinements see the plain decoded value and cannot change it. They have no `ctx`: a check
that needs the database, such as a free user name, belongs in the procedure or a
[middleware](./middleware.md).

## On the client

`tbr generate` also writes the inputs with their rules and checks as data, `inputRules`.
`inputSchema()` from `ts-bin-rpc/validate` turns one into a [Standard Schema](https://standardschema.dev),
which TanStack Form, react-hook-form and others take where they take a Zod schema:

```ts
import { inputSchema } from 'ts-bin-rpc/validate';
import { formats } from 'ts-bin-rpc/formats';
import { inputRules } from './tbr.gen';

const createUser = inputSchema(inputRules.createUser, { checks: formats });

const result = createUser['~standard'].validate(values);
result.issues; // [{ message: 'is shorter than 1', path: ['name'], field: 'CreateUser.name', rule: 'minLength', limit: 1 }, …]

// TanStack Form
useForm({ defaultValues, validators: { onChange: createUser } });
// react-hook-form, with @hookform/resolvers
useForm({ resolver: standardSchemaResolver(createUser) });
```

It checks what the server checks, and reports every issue instead of the first:

- **The shape**: a value the encoder would reject, such as `300` in a `u8` or a missing field,
  is an issue with `rule: 'type'` and `expected u8, got 300`.
- **The rules**, with the texts of the server: `is shorter than 1`, `does not match /^[a-z]+$/`.
  `field`, `rule` and `limit` are the same as in the server's `BAD_INPUT` data.
- **Checks and refinements** you pass, as to `createHandler`: `checks` and `refine`, functions or
  Standard Schemas. A check you do not pass is left to the server, for checks that need its data,
  like a free user name. A value's checks run when its parts are clean, and its refinements after its
  checks pass, as on the server.

`message` gives your text for an issue, in the user's language for example; return `undefined` to
keep the default:

```ts
inputSchema(inputRules.createUser, {
  checks: formats,
  message: (issue) => (issue.rule === 'minLength' ? `at least ${issue.limit} characters` : undefined),
});
```

`validate` is synchronous unless a check or a refinement returns a promise. Its output is the input as
it is: rules do not transform values.

A client that does not import `ts-bin-rpc/validate` does not carry it or `inputRules`: bundlers drop
both. For the e2e router, all of it with the formats adds 2.1 KB gzip
([size.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/size.md)).

The client validator is a convenience for forms, not a guard: the server checks every input anyway.

## Where rules are checked

The server checks rules, checks and refinements on procedure inputs, stream inputs included; a client
checks them only [when you ask](#on-the-client). The client does not check the outputs it receives. A rule on an output type documents the value; nothing enforces
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

Checks and refinements cost what your functions cost, plus a walk over the parts of the input
that lead to them. An input that reaches no check and no refined type is not walked at all.
