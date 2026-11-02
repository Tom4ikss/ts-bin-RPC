# TypeScript-native RPC frameworks (code-first, end-to-end typed) — state as of Nov 2026

Research date: 2026-11-02. Repo stats were pulled live from the GitHub REST API (`api.github.com/repos/...`) and npm data from `registry.npmjs.org` / `api.npmjs.org/downloads/point/last-month/...` on that date. Those are cited as "GitHub API" / "npm registry" with the repo/package URL.

## Q1. Per-framework snapshot: architecture, wire format, validation, perf, versioning, DX, maintenance, known problems

### Takeaway
The mainstream (tRPC, oRPC, Hono RPC, Elysia Eden) all infer types from server code via `typeof router` with no codegen. They use JSON on the wire (plus SSE/streaming and FormData/Blob) and validate with Standard Schema validators (Zod, Valibot, ArkType). None offers a binary body format for structured data. The binary TS-first options are TSRPC/tsbuffer (dormant, ~2.5k downloads/month), Deepkit RPC/BSON (alive, niche, ~10k downloads/month), Effect RPC's new `SchemaBinary`, and typia's protobuf codegen. All of them **decode eagerly** into JS objects.

### Cited Findings

**Maintenance and adoption table (live data, 2026-11-02)**

| Project | Stars | Last push | Latest npm version (date) | npm downloads, last month |
|---|---|---|---|---|
| tRPC (`@trpc/server`) | 40,761 | 2026-11-02 | 11.22.1 (2026-10-28) | 21.9M |
| oRPC (`@orpc/server`) | 5,750 | 2026-11-02 | 1.16.1 (2026-10-22); 2.0.0-beta exists | 7.3M |
| Hono (`hono`, whole framework) | 32,790 | 2026-11-01 | 4.13.16 (2026-11-01); `next` = 5.0.0-rc.1 | 288M |
| Elysia / Eden | 19,328 | 2026-10-28 | elysia 1.4.30 (2026-08-26), `next` 2.0.0-beta.32; eden 1.4.9 | 6.0M / 1.85M |
| ts-rest (`@ts-rest/core`) | 3,341 | **archived** | 3.52.1 (2025-03-04) | 2.85M |
| Zodios (`@zodios/core`) | 1,918 | 2026-10-28 | 10.9.6 (**2023-08-22**) | 1.36M |
| TSRPC (`tsrpc`) | 1,939 | 2026-02-26 | 3.4.21 (2025-10-10) | **2.5k** |
| tsbuffer | 45 | 2025-10-13 | 2.2.23 (2025-10-13) | 3.3k |
| Deepkit (`@deepkit/rpc`) | 3,545 | 2026-11-01 | 1.1.0 (2026-10-31) | 9.7k (`@deepkit/type` 55.6k) |
| ConnectRPC (`@connectrpc/connect`, schema-first, for reference) | — | — | — | 22.7M |

