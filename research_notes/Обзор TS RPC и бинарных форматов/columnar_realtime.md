# Columnar and realtime numeric data transport for browsers/JS (as of Nov 2026)

Scope: competition and needs for a "TS-first binary RPC for realtime/numeric data" positioning. These notes cover Apache Arrow JS, game netcode serializers, finance/telemetry/geo formats, the browser transport layer, and delta/incremental update patterns. Research date: 2026-11-02. npm versions and weekly downloads come from registry.npmjs.org / api.npmjs.org, queried 2026-11-02 (method: `curl https://registry.npmjs.org/<pkg>/latest` and `https://api.npmjs.org/downloads/point/last-week/<pkg>`).

---

## Q1. Is there an existing TS-first (types-from-TS) solution for columnar/realtime numeric RPC? What gap remains vs Arrow and Colyseus schema?

### Takeaway
I found no library that does all of the following: derive the wire schema from TS types, use a columnar/SoA layout with zero-copy TypedArray views, and provide RPC plus streaming/deltas. The space is split three ways. Arrow JS / Flechette is columnar and zero-copy, but it is schema-at-runtime, has weak TS row typing, is heavy, and has no browser RPC (Flight does not work in browsers). Game serializers (Colyseus schema, bitECS, nengi, geckos) offer deltas, per-client views and small integer types, but they are object/AoS-oriented state sync tied to a game framework. Typed binary codecs (typed-binary, BinarySchema) offer TS inference from schema objects, but they are AoS object codecs without RPC, streaming or columns.

### Cited Findings

