# Security

ts-bin-rpc is an alpha. Use it on servers and clients you control, and read this page before you
expose a handler to the internet.

## Reporting a vulnerability

Report it privately through [GitHub security advisories](https://github.com/Tom4ikss/ts-bin-RPC/security/advisories/new),
not in a public issue. Expect a reply within a week. Fixes go into the latest alpha only.

## What is verified

The server verifies every request before a procedure sees it, against the codecs generated from the
router:

- the header: magic bytes, format version, reserved bits, block bounds;
- offsets and lengths stay inside the message;
- the ASCII string block has no byte above `0x7f`, the UTF-16 block is well-formed;
- enum indexes and union tags exist, required fields are present;
- nesting depth (`maxDepth`, 64) and the number of elements (`maxNodes`, 16M) stay within limits,
  so a message with reused offsets cannot make a reader loop or allocate without bound;
- the message size (`maxBytes`, 64 MB).

A request that fails is answered `400 BAD_INPUT`; it never reaches the procedure and never crashes
the process. Inputs are decoded into objects built by generated code with a fixed set of keys, so
a message cannot set `__proto__` or keys the type does not have.

Outputs are checked while they are encoded: a value that breaks its declared type (a negative
`u32`, a missing field) is a `500 BAD_OUTPUT`, with the details passed to `onError` and not sent to
the client. Other errors thrown by a procedure become `500 INTERNAL` without a message; only
`RpcError` reaches the client as it was thrown.

## What is not verified

- **Meaning.** Verification checks shape and ranges of the declared types. Authorization, ownership
  and business rules are the procedure's job.
- **Responses in production builds.** The client skips verification by default when
  `process.env.NODE_ENV` is `'production'`. Without it, a broken or hostile response can throw a
  `RangeError` on read, return wrong values or allocate large arrays. Pass `verify: true` to
  `createClient` when the server is not yours.
- **Body size before it is read.** `createHandler` rejects a request whose `content-length` is over
  `maxBytes`, but a chunked request without one is read in full before the check. `toNodeListener`
  counts bytes as they arrive and stops at `maxBytes`; on Bun, Deno and edge runtimes set the
  platform's own body limit.
- **Transport.** No authentication, CSRF protection or rate limiting. Headers and `ctx` are yours to
  check.