Sources: GitHub API for [trpc/trpc](https://github.com/trpc/trpc), [middleapi/orpc](https://github.com/middleapi/orpc), [honojs/hono](https://github.com/honojs/hono), [elysiajs/elysia](https://github.com/elysiajs/elysia), [ts-rest/ts-rest](https://github.com/ts-rest/ts-rest), [ecyrbe/zodios](https://github.com/ecyrbe/zodios), [tsrpc/tsrpc](https://github.com/tsrpc/tsrpc), [k8w/tsbuffer](https://github.com/k8w/tsbuffer), and [marcj/deepkit](https://github.com/marcj/deepkit). npm data from [registry.npmjs.org](https://registry.npmjs.org/@trpc/server) and [api.npmjs.org](https://api.npmjs.org/downloads/point/last-month/tsrpc). Note: the oRPC download count is likely inflated by transitive dependencies. I did not verify why.

---

**tRPC (v11)**
- **Architecture:** the client imports `type AppRouter = typeof appRouter`. All types come from TS inference, with no codegen. This is the defining design (general knowledge, consistent with all sources below).
- **v11 (released 2025-03-21):** TanStack Query v5 support with Suspense, plus a new TanStack React Query integration. Adds FormData and non-JSON content types (Blob, File, Uint8Array), RSC/App Router prefetch helpers, `httpBatchStreamLink` for streamed responses, SSE subscriptions (recommended over WebSockets), generator-based subscriptions with output validators, and shorthand routers. The page says nothing about wire format or TS performance changes — [tRPC v11 announcement](https://trpc.io/blog/announcing-trpc-v11)
- **Wire format:** JSON, with an optional `transformer` such as superjson. v11 adds Blob/File/Uint8Array payloads but no msgpack/CBOR body codec. Issue #1937 ("Support for additional Content-Types") collects requests. A user said CBOR "does not work with the transformer property" (Mar 2025). Others asked for msgpack/cbor (May 2025) and a protobuf-like binary protocol (Oct 2025). Maintainer KATT once said binary for POSTs would mean "straying away from JSON as the defacto mode of transport" — [trpc/trpc#1937](https://github.com/trpc/trpc/issues/1937)
- **TS performance at scale (the main complaint):**
  - In v10, the team tested against 3,500 procedures and 1,000 routers. They found TS eagerly evaluating unneeded types and cut check time from 332ms to 136ms by deferring the `DecoratedProcedureUtilsRecord` evaluation — [tRPC blog: TS performance lessons](https://trpc.io/blog/typescript-performance-lessons)
  - Feb 2024: "resolving types for our router now takes 4-8 seconds". One workaround was typing the router as `any` — [Discussion #5508](https://github.com/trpc/trpc/discussions/5508)
  - About 30 merged routers led to 10s+ IntelliSense latency, blamed partly on Zod and trpc-openapi. Large context objects (Prisma/Drizzle clients) inflate router types; one user saw the Prisma model repeated 6 times at about 561 lines each. Composed Zod `.pick/.merge` hurts too. Workarounds include `satisfies`, removing heavy objects from the context, and a "trpc:bake" step that precompiles router `.d.ts` with tsc — [Discussion #2448](https://github.com/trpc/trpc/discussions/2448), [Discussion #5636 "inferred type exceeds maximum length"](https://github.com/trpc/trpc/discussions/5636), [Discord thread](https://discord-questions.trpc.io/m/1194093565819760772)
  - Most of these threads are from 2022–2024 (v9/v10). I found no comparable v11 data apart from oRPC's benchmark below.
- **Versioning:** there is no built-in story. Mobile clients stuck in app-store review break when the server changes. The proposed fixes are an app-version header with versioned procedures, force-update gates, or "auto-versioned immutable deployments" where DTOs are supersets and procedures are never removed — [Theo community thread](https://www.answeroverflow.com/m/1029680390379671602), [Kenneth Skovhus: tRPC auto-versioning](https://www.skovhus.dev/blog/trpc-auto-versioning), [example PR mounting /v1/trpc + mobile gate](https://github.com/swtmply/zius/pull/69). The v10→v11 wire protocol was claimed incompatible, but the maintainer flagged that reply as possibly AI-written and unverified — [Discussion #6873](https://github.com/trpc/trpc/discussions/6873)
- **OpenAPI / non-TS clients:** `@trpc/openapi` is alpha and covers tRPC-style endpoints only, per oRPC's (competitor-authored) comparison — [orpc.dev comparison](https://orpc.dev/docs/comparison)

**oRPC**
- **v1.0** was covered by InfoQ in Dec 2025: first-class OpenAPI, typed inputs, outputs and errors, native Date/File, and TanStack Query for React/Vue/Solid/Svelte. Published claims: "1.6x faster type checking, 2.8x faster runtime" than tRPC — [InfoQ](https://www.infoq.com/news/2025/12/orpc-v1-typesafe/)
- **Two workflows:** code-first, or contract-first via `oc` (`@orpc/contract`) with `.input/.output`, implemented through `implement(contract)`. It can generate OpenAPI from the contract or a contract from OpenAPI — [oRPC contract-first docs](https://orpc.dev/docs/contract-first)
- **README:** a typed client, a REST API with an OpenAPI document, and MCP tools from one definition, with no codegen. Runs on Node/Bun/Deno/Workers — [middleapi/orpc](https://github.com/middleapi/orpc)
- **oRPC's own comparison** (biased source; versions oRPC 2.0.0-beta.37, tRPC 11.19, Hono 4.13.8):
  - Throughput with no-op handlers: oRPC 20,279 req/s vs tRPC 4,821 over HTTP; 22,979 vs 5,228 over WebSocket.
  - Type-check with 3,000 procedures: 1.62s / 469MB vs 2.32s / 677MB. Hono was not measured because its RPC types are "impractical at that scale".
  - Bundle (min+gzip): oRPC 14.5kB, tRPC 23.7kB (including superjson), Hono 17.0kB.
  - oRPC claims "typed binary responses" and `ReadableStream<Uint8Array>` streaming, both of which it marks unsupported in tRPC. These are raw bytes, not a binary encoding of structured data — [orpc.dev/docs/comparison](https://orpc.dev/docs/comparison), [middleapi/orpc-benchmarks](https://github.com/middleapi/orpc-benchmarks)
- **Comparison framing:** tRPC suits React-centric apps without OpenAPI, ts-rest is contract-first with OpenAPI, and oRPC bridges both — [InfoQ](https://www.infoq.com/news/2025/12/orpc-v1-typesafe/), [LogRocket tRPC vs oRPC](https://blog.logrocket.com/trpc-vs-orpc-type-safe-rpc/)

**Hono RPC (`hc`)**
- **Architecture:** `hc<typeof app>` infers routes from a chained Hono app. The docs admit "the more routes you have, the slower your IDE will become." The official mitigations are:
  - precompile the client type with tsc (`hcWithType`), the same "bake" idea as in tRPC;
  - pass type arguments manually;
  - split into one client per sub-app;
  - keep Hono versions identical across packages, because mismatches cause "Type instantiation is excessively deep" errors.
  Source: [Hono RPC guide](https://hono.dev/docs/guides/rpc)
- A maintainer said 600 routes in one `hc` client is difficult and recommended separating apps — [Discussion #2976](https://github.com/orgs/honojs/discussions/2976). A request for "pure" client types not tied to the app type is in [#2489](https://github.com/honojs/hono/issues/2489). IntelliSense slowness was reported in [#1921](https://github.com/honojs/hono/issues/1921). In monorepos, the advice is to import emitted `.d.ts` instead of `typeof app` — [AnswerOverflow](https://www.answeroverflow.com/m/1346424853196050472)
- **Wire format:** plain HTTP/JSON (REST-shaped).

**Elysia Eden Treaty**
- Elysia 1.0 precomputed types, which cut Eden inference from about 1500ms to 400ms on a 450-route stress test ("up to 13x faster") — [Elysia 1.0 blog](https://elysiajs.com/blog/elysia-10)
- **Still breaks at scale:** with about 90 plugins on 2.0.0-beta.30, `treaty<App>` fails with TS2589. The workaround maps `Treaty.Sign<App['~Routes']...>` by hand — [eden#274](https://github.com/elysiajs/eden/issues/274). Official advice is to use sub-apps to isolate inference and to profile with `tsc --generateTrace` — [Elysia TS docs](https://elysiajs.com/patterns/typescript)
- **Monorepo type loss:**
  - path aliases turn params into `any` — [eden#110](https://github.com/elysiajs/eden/issues/110);
  - plugins in imported modules lose types — [eden#215](https://github.com/elysiajs/eden/issues/215);
  - `@types/bun` is required even off-Bun — [elysia#934](https://github.com/elysiajs/elysia/issues/934).

**ts-rest and Zodios (contract-first around Zod)**
- **ts-rest is archived.** The README says "ts-rest is no longer maintained. There are no planned releases, including V4, bug fixes, security updates, or support." The unfinished V4 work is left for forks — [ts-rest README](https://github.com/ts-rest/ts-rest)
- **Zodios:** last npm release 10.9.6 on 2023-08-22, so effectively dormant even though the repo shows recent pushes — [npm registry](https://registry.npmjs.org/@zodios/core), [GitHub](https://github.com/ecyrbe/zodios)

**TSRPC (k8w / tsrpc org) + tsbuffer — the closest prior art**
- **Positioning:** a TS RPC with "runtime type checking and binary serialization", "pure TypeScript, without any decorator", HTTP/WebSocket, "optional backward-compatibility to JSON", and "verified by services over 100,000,000 users". It gives no benchmark numbers. The README targets "website / APP / games". The main docs are Chinese (tsrpc.cn) and the README says "English version is on the way" — [tsrpc/tsrpc](https://github.com/tsrpc/tsrpc)
- **tsbuffer claim:** it may be the only serializer supporting TS advanced types: unions, intersections, mapped types, Pick/Omit/Partial, IndexedAccess, keyof — [k8w/tsbuffer](https://github.com/k8w/tsbuffer), [tsbuffer-schema](https://github.com/k8w/tsbuffer-schema)
- **Pipeline:**
  - TS source is turned into `TSBufferSchema` JSON by `tsbuffer-proto-generator`. The schema adds number aliases (int, uint, …) for "advanced type checking and binary encoding optimization" — [tsbuffer-schema](https://github.com/k8w/tsbuffer-schema)
  - Services split into ApiService (request/response) and MsgService (pub/sub) — [tsrpc-proto](https://github.com/k8w/tsrpc-proto)
  - The CLI has `tsrpc encode/decode/validate` for hex-dump debugging — [tsrpc-cli](https://github.com/k8w/tsrpc-cli)
- **Wire encoding (read from source, `src/encoder/Encoder.ts`, `src/models/IdBlockUtil.ts`, `src/decoder/Decoder.ts` in [k8w/tsbuffer](https://github.com/k8w/tsbuffer)):** a protobuf-like tag/length stream, not FlatBuffers-style random access.
  - Each field is written as a varint *field id* with a 2-bit "LengthType": LengthDelimited=0, Varint=1, Bit64=2, IdBlock=3.
  - Numbers default to `double` (fixed 8 bytes). `int` is zigzag varint and `uint` is plain varint. `bigint*` values are length-delimited. Dates are varint ms.
  - Strings, Buffers and `any`/`object` are length-delimited; `any`/`object` are **JSON.stringify'd inside the binary**.
  - Arrays get a varint length prefix. Tuples get a varint "payload mask".
  - Interfaces are "IdBlocks": a block count, then blocks keyed by property id or `extends id + 1`, so base interfaces nest as sub-blocks.
  - Literal-typed fields are not encoded at all. Enums are encoded as an enum item id.
  - **Forward compatibility:** the decoder skips unknown field ids by LengthType ("可能是新协议，此处兼容" = "might be a newer protocol, stay compatible"). Field ids, not names, carry identity.
  - The decoder is **fully eager and recursive** (`_read` → `_readInterface` builds a plain object). There is no lazy or zero-copy access. Encoding goes through a validator (`tsbuffer-validator`) and an op-list `BufferWriter`.
  - There is a `nullAsUndefined` option to work around MongoDB turning `undefined` into `null`.
- **Maintenance:** tsrpc 3.4.21 (2025-10-10) only bumped dependencies. The 2025 releases were small fixes (e.g. `gracefulStop`, contributed via PR #64), and the last repo push was 2026-02-26 — [GitHub API commits](https://github.com/tsrpc/tsrpc/commits). The `beta` dist-tag is still 3.4.0-beta.0 and there is no v4 — [npm registry](https://registry.npmjs.org/tsrpc). tsbuffer has 45 stars and about 3.3k downloads per month.

**Deepkit (RPC + BSON + type compiler)**
- **Alive.** It left alpha in Feb 2025 (1.0.1). v1.1.0 shipped around 2026-10-31 and cut dependencies (`@deepkit/bson` went from 12 to 4 deps) — [release v1.1.0](https://github.com/marcj/deepkit/releases/tag/v1.1.0), [npm registry](https://registry.npmjs.org/@deepkit/rpc)
- **2025 RPC work:** a new BsonStreamReader, a Chrome devtool for RPC, GC of RPC observables, about 25% RPC speedup, and a BSON TypeEncoder and AutoBuffer — [release notes via search](https://github.com/marcj/deepkit/releases/tag/v1.1.0)
- **Mechanism:**
  - `@deepkit/type-compiler` is a TS transformer that emits runtime type metadata (`"reflection": true` in tsconfig). RPC infers parameter and return types with no codegen; types are shared "isomorphically". Validation is automatic from type constraints, and streaming uses RxJS Observables — [Deepkit RPC docs](https://deepkit.io/documentation/rpc)
  - The wire format is BSON. `@deepkit/bson` claims to be 13x faster than official bson-js and 2x faster than JSON (self-claim) — [marcj/deepkit](https://github.com/marcj/deepkit)
- **Adoption blockers:** the transformer needs the TS type checker, so esbuild/Vite fast paths cannot run it. There is still no official esbuild plugin, though a Bun plugin PR from Jan 2026 offers to add one — [Discussion #221](https://github.com/marcj/deepkit/discussions/221), [PR #691](https://github.com/marcj/deepkit/pull/691). Other open or recent issues:
  - third-party libs without runtime types — [#352](https://github.com/marcj/deepkit/issues/352);
  - tsconfig `extends` arrays crash — [#600](https://github.com/marcj/deepkit/issues/600);
  - "No type information received" on Node 25 — [#698](https://github.com/marcj/deepkit/issues/698);
  - TypeScript 7 tracking issue still open — marcj/deepkit#658, referenced from [runtyped#4](https://github.com/runtyped/runtyped/issues/4).

### Inferences
- Every popular framework has converged on "infer from `typeof server`". Their top scaling complaint is TS checker and tsserver cost. The official workarounds (tRPC "bake", Hono `hcWithType`, Eden `Treaty.Sign`) amount to precomputing concrete types. A codegen-emitted concrete client is that same workaround, done by default.
- In this space, schema-first or contract-first tools without a backer die. Both ts-rest and Zodios stalled despite millions of downloads per month. Solo maintainership is a real risk factor.

### Gaps
- I found no published TS-perf measurements for tRPC v11 other than oRPC's competitor-run benchmark.
- I did not verify tsrpc.cn's own benchmark pages (Chinese docs) or whether `tsrpc-cli proto` preserves field ids across regenerations with an `--old` file. The decoder's skip logic implies ids must stay stable, but I did not read the generator's code.
- Elysia/Eden and Hono v5 stats beyond release tags were not deeply researched.

## Q2. Does any existing TS-first RPC already do binary + lazy / zero-copy reads?

### Takeaway
No, as far as I could find. Every TS-first binary option decodes eagerly into plain JS objects: tsbuffer, Deepkit BSON, Effect SchemaBinary, typia protobuf, and Effect v3 msgpack. Zero-copy lazy accessors exist only in schema-first FlatBuffers (`.fbs` + `flatc`) and Cap'n Proto-style systems, not in a code-first TS RPC.

### Cited Findings
- tsbuffer's `Decoder._read`/`_readInterface` recursively materialize objects — [k8w/tsbuffer src/decoder/Decoder.ts](https://github.com/k8w/tsbuffer/blob/master/src/decoder/Decoder.ts) (read directly)
- **Effect v4:** `SchemaBinary` is a "compact binary codec derived from the encoded side of a Schema" and the default wire format for cluster transports. Codecs are made with `SchemaBinary.toCodec(schema)` and stable field ids are set with `SchemaBinary.fieldId(n)`. Fixed-width `int32/uint32/int64/uint64` little-endian fields came in PR #10230. In RPC it is used via `RpcSerialization.layerSchemaBinary()` — [SchemaBinary API](https://effect.website/docs/v4/api/effect/encoding/SchemaBinary), [effect@4.0.0 release](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0), [PR #10230](https://github.com/Effect-TS/effect/pull/10230)
- **Effect removed msgpack** (`RpcSerialization.msgPack`, plus the msgpackr dependency) on main in #7461, merged 2026-08-26, in favour of `layerSchemaBinary` — [livestore#1600](https://github.com/livestorejs/livestore/issues/1600). The v3 msgpack path silently dropped messages on Cloudflare Workers because msgpackr's JIT uses `new Function()` — [effect#6169](https://github.com/Effect-TS/effect/issues/6169)
- **Effect SchemaBinary bugs:**
  - a request-level decode failure becomes a connection defect that breaks the client — [effect#8826](https://github.com/Effect-TS/effect/issues/8826);
  - a regression since 4.0.7 where `toCodec` throws on some schemas — [effect#10178](https://github.com/Effect-TS/effect/issues/10178);
  - most union codecs prefix a member selector — [SchemaBinary API](https://effect.website/docs/v4/api/effect/encoding/SchemaBinary).
- **typia:** an AoT transformer that generates protobuf `encode<T>/decode<T>` from plain TS types. Tags select scalar types (`tags.Type<"uint32">`) and field numbers (`tags.Sequence<N>`). `.proto` export is only needed for non-TS consumers — [typia protobuf blog](https://typia.io/blog/typia-protocol-buffer-library-of-typescript/), [typia protobuf message docs](https://typia.io/docs/protobuf/message/). I found no protobuf-specific benchmark numbers.
- **Cap'n Web** (Cloudflare, by the Cap'n Proto author) is TS-native and schema-less, with promise pipelining and pass-by-reference. Its wire format is deliberately **JSON** with preprocessing for special types, "readable from the network tab". The core is under 16–17 kB min+gz with no dependencies. It does not validate argument types itself; a `@validateRpc()` helper generates validators from TS types — [cloudflare/capnweb](https://github.com/cloudflare/capnweb), [Cloudflare blog](https://blog.cloudflare.com/capnweb-javascript-rpc-library/)
- FlatBuffers' JS lib gives lazy, vtable-offset field access without unpacking, but it is schema-first (`.fbs` → `flatc`) — [google/flatbuffers](https://github.com/google/flatbuffers)
- A targeted search for "code-first TS RPC + lazy DataView accessors" returned no such project — [GitHub flatbuffers topic](https://github.com/topics/flatbuffers)

### Inferences
- The proposed design (TS interfaces → layout → generated getter classes over DataView, plus TypedArray columns) appears to be a genuinely unoccupied niche. The nearest neighbours are tsbuffer (same input, protobuf-like eager output), typia protobuf (same input, protobuf output), and FlatBuffers (same output style, schema-first input).
- Effect's move from msgpack to a schema-derived binary codec, with stable field ids and fixed-width ints, is a 2026 signal: schema-aware binary beats generic binary (msgpack/CBOR) in a typed RPC. Its bugs (union selectors, error-path encoding) are exactly the edge cases our design must handle: discriminated unions, and error envelopes that stay decodable when the payload fails.

### Gaps
- I did not benchmark or find benchmarks comparing tsbuffer, SchemaBinary or typia-protobuf against JSON.
- I did not check whether Deepkit's BSON parser has a lazy or "view" mode. The docs only show full deserialization.

## Q3. Why did TSRPC and Deepkit not win adoption despite binary support?

### Takeaway
Mostly ecosystem reasons, plus one hard technical one for Deepkit: build-pipeline coupling. TSRPC: Chinese-first docs, a game and mini-program audience, its own server stack and solo maintenance. Deepkit: a TS transformer is required for runtime types, which conflicts with esbuild/Vite/SWC and now TS 7. Both are monolithic frameworks rather than adapters. Neither matched the React Query–centric DX that made tRPC win. Binary as such was not shown to be the reason.

### Cited Findings
- TSRPC's main documentation is Chinese and its "English version is on the way". It targets "website / APP / games" and has about 2.5k npm downloads per month — [tsrpc/tsrpc](https://github.com/tsrpc/tsrpc), [npm downloads](https://api.npmjs.org/downloads/point/last-month/tsrpc)
- TSRPC is maintained by essentially one author (k8w / Kin Wang). 2025 releases were dependency bumps and a community fix, with no v4 — [k8w profile](https://github.com/k8w), [tsrpc commits](https://github.com/tsrpc/tsrpc/commits)
- Deepkit's type-compiler needs type info from the TS compiler, so "esbuild didn't offer any api to provide that". Users found the alternative rollup TS plugin "extremely slow" — [deepkit Discussion #221](https://github.com/marcj/deepkit/discussions/221). There is still no official esbuild plugin as of Jan 2026 — [PR #691](https://github.com/marcj/deepkit/pull/691)
- Deepkit types from third-party libraries not compiled with its transformer are excluded or emitted as `any` — [deepkit#352](https://github.com/marcj/deepkit/issues/352)
- **TS 7 (Go) GA'd 2026-07-08 without a stable programmatic or transformer API.** That API is promised for 7.1, and the recommended path is pinning `typescript@6` alongside `@typescript/native`. Typia moved to its own `ttsc` toolchain to support TS 7 (Typia v13, Jul 2026). Deepkit has only an open tracking issue — [digitalapplied TS 7 RC guide](https://www.digitalapplied.com/blog/typescript-7-0-rc-go-native-compiler-2026-upgrade-guide), [typia#1534](https://github.com/samchon/typia/issues/1534), [runtyped#4 referencing deepkit#658](https://github.com/runtyped/runtyped/issues/4)

### Inferences
- **Lesson for our design:** do codegen as a **separate CLI step that emits plain `.ts`**, not as a compile-time transformer. That way users' bundlers (Vite/esbuild/SWC/tsgo) never need to understand it. Deepkit and typia both paid heavily for transformer coupling.
- Our CLI uses the TS Compiler API, which is only available in TS ≤6 until 7.1. Pinning `typescript@6` as a devDependency of the codegen CLI is a workable mitigation, because it is decoupled from the user's build. It should still be tracked as a maintenance risk.
- TSRPC's binary format (protobuf-like, eager) gave modest wins on typical CRUD payloads but took away network-tab readability. Our benchmarks suggest the big wins come from partial reads and numeric columns, which tsbuffer could not exploit. This is speculative but consistent with the code read above.
- Adoption in this space followed DX and integrations (TanStack Query, Next.js, adapters for existing servers), not wire efficiency. Both TSRPC and Deepkit asked users to adopt their whole server framework.

### Gaps
- I found no post-mortem or author statement explaining TSRPC's or Deepkit's limited uptake. The reasons above are inferred from docs, issues and download data.
- I did not survey Chinese-language community discussion of TSRPC on Zhihu or Juejin.

## Q4. What do tRPC/oRPC users complain about most, and which DX patterns are table stakes?

### Takeaway
The top complaints are:
1. TS and IDE slowness with large routers.
2. Monorepo coupling: `typeof app` across packages, version skew and path aliases.
3. No versioning story for deployed mobile clients.
4. No non-TS clients or OpenAPI, which is why oRPC rose.
5. A repeated, never-fulfilled request for binary bodies in tRPC.

A codegen, binary design directly addresses 1, 2 and 5. It also gives a natural place for 3 (field ids / layout evolution). It could make things worse on debuggability, string-heavy payload size, non-TS interop (unless a schema export exists), and the table-stakes integrations.

### Cited Findings
- **TS slowness at scale:**
  - tRPC: [#5508](https://github.com/trpc/trpc/discussions/5508), [#2448](https://github.com/trpc/trpc/discussions/2448), [#5636](https://github.com/trpc/trpc/discussions/5636)
  - Hono: [RPC guide](https://hono.dev/docs/guides/rpc), [#2976](https://github.com/orgs/honojs/discussions/2976)
  - Eden: [eden#274](https://github.com/elysiajs/eden/issues/274)
  - oRPC markets itself as "typesafe at scale" with fewer instantiations: 2.20M vs 2.72M at 3,000 procedures — [orpc comparison](https://orpc.dev/docs/comparison)
- **Monorepo coupling:**
  - Hono version mismatch across packages causes "excessively deep" errors, and the advice is to import emitted `.d.ts` — [Hono RPC guide](https://hono.dev/docs/guides/rpc), [AnswerOverflow](https://www.answeroverflow.com/m/1346424853196050472)
  - Eden: path aliases break types, cross-package plugin types are lost — [eden#110](https://github.com/elysiajs/eden/issues/110), [eden#215](https://github.com/elysiajs/eden/issues/215)
- **Versioning / mobile:** [Skovhus](https://www.skovhus.dev/blog/trpc-auto-versioning), [AnswerOverflow thread](https://www.answeroverflow.com/m/1029680390379671602)
- **Binary requests in tRPC:** [#1937](https://github.com/trpc/trpc/issues/1937)
- **Table stakes (from tRPC v11 and oRPC's feature matrix):**
  - TanStack Query integration (React plus Vue/Solid/Svelte for oRPC) with Suspense and RSC prefetch;
  - SSE subscriptions and streaming (async generators);
  - batching;
  - FormData, File and Blob uploads;
  - typed errors (per-procedure in oRPC, a single global shape in tRPC);
  - middlewares/plugins (CORS, CSRF, retry, rate-limit, OpenTelemetry);
  - Standard Schema validation (Zod/Valibot/ArkType);
  - native Date/Map/Set (tRPC via superjson);
  - OpenAPI generation;
  - WebSockets;
  - Next.js Server Actions;
  - increasingly, MCP and AI SDK integration.
  Sources: [tRPC v11](https://trpc.io/blog/announcing-trpc-v11), [oRPC comparison](https://orpc.dev/docs/comparison), [InfoQ](https://www.infoq.com/news/2025/12/orpc-v1-typesafe/)
- **Bundle sizes for reference** (oRPC-measured, min+gz): oRPC 14.5kB, tRPC 23.7kB (with superjson), Hono 17.0kB — [orpc comparison](https://orpc.dev/docs/comparison). Cap'n Web is under 16–17 kB — [cloudflare/capnweb](https://github.com/cloudflare/capnweb)
- **Readability is valued:** Cap'n Web chose JSON explicitly so traffic is readable in devtools — [Cloudflare blog](https://blog.cloudflare.com/capnweb-javascript-rpc-library/). Deepkit built a Chrome devtool for its binary RPC — [deepkit v1.1.0 / 2025 notes](https://github.com/marcj/deepkit/releases/tag/v1.1.0). tsrpc-cli ships `decode` for hex dumps — [tsrpc-cli](https://github.com/k8w/tsrpc-cli)

### Inferences
**What our design can address:**
- Generated concrete client classes remove `typeof router` inference cost and cross-package type coupling, by the same principle as tRPC "bake" and Hono `hcWithType`.
- A layout with stable field ids or slots (like tsbuffer ids or Effect `fieldId`) gives an explicit evolution and compatibility story that tRPC lacks.
- Binary bodies answer tRPC#1937-style requests, and TypedArray columns cover a use case no current framework targets.

**What it could make worse:**
- **Payload size:** about 45% larger after brotli on string-heavy payloads. Most CRUD apps are string-heavy, so this is a real regression for the median user. Mitigations to consider: per-procedure or negotiated JSON fallback (as TSRPC did with "optional backward-compatibility to JSON"), and string dedup / dictionary tables.
- **Debuggability:** needs a devtool or decoder (Deepkit and TSRPC both had to build one).
- **Validation:** inputs still need validation. Branded `u32` types need generated range checks, since tsbuffer validates on encode via `tsbuffer-validator`.
- **Integrations:** loss of the Standard Schema / Zod ecosystem unless interop is offered.
- **Non-TS clients:** without an exported schema (FlatBuffers `.fbs`, protobuf, or OpenAPI for a JSON mode), non-TS clients stay impossible, as typia does with `protobuf.message<T>()`.

**DX parity needed to be taken seriously:** TanStack Query adapters, SSE/async-iterator streaming, typed errors, middleware, File upload, and an OpenAPI or JSON escape hatch.

**Lazy getter classes vs. React patterns:** frameworks hand React Query plain, structurally-cloneable objects. Query caching, `structuralSharing`, RSC serialization and devtools all assume POJOs. Lazy proxies or getter objects may conflict with structural sharing and RSC hydration. This needs explicit design: e.g. disable `structuralSharing`, or provide `toJSON()` / materialize helpers.

### Gaps
- I found no quantitative survey ranking tRPC/oRPC complaints. The ordering above reflects issue and discussion volume seen in searches, not a measured ranking.
- I did not verify how oRPC's "typed binary responses" are encoded on the wire (likely raw Blob/stream with a content-type) or whether oRPC 2.0 adds any structured binary codec.
