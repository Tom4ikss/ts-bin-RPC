# Type-driven codegen in TypeScript: deriving runtime serializers and validators from TS types, and the state of the TS compiler toolchain (as of Nov 2026)

Research date: 2026-11-02. "Older info" is marked as such. Where only secondary sources (blogs, aggregators) were available, this is flagged.

---

## Q1. Is building on the TS Compiler API in 2026 a dead end given TypeScript 7? What is the migration path?

### Takeaway
It is not a dead end for a standalone, read-only codegen CLI (our design). It is a dead end for emit-side transformers (ts-patch/Typia-v12-style plugins). TS 7.0 (Go, July 2026) shipped with no programmatic API. TS 7.1 (beta Oct 20, 2026; stable expected around late Nov 2026) adds a new, different, IPC-backed API (`typescript/sync`, `typescript/async`, `typescript/ast`...) with Program and TypeChecker queries (`getPropertiesOfType`, `getTypeOfSymbol`, etc.). The TS team says emit-side transforms are "out of scope going forward". Recommended path: build on TS 6's classic API now (shipped side by side as `@typescript/typescript6`), isolate checker access behind a thin adapter, and port that adapter to `typescript/sync` once 7.1 is stable.

### Cited Findings
**Release status and timeline**
- Go-native port announced March 11, 2025. TS 6.0 (March 2026) was the last JS-codebase release and a "bridge" that deprecated everything 7.0 removes. 7.0 Beta came April 21, 2026; RC June 18, 2026; stable July 8, 2026 — [InfoQ](https://www.infoq.com/news/2026/08/typescript-7-released/) (secondary, via search summary); [VS Magazine on RC](https://visualstudiomagazine.com/articles/2026/06/22/typescript-7-0-rc-moves-microsofts-go-rewrite-into-the-mainline-compiler.aspx)
- The official "Announcing TypeScript 7.0" post is dated July 8, 2026 — [devblogs: Announcing TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/). Minor conflict: the GitHub releases page shows v7.0.2 tagged "20 Aug" — [microsoft/TypeScript releases](https://github.com/microsoft/typescript/releases) (via search summary). The 7.0 line may have had several patch tags. Unresolved.
- Performance: InfoQ reports typical full-build speedups of 8–12x. VS Code full build: 125.7 s on TS 6 vs 10.6 s on TS 7 (11.9x), with ~18% less memory. Type-checking algorithms are kept "structurally identical" to TS 6.0 — [InfoQ](https://www.infoq.com/news/2026/08/typescript-7-released/)
- The `tsgo` binary name is gone for stable: TS 7 is plain `tsc` in the `typescript` package. microsoft/typescript-go was archived on Sep 1, 2026, and development moved back to microsoft/TypeScript — [typescript-go discussion #4576](https://github.com/microsoft/typescript-go/discussions/4576); [microsoft/typescript-go repo](https://github.com/microsoft/typescript-go)
- TS 7.1 Beta was announced 2026-10-20 by Daniel Rosenwasser. Next steps: "a Release Candidate in about a month from now, followed by a final release shortly thereafter" — [devblogs: Announcing TS 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/). A secondary site gives a 7.1 stable target of Nov 24, 2026 and notes the beta slipped two weeks — [devopen.io](https://devopen.io/typescript-7-1-release-date/) (secondary; not confirmed from the iteration plan)

**Compiler API: 7.0 has none, 7.1 adds a new one**
- 7.0 announcement: "While TypeScript 7.0 is here, it does not ship with an API." The team expects "TypeScript 7.1 to ship with a new (and different) API" — [devblogs: TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- Side-by-side usage: `@typescript/typescript6` provides a `tsc6` executable and re-exports the TS 6.0 API. Suggested aliasing: `"@typescript/native": "npm:typescript@^7.0.2", "typescript": "npm:@typescript/typescript6@^6.0.2"` — [devblogs: TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- Tools that embed TS, such as Volar, "can only currently rely on TypeScript 6.0". Vue, MDX, Astro and Svelte are advised to stay on 6.0. Angular can use TS 7 for CLI checking and TS 6 for the editor — [devblogs: TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- 7.1 API entry points: `typescript/sync` (synchronous client: compiler options, type checker, program APIs), `typescript/async` (Promise-based), `typescript/fs` (request-scoped full or layered filesystems), and `typescript/ast`, `typescript/ast/is`, `typescript/ast/factory`. `API` and `Program` are `Disposable`. A "snapshot" is "a version of all the projects and programs at a point in time", used for incremental workflows (`api.createSnapshot`, `snapshot.update()`). Program methods shown: `getSemanticDiagnostics`, `emit`, `emitToString`, and others. No stability promise is given; the team is "working with partner teams" — [devblogs: TS 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/)
- Example use of the 7.1 checker (from an issue repro on `typescript@7.1.0-dev.20261027.1`): `new API({cwd})`, `api.createProgram([entry], {strict:true})`, `program.getProject().checker`, `checker.getDeclaredTypeOfSymbol(checker.getSymbolAtLocation(alias.name))`, `checker.getPropertiesOfType(shape)` — [microsoft/TypeScript#64991](https://github.com/microsoft/TypeScript/issues/64991). Another repro uses `api.createSnapshot({fileSystem, createPrograms:[...]})` and imports from `@typescript/typescript/sync`, so setup shape differs across builds — [microsoft/TypeScript#64863](https://github.com/microsoft/TypeScript/issues/64863)
- Secondary summary: the checker has `getSymbolAtLocation`, `getTypeAtLocation`, `getTypeOfSymbol`, `getPropertiesOfType`, `typeToString`, `getExportsOfModule` and JSDoc access, all batchable. The module was `typescript/unstable/sync` in 7.0.2 — [chant#4338](https://github.com/INTENTIUS/chant/issues/4338) (third-party tracker, via search summary)
- Architecture (older, 2025): the JS client talks to a Go API server over STDIO. It uses `libsyncrpc` to block during sync calls and returns "shallow serializable objects". IPC is "very fast on Apple Silicon"; Windows has "significantly more overhead per call". FFI via napi-go was "still on the table" — [typescript-go PR #711](https://github.com/microsoft/typescript-go/pull/711). The API "will expose most of the read-only features of today's ts.Program and ts.TypeChecker", and third-party code can't be linked into the Go process — [typescript-go#2824](https://github.com/microsoft/typescript-go/issues/2824)
- Checker-gap tracking: a TypeScriptToLua consumer listed missing methods (Apr 2026): `getBaseConstraintOfType`, `getPropertyOfType`, `isArrayType`/`isTupleType`, `getConstantValue`, `getAliasedSymbol`, `Type.aliasSymbol`, JSDoc access, and others. Andrew Branch put it in the Post-7.0 milestone, and it was closed as completed via PR #4424 on Jun 24, 2026. The exact coverage of #4424 is unclear — [typescript-go#3610](https://github.com/microsoft/typescript-go/issues/3610)
- Known 7.1 API pain points: per-member `getPropertiesOfType` and related calls mean many out-of-process round trips. jsii on aws-cdk-lib made ~134k `getJsDocTags`, ~125k `getTypeAtLocation` and ~117k `getDocumentationComment` calls, so coarse-grained queries (`getMembersOfType`, `getSymbolDocumentations`) were requested — [microsoft/TypeScript#65051](https://github.com/microsoft/TypeScript/issues/65051). `typeToTypeNode` output prints multi-line (regression vs 6.0.2) — [#64991](https://github.com/microsoft/TypeScript/issues/64991). `getSignaturesOfType` panics on a decorator's contextual type — [#64863](https://github.com/microsoft/TypeScript/issues/64863). In 7.1, `typeRef.resolvedTypeArguments` is replaced by `checker.getTypeArguments(type)`, and `SyntaxKind` values differ between TS 5/6 and TS 7 — [GraphQLSP PR #438](https://github.com/0no-co/GraphQLSP/pull/438)

**Field report from a real port (ts-json-schema-generator, Oct 2026)**
- Porting to `typescript/sync` turned up several breaks. Synthetic nodes from `typeToTypeNode` break `getText` and symbol lookup. Heritage clause shapes changed. Many root exports moved or disappeared. Compiler options need numeric enums (string values made the Go server panic). Estimated port effort: 3–5 weeks — [vega/ts-json-schema-generator#2199](https://github.com/vega/ts-json-schema-generator/issues/2199)
- Performance: Vega-Lite schema generation takes ~535 ms on TS 6 with ~73k checker calls. A naive 7.1 port was estimated at 1.6–2 s; caching was expected to close the gap (not measured end to end). The author argued speed alone is not a strong reason to go Go-native. ts-loader's port "hit API shape changes and Go-side panics between nightlies". rslib is adopting `typescript/sync`. typescript-eslint still needs the TS 6 alias — [#2199](https://github.com/vega/ts-json-schema-generator/issues/2199)

**Transformers / plugins: officially out**
- Jake Bailey (TS team, Mar 2025): "Go is a statically compiled language without good plugin support". Build systems "must either use our API, or patch tsc"; patching "just isn't going to work". Ryan Cavanaugh (Aug 20, 2026), asked about transform-paths-style transforms: "Not currently… I expect that emit-side transforms are going to be out of scope going forward." The issue was moved to microsoft/TypeScript as #63771 ("Awaiting More Feedback"). Recommended routes: the programmatic API plus content mappers, or third-party type-erasing emitters — [typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)
- Content mappers (7.1) are the new official plugin point. They are external executables, declared in `tsconfig.json` `contentMappers` (package + extensions), that produce a virtual TS representation of non-TS files (Vue SFC, Svelte, Astro, MDX, CSS Modules). They require `--runExternalCode`, otherwise error TS18068. TS drives the protocol: initialize → openProject → transform* → closeProject — [devblogs: TS 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/); [sxzz/ts-content-mapper](https://github.com/sxzz/ts-content-mapper); [Vize docs](https://vizejs.dev/guide/content-mapper/index.html)

**Unofficial Go-native route (forking or shimming internals)**
- typescript-go keeps its compiler in `internal/` packages. tsgolint, ttsc and ts-json-schema-generator-go reach it through generated `go:linkname` shim packages (ast, checker, compiler, core, scanner, tsoptions, tspath, vfs). tsgolint also vendors typescript-go as a submodule and applies a patch stack — [syumai talk on tsgolint](https://speakerdeck.com/syumai/how-tsgolint-exposes-typescript-gos-private-apis); [typescript-eslint/tsgolint](https://github.com/typescript-eslint/tsgolint); [ttsc docs](https://ttsc.dev/docs/development/concepts/tsgo/)
- Maintenance cost: ttsc maintains 223 linkname bindings, and both tools regenerate shims on every TS bump. No public Go API has shipped; the TS team "may expose Go packages" after the repo move — [vega#2199](https://github.com/vega/ts-json-schema-generator/issues/2199) (via search summary). The Oxc team accepts the risk because "the TypeScript AST and its visitor are actually quite stable" — [Oxc type-aware preview](https://oxc.rs/blog/2025-08-17-oxlint-type-aware.html) (2025)

**What major tool authors are doing**
- **Typia/Nestia:** rewrote the transformer in Go and built the `ttsc` host compiler (details in Q2).
- **Deepkit:** the maintainer said (June 25, 2025) "yes, we are planning to support it, but it is still unclear how" and would watch Angular. No roadmap; the issue is still open — [marcj/deepkit#658](https://github.com/marcj/deepkit/issues/658)
- **ts-morph:** the latest release (28.0.0) targets TS 6.0. dsherret (Jul–Sep 2026) is working on a TypeScript fork, moving logic to Go, Wasm first and native later. A native backend exists and is "faster than ts-morph on TS 6" (Sep 6, 2026 edit) — [dsherret/ts-morph#1621](https://github.com/dsherret/ts-morph/issues/1621); [ts-morph releases](https://github.com/dsherret/ts-morph/releases)
- **Angular:** ngtsc is a `ts.Program` plus a `ts.Transformer`, "not available cross-language". Angular 22 requires `typescript >=6.0 <6.1`. The team is building "ngp" (Angular Preprocessor): Rust/OXC plus TS, via napi-rs, decoupled from TS compiler APIs and nearing MVP. Analog has an experimental NGP mode with TS 7 type checking — [kevindavila.dev](https://kevindavila.dev/en/blog/angular-typescript-7-tsgo) (secondary); [analogjs/analog PR #2695](https://github.com/analogjs/analog/pull/2695); [Angular on X](https://x.com/angular/status/2103218433101811830)
- **Vue/Volar:** blocked on 7.1. No official Vue timeline found. A secondary estimate puts 7.1-native Volar/typescript-eslint releases in Q1 2027 — [devopen.io](https://devopen.io/typescript-7-1-release-date/) (speculative); [VS Magazine](https://visualstudiomagazine.com/articles/2026/07/08/typescript-7-arrives-to-rock-vs-code-with-go-powered-speed.aspx)
- **ts-json-schema-generator:** two tracks. An experimental Go port (v3, Aug 2026, shims, CLI-compatible, drops the JS library API) — [vega/ts-json-schema-generator-go](https://github.com/vega/ts-json-schema-generator-go). A proposed `typescript/sync` port as a new major (ESM, TS ≥7.1 only, 2.x kept for TS 6) — [#2199](https://github.com/vega/ts-json-schema-generator/issues/2199)

### Inferences
- Our CLI only reads types (symbols, properties, intersections, literal types, type arguments) and writes files. That is exactly the read-only surface the TS team commits to in 7.1. We never need emit-side transforms, which are the part being dropped. Choosing a standalone CLI over a compiler plugin is vindicated: it is the same conclusion Typia reached in reverse, by having to write its own Go compiler host.
- Practical migration plan:
  1. Write codegen against the TS 6 API via `@typescript/typescript6` (or `typescript@6`), behind a narrow internal "TypeSource" interface: resolve exported interfaces, list properties with optionality, classify primitive/brand/array/union/literal, and get type args. Users can still compile their app with TS 7, since we only need TS 6 for analysis.
  2. When 7.1 stabilizes (≈ end of 2026), add a `typescript/sync` backend. Plan for IPC round-trip cost: walk each RPC schema once, cache by type id, and avoid per-node `getText`/`typeToTypeNode`. RPC schemas are hundreds of types, not the ~73k checker calls of Vega-Lite, so latency should be acceptable even naively.
  3. Avoid ts-morph as a hard dependency, since its TS 7 story is a fork-in-progress. Use the raw checker.
- The Go-shim route (ttsc/tsgolint style) gives native speed but costs constant upkeep on every TS bump and needs a Go toolchain. It isn't warranted for an RPC codegen.

### Gaps
- No official API stability guarantee or semver policy for `typescript/sync` was found. Whether 7.1 stable will freeze the surface is unknown.
- Exact list of TypeChecker methods in 7.1 stable: no official reference doc found. The list above comes from issues and secondary summaries.
- Whether the API can run in-process (napi/FFI or Wasm) instead of IPC in 7.1: not stated in the beta post.
- 7.0.2 date conflict (July 8 announcement vs "20 Aug" release tag) is unresolved.

---

## Q2. Typia and Nestia: mechanism, protobuf, numeric tags, performance, limitations, TS-Go status, user complaints

### Takeaway
Typia is a compile-time transformer: `typia.is<T>()`, `typia.protobuf.encode<T>()` and similar calls are replaced by generated code. Through v12 it ran via ts-patch, unplugin-typia, or a `typia generate` source-to-source CLI. For TS 7, samchon ported the transformer to Go and built `ttsc`, a typescript-go host that compiles Go source plugins, plus `@ttsc/unplugin` for bundlers. Typia 13 shipped July 9, 2026 and is at 15.x by October 2026. Its runtime performance is excellent. Its main cost is setup and build friction, now including a multi-minute first build that compiles a Go plugin.

### Cited Findings
**Mechanism and setup modes**
- Older (v3.6.1+): `npx typia generate --input src/templates --output src/generated --project tsconfig.json` reads TS and writes transformed TS. It was the path for "non-standard TypeScript compilers like swc or babel" — [typia v3.6.1 release](https://github.com/samchon/typia/releases/tag/v3.6.1); [typia 3.7.4 npm README](https://www.npmjs.com/package/typia/v/3.7.4) (older, 2023)
- Older (v12 era): `@ryoppippi/unplugin-typia` did not need ts-patch because it "doesn't use transform plugin for tsc". It is now deprecated on npm (2.6.5, "Package no longer supported") and archived on JSR — [typia#1252](https://github.com/samchon/typia/issues/1252); [npm @ryoppippi/unplugin-typia](https://www.npmjs.com/package/@ryoppippi/unplugin-typia)
- Current (typia 13+ on TS 7): install `typia`, `ttsc` and `typescript`. Build with `npx ttsc` (`--noEmit`, `--watch`); run with `npx ttsx src/index.ts`. Stock `tsc`, `ts-node` and `tsx` don't load the transform. For bundlers (Vite, Next.js, Rollup, esbuild, Webpack, Rspack, Farm, Bun) use `@ttsc/unplugin`. Requires ttsc ≥ 0.34.1, which targets TS 7.0 or 7.1 based on the installed version. Config goes in `compilerOptions.plugins: [{transform: "typia/lib/transform"}]`. Projects on typia 12 / TS < 7 use the "legacy setup" — [typia.io/docs/setup](https://typia.io/docs/setup/)
- Typical error: "no transform has been configured" means the build bypassed ttsc/ttsx/@ttsc/unplugin, e.g. through tsc, nest build, SWC or Babel — [nestia setup](https://nestia.io/docs/setup/) (via search summary)
- Today, using typia means "compiling Go on the user's machine": ttsc builds the plugin's Go source together with typescript-go internals into one executable. ttsc#1755 proposes prebuilt Wasm plugins behind a versioned interface so typia stops depending on TS-Go internals — [samchon/ttsc#1755](https://github.com/samchon/ttsc/issues/1755) (via search summary)

**TS-Go timeline (typia#1534)**
- Mar 14, 2025, samchon: "If not possible to support by ts-patch, I will support it by re-making typia by go language." Jan 2026: planned a Go port around April. Mar 11, 2026: monorepo split of programmatic vs transform units and a new `@typia/interface`. Apr 25 / Jun 10, 2026: ttsc complete; typia 13 on `next` with a Go transform; bundler integration moved from `@typia/unplugin` (v12) to `@ttsc/unplugin`. Jul 6, 2026: Bun runtime support via `preload = ["@ttsc/unplugin/bun-register"]` in bunfig.toml (ttsc 0.17.0). Jul 9, 2026: "TypeScript v7 and typia v13 released" — [samchon/typia#1534](https://github.com/samchon/typia/issues/1534)
- samchon on the TS issue: "typia literally dies without transformer plugins" — [typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)
- The porting story, including AI-assisted line-by-line translation of TS to Go, is in [typia blog: AI deleted my tests](https://typia.io/blog/ai-deleted-my-tests-and-said-all-tests-pass/)
- Oct–Nov 2026: typia#2511 moves to ttsc 0.34 / Go 1.27 for TS 7.1 — [typia#2511](https://github.com/samchon/typia/issues/2511). Nestia v14.1.0 (Oct 23, 2026) adds TS 7.1 support. It requires ttsc ≥ 0.34.1 and Go 1.27 for native source-plugin builds, and pins typia 15.2.0. With 7.1 content mappers you run `ttsc --runExternalCode --emit` — [nestia v14.1.0](https://github.com/samchon/nestia/releases/tag/v14.1.0)

**Protobuf from TS types (`typia.protobuf.*`)**
- API: `message<T>()` (emits a .proto schema), `encode`/`isEncode`/`assertEncode`/`validateEncode`, decode counterparts, and `createAssertEncode<T>()` for a hoisted reusable encoder. No .proto file is needed unless another service must read the schema. Plain `encode` "trusts you completely" and does no validation — [typia protobuf encode](https://typia.io/docs/protobuf/encode/)
- Type mapping: untagged `number` → `double`. `tags.Type<"int32"|"int8"|"int16">` → int32; `uint32|uint8|uint16` → uint32; `int64` → int64; `uint64` → uint64; `float` → float; `double` → double. Untagged `bigint` → int64. No sint/fixed types are mentioned. `tags.Sequence<N>` sets field numbers; untagged fields continue from the previous number, starting at 1. Each union variant can have its own Sequence — [typia protobuf message](https://typia.io/docs/protobuf/message/)
- Rejected for protobuf: non-object top-level (arrays, Record, bigint at top level); top-level object unions (`Cat | Dog`); unions inside container values; nested arrays (`number[][]`: "does not support over two dimensional array type"); `Record<string, string[]>`; Map with union keys or values; `Date` ("Use string type instead"); `any`; `Set`. Supported: nested objects, `Array<T>` → repeated, `Map<K,V>` → map, `T | null` and optional (skipped when null/undefined), numeric unions with different `tags.Type` → `oneof`, and recursion through arrays (`children: Array<IMember>`) — [typia protobuf message](https://typia.io/docs/protobuf/message/)

**Numeric tags**
- `tags.Type<"int8"|"uint8"|"int16"|"uint16"|"int32"|"uint32"|"int64"|"uint64"|"float"|"double">`. `int64`/`uint64` apply to `number` or `bigint`. The number form "rounds the maximum up to the next power of two", so use bigint when the boundary matters. `float` checks the finite float32 range; `double` adds no width check. Tags compose as intersections (`number & tags.Type<"uint32"> & tags.Minimum<0>`) and support unions such as `(number & tags.Type<"int32">) | (bigint & tags.Type<"uint64">)`. Custom tags use `tags.TagBase<{kind, target, value, validate: "$input ..."}>`, where `validate` is a string template. Comment tags (`@type uint32`) are discouraged — [typia tags docs](https://typia.io/docs/validators/tags/)

**Performance claims**
- README: "Runtime validator is 20,000x faster than class-validator", "JSON serialization is 200x faster than class-transformer". No README comparison vs zod/ajv/protobufjs. ~6.0k GitHub stars — [samchon/typia](https://github.com/samchon/typia)
- Independent microbenchmark (Oct 2026, median ns/call, valid user): typia 21.9, ArkType 291.5, Zod 612.6, Valibot 951.2. The author warns it is a microbenchmark — [dev.to: 6 validation libraries](https://dev.to/nyaomaru/i-compared-6-typescript-validation-libraries-heres-what-surprised-me-325g)

**Complaints and friction**
- "Stock tsc alone does not run the transform." The first typia build compiled a Go source plugin and "took several minutes" — "absolutely part of the adoption decision". Built-in `MinLength`/`MaxLength` didn't match the author's UTF-16 contract. Commenter: "slower builds and extra tooling can affect the whole development workflow" — [dev.to comparison](https://dev.to/nyaomaru/i-compared-6-typescript-validation-libraries-heres-what-surprised-me-325g)
- Bun runtime with the tsgo version didn't work initially, and there were problems in an existing SvelteKit codebase (Jun 2026). It was fixed via the bun-register preload — [typia#1534](https://github.com/samchon/typia/issues/1534)
- Compile-time slowness: a user found typia "too slow for compile-time validation needs" (Jan 2026, TS-JS era). tsgonest (Mar 2026) was created because Nestia's Swagger generation was slow on large projects — [typia#1534](https://github.com/samchon/typia/issues/1534)
- Older friction: ts-patch breaks on TS upgrades (e.g. "TypeScript v5.7 has occured many break changes on its filesystem, and it had broken the ts-patch") — [typia v7.0.2 release](https://github.com/samchon/typia/releases/tag/v7.0.2) (via search summary; older)

**Nestia**
- A NestJS companion built on typia: `nestia sdk` (typed client SDK from controller types), `nestia swagger` (OpenAPI 3.1 / Swagger 2.0 from exact controller types), `nestia e2e`, and `NestiaSwaggerComposer.document(app)` at runtime (needs the @nestia/sdk transform at build) — [nestia v14.1.0](https://github.com/samchon/nestia/releases/tag/v14.1.0); [ttsc nestia plugin docs](https://ttsc.dev/docs/plugins/nestia/) (via search summary)

### Inferences
- Typia's protobuf restrictions are a good preview of what a binary-layout codegen must reject or special-case: top-level unions, nested arrays, Date, Set, any, and Map with union values. Our FlatBuffers-style layout can accept more (e.g. vectors of vectors via tables, unions via a tag byte), but these are the corners where users will try things.
- Typia's tag vocabulary (`int8…uint64`, `float`, `double`) is the de facto convention. Matching it (or accepting it as an alias) would ease adoption.
- Users' biggest complaint is build integration, which a standalone codegen CLI with committed output avoids entirely. That is a selling point vs typia.

### Gaps
- Typia protobuf encode/decode benchmark vs protobufjs/protobuf-es: not found in current docs.
- npm weekly downloads for typia/nestia: not retrievable (badge images).
- Whether `typia generate` (source-to-source CLI mode) still exists in typia 13+: not confirmed; the current setup page doesn't mention it.

---

## Q3. Deepkit runtime types: mechanism, BSON performance, 2025–2026 status, problems

### Takeaway
Deepkit's type compiler (a TS transformer) emits type information as bytecode into the output JS, executed by a small VM at runtime, so `typeOf<T>()`, `is<T>()`, serializers and BSON work from TS types. The project moved to github.com/marcj/deepkit and is active (v1.1.0, Oct 31, 2026). It is still built on TS 6, and its TS 7 plan is "unclear how".

### Cited Findings
- Type data is stored "as bytecode run by a custom virtual machine". Runtime reflection covers class properties, function parameters and return types. Validation and serialization need no codegen or schema library — [deepkit.io runtime types](https://deepkit.io/documentation/runtime-types)
- Numeric annotations: `integer, int8, uint8, int16, uint16, int32, uint32, float, float32, float64` (`type uint32 = number` plus reflection metadata). Ranges: int8 −128..127, uint32 0..4294967295, float32 ±3.40282347e+38. The validator, serializer, BSON and ORM each use this info differently. float32 can't be range-checked exactly but helps binary serializers — [deepkit types docs (ko)](https://deepkit.io/ko/documentation/runtime-types/types); [API docs](https://api.framework.deepkit.io/modules/type.html) (the API docs show int8 as −127..128, likely a typo)
- BSON benchmark (Deepkit's own numbers, ~2025), 10k-object array. Parse: bson-ext 31 ms, js-bson 25 ms, JSON.parse 5 ms, deepkit/type JIT 2 ms. Serialize: bson-ext 39 ms, js-bson 33 ms, JSON.stringify 5 ms, deepkit JIT 2 ms. "JIT" means a schema-specialized serializer. ObjectId deserializes as string. Top-level non-objects are wrapped as `{v: ...}` — [@deepkit/bson npm](https://www.npmjs.com/package/@deepkit/bson)
- v1.1.0 (Oct 31, 2026): built with TS 6, supports TS < 5.5 again, Node ≥ 20. Breaking: `declare` statements in your own files produce no runtime types. Named re-exports carry types. Bun plugin honors compilerOptions/include/exclude and has CI tests. `@deepkit/vite` gained its own glob matching. BSON rejects NaN, and union errors match `validate()` with a "scored union resolver" (picks the member with the most matching properties). Mongo cursor IDs are read as bigint. Goal: "zero external dependencies" (40 deps removed). Docs are offered as llms.txt for coding agents. TS 7 is not mentioned — [marcj/deepkit v1.1.0](https://github.com/marcj/deepkit/releases/tag/v1.1.0)
- v1.0.x released early 2025 (e.g. 1.0.5 on 2025-04-02, adding `@deepkit/run`) — [deepkit releases](https://github.com/marcj/deepkit/releases/tag/v1.1.0) (via search summary)
- TS 7: "yes, we are planning to support it, but it is still unclear how" (marcj, Jun 25, 2025). No milestone or PR — [marcj/deepkit#658](https://github.com/marcj/deepkit/issues/658). Deepkit is named in the upstream transformer-plugin issue alongside typia and mion — [typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)

### Inferences
- Deepkit's design (`type uint32 = number` with metadata captured by its own transformer) only works because its transformer sees the alias name at the use site. A plain checker-based codegen like ours generally cannot distinguish `type u32 = number` from `number`, because primitive aliases are erased. That is why intersection brands (`number & {__type:'u32'}`) are the right choice for a CLI that only uses the checker.
- Deepkit's approach (bytecode embedded via an emit-time transformer) is the most exposed to TS 7's "no emit-side transforms" stance. Expect it to stay on TS 6 or follow a ttsc-like or bundler-plugin route.

### Gaps
- No independent 2025–2026 benchmark of Deepkit vs typia found. Exact BSON wire encoding for int8/float32 is not documented.
- Deepkit community health (downloads, contributors) in 2026 is not measured.

---

## Q4. Other "types → runtime" approaches and how they cope with esbuild/SWC/Vite/Bun

### Takeaway
The landscape splits into four groups. (a) Transformer-based (typia ≤12, ts-runtime-checks, Deepkit) needs ts-patch or a bundler plugin and is the group most hurt by TS 7. (b) Schema-file generators running on the checker (ts-json-schema-generator, typescript-json-schema) work like our CLI and are porting to `typescript/sync` or Go. (c) Schema-first builders (TypeBox, Zod, Effect Schema) avoid the compiler entirely. (d) Bundler-agnostic delivery comes via unplugin wrappers or generated source files. esbuild, SWC, Vite and Bun all strip types without running TS transformers, so (a) always needs an extra plugin layer.

### Cited Findings
- **ts-runtime-checks:** a transformer that "automatically generates validation code from your types", set up via ts-patch (`plugins: [{transform: "ts-runtime-checks"}]`, `tspc`). Latest 0.6.3, published ~2 years ago. Supports up to TS 5.7. Single maintainer. A "v0.7.0 rewrite" issue has been open since Jun 2024. No TS 7 signal — [GoogleFeud/ts-runtime-checks](https://github.com/GoogleFeud/ts-runtime-checks); [npm](https://www.npmjs.com/package/ts-runtime-checks)
- **ts-patch:** still released (v4.0.0/4.0.1 on May 1, 2026; previous v3.3.0 Dec 2024). ~133k weekly downloads. Single maintainer (nonara). v4 patches only `typescript.js`/`tsc.js`, i.e. the JS compiler (TS ≤ 6) — [npm ts-patch](https://www.npmjs.com/package/ts-patch) (via search summary). No evidence it can patch TS 7. The TS team says patching tsc "just isn't going to work" — [typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)
- **typescript-json-schema:** self-described as "more or less in maintenance mode", recommending ts-json-schema-generator — [npm typescript-json-schema](https://www.npmjs.com/package/typescript-json-schema)
- **ts-json-schema-generator (vega):** checker-based schema generation. Experimental Go port v3 (Aug 9, 2026): native per-OS packages, CLI-compatible, no JS library API, 251 golden fixtures, identical output on Vega-Lite and Mosaic — [vega/ts-json-schema-generator-go](https://github.com/vega/ts-json-schema-generator-go). A `typescript/sync` port is proposed — [#2199](https://github.com/vega/ts-json-schema-generator/issues/2199)
- **TypeBox (reverse direction: schema builder → static type):** 1.0 ships as the `typebox` package (ESM, `import Type from 'typebox'`). `@sinclair/typebox` 0.x is now long-term support. It includes a JSON Schema compiler (drafts 3 to 2020-12) pitched as an Ajv alternative, with dynamic fallback in JIT-restricted environments (Cloudflare Workers). No native Standard Schema support; TypeMap was archived in 2026 — [sinclairzx81/typebox](https://github.com/sinclairzx81/typebox); [1.0 migration](https://github.com/sinclairzx81/typebox/blob/main/changelog/1.0.0-migration.md); [typebox#1154](https://github.com/sinclairzx81/typebox/issues/1154)
- **Build tools:** the TS team points users needing custom emit to "type-erasing emitters", some of which are extensible, and to Node's strip-types — [typescript-go#516](https://github.com/microsoft/typescript-go/issues/516). Typia covers bundlers via `@ttsc/unplugin` (Vite, Rollup, esbuild, Webpack, Rspack, Farm, Next.js, Bun) — [typia setup](https://typia.io/docs/setup/). Deepkit uses `@deepkit/vite` and a Bun plugin — [deepkit v1.1.0](https://github.com/marcj/deepkit/releases/tag/v1.1.0)
- **runtyped and mion:** other runtime-type projects tracking TS 7, with an open "Typescript v7 (Go)" issue — [runtyped#4](https://github.com/runtyped/runtyped/issues/4). M-jerez (ts-runtypes/mion author) argues that IPC-based JS access "would be much slower than forking tsgo directly" and offers Go binaries — [vega#2199](https://github.com/vega/ts-json-schema-generator/issues/2199)
- **tsgonest** (Mar 2026): a compile-time alternative inspired by nestia/typia, created over slow Swagger generation — [typia#1534](https://github.com/samchon/typia/issues/1534)

### Inferences
- The robust, toolchain-agnostic pattern is "generate plain .ts files ahead of time", as in typia's old `generate` mode, Prisma, and ts-json-schema-generator. The output works under any stripper (esbuild/SWC/Bun/Node strip-types) with zero plugins. This matches our design and sidesteps every integration complaint above.
- If we ever want call-site magic (`rpc.encode<T>()` without a codegen step), the only TS-7 path is a ttsc-like Go host or a bundler plugin running our own analysis. Both are far more fragile.

### Gaps
- **ts-auto-guard, ts-to-zod:** not researched in this pass. Their TS 7 status and internals (ts-morph vs raw API) are unverified.
- No consolidated npm-download comparison found for these tools in 2026.

---

## Q5. What subset of TS types do mature tools support/reject, and type-level techniques (brands, u8–u64/f32, bigint, Date, optional/nullable, unions, recursion)

### Takeaway
Mature tools accept "data-shaped" types: object literals/interfaces, primitives, literal types, arrays, Map/Record, optional, nullable, and tagged/branded primitives. Their support for unions and generics is limited, and they reject `any`, functions, classes with behavior, and (for binary formats) Date, Set, nested arrays and top-level unions. Numeric width is expressed through phantom intersection brands: typia's `tags.Type<"uint32">`, Effect's `Brand<"X">`, or Deepkit's alias-plus-metadata. 64-bit integers are carried as `bigint`.

### Cited Findings
- **Typia tags convention:** `number & tags.Type<"uint32">` and `bigint & tags.Type<"uint64">`. Tag unions are allowed (`number & (tags.Type<"uint32"> | tags.Type<"double">)`). number-based int64 is imprecise at the boundary — [typia tags](https://typia.io/docs/validators/tags/)
- **Effect Brand:** `type ProductId = number & Brand.Brand<"ProductId">`. The tag key is a unique symbol `BrandTypeId = Symbol.for("effect/Brand")` to avoid collisions. `Brand.nominal<T>()` (no runtime check), `Brand.refined<T>(pred, err)` (validated constructor), and `Brand.all(Int, Positive)` (combine). Brands add distinctness "without altering their runtime characteristics" — [Effect branded types](https://effect.website/docs/code-style/branded-types/)
- **Deepkit:** `type uint32 = number` plus transformer metadata. int8/uint8/int16/uint16/int32/uint32/float32/float64/integer — [Deepkit types](https://deepkit.io/ko/documentation/runtime-types/types)
- **bigint / 64-bit:** typia maps untagged `bigint` → int64 and `bigint & Type<"uint64">` → uint64. Range checks span `-(2n**63n)`..`2n**63n-1n` and `0n`..`2n**64n-1n` — [typia tags](https://typia.io/docs/validators/tags/); [typia protobuf message](https://typia.io/docs/protobuf/message/). Deepkit reads Mongo cursor IDs as bigint — [deepkit v1.1.0](https://github.com/marcj/deepkit/releases/tag/v1.1.0)
- **Date:** typia protobuf rejects Date ("Use string type instead"). For JSON validation, typia uses `string & tags.Format<"date-time">` — [typia protobuf message](https://typia.io/docs/protobuf/message/); [typia tags](https://typia.io/docs/validators/tags/)
- **Optional/nullable:** typia protobuf accepts `T | null` and `?`, and skips null/undefined fields on encode — [typia protobuf message](https://typia.io/docs/protobuf/message/)
- **Unions:** typia protobuf supports numeric-tag unions as `oneof`, with per-variant `Sequence`. It rejects top-level object unions and unions in container values — [typia protobuf message](https://typia.io/docs/protobuf/message/). Deepkit BSON/validate resolves object unions by a "scored union resolver" (most matching properties) — [deepkit v1.1.0](https://github.com/marcj/deepkit/releases/tag/v1.1.0)
- **Recursion:** typia protobuf supports recursive types through arrays (`children: Array<IMember>`) — [typia protobuf message](https://typia.io/docs/protobuf/message/)
- **Declarations:** Deepkit v1.1.0 stopped emitting runtime types for local `declare type/interface` (they become `any`) — [deepkit v1.1.0](https://github.com/marcj/deepkit/releases/tag/v1.1.0)

### Inferences (for our design)
- Our `type u32 = number & {__type:'u32'}` is the same shape as typia/Effect brands. Two refinements worth considering:
  - Make the brand property optional or symbol-keyed (Effect-style) so that `getPropertiesOfType(u32)` doesn't show `__type` as a "real" field, and so literal assignment ergonomics can be tuned. The codegen detects brands by inspecting intersection constituents via the checker.
  - Accept typia's `tags.Type<"uint32">` as an alias so typia users can reuse types.
  - A bare `type u32 = number` is not detectable reliably via the checker, because primitive aliases lose their alias identity; Deepkit only gets away with it through its own transformer. This last point is an inference; checker behavior for `aliasSymbol` on primitive aliases was not verified in this pass.
- Suggested type set: u8/u16/u32/i8/i16/i32/f32/f64 as `number` brands; u64/i64 as `bigint` brands (as typia does), optionally with a `number`-backed "u53" for ergonomic IDs. Date: either reject it (typia) or define an explicit `Timestamp` brand over bigint/number, because a binary format must pick an encoding. Discriminated unions: require a literal discriminant property and map it to a FlatBuffers-style union tag byte. That is more than typia protobuf allows and lets us generate switch-based decoders. Recursion: allow it through vectors and optional table references; reject direct infinite structs.
- Reject list to mirror mature tools: `any`/`unknown`, functions, Set (or map to a vector), nested arrays (or support them via wrapper tables), index signatures with union values, top-level non-objects (or wrap them, as Deepkit wraps `{v: ...}`).

### Gaps
- ts-brand library conventions were not researched in this pass.
- How typia's tag type is structurally encoded (e.g. a phantom optional property) was not verified from source.

---

## Q6. ts-morph and alternatives for writing codegen; incremental/watch performance on big projects

### Takeaway
ts-morph (wrapper over the TS JS API) is at 28.0.0 on TS 6.0. Its maintainer is building a TS fork with a Go backend (Wasm first) for TS 7, which is promising but unreleased. For new codegen in late 2026, prefer the raw checker API behind your own adapter: TS 6 now, `typescript/sync` with snapshots for incremental work in 7.1. For emitting code, string templates or a small printer are enough. ts-morph's AST-manipulation niceties matter less when you generate fresh files.

### Cited Findings
- ts-morph 28.0.0: "feat(BREAKING): TypeScript 6.0". There is an open "WASM + typescript-go" issue — [ts-morph releases](https://github.com/dsherret/ts-morph/releases)
- dsherret, Mar 2025: didn't expect ts-morph to survive an IPC-only API. Jul 26–28, 2026: a path forward that "requires a TypeScript fork", moving logic to Go, Wasm first then native. Sep 6, 2026: a native backend exists and is faster than ts-morph on TS 6 — [ts-morph#1621](https://github.com/dsherret/ts-morph/issues/1621)
- Downstream projects are planning to leave ts-morph for TS 7 compatibility (e.g. zinfer) — [toiroakr/zinfer#200](https://github.com/toiroakr/zinfer/issues/200)
- Incremental model in 7.1: snapshots ("a version of all the projects and programs at a point in time") with `snapshot.update()` driven by `fileNotifications`, avoiding full rebuilds — [devblogs: TS 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/)
- Scale data points: Vega-Lite schema generation is ~535 ms with ~73k checker calls on TS 6. A naive 7.1 IPC port is estimated at 1.6–2 s — [vega#2199](https://github.com/vega/ts-json-schema-generator/issues/2199). jsii on aws-cdk-lib makes 100k+ calls per checker method, which motivated coarse-grained batch APIs — [TypeScript#65051](https://github.com/microsoft/TypeScript/issues/65051)
- TS 7 build itself: mui-docs `--noEmit` went from 22.2 s (7.0) to 11.9 s (7.1) — [devblogs: TS 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/)

### Inferences
- For watch mode on a big monorepo, do this:
  - Restrict the program to the RPC schema entry files and their imports, not the whole tsconfig.
  - Cache generated output keyed by a hash of the resolved type graph.
  - On TS 6, reuse `ts.createWatchProgram`/builder programs.
  - On 7.1, use snapshots.
  - Since the user's app build can be TS 7 (`tsc` 10x faster) while our codegen runs on the TS 6 API in parallel, the codegen won't be the bottleneck for schema-sized inputs.
- Avoid depending on ts-morph until its TS 7 fork ships. The raw checker calls we need (symbol → declared type → properties → flags/intersections/literals) are a small surface and easy to port.

### Gaps
- No public benchmarks of watch-mode codegen on large projects for TS 6 vs 7.1 found.
- Alternatives to ts-morph for TS 7 (e.g. tsrs, an independent Rust TS checker mentioned with an `unstable/*` API) were not researched in depth — [GraphQLSP PR #438](https://github.com/0no-co/GraphQLSP/pull/438).