**Apache Arrow JS (`apache-arrow`)**
- npm latest is 21.2.0, published 2026-07-21. Before that came 21.1.0 (2025-10-07) and 21.0.0 (2025-07-04). It has about 9.8M weekly downloads, most of them transitive (DuckDB-WASM, Perspective, Observable/Mosaic stacks, etc.) — npm registry query 2026-11-02; [npm](https://www.npmjs.com/package/apache-arrow)
- Arrow JS now lives in its own repo (apache/arrow-js). Since Arrow 23.0.0 (Jan 2026), the main apache/arrow monorepo holds only the format spec and C++ (with Python/R/Ruby/GLib bindings). The JS release cadence is separate — [Arrow 26.0.0 release notes](https://arrow.apache.org/blog/2026/10/08/26.0.0-release/); [Arrow 23.0.0 release](https://arrow.apache.org/blog/2026/01/18/23.0.0-release/)
- A 2026 overview describes the JS implementation as one of the slower-moving ones ("the JavaScript, .NET, and Swift implementations move more slowly"). This is a secondary source, a Substack opinion piece — [The State of Apache Arrow in 2026](https://amdatalakehouse.substack.com/p/the-state-of-apache-arrow-in-2026)
- The package is written in TS and published in many targets (`@apache-arrow/es5-cjs`, `es2015-esm`, `esnext-umd`, `ts`, ...) to reduce node_modules size — [npm apache-arrow](https://www.npmjs.com/package/apache-arrow); [Arrow JS docs](https://arrow.apache.org/js/)
- **TS typing:** the signature is `tableFromIPC<T extends TypeMap = any>(source): Table<T>`, so rows are `any` unless the user hand-writes an Arrow `TypeMap` (e.g. `{ time: TimestampMillisecond, value: Float64 }`). It is async for fetch/stream sources: `await tableFromIPC(fetch('/x.arrow'))` — [tableFromIPC docs](https://arrow.apache.org/docs/14.0/js/functions/Arrow_dom.tableFromIPC.html)
- Rows are `StructRowProxy<T> = StructRow<T> & { [P in keyof T]: T[P]["TValue"] } & { [key: symbol]: any }`. This proxy-object intersection type is the reason plain objects can't be assigned to builder inputs — [StructRowProxy docs](https://arrow.apache.org/docs/16.0/js/types/Arrow_dom.StructRowProxy.html)
- Known TS ergonomics issues:
  - arrow-js #90, "Strong typing for builders": users report "obfuscating the builder types … to clear the editor issue highlights" and type builders loosely as `arrow.Builder` — [issue #90](https://github.com/apache/arrow-js/issues/90)
  - #61: `instanceof` checks break when multiple copies of the library are bundled — [issue #61](https://github.com/apache/arrow-js/issues/61)
  - #45: Arrow 18 failed to type-check under TS 5.7 because of missing DOM/Node stream lib types — [issue #45](https://github.com/apache/arrow-js/issues/45)
- Calling `toArray()` on a large table to get JS row objects throws away the columnar layout and is slow (a secondary guide says so) — [mojoauth guide](https://mojoauth.com/dev-guides/serialize-and-deserialize-apache-arrow-with-react)

**Flechette (`@uwdata/flechette`)**
- Flechette is a lightweight Arrow reader/writer from UW IDL, the team behind Mosaic. It exists because the authors "had to develop workarounds for the performance and correctness of the Arrow JavaScript reference implementation" — [GitHub uwdata/flechette](https://github.com/uwdata/flechette)
- Bundle: about 49 KB min (16 KB gz). Arrow JS is about 163 KB min (43 KB gz) — [flechette README](https://github.com/uwdata/flechette)
- Speed vs Arrow JS: value iteration 1.3–1.6x faster, array extraction 2–7x, row-object extraction 7–11x, building columns 1.5–3.5x — [flechette README](https://github.com/uwdata/flechette)
- Trade-offs:
  - input must be byte buffers (no promises or streams)
  - "less strict TypeScript typings"
  - dictionary data is decoded upfront
  - by default, int64 is converted to number, timestamps to numbers, and structs to plain JS objects
  - it supports types Arrow JS lacks (run-end encoded, binary/list views, month-day-nano intervals) — [flechette README](https://github.com/uwdata/flechette)
- npm 2.7.1, about 145k weekly downloads — npm registry query 2026-11-02

**Arrow Flight / Flight SQL in browsers**
- There is still no official browser Flight client. The tracking issue apache/arrow #17325 (ex-ARROW-9860, "[JS] Arrow Flight JavaScript Client or Example") remains a request thread. Users there report grpc-web + Envoy experiments that work on the server side but not in the browser — [apache/arrow #17325](https://github.com/apache/arrow/issues/17325)
- Paul Taylor (arrow-js maintainer) on that thread: browsers only natively support gzip/brotli applied at the HTTP layer, so Flight's per-message compression doesn't map cleanly — [apache/arrow #17325](https://github.com/apache/arrow/issues/17325)
- Third-party JS Flight clients target Node, Bun and Deno, not browsers:
  - `@qualithm/arrow-flight-client` (Flight + Flight SQL; Bun / Node 20+ / Deno) — [GitHub qualithm](https://github.com/qualithm/arrow-flight-client-js)
  - `arrow-flight-client` by woodger (Node only, experimental 0.0.x, created Dec 2025, built on nice-grpc) — [GitHub woodger](https://github.com/woodger/arrow-flight-client)
- Deephaven works around browser gRPC limits with a custom `BrowserFlightService`. It emulates bidi streaming over grpc-web through Open*/Next* unary-style calls — [Deephaven javadoc](https://docs.deephaven.io/core/javadoc/io/deephaven/flightjs/protocol/BrowserFlightServiceGrpc.html)
- Inference from the above: in practice, browser users fetch Arrow IPC streams over plain HTTP or WebSocket rather than using Flight.

**Arrow adopters in browser (columnar consumers)**
- **Perspective** is a streaming pivot/grid/chart engine originally from J.P. Morgan. It moved from FINOS to OpenJS Foundation incubation on 2025-10-30; the repo is now perspective-dev/perspective.
  - Its client/server "replicated" mode sends the initial dataset to the browser, then "update deltas" over WebSockets as Apache Arrow.
  - It has "virtual servers" over DuckDB, ClickHouse, Postgres and Polars that stream only the visible region — [GitHub perspective-dev/perspective](https://github.com/finos/perspective); [Perspective client/server docs](https://perspective.finos.org/guide/explanation/architecture/client_server.html); [PR #2615 virtual API](https://github.com/finos/perspective/pull/2615)
  - `@finos/perspective` on npm is at 3.8.0 with about 15.7k weekly downloads. The package may have been renamed after the OpenJS move; I didn't verify this — npm registry query 2026-11-02
- **DuckDB-WASM** (`@duckdb/duckdb-wasm` 1.33.1-dev57, about 713k weekly downloads) is used with Mosaic and GeoArrow to query Parquet in the browser and hand Arrow buffers to deck.gl — npm query; [deckgl-duckdb-geoarrow example](https://github.com/dzole0311/deckgl-duckdb-geoarrow)
- **parquet-wasm** (0.9.0, about 197k/week) reads Parquet to Arrow in the browser. The GeoArrow WASM tooling (geoarrow-rs, `@geoarrow/geoparquet-wasm`, `@geoarrow/flatgeobuf-wasm`) uses `arrow-js-ffi` to read Arrow memory zero-copy out of the WASM heap. `@geoarrow/deck.gl-layers` "pass[es] the buffers directly to deck.gl's binary interface" — [geoarrow/deck.gl-layers](https://github.com/geoarrow/deck.gl-layers); [geoarrow-rs](https://github.com/geoarrow/geoarrow-rs); [Kyle Barron Observable notebooks](https://observablehq.com/@kylebarron)

**Game netcode serializers**
- **@colyseus/schema** describes itself as "Automatic state replication for multiplayer games", an "incremental binary state serializer with delta encoding". It can be used standalone — [GitHub colyseus/schema](https://github.com/colyseus/schema)
  - Version conflict: the npm registry shows **5.0.43** (about 212k weekly downloads, queried 2026-11-02). A search snippet claimed 4.0.30, and the GitHub package.json in an index showed 3.0.66. Treat the registry value as current.
  - **Schema definition:** current style is `schema({...}, "Name")`, which returns a real class, with `SchemaType<typeof X>` for the instance type. Legacy `@type()` decorators still work, but the project is "moving away from decorators" (they need `experimentalDecorators` and `useDefineForClassFields:false`). So types are inferred from a runtime schema object, not from TS interfaces — [colyseus/schema README](https://github.com/colyseus/schema)
  - **Numeric types:** int8/uint8/int16/uint16/int32/uint32/int64/uint64, float32/float64, and `number` (auto int/float). Collections are `array`, `map` and child schemas. No mixed types, no multi-dimensional arrays. Max 64 fields per schema. NaN/null numbers encode as 0, and Infinity as MAX_SAFE_INTEGER — [README](https://github.com/colyseus/schema)
  - **Delta mechanics:** a per-instance ChangeTree tracks mutations. `encodeAll()` sends full state to joiners, `encode()` sends changes, then `discardChanges()`. Only the latest mutation per property within a patch interval is sent. Child schemas are referenced by refId. Primitives use msgpack-like prefixes with little-endian payloads — [README](https://github.com/colyseus/schema); [Rust port docs](https://docs.rs/colyseus-schema/latest/colyseus_schema/)
  - **StateView:** `.view()`-tagged fields plus `StateView.add(obj)` give per-client visibility (interest management). Field tags `.unreliable()` and `.fullStateOnly()` exist too — [README](https://github.com/colyseus/schema)
  - **Size benchmark** (README units unstated, presumably bytes), Colyseus vs msgpack + fossil-delta: initial state of 100 entities 2671 vs 3283; update x/y of 1 entity 9 vs 26; 50 entities 342 vs 684; 100 entities 668 vs 1529 — [README](https://github.com/colyseus/schema)
  - Codegen exists for C#/Unity, C++, Haxe, Lua, etc. JS clients use reflection (the schema is sent over the wire) — [README](https://github.com/colyseus/schema)
- **bitECS 0.4** (`bitecs` 0.4.0, about 25k/week) has built-in `bitecs/serialization`:
  - `createSoASerializer(components) → (eids) => ArrayBuffer`, with typed fields `f32`, `u8`, `str`, `array` and an optional diff mode
  - `createSnapshotSerializer` (topology plus SoA data)
  - `createObserverSerializer(world, networkTag, components)`, which emits only entity/component adds and removes since the last call
  - The recommended setup is a snapshot on join, then Observer (structure) plus SoA (values) per tick, with pre-allocated buffers to avoid GC — [bitECS API](https://bitecs.dev/api); [DeepWiki bitECS serialization](https://deepwiki.com/NateTheGreatt/bitECS/4.4-serialization-overview)
  - This is the only mainstream JS game library I found whose wire layout is natively **SoA** (component stores are TypedArrays).
- **nengi 2** (2.0.0-alpha.173, last published about 2 years ago, about 11.8k/week):
  - Schemas are flat: `defineSchema({ x: Binary.Float64, pid: Binary.UInt32, ... })`.
  - v2 "writes bytes instead of bits (much faster, trivially more bandwidth)". Users can still bit-pack manually into typed arrays.
  - Nested objects are intentionally unsupported — [npm nengi](https://www.npmjs.com/package/nengi)
- **geckos.io**:
  - `@geckos.io/snapshot-interpolation` (1.1.1, about 1k/week, updated Feb 2025) handles client prediction, reconciliation, lag compensation, and a default interpolation buffer of 3 server frames. World state must be an array of flat objects, with `x(deg)`, `r(rad)`, `q(quat)` annotations for angle-aware interpolation.
  - It pairs with `@geckos.io/typed-array-buffer-schema` (last updated Dec 2022, about 60 downloads/week; effectively dormant). That library offers uint8/int16/... types and a README example game state of 56 bytes — [GitHub snapshot-interpolation](https://github.com/geckosio/snapshot-interpolation); [typed-array-buffer-schema](https://github.com/geckosio/typed-array-buffer-schema)
- **Bit-level TS codecs:**
  - `nasselk/BinarySchema` compiles encode/decode functions per schema, packs 1–32-bit integers and booleans at bit level, has "schema-driven IDE hints", and exposes min/max byte lengths — [GitHub BinarySchema](https://github.com/nasselk/BinarySchema)
  - `nasselk/BinaryPack` is a bit-level BufferWriter/Reader with LEB128 and zigzag — [GitHub BinaryPack](https://github.com/nasselk/BinaryPack)
- **typed-binary** (4.3.5, about 270k/week) uses composable schema objects (`bin.object`, `bin.arrayOf`) and `Parsed<T>` to infer TS types, with "no external DSL or compile step". It works on objects (AoS) — [GitHub iwoplaza/typed-binary](https://github.com/iwoplaza/typed-binary)
- Smaller struct-mapping libs: `@rametta/array-buffed` (tuples/arrays only, `Infer` type) and `arraybuffer-struct` (C-like struct over ArrayBuffer; warns that TS inference fails on deep generics) — [JSR array-buffed](https://jsr.io/@rametta/array-buffed); [arraybuffer-struct](https://github.com/Jerrykelft/arraybuffer-struct)

### Inferences
- **Remaining gap:**
  - (a) A schema **derived from plain TS interfaces/types**. Every existing option needs a runtime schema DSL: Arrow `TypeMap`/`Schema`, Colyseus `schema({})`, bitECS `f32`, nengi `Binary.*`, typed-binary `bin.*`.
  - (b) A **columnar/SoA wire layout** that decodes to `{ x: Float32Array, y: Float32Array }` with real TS types. Only Arrow/Flechette (weakly typed) and bitECS SoA (ECS-bound) do this.
  - (c) **RPC semantics** (request/response, server-stream, cancellation), which none of the columnar or game options provide in the browser.
  - (d) A **JSON fallback** for non-numeric parts in the same contract.
- **Positioning vs Arrow:**
  - Arrow's strengths are interop (DuckDB, Polars, Parquet, Python servers), a rich type system (nulls, dictionaries, nested, decimals) and ecosystem lock-in for analytics. A new project should **not** try to be Arrow. It should either (i) target cases where Arrow is overkill (small/medium realtime frames, typed rows, ~kB-sized bundle) or (ii) offer Arrow IPC import/export as an escape hatch.
  - Arrow's weak spots are TS typing, bundle size (43 KB gz for Arrow JS), lack of a browser RPC/Flight story, and the fact that it was never designed for small high-frequency deltas.
- **Positioning vs Colyseus schema:**
  - Colyseus has mature delta/patch semantics, interest management (StateView) and multi-language codegen, but it is per-object change tracking (AoS) tied to the Colyseus room model, and its 64-field limit and object graph make it poor for 100k-point numeric bulk.
  - A columnar RPC competes with Colyseus only if it adds deltas and views. Otherwise it is complementary.
- Download counts suggest real demand. Even where adoption is partly transitive, Arrow-family columnar tooling (Arrow 9.8M, DuckDB-WASM 713k, parquet-wasm 197k) far outweighs game-netcode schema libs (Colyseus 212k; others ≤25k).

### Gaps
- I didn't find a measured Arrow JS bundle size for a tree-shaken IPC-reader-only build. The only number found is Flechette's comparison (Arrow 163 KB min / 43 KB gz).
- I didn't verify the "digits"-based float quantization in `typed-array-buffer-schema` (I recall `{ type: int16, digits: 2 }`, but the README wasn't fetched).
- Photon JS, Nakama JS and Lance were not researched (tool budget). Nakama/Photon generally pass opaque byte payloads (user-defined encoding); that is an unverified recollection.
- I couldn't confirm Observable Framework/Plot's Arrow usage, or Polars-in-browser status (polars WASM), with sources in this pass.
- I found no published head-to-head benchmark of Arrow IPC vs a custom SoA format for small realtime frames.

---

## Q2. What features does this niche actually need (streaming, deltas, quantization, worker transfer, GPU upload)? Transport layer status.

### Takeaway
The recurring requirements are:
- binary frames over WebSocket, with WebTransport as an emerging option, now Baseline since Safari 26.4 (March 2026)
- full snapshot plus incremental deltas
- per-client filtering/interest management
- small integer/float32 types (quantization)
- data handed directly to TypedArray consumers: deck.gl attributes, uPlot columns, WebGPU buffers, workers via transfer

Mature consumers (deck.gl, uPlot, GeoArrow, Perspective) all want **columnar typed arrays** and explicitly penalize row objects.

### Cited Findings

**Transport: WebTransport**
- Safari 26.4 (released 2026-03-24, macOS and iOS) shipped WebTransport on by default. That made WebTransport **Baseline Newly Available** across Chrome 97+, Edge 97/98+, Firefox 114+ and Safari 26.4+. "Widely available" is projected for 2028-09-24. It is part of Interop 2026 — [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/features/webtransport); [WebKit Features in Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/); [WebRTC.ventures, Apr 2026](https://webrtc.ventures/2026/04/webtransport-is-now-baseline-what-it-means-for-real-time-media/)
- The W3C API reached Candidate Recommendation on 2026-07-30. The IETF protocol is not yet an RFC. WebTransport can fall back to HTTP/2 over TCP when QUIC is blocked. Usage is very low, about 0.002% of page loads per Chrome Platform Status (secondary source) — [CODERCOPS 2026](https://blog.codercops.com/blog/webtransport-explained-websocket-alternative-2026); [utsubo 2026](https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready)
- Before 26.4, iOS Safari was the blocker for WebTransport. An Apple dev-forum thread's accepted answer (Mar 2026) confirms it is fixed — [Apple dev forums](https://origin-devforums.apple.com/forums/thread/764486)

**Transport: WebSocket / WebSocketStream**
- The classic WebSocket API has **no backpressure for incoming messages**. Outgoing backpressure is only possible by polling `bufferedAmount` — [Chrome WebSocketStream docs](https://developer.chrome.com/docs/capabilities/web-apis/websocketstream)
- **WebSocketStream** (streams plus backpressure) ships **only in Chromium** (Chrome 124+). Firefox (through 156) and Safari (through 26.5/27) don't support it — [caniuse WebSocketStream](https://caniuse.com/mdn-api_websocketstream); [Chrome docs](https://developer.chrome.com/docs/capabilities/web-apis/websocketstream)
- Exchanges use mixed framing on one socket. Binance's SBE market-data streams (`stream-sbe.binance.com`) send subscription requests and responses plus `serverShutdown` as JSON **text frames**, and market events as SBE **binary frames**. The WebSocket API has a `responseFormat=sbe&sbeSchemaId=…&sbeSchemaVersion=…` URL param. REST uses `Accept: application/sbe` + `X-MBX-SBE` — [Binance SBE Market Data Streams](https://developers.binance.com/docs/binance-spot-api-docs/sbe-market-data-streams); [Binance SBE FAQ](https://developers.binance.com/docs/binance-spot-api-docs/faqs/sbe_faq)
  - This is precedent for the planned "binary for numeric, JSON fallback for the rest" model.
- Binance schema evolution is server-driven: since 2025-08-27, requests for schema 3:0 receive responses encoded in 3:1 (auto-upgrade). Decoders are generated with real-logic SbeTool — [Binance SBE FAQ](https://developers.binance.com/docs/binance-spot-api-docs/faqs/sbe_faq); [Binance changelog](https://developers.binance.com/docs/binance-spot-api-docs/CHANGELOG)
- Bybit also offers SBE, but only via its Market Maker WebSocket gateway (from 2026-01-15, path `v5/public-sbe`) — [Bybit SBE basic info](https://bybit-exchange.github.io/docs/institutional/sbe/basic-info)
- Grafana Live (since v8.0) is Pub/Sub over one WebSocket per browser tab. Per current docs, WebSocket channel data "must be JSON-encoded". The push API ingests Influx line protocol and turns it into data frames. So Grafana's realtime path is **JSON**, not binary — [Grafana Live docs](https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/); [Telegraf→Grafana tutorial](https://grafana.com/tutorials/stream-metrics-from-telegraf-to-grafana/)

**Workers, SharedArrayBuffer and transfer**
- SharedArrayBuffer requires cross-origin isolation: `Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`). Chrome has required this since 92; Safari supports it since 15.2 with isolation — [web.dev cross-origin isolation guide](https://web.dev/articles/cross-origin-isolation-guide); [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- `COEP: credentialless` works in Chromium and Firefox but **not Safari**, so Safari apps fall back to `require-corp` and need CORP/CORS on every cross-origin subresource. COOP also breaks communication with cross-origin popups (OAuth flows, payment windows). The WICG Document-Isolation-Policy proposal exists because COOP/COEP "have proven hard to deploy" — [uper.pl 2026 guide](https://uper.pl/en/blog/coop-coep-corp-cross-origin-isolation/); [WICG document-isolation-policy](https://github.com/WICG/document-isolation-policy)
- MDN's pattern is to check `crossOriginIsolated` and fall back to a plain `ArrayBuffer` posted to the worker — [MDN via search on COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- deck.gl recommends web workers to load data and generate attributes off the main thread — [deck.gl performance guide](https://deck.gl/docs/developer-guide/performance)

**GPU upload**
- deck.gl: "99% of the CPU time that deck.gl spends in updating buffers is calling the accessors you supply". Its two binary paths are (1) passing interleaved typed arrays as `data`, and (2) passing `data.attributes.getPosition` etc. as TypedArrays or luma.gl Buffers. The second is described as offering "the maximum performance possible in terms of data throughput".
  - Variable-length geometry (PathLayer) needs a `startIndices` array plus vertex-aligned attributes.
  - Supplying typed arrays avoids fp64 allocations.
  - Binary became first-class in v7, and attribute replacement arrived in v8 — [deck.gl performance guide](https://deck.gl/docs/developer-guide/performance); [Layer API](https://deck.gl/docs/api-reference/core/layer); [PathLayer](https://deck.gl/docs/api-reference/layers/path-layer); [deck.gl discussion #6250](https://github.com/visgl/deck.gl/discussions/6250); [performance roadmap](https://github.com/visgl/deck.gl/blob/master/dev-docs/roadmaps/performance-roadmap.md)
- WebGPU reached Baseline in Jan 2026:
  - Chrome/Edge 113+ and Safari 26 (Sept 2025, on macOS/iOS/iPadOS/visionOS)
  - Firefox 141 on Windows (Jul 2025), 145 on macOS Tahoe ARM, and 147 on all Apple Silicon macOS (Jan 2026)
  - Firefox Linux/Android was still pre-release or behind a flag as of Aug 2026, so a WebGL2 fallback still matters
  - Spec: W3C CR Draft of 2026-09-15 — [Wikipedia WebGPU](https://en.wikipedia.org/wiki/WebGPU); [web.dev WebGPU in major browsers](https://web.dev/blog/webgpu-supported-major-browsers); [gpuweb Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)

**Chart ingestion**
- uPlot (1.6.32, about 956k/week) takes columnar data (`[xs, ys1, ys2…]`) and does no parsing or aggregation itself.
  - Cold start: 166,650 points in 25 ms, then about 100k points/ms. Streaming at 60 fps "may start to struggle past 100k points in view". 3,600 points at 60 fps uses 10% CPU and 12.3 MB.
  - The maintainer criticizes row formats like `[[x,y],…]` because they allocate millions of tiny arrays — [uPlot README](https://github.com/leeoniya/uPlot); [HN comment by maintainer](https://news.ycombinator.com/item?id=46709415)
- uPlot issue #1122 is a real append-only pain point: sensors every 20 ms (50 pts/s per chart), hours of history, dozens of sensors. The user tried Float64Array plus capacity doubling and got CPU spikes on each copy. Full history must be kept for zoom — [uPlot #1122](https://github.com/leeoniya/uPlot/issues/1122)

**Deltas / incremental updates (how libs do it)**
- Colyseus: per-property change tracking, keeping only the last write per patch window; full `encodeAll` on join; per-view filtered encodes — [colyseus/schema](https://github.com/colyseus/schema)
- bitECS: Observer serializer for structural deltas (queue cleared on every serialize) plus SoA serializer with diff mode for values — [bitECS API](https://bitecs.dev/api)
- Perspective: initial Arrow snapshot, then Arrow-encoded "update deltas" over WebSocket; tables "update incrementally and views tick in real time" — [Perspective client/server](https://perspective.finos.org/guide/explanation/architecture/client_server.html)
- Mapbox Vector Tiles: geometry is a packed `uint32` command stream of **delta + zigzag** integer coordinates in tile-local integer space (quantized). Keys and values are dictionary-encoded per layer — [MVT spec 2.0](https://github.com/mapbox/vector-tile-spec/blob/master/2.0/README.md)
- MapLibre Tile (MLT) is a **columnar** successor to MVT:
  - Each column is split into streams with lightweight codecs (FastPFOR, FSST, varint, byte-RLE, delta on Morton codes). It has an explicit in-memory layout for "seamless GPU offloading" and optional pre-tessellation.
  - It claims up to 3x better compression than MVT.
  - v1 is stable, v2 experimental (adds Z/M and nested properties). MapLibre GL JS and Native support it natively, and the Martin server can convert MVT→MLT at serve time — [MLT spec](https://maplibre.org/maplibre-tile-spec/index.md); [arXiv 2508.10791](https://arxiv.org/pdf/2508.10791); [Martin MLT guide](https://maplibre.org/martin/using-guides/mlt/); [HN discussion](https://news.ycombinator.com/item?id=46763864)
- Cesium's legacy 3D Tiles vector format also used zigzag-delta (`AttributeCompression.zigZagDeltaDecode`, decoded in place). The 3D Tiles 2.0 direction moves vector data into glTF buffers (`3DTILES_content_gltf_vector`). In earlier tests, glTF + meshopt + gzip was about equal in size to legacy .vctr + gzip. Cesium also plans to add MVT runtime support (June 2026) — [CesiumJS PR #6097](https://github.com/AnalyticalGraphicsInc/cesium/pull/6097); [3d-tiles #825](https://github.com/CesiumGS/3d-tiles/issues/825); [Cesium blog 2026-06-29](https://cesium.com/blog/2026/06/29/help-shape-vector-data-support-in-3d-tiles/)

**Quantization in practice**
- MVT quantizes to integer tile coordinates — [MVT spec](https://github.com/mapbox/vector-tile-spec/blob/master/2.0/README.md)
- Colyseus exposes int8/int16/float32 per field — [colyseus/schema](https://github.com/colyseus/schema)
- nengi exposes 8/16/32/64-bit ints — [npm nengi](https://www.npmjs.com/package/nengi)
- BinarySchema packs ints of arbitrary width from 1–32 bits — [BinarySchema](https://github.com/nasselk/BinarySchema)
- deck.gl users commonly ask about 32-bit positions vs fp64 — [deck.gl #6250](https://github.com/visgl/deck.gl/discussions/6250)
- Binance SBE uses microsecond integer timestamps and fixed-point mantissa/exponent prices (SBE convention) — [Binance SBE FAQ](https://developers.binance.com/docs/binance-spot-api-docs/faqs/sbe_faq)

### Inferences
- **Must-have feature list for the niche** (synthesized from the consumers above):
  1. SoA columns decoded as TypedArray views (`Float32Array`, `Float64Array`, `Int32Array`, `BigInt64Array`?) with **correct alignment**, so they can go straight to deck.gl attributes, uPlot or `GPUQueue.writeBuffer` without copying.
  2. **Server-streaming** of frames with a snapshot then deltas, plus resync on reconnect or gap. Colyseus `encodeAll`/`encode`, Perspective initial+delta and bitECS snapshot+observer all converge on this.
  3. **Append-only column deltas** (time series) and **sparse-index updates** (entity positions). uPlot #1122 shows that growable ring/chunked buffers are an unsolved client-side pain worth shipping as a helper.
  4. **Per-field numeric width / quantization** (f32, i16 with scale/offset, delta + zigzag + varint for monotonic timestamps, as in MVT and MLT).
  5. **Worker-friendly**: decoding must work on a transferable `ArrayBuffer` in a worker without needing SharedArrayBuffer, because COOP/COEP is costly and Safari lacks `credentialless`.
  6. **Mixed-frame protocol**: JSON for control and subscription, binary for data. The Binance SBE pattern is the industry precedent.
  7. Interest management / per-client views (Colyseus StateView, Perspective virtual viewport) for multi-user dashboards and games.
  8. Transport abstraction: WebSocket by default, WebTransport (datagrams for unreliable snapshots, streams for reliable data) now viable on all engines, and application-level backpressure, since WebSocketStream is Chromium-only.
- The benchmark claim (300x decode, about 20% smaller post-brotli) matches the qualitative consensus. deck.gl and uPlot both identify per-row JS object creation as the dominant cost. The size win is modest because brotli already compresses JSON well. Quantization and delta coding (MVT, MLT) are where the large size wins come from.

### Gaps
- I didn't verify whether `GPUQueue.writeBuffer` accepts TypedArray subviews with element offsets uniformly across Safari, Firefox and Chrome (my search didn't cover it).
- Fetch upload streaming (request body streams, HTTP/2 only, Chromium-only half-duplex) and SSE binary limits (text/UTF-8 only, so base64 is needed) were not researched with sources in this pass.
- No source found on Grafana's internal use of Arrow data frames between backend plugins and the frontend. Only the Live WebSocket JSON rule was confirmed.
- Kafka-in-browser was not researched. Kafka has no browser client protocol; bridges are typically WebSocket or SSE proxies. This is unverified.

---

## Q3. Typical payload sizes and update rates in these use cases

### Takeaway
Realtime rates cluster at **20 Hz** (Colyseus default patches, Grafana's 20 Hz demo stream), **50 ms–100 ms** (exchange order-book depth, sensors at 20 ms), and **60 fps** render loops with interpolation. Per-update payloads are small, from tens of bytes to a few KB per delta. Bulk loads are large: 100k–10M points, MB-scale Arrow/Parquet. Two regimes therefore exist: "big initial columnar snapshot" and "tiny high-frequency deltas". A product must be good at both.

### Cited Findings
- **Colyseus default patchRate is 50 ms (20 fps)**, and the default simulation interval is 16.6 ms (60 fps). Clients interpolate between patches — [Colyseus FAQ](https://docs.colyseus.io/faq); [Colyseus Phaser lerp tutorial](https://docs.colyseus.io/learn/tutorial/phaser/linear-interpolation); [Colyseus 0.10 Room docs](https://0-10-x.docs.colyseus.io/server/room/)
- Colyseus payload sizes (README benchmark, presumably bytes): 100-entity initial state about 2.7 KB; x/y update for 1 entity 9 B; for 100 entities 668 B — [colyseus/schema](https://github.com/colyseus/schema)
- geckos.io's snapshot-interpolation example: a game-state snapshot of **56 bytes** with typed-array-buffer-schema. The default interpolation buffer is 3 server frames (e.g. 200 ms at 50 ms frames plus 50 ms latency) — [snapshot-interpolation README](https://github.com/geckosio/snapshot-interpolation); [typed-array-buffer-schema](https://github.com/geckosio/typed-array-buffer-schema)
- **Binance**: the SBE `@depth` / `@depth20` stream update speed changed to **50 ms** (changelog 2025-11-11, applied automatically to SBE users). The WebSocket subscription request limit is 5 req/s per connection. Timestamps are in microseconds — [Binance testnet changelog](https://developers.binance.com/docs/binance-spot-api-docs/testnet/CHANGELOG); [Binance SBE streams](https://developers.binance.com/docs/binance-spot-api-docs/sbe-market-data-streams)
- **Grafana Live** demo channel `plugin/testdata/random-20Hz-stream` (20 Hz). Telegraf→Grafana high-frequency push recommends the WebSocket output. v8.1 docs list a default of 100 simultaneous Live connections — [Grafana Live](https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/); [Grafana v8.1 Live docs](https://grafana.com/docs/grafana/v8.1/live/)
- **Sensor telemetry**: one point per 20 ms (50 Hz) per sensor, dozens of sensors, hours of retained history (uPlot #1122). uPlot streams 3,600 points at 60 fps with 10% CPU and struggles beyond about 100k points in view at 60 fps. Its demo shows 2M–10M points statically — [uPlot #1122](https://github.com/leeoniya/uPlot/issues/1122); [uPlot README](https://github.com/leeoniya/uPlot); [uPlot 10M bench](https://leeoniya.github.io/uPlot/bench/uPlot-10M.html)
- **Maps/geo**: MLT claims up to 3x smaller tiles than MVT. Tiles are typically fetched per viewport rather than streamed — [arXiv 2508.10791](https://arxiv.org/pdf/2508.10791)
- **Perspective**: whole datasets are mirrored to the browser in replicated mode, or virtualized so that only the visible region streams ("large and/or streaming datasets") — [Perspective repo](https://github.com/finos/perspective)

### Inferences
- The 100k-point telemetry benchmark matches the **initial-load / history-backfill** regime (uPlot, deck.gl, Perspective snapshots). Steady-state traffic in games and trading is **small deltas at 20–60 Hz**. Here per-message overhead (header bytes, allocation, no per-message schema reflection) matters more than bulk decode speed. Benchmarks should add a "1–100 entities × 20–60 Hz" scenario and compare against Colyseus schema (9 B for a single-entity update) and SBE.
- At 50 ms cadence with brotli, per-message compression is usually unavailable. WebSocket permessage-deflate is the browser option, and brotli applies only to HTTP bodies. Compactness then has to come from the encoding itself (quantization, varints, deltas), not post-compression. This is an inference, consistent with Paul Taylor's note on browser compression in apache/arrow #17325 ([link](https://github.com/apache/arrow/issues/17325)).

### Gaps
- I found no authoritative public data on typical byte sizes of exchange order-book messages, or on Coinbase/Kraken/OKX feed formats. I believe these are JSON over WebSocket, but this is unverified in this pass.
- I found no published distribution of real-world dashboard payload sizes (e.g. Grafana panel query response sizes).
- deck.gl/kepler.gl typical dataset sizes were not sourced. kepler.gl was not researched.
