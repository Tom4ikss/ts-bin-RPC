# Schema-first binary serialization formats and their JS/TS implementations (state as of Nov 2026)

Scope: Protocol Buffers (protobuf-es, ts-proto, protobufjs, google-protobuf, Connect-ES, gRPC-web), FlatBuffers TS, Cap'n Proto TS (capnp-es), Avro (avsc), Bebop, Karmem, Borsh, Fory, and TS-native binary schema libraries (typed-binary and similar). The notes focus on lazy reads, V8 performance against JSON.parse, string handling, evolution, and pain points, for a code-first TS RPC with a FlatBuffers-style layout and a lockfile of field IDs.

Where a source is old, its date is given. Statements not backed by a fetched source are labelled as unverified or listed under Gaps.

---

## Q1. Which formats have lazy or zero-copy reads in JS, and do they beat JSON.parse in V8 for typical payloads? Are there credible published benchmarks?

### Takeaway
Only FlatBuffers (flatc --ts), Cap'n Proto (capnp-es, getter-based) and Karmem (AssemblyScript only) offer lazy, offset-based reads in the JS/TS world. None of them publishes a credible V8 benchmark against JSON.parse. Credible eager-decode benchmarks show this pattern:
- Schema-compiled decoders (avsc, protobufjs) can beat JSON.parse by about 1–7x on decode.
- Descriptor- or reflection-driven protobuf runtimes (google-protobuf, @bufbuild/protobuf before v2.14) are at or below JSON speed.
- Protobuf encode in JS is often slower than JSON.stringify.

The FlatBuffers lazy-read advantage holds mainly for partial access. Full traversal pays per-access costs, which include repeated string decoding.

### Cited Findings

**Lazy and zero-copy availability**
- FlatBuffers' official support matrix for JavaScript and TypeScript: codegen yes, Object API yes, optional scalars yes. **Buffer verifier NO**, reflection no, JSON parsing no, simple mutation no, fuzz testing no, Performance "?". — [FlatBuffers support matrix](https://flatbuffers.dev/support/)
- FlatBuffers TS runtime (`ts/byte-buffer.ts`) internals:
  - `__offset` reads the vtable through `bb_pos - readInt32(bb_pos)`.
  - It returns 0 (absent, so the default applies) when the slot index is at or past the vtable length.
  - Vectors are reached with `__vector`/`__vector_len`, and the generated code indexes elements itself.
  - int64 values are read as two uint32 reads combined into a `BigInt` with `BigInt.asIntN(64, …)`.
  
  — [flatbuffers/ts/byte-buffer.ts](https://raw.githubusercontent.com/google/flatbuffers/master/ts/byte-buffer.ts)
- capnp-es generates getters and setters for structs. Lists implement the standard `Array` interface. UTF-8 uses native TextEncoder/TextDecoder. The README calls it "alpha-quality software". — [unjs/capnp-es](https://github.com/unjs/capnp-es)
- Karmem lists zero-copy decoding for AssemblyScript but not zero-copy strings or native arrays. There is no plain JS/TS target. Its README claims "ten times faster than Google Flatbuffers" (author's own M1 benchmark). — [inkeliz/karmem](https://github.com/inkeliz/karmem)
- The adelost benchmark deliberately excludes FlatBuffers. It argues that FlatBuffers' zero-copy design (fields read straight from the buffer, no deserialize step) "is fundamentally different" from the encode/decode pattern it tests. — [adelost/javascript-serialization-benchmark](https://github.com/Adelost/javascript-serialization-benchmark)

**Eager-decode benchmarks against JSON (most credible current numbers)**

The adelost/javascript-serialization-benchmark was re-run in 2026 on Node v22.19.0 with a Ryzen 9 5950X; the original run was in 2020 on Node 12. Results relative to JSON:

| Library | Encode | Decode | Size vs JSON |
|---|---|---|---|
| avsc 5.7.9 | 8–12x faster | 3–7x faster | 32% |
| msgpackr | 2–4x | 2–3x | 53% |
| cbor-x | 2–4x | 1–2x | 53% |
| protobufjs 8.0.0 | 0.2–0.7x | 1–3x faster | 42% |
| pbf | 0.8–1.4x | 0.7–1.4x | 42% |
| google-protobuf 4.0.1 | 0.3–0.5x | 0.8x | — |
| @bufbuild/protobuf 2.11.0 | similar to google-protobuf ("due to its descriptor-based design") | | |

Further notes from the same benchmark:
- Making fields optional drops avsc's encode advantage from about 10x to about 4x.
- protobufjs' max payload is about 153 MB and google-protobuf's about 98 MB, against 298 MB for JSON.

— [adelost/javascript-serialization-benchmark](https://github.com/Adelost/javascript-serialization-benchmark)

**protobuf-es v2.14 performance release**
- v2.14 compiles descriptors into closure trees (#1491) instead of interpreting the schema on every call. It also caches a compiled `create()`, caches the DataView, uses a growable writer buffer, adds ASCII fast paths, native `isWellFormed()`, native base64, and allocation-free varint64. It drops Node 20.
- Speedups over v2.13:
  - "general" fixture: toBinary 4.66x, fromBinary 1.46x.
  - "user-normal" fixture: toBinary 5.24x, fromBinary 1.99x.
- Bundle is 5% smaller.
- The adelost numbers above use protobuf-es 2.11, so they predate this change.

— [protobuf-es v2.14.0 release notes](https://github.com/bufbuild/protobuf-es/releases/tag/v2.14.0); also summarized in [Buf blog "Protobuf-ES just got a lot faster"](https://buf.build/blog/protobuf-es-performance) (blog returned 403 to the fetcher; content seen only through the search snippet).

**Other protobuf benchmarks**
- expatfile/protobuf-benchmarks:
  - protobuf-es 2.15.0 (released 2026-09-11) is about 5–11% slower than ts-proto under Node.
  - ts-proto v2, which sits on protobuf-es, trails ts-proto v1 by about 2% on reads and about 4% on updates. The gap was 26% when pinned to protobuf-es 2.2.3.
  
  — [expatfile/protobuf-benchmarks](https://github.com/expatfile/protobuf-benchmarks) (seen through the search snippet, not fetched in full)

**Avro and Fory benchmarks**
- avsc wiki (last edited Aug 2017, Node 5.0, avsc 3.x): the JS-library comparison against JSON, protobufjs, msgpack and PSON is published only as chart images.
  - Size table for the "Coupon" record: Avro 71 B, Protobuf 85 B, MessagePack 231 B, JSON 359 B.
  - avsc decoded at 41% of Java-Avro's throughput (769k records/s) and encoded at 60%.
  - The wiki itself notes that Node 5 has a different performance profile from current Node. **Outdated.**
  
  — [avsc wiki: Benchmarks](https://github.com/mtth/avsc/wiki/Benchmarks)
- Apache Fory JS (xlang mode) vendor benchmark, run 2026-05-08:
  - Fory beats both "protobuf" and JSON in every case listed.
  - NumericStruct deserialize: 56.9 ns Fory, 94.8 ns protobuf, 333 ns JSON.
  - MediaContent deserialize: 539 ns Fory, 628 ns protobuf, 1134 ns JSON.
  - SampleList serialize: 1.68 µs Fory, 19.3 µs protobuf, 11.9 µs JSON.
  - Caveat: Fory receives "pre-normalized" values and protobuf receives prebuilt protobuf-shaped values. Which protobuf JS library was used is not stated in the snippet. **Vendor benchmark.**
  
  — [Fory JS benchmark report](https://fory.apache.org/docs/benchmarks/object-serialization/xlang/javascript/)

**Bebop and community discussion**
- Bebop's README claims it is about 10x faster than protobuf in C# and TS, and about 5x faster than JSON in TS. The graphs give no methodology. — [betwixt-labs/bebop](https://github.com/betwixt-labs/bebop)
- The 2026 Bebop whitepaper benchmarks only the native C runtime (Apple M3 Ultra, compared with protobuf-c, msgpack-c and simdjson). There are no JS or V8 numbers. — [arXiv 2604.09591](https://arxiv.org/html/2604.09591)
- HN thread on the Protobuf-ES launch (Oct 2022, **old**). No consensus; anecdotes conflict:
  - mnutt measured Protobuf-ES v1 at about 5.1x slower than protobufjs on encode and 14.8x slower on decode (Node 16, M1, "not particularly scientific").
  - leeoniya found "plain JSON was a multi-factor speedup over pbf" for flat arrays streamed at high frequency, but pbf was faster on deep structures.
  - mourner (pbf author) said that at pbf speeds, decoding is rarely the bottleneck compared with bandwidth.
  
  — [HN: Protobuf-ES](https://news.ycombinator.com/item?id=33381571)
- Auth0 "Beating JSON performance with Protobuf" (**old, about 2016–2017**):
  - In a browser JS client, protobuf messages were about 9% smaller and took only about 4% less time to become available to JS than JSON.
  - With google-protobuf the results were worse than JSON.
  - The headline "6x faster" figure was Java-to-Java.
  
  — [Auth0 blog](https://auth0.com/blog/beating-json-performance-with-protobuf/) (seen through the search snippet)

### Inferences
- No credible public V8 benchmark compares lazy FlatBuffers or Cap'n Proto reads with JSON.parse plus full object access on typical web payloads. Our zerocopy-bench would be filling a real gap.
- The winners against JSON.parse (avsc, protobufjs, Fory, msgpackr) all generate specialized per-type code or closures (JIT-like), so V8 can inline monomorphic property stores. protobuf-es' jump in v2.14 from "reflection walk" to "closure tree" confirms it: per-schema specialization, not the wire format, is the main lever. For codegen-from-TS this argues for emitting straight-line, per-type accessor code rather than a generic descriptor interpreter.
- Lazy reads beat eager decoding only when the consumer touches a small part of the payload. With full traversal, every getter does a DataView read and a vtable lookup. Memoizing strings and exposing numeric arrays as TypedArray views over the buffer (both planned in our design) address the two most expensive repeated costs.
- avsc's 8–12x encode lead depends partly on having no per-field tags or vtables: positional data with the writer schema known out of band. That trades away the ability to evolve without a schema registry or handshake.

### Gaps
- No published FlatBuffers-TS against JSON.parse benchmark in modern V8 was found. The FlatBuffers support matrix itself marks JS/TS performance as "?".
- No capnp-es benchmarks were found; the README makes no performance claims.
- Bebop TS has no independent V8 benchmark; the README graphs have no methodology.
- The original Buf blog posts (performance, v2, "gRPC-Web failed the web") returned HTTP 403 to the fetcher. Their contents are known only through search snippets.

---

## Q2. How do these implementations handle strings in JS (TextDecoder, manual decoding, caching)?

### Takeaway
The current TS-native runtimes (FlatBuffers TS, capnp-es) call `TextDecoder.decode()` on a `subarray`. FlatBuffers caches nothing, so each getter call decodes again. protobuf-es v2.14 added ASCII fast paths and native `isWellFormed()`. Bebop's C runtime points strings into the input buffer, which JS cannot do. Memoizing strings on first read is a real gap in FlatBuffers TS, and a known footgun there.

### Cited Findings
- FlatBuffers TS `__string`:
  - Takes `bytes_.subarray(offset, offset+length)`.
  - If `Encoding.UTF8_BYTES` is requested, it returns the raw `Uint8Array`, which gives zero-copy access to the bytes.
  - Otherwise it calls `this.text_decoder_.decode(utf8bytes)`.
  - There is no caching.
  
  — [flatbuffers/ts/byte-buffer.ts](https://raw.githubusercontent.com/google/flatbuffers/master/ts/byte-buffer.ts)
- HN "What happened to flatbuffers?" (Jan 2023): "it's also quite easy to trip yourself up in terms of performance by decoding the same data over and over again rather than re-using the first decode like you would with JSON or PB". The same commenter said the JS API is awkward because "an array isn't a JavaScript array, it's an object with decoder helpers". — [HN item 34417310](https://news.ycombinator.com/item?id=34417310)
- capnp-es: "UTF-8 is handled with the native TextEncoder and TextDecoder". Whether reads are lazy or cached is not documented. — [unjs/capnp-es](https://github.com/unjs/capnp-es)
- protobuf-es v2.14 string-related changes: native `String.prototype.isWellFormed()` (#1479), "ASCII fast paths" (#1509), and a fix to the fallback byte-size estimate (#1504). Strings now reserve bytes for length prefixes instead of measuring twice (#1490). — [protobuf-es v2.14.0](https://github.com/bufbuild/protobuf-es/releases/tag/v2.14.0)
- Bebop 2026 wire strings: a 4-byte length, UTF-8 bytes, and a 1-byte NUL terminator. "Decoded strings point directly into the input buffer" (C runtime). — [arXiv 2604.09591](https://arxiv.org/html/2604.09591)
- Karmem: zero-copy strings are not supported for AssemblyScript. — [inkeliz/karmem](https://github.com/inkeliz/karmem)

### Inferences
- In JS a "zero-copy string" is impossible: a JS string must be materialized. The best options are:
  - decode lazily, on first access;
  - memoize the result (what our design does);
  - offer a raw-bytes escape hatch, as FlatBuffers does with `UTF8_BYTES`, for comparing, hashing or forwarding without decoding.
- TextDecoder has a fixed per-call overhead. That is why several libraries (protobuf-es with ASCII fast paths; protobufjs, per prior knowledge) decode short strings by hand. A hybrid is worth benchmarking in V8: a manual ASCII loop, or `String.fromCharCode.apply`, below roughly 16–64 bytes, and TextDecoder above.

### Gaps
- Not verified in this session (prior knowledge only, needs checking): protobufjs uses a hand-written UTF-8 decoder (`@protobufjs/utf8`) for strings, and protobuf-es uses TextDecoder via `getTextEncoding()`. Neither source was fetched.
- No source gives a measured threshold where TextDecoder beats manual decoding in current V8.

---

## Q3. Why do teams abandon protobuf or FlatBuffers on the web frontend?

### Takeaway
The recurring reasons are:
- JSON.parse is native and fast, so decode wins in the browser are small or negative, and encode is often slower.
- Runtime bundle size.
- Debuggability in DevTools: the Network tab is opaque.
- int64 and BigInt friction.
- Awkward generated APIs: non-plain objects, `itemsList` renames, FlatBuffers accessor objects instead of arrays.
- Build-step complexity (protoc/flatc binaries).
- Decaying official JS tooling (google-protobuf receives only minimal updates; gRPC-web is in maintenance).

No credible public "we removed protobuf from our web client" engineering post was found. The evidence is HN threads and library docs.

### Cited Findings

**Performance and debugging**
- HN (2015, **old**): a Google engineer said a product that sent protos to the web frontend "in practice, that system was a failure, in part to the decision to use protos". Others argued that native JSON parsing plus compression makes binary not worthwhile in browsers. — [HN item 9665204](https://news.ycombinator.com/item?id=9665204)
- HN on Protobuf-ES (2022) on debugging:
  - francislavoie: JSON is "much easier to debug and observe traffic (browser Network tab)".
  - osigurdson: messages are "impossible to know" without the .proto.
  
  — [HN 33381571](https://news.ycombinator.com/item?id=33381571)
- The same HN thread on int64: fsaintjacques warned that "a simple round-trip to javascript can wreak silent havoc" for integers above 2^53. — [HN 33381571](https://news.ycombinator.com/item?id=33381571)

**API and ergonomics**
- google-protobuf requires builder-style APIs and renames repeated fields (`items` becomes `itemsList`). protobufjs objects carry type-name remnants on the prototype. — [adelost benchmark](https://github.com/Adelost/javascript-serialization-benchmark)
- FlatBuffers ergonomics (HN 2023):
  - an extra build step with a custom `flatc` executable;
  - "difficult to use (in JS at least)";
  - worthwhile "only … in performance sensitive contexts or when you only need a small portion of a larger data-structure".
  
  — [HN 34417310](https://news.ycombinator.com/item?id=34417310)
- FlatBuffers TS generator bugs:
  - since 22.11.22, generated `.ts` files import with `.js` extensions ([#7661](https://github.com/google/flatbuffers/issues/7661));
  - the Object API defaults vectors to `[]`, which contradicts the spec ([#7631](https://github.com/google/flatbuffers/issues/7631));
  - the TS builder emitted offset 0 for empty strings, which broke verifiers in other languages ([#7048](https://github.com/google/flatbuffers/issues/7048)).

**Bundle size** (protobuf-es repo's own measurement, esbuild + minify + compression, googleapis schema)

| Generated files | Protobuf-ES compressed | protobuf-javascript (google-protobuf) compressed |
|---|---|---|
| 1 | 15,926 B | 36,091 B |
| 32 | 24,962 B | 75,520 B |

Minified sizes for 32 files: 101 KB for Protobuf-ES against 854 KB for google-protobuf. — [protobuf-es bundle-size README](https://github.com/bufbuild/protobuf-es/blob/main/packages/bundle-size/README.md)

**Decaying official tooling**
- The grpc-web roadmap says its core dependencies (Closure, now archived, and protobuf-javascript, "receiving only minimal updates") mean "we do not plan to be adding new features going forward". — [grpc-web roadmap](https://github.com/grpc/grpc-web/blob/master/doc/roadmap.md)
- grpc-web 2.0.2 pins google-protobuf ~3.21.4 and breaks with 4.x (`reader.readPackedBool is not a function`, issue opened Mar 2026). — [grpc-web #1525](https://github.com/grpc/grpc-web/issues/1525)
- Buf calls gRPC-web "effectively in maintenance mode". — [Buf blog: gRPC-Web Failed the Web](https://buf.build/blog/grpc-web-failed-the-web) (snippet only; 403 on fetch)
- Google's J2CL protobuf was archived in March 2025. — [google/j2cl-protobuf](https://github.com/google/j2cl-protobuf)

**Validation and JSON-mapping friction**
- A project that moved to protobuf schemas but kept proto3 canonical JSON on the wire listed these downsides:
  - Protobuf cannot express ranges, non-empty text, finite floats or required enums.
  - proto3 JSON omits nulls and zero defaults, so consumers must treat "absent" and "null" alike.
  
  — [uw-syfi/vibesys PR #850](https://github.com/uw-syfi/vibesys/pull/850)

**Common industry pattern**
- JSON/REST for web clients and external APIs, protobuf/gRPC between internal services. — [Zuplo](https://zuplo.com/learning-center/protobuf-vs-json-api-serialization)

### Inferences
- A code-first TS RPC answers several of these pain points by design:
  - no external IDL or compiler binary;
  - generated types are the user's own TS interfaces.
  
  It should still plan for:
  - a DevTools or debug story, such as a JSON debug mode, a decoder in a browser extension, or `toJSON()` on views;
  - an explicit int64 policy (BigInt vs number with a range check, as in ts-proto's `forceLong`);
  - lazy view objects that are not plain arrays or objects, which hurts spread, `structuredClone`, `JSON.stringify`, React props and equality checks.
- "Lazy view escapes into app state" is the FlatBuffers-specific trap. Views hold the whole buffer alive and re-decode on every access. A cheap `.toObject()` or materialize step and memoization reduce it.

### Gaps
- No post-mortem blog from a named company that dropped protobuf or FlatBuffers on the web frontend was found in this session's searches.

---

## Q4. Per-format profiles: wire layout, evolution, JS/TS implementation, performance, bundle, verification, maintenance, complaints

### Takeaway
- **protobuf-es** (plus Connect-ES) is the best-maintained, conformance-complete TS protobuf, and has been closing the performance gap since v2.14.
- **ts-proto** produces the most idiomatic plain-interface TS and now sits on the protobuf-es wire layer.
- **protobufjs** is fast at decoding but carries a 2026 RCE through untrusted schemas.
- **google-protobuf and gRPC-web** are effectively legacy.
- **FlatBuffers TS** is the only mature lazy-read JS option, with no verifier and rough ergonomics.
- **capnp-es** is alpha.
- **avsc** is the fastest eager codec in JS, but positional data needs the writer schema.
- **Bebop** has a "Bebop 2026" rewrite under way.
- **Karmem** has no plain JS target.
- **Borsh** is deterministic, with no evolution story.

### Cited Findings

#### Protocol Buffers: protobuf-es (Buf) and Connect-ES
- v2 design:
  - generates a schema object plus a TS type per message, no classes;
  - API is `create(UserSchema, {...})`, `toBinary(UserSchema, msg)` and similar;
  - proto3 messages are plain objects, while proto2 and editions files use the prototype chain to track presence;
  - motivation: ES6 classes don't cross the "serialization boundary" (for example server-component props).
  
  v2 also added Editions support, field-presence APIs, typed JSON format, a full reflection API and custom options. Connect-ES 2.0 adopted the same APIs. — [Buf blog: Protobuf-ES 2.0](https://buf.build/blog/protobuf-es-v2) (via search snippet); [Connect-ES 2.0](https://buf.build/blog/connect-es-v2)
- The repo bills itself as the only JS protobuf library that is fully compliant with the conformance tests. — [bufbuild/protobuf-es](https://github.com/bufbuild/protobuf-es)
- Performance history:
  - descriptor-interpreting design, so slow (adelost puts it on par with google-protobuf at v2.11);
  - v2.14 compiled closure trees, giving 1.4–5.3x faster encode and 1.4–2x faster decode;
  - a small-schema browser bundle is under 19 KB gzipped (search snippet).
  
  — [v2.14.0 notes](https://github.com/bufbuild/protobuf-es/releases/tag/v2.14.0); [adelost](https://github.com/Adelost/javascript-serialization-benchmark)
- Bundle size against google-protobuf: about 16 KB compared with about 36 KB for one file, and about 25 KB compared with about 76 KB for 32 files. — [bundle-size README](https://github.com/bufbuild/protobuf-es/blob/main/packages/bundle-size/README.md)
- Buf's evolution tool: `buf breaking` checks backward compatibility. A Buf employee on HN called schema evolution "one of the core problems Buf solves". — [HN 33381571](https://news.ycombinator.com/item?id=33381571)

#### Protocol Buffers: ts-proto
- Generated code:
  - each message is a plain TS interface plus a const with `encode/decode/fromJSON/toJSON/fromPartial/create`;
  - v2.x switched the binary layer from protobufjs to `@bufbuild/protobuf` (`BinaryReader`/`BinaryWriter`).
- Options:
  - `forceLong` = number (the default, throws above the safe-integer range), long, string or bigint;
  - `oneof=unions-value` produces an ADT with `$case`;
  - `onlyTypes`, `outputEncodeMethods` and `outputJsonMethods` trim output;
  - `unknownFields=true` keeps unknown fields as buffers.
- RPC: client and service generators for Twirp, grpc-web, grpc-js, NestJS and nice-grpc; it is not itself an RPC framework.
- Repo: about 2.6k stars and 120 open issues.

— [stephenh/ts-proto](https://github.com/stephenh/ts-proto)

#### Protocol Buffers: protobufjs
- Fast decode (1–3x JSON), slow encode (0.2–0.7x JSON), and prototype remnants on decoded objects. — [adelost](https://github.com/Adelost/javascript-serialization-benchmark)
- **Security:**
  - Advisory: GHSA-xq3m-2v4x-88gg / CVE-2026-41242, published 2026-04-16, CVSS 4.0 score 8.7.
  - Impact: "Code execution through attacker-controlled protobuf definitions". Type names from schema metadata reached runtime JS code generation without validation.
  - Affected: ≤7.5.4 and 8.0.0. Fixed in 7.5.5 and 8.0.1.
  - Scope: only untrusted schemas or descriptors are a vector, not untrusted messages.
  
  — [GHSA-xq3m-2v4x-88gg](https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg)

#### Protocol Buffers: google-protobuf and gRPC-web
- google-protobuf: 0.3–0.5x JSON on encode and 0.8x on decode, builder API, `itemsList` renames. — [adelost](https://github.com/Adelost/javascript-serialization-benchmark)
- Status: "minimal updates", and gRPC-web adds no new features. — [grpc-web roadmap](https://github.com/grpc/grpc-web/blob/master/doc/roadmap.md)

#### FlatBuffers (flatc --ts)
- Wire layout:
  - each table starts with an int32 soffset to its vtable;
  - the vtable holds uint16 entries: vtable size, then per-field offsets;
  - a 0 entry or an out-of-range slot means "absent", so the default from codegen applies;
  - strings and vectors are uint32 length-prefixed.
  
  — [byte-buffer.ts](https://raw.githubusercontent.com/google/flatbuffers/master/ts/byte-buffer.ts)
- JS/TS has an Object API (unpack to plain objects) but no verifier, reflection, mutation or JSON parsing. — [support matrix](https://flatbuffers.dev/support/)
- The TS runtime does minimal bounds checking: read methods, `__offset` and `__string` are unchecked. Out-of-range typed-array reads coerce to 0 or truncate, so corrupt input yields silent garbage rather than exceptions. This comes from the fetcher's analysis of the source. — [byte-buffer.ts](https://raw.githubusercontent.com/google/flatbuffers/master/ts/byte-buffer.ts)
- Other languages have verifiers. C# gained one recently (commit 876a64a). Rust's tracking issue noted that without a verifier "any accessor may panic". — [C# verifier commit](https://github.com/google/flatbuffers/commit/876a64aae138be5d9eb9245348719a18161d8e09); [Rust #4916](https://github.com/google/flatbuffers/issues/4916)

#### Cap'n Proto
- **capnp-es** (unjs):
  - Origin: fork and rework of jdiaz5513/capnp-ts. ESM-only, uses the TS 5 compiler API, supports TS ≥5.7.3, with TS 7 support planned.
  - Requires the external `capnpc` binary.
  - Level-1 RPC is "experimental"; the library is "alpha-quality".
  - Repo: 178 stars and no tagged releases.
  
  — [unjs/capnp-es](https://github.com/unjs/capnp-es)
- **Promise pipelining:**
  - Calls return promises immediately, and the client can call methods on, or pass, an unresolved result. The chain `root.open("bar").open("foo").size()` → `read(0,size)` collapses four round trips into one.
  - Limit: pipelined results can only be used in new requests to the same server.
  - Interface references are capabilities: per-connection IDs that grant permission.
  
  — [capnproto.org/rpc](https://capnproto.org/rpc.html)
- Bebop 2026 RPC has a similar batch pipelining (`input_from`, server-side dependency layers). — [arXiv 2604.09591](https://arxiv.org/html/2604.09591)

#### Apache Avro (avsc)
- Wire: "Binary encoded Avro data does not include type information or field names". Values appear in schema order, so the reader must have the writer's schema. — [Avro 1.12 spec](https://avro.apache.org/docs/1.12.0/specification/#schema-resolution)
- Schema resolution between the writer schema (W) and the reader schema (R):
  - fields are matched **by name**, in any order;
  - W-only fields are ignored;
  - R-only fields take R's default, and are an error if R has no default;
  - aliases map renamed fields and types;
  - enums fall back to the reader's enum default;
  - promotions: int→long/float/double, long→float/double, float→double, string↔bytes;
  - union branch matching.
  
  — [Avro spec](https://avro.apache.org/docs/1.12.0/specification/#schema-resolution)
- avsc 5.7.9: the fastest library in the 2026 adelost run (8–12x encode, 3–7x decode, 32% of JSON size). Marked "Active". — [adelost](https://github.com/Adelost/javascript-serialization-benchmark)

#### Bebop
- Legacy wire format:
  - **struct** = concatenated fields, no tags, frozen forever (change it by creating `FooV2`);
  - **message** = uint32 length, then repeated (1-byte field index + value), skipping unknown indices.
  
  — [Bebop wire format](https://docs.bebop.sh/reference/wire-format/); [Message](https://docs.bebop.sh/reference/message/)
- Bebop 2026 edition:
  - compiler rewritten in C;
  - messages are a 4-byte length, 1-byte tags (1–255) and a 0x00 terminator;
  - primitives are fixed-width little-endian;
  - strings are length-prefixed and NUL-terminated;
  - about 37% overhead on small records;
  - wire size tradeoff: OrderLarge is 1,240 B in Bebop against 423 B in protobuf;
  - evolution: add tags; deprecate without reuse; no type changes; structs are frozen.
  
  — [arXiv 2604.09591](https://arxiv.org/html/2604.09591); [6over3/bebop-next](https://github.com/6over3/bebop-next)
- The original repo (betwixt-labs/bebop) has 2.2k stars and is not archived. — [betwixt-labs/bebop](https://github.com/betwixt-labs/bebop)

#### Karmem
- Wire and evolution:
  - inline structs are fixed-size and frozen;
  - tables are offset-based and append-only (new fields get defaults);
  - enums must start at 0;
  - `@packed(true)` removes padding.
- Safety: bounds checks, but the README notes:
  - offset reuse allows "short message expands to large arrays" (resource exhaustion);
  - encoding doesn't clear memory, so data can leak;
  - messages over 2 GB are undefined behavior.
- Status: "API is not stable". Toolchain versions date from 2022 (Go 1.19, Zig 0.10).

— [inkeliz/karmem](https://github.com/inkeliz/karmem)

#### Borsh (borsh-js)
- Schema as plain JS objects (`{struct:{…}}`, `{array:{type,len}}`, `{option}`, `{map}`, `{enum}`), "meant to be used in security-critical projects".
- The page documents no evolution support and no benchmarks.
- About 140 stars.

— [near/borsh-js](https://github.com/near/borsh-js)

#### TS-native and other options
- **typed-binary** (iwoplaza): TS schemas define the types (`bin.object`, `bin.arrayOf`, `Parsed<T>`), with no IDL. Eager encode/decode to plain objects. v4.3.x, about 190 stars, updated Mar 2026. — [iwoplaza/typed-binary](https://github.com/iwoplaza/typed-binary)
- Similar libraries that turned up: surd (`t.struct`, binary validation), colyseus/schema (delta encoding), paulmillr/micro-packed, TSBuffer (TS runtime type checking plus binary), and sia. — [search results incl. tsbuffer-schema](https://github.com/k8w/tsbuffer-schema), [surd](https://www.npmjs.com/package/surd)
- **Apache Fory JS:**
  - packages `@apache-fory/core` and `@apache-fory/hps`;
  - xlang wire format readable across languages when peers share type identity and schema;
  - vendor benchmark beats JSON and protobuf (see Q1).
  
  — [Fory JS benchmark](https://fory.apache.org/docs/benchmarks/object-serialization/xlang/javascript/)

### Inferences
- The JS ecosystem has no maintained, verified, lazy-read, TS-first binary format:
  - FlatBuffers TS is lazy but unverified and awkward;
  - capnp-es is lazy-ish but alpha;
  - Karmem has no JS target;
  - typed-binary is TS-first but eager.
  
  A code-first TS RPC with lazy views and a JS verifier is a genuinely open niche.
- Untrusted-input verification in JS has two sides:
  - **Memory safety.** Out-of-bounds DataView reads throw `RangeError`, and typed-array index reads return `undefined`.
  - **Resource exhaustion.** Karmem's warning about offset reuse applies: a verifier should check offset ranges, alignment, vtable sizes, string and vector lengths against the remaining buffer, and depth or recursion limits.
  
  Since getters are lazy, an up-front verify pass (FlatBuffers C++/Rust/C# style) or checked getters are both options; FlatBuffers TS has neither.
- Avoid `new Function`/eval-based codegen at runtime from schemas that might be untrusted. The protobufjs CVE shows the risk. CSP `unsafe-eval` is also an issue for browser apps. This favors build-time codegen, which our TS-interface codegen already does.

### Gaps
- No fetched source confirms avsc's internals (runtime `new Function` codegen for record types), its maintenance cadence in 2026, or its type-hinting and TS story.
- SBE (Simple Binary Encoding) was not researched in this session. No JS/TS implementation was surfaced. Prior knowledge (unverified): the official real-logic/simple-binary-encoding generates Java, C++, C#, Go and Rust, but not JS.
- bincode-style JS libraries, `@ezier`, `ts-binary`, `structurae` and `bin-proto` were not covered. The search suggests bin-proto is a Rust crate (unverified).
- The protobufjs/google-protobuf/ts-proto bundle sizes in a single comparable table were not found; the protobuf-es README compares only against google-protobuf.
- Connect-ES protocol details (Connect protocol vs gRPC-web vs gRPC framing, JSON/binary switching) were not fetched.

---

## Q5. Schema evolution best practices across formats, and lessons for a code-first schema with a lockfile of stable field IDs

### Takeaway
Every format converges on the same rules:
- Identity on the wire is a **stable number** (protobuf field number, FlatBuffers vtable slot or `id`, Bebop tag), never the name.
- Never reuse a retired ID. Keep it as `reserved`/`deprecated`.
- Adding fields is safe only if old readers can skip them and new readers get a defined default.
- Changing defaults or types is unsafe.
- Positional "structs" are frozen forever.

Avro is the exception. It matches **by name**, with aliases for renames, and needs the writer's schema at read time.

### Cited Findings

**Protobuf**
- Field numbers "cannot be changed once your message type is in use" and "should never be reused".
- When deleting, "you must reserve the deleted field number".
- Reserved names protect JSON and TextFormat parsing: reusing names is safe except for those encodings.
- Adding fields and enum values is safe.
- Moving fields into an existing `oneof` is unsafe.
- int32/uint32/int64/uint64/bool are wire-compatible but lossy. string↔bytes is compatible if the bytes are valid UTF-8.
- proto3 preserves unknown fields, but they are lost through JSON.
- `optional` (explicit presence) is recommended over implicit presence.
- The first enum value must be zero, named `*_UNSPECIFIED`.

— [protobuf.dev proto3 guide](https://protobuf.dev/programming-guides/proto3/)

**FlatBuffers**
- "New fields MUST be added to the end of the table definition" unless every field has an explicit `id`.
- "You MUST not remove a field"; mark it `deprecated` instead, which stops accessors from being generated.
- Changing defaults is generally not OK, because defaults aren't stored and old data "relied on generated code to provide the default value".
- Renaming is "generally OK" for the binary format, though it breaks code and JSON.
- Type changes are only "MAYBE OK" at the same width.
- Union variants are append-only unless discriminants are explicit.
- `flatc --conform` checks the evolution against a base schema.

— [flatbuffers.dev/evolution](https://flatbuffers.dev/evolution/)

**Avro**
- Matching is by name, and aliases handle renames.
- New reader fields need defaults.
- The type promotion lattice applies.
- Readers need the writer schema, because the binary has no names or tags.

— [Avro spec](https://avro.apache.org/docs/1.12.0/specification/#schema-resolution)

**Bebop**
- Messages use tags; structs never change (`MyStructV2`).
- Changing a tag counts as remove plus add.
- Reusing a tag with a different type is forbidden.

— [Bebop message docs](https://docs.bebop.sh/reference/message/); [arXiv 2604.09591](https://arxiv.org/html/2604.09591)

**Karmem**
- Tables are append-only, and new fields default to zero, false or the empty string.
- Inline structs are frozen.
- Enums must have a zero default.

— [karmem](https://github.com/inkeliz/karmem)

**Tooling**
- Buf provides `buf breaking`. — [HN 33381571](https://news.ycombinator.com/item?id=33381571)
- FlatBuffers provides `flatc --conform`. — [flatbuffers.dev/evolution](https://flatbuffers.dev/evolution/)

### Inferences (lessons for a TS-interface + lockfile design)
1. **The lockfile is the source of truth for field IDs.** Map each `(TypeName, fieldName)` to a stable numeric id or vtable slot, assigned once, append-only, never reused. A field removed from the interface stays in the lockfile as `retired`/`reserved`, keeping its ID (and name), as protobuf `reserved` and FlatBuffers `deprecated` do.
2. **Rename support.** Since TS has no field numbers, a rename looks like delete-plus-add to the codegen. Provide an explicit rename mechanism, such as a JSDoc tag like `@renamedFrom oldName` or a CLI `rename` command that rewrites the lockfile key and keeps the ID, analogous to Avro aliases. Otherwise renames silently break compatibility.
3. **Defaults are part of the contract.** FlatBuffers-style "absent means default from codegen" makes the default immutable. Lock the default value in the lockfile too, and fail the build if it changes.
4. **Fixed-size inline structs are frozen.** Keep separate "struct" (positional, frozen) and "table" (vtable, evolvable) kinds, as FlatBuffers, Karmem and Bebop do. Either:
   - mark TS types as frozen explicitly (for example a branded `Struct<...>` type or a `@struct` tag), or
   - default everything to tables.
5. **Type-change rules.** Allow only same-width, lossless changes, or forbid type changes entirely. Encode the allowed promotions in a CI check, similar to `buf breaking` or `flatc --conform`: diff the current interfaces against the committed lockfile.
6. **Unknown-field preservation** (proto3 style) matters for proxies and middleboxes. Decide whether views pass unknown slots through on re-encode. A buffer-view design gets this for free when forwarding the raw buffer, but loses it on materialize-and-re-encode.
7. **Enums.** Require a zero "unspecified" value, and decide how unknown enum values surface in TS: a raw number, or an `UNKNOWN` sentinel.
8. **Optional vs default.** Prefer explicit presence (`field?: T` maps to "absent" distinct from the default), as protobuf now recommends `optional` over implicit presence. This maps naturally onto TS optional properties.
9. **JSON compatibility.** If a JSON debug encoding exists, field names become part of the contract (protobuf's reserved-names rationale). Keep retired names reserved as well as retired IDs.

### Gaps
- No source found describes a code-first (no IDL) system that assigns field IDs through a lockfile. Prior knowledge (unverified in this session): typical examples include Microsoft Bond, Cap'n Proto `@N` ordinals, Rust `prost` derive with explicit tags, and protobuf-net `[ProtoMember(N)]` in C#. That last one is the closest code-first analogue, but explicit annotations are used there instead of a lockfile. It is worth a dedicated search if the report needs precedent.
