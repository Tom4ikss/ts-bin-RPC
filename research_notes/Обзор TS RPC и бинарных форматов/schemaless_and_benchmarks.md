# Schemaless/self-describing binary formats in JS, and JSON vs binary decoding performance in browsers (state as of Nov 2026)

Scope note: research done 2026-11-02. Many of the library benchmarks are old (Node 14/15, 2020–2021) and are marked as such. I found no rigorous, recent head-to-head of msgpackr/cbor-x against JSON.parse in Chrome, Firefox and Safari with per-browser numbers. The closest is Adam Faulkner's 2025 post, which shows results only as graphs.

---

## Q1. How do the schemaless JS libraries (msgpackr, cbor-x, @msgpack/msgpack, msgpack-lite, BSON/Smile/Ion, SuperJSON/devalue) get their speed, and what do their benchmarks really show?

### Takeaway
msgpackr and cbor-x beat JSON.parse by a wide margin (about 4.5x) only with the "records/shared structures" extension. That is effectively a schema handed out of band, plus generated code and key/short-string tricks. Without records they are at best on par with JSON.parse. Their published numbers are from Node 14/15 and use a native string addon that browsers don't get. In browsers, a 2025 test found msgpackr and cbor-x "among the slowest", and a current @msgpack/msgpack benchmark on Node 22 shows JSON.parse still ahead.

### Cited Findings

**msgpackr (Kris Zyp)**
- Benchmark in the README (OLD: "Node 15 / V8 8.6, Windows i7-4770"), in op/s: JSON.stringify/parse 16,313 / 18,125; msgpackr pack/unpack 33,940 / 21,926; **msgpackr with shared structures pack/unpack 38,072 / 84,580**; @msgpack/msgpack encode/decode 20,607 / 11,810; msgpack-lite 6,253 / 3,135; notepack 13,081 / 6,667; avsc 17,842 / 21,675 — [msgpackr README](https://github.com/kriszyp/msgpackr)
  - So without records, unpack is only about 1.2x JSON.parse. With shared structures it is about 4.7x. Nearly all of the "faster than JSON" claim comes from records.
- The record extension uses ext type 0x72 ("r"). Record ids fall in 0x40–0x7f and are followed by an array of field names. It is claimed to make decoding "2-3x faster". `maxSharedStructures` defaults to 32 (max 8160), and `getStructures`/`saveStructures` persist the shared definitions. Structures are append-only, so older data stays decodable. Streams turn on `sequential` (structure definitions inline, in order) — [msgpackr README](https://github.com/kriszyp/msgpackr)
- `randomAccessStructure` was removed in msgpackr 2.0 and now lives in a separate `structon` package with an identical binary format. This is the lazy, random-access, FlatBuffers-like mode, so it is a direct analogue of your design — [msgpackr README](https://github.com/kriszyp/msgpackr)
- String acceleration on Node comes from the native addon `msgpackr-extract`. **In browsers and Deno there is no addon**, so `bundleStrings` (a custom extension that bundles all strings into one block decoded in one call) is offered and claims a "30%-50%" decoding improvement. Both encoder and decoder must support it — [msgpackr README](https://github.com/kriszyp/msgpackr)
- The fast record path relies on `new Function`/eval-generated readers. The `index-no-eval.js` build exists for CSP, but the README warns that dynamic evaluation "provides important performance optimizations for records" — [msgpackr README](https://github.com/kriszyp/msgpackr)
- Turning on `structuredClone` (reference tracking) costs about 25–30% performance. Float32 decimal rounding costs about 20–25% — [msgpackr README](https://github.com/kriszyp/msgpackr)
- The README itself says MessagePack data compresses less well with gzip/brotli than compressed JSON — [msgpackr README](https://github.com/kriszyp/msgpackr)
- Kris Zyp's write-up "Building the Fastest JS (De)serializer" (quoted via search snippet; the page returned 403 to the fetcher):
  - For short strings (under 32 bytes), `String.fromCharCode` decoding is "typically still faster (and much faster for very small strings)" than native `Buffer.toString`, because native decoding pays the JS↔C++ boundary cost.
  - Property-name strings are cached and matched by their raw bytes. Key caching is used only when records are off and only for smaller objects — [Kris Zyp, Medium](https://kriszyp.medium.com/building-the-fastest-js-de-serializer-a413a2b4fb72)
- msgpack.org lists a msgpackr table: unpack 109,700 op/s vs JSON.parse 90,700, and with records 422,900. This is a secondary listing of the author's own Node numbers — [msgpack.org](https://msgpack.org/) (via search snippet)
- Counterexample (Medium, a single team's report): on a complex 10 MB object, JSON.parse took 65.0 ms and msgpackr unpack took 102.7 ms — [smali-kazmi, Medium](https://smali-kazmi.medium.com/when-optimized-is-slower-why-we-stuck-with-native-json-for-our-10mb-context-object-2d7dd62e6982) (search snippet only)

**@msgpack/msgpack (msgpack-javascript, official)**
- **Current** benchmark (Node 22.13.1, V8 12.4), in op/s: **JSON.parse 340,060 vs @msgpack/msgpack decode 280,400** (reused Decoder 281,220); JSON.stringify+Buffer.from 269,740 vs encode 247,740 (reused Encoder 275,960); msgpack-lite decode 107,900. The README says JSON cases include a Buffer conversion "to emulate I/O" — [msgpack-javascript README](https://github.com/msgpack/msgpack-javascript)
- The README says that as of 2019 JSON.parse was "the fastest deserializer". A reused Encoder is about 20% faster and a reused Decoder about 2% faster. `rawStrings: true` skips UTF-8 decoding and returns Uint8Array. CI runs in Chrome and Firefox — [msgpack-javascript README](https://github.com/msgpack/msgpack-javascript)
- `CachedKeyDecoder` (PR #54) caches map-key strings by their byte representation, on the reasoning that most strings are keys and unique keys are few. It reported about **1.5x faster decoding** — [msgpack-javascript PR #54](https://github.com/msgpack/msgpack-javascript/pull/54)
- msgpack-nodejs (credits msgpackr) uses pure-JS utf8 decoding for strings under 200 bytes and caches them in a prefix trie — [npm msgpack-nodejs](https://npmjs.com/package/msgpack-nodejs) (search snippet)

**msgpack-lite**: legacy. It is about 3–6x slower than msgpackr in the same old benchmark (decode 3,135 vs 21,926 op/s) — [msgpackr README](https://github.com/kriszyp/msgpackr)

**cbor-x (same author)**
- Benchmark (OLD: Node 14.8.0, i7-4770), in op/s: JSON.parse 17,909; cbor-x decode 20,023; **cbor-x with shared structures decode 82,800**, encode 35,645; `cbor` (node-cbor) decode 629; cbor-sync 3,984. The README claims cbor-x is "3-10x faster" than other CBOR JS implementations, including cborg, but gives no table for that — [cbor-x README](https://github.com/kriszyp/cbor-x)
- Records use tag 105 and the range 26880–27135 (proposed record extension). The structure limit is 64. They are claimed to be "15-50% more compact" and to decode "2-3x" faster — [cbor-x README](https://github.com/kriszyp/cbor-x)
- The `pack` option implements the **Packed CBOR** draft (tag 6 for references, tag 51 for the table). It is a **string/value dedup table**. It slows encoding and "generally does not yield as much compaction as standard compression tools", but is faster than encode-then-compress. Shared packed tables are "in-progress" — [cbor-x README](https://github.com/kriszyp/cbor-x)
- `bundleStrings` claims a "30%-50%" browser decode improvement. The README warns that CBOR's character frequency "tends to defeat Huffman encoding", so compressed CBOR is often less compact than compressed JSON — [cbor-x README](https://github.com/kriszyp/cbor-x)

**BSON / Smile / Ion / UBJSON**
- Uncompressed sizes on Lucid's dataset (2019, OLD; JVM tooling, not JS) in bytes: JSON 133,284,487; BSON 129,823,535 (barely smaller than JSON); textual Ion 117,878,664; CBOR 101,739,795; MessagePack 96,113,007; Smile 72,283,777 (Smile has back-references for repeated keys and values); **binary Ion 63,672,734** (Ion uses symbol tables) — [Lucid techblog](https://lucid.co/techblog/2019/12/06/json-compression-alternative-binary-formats-and-compression-methods)
- BSON is in the adelost JS serialization benchmark, alongside Protocol Buffer and Avro — [adelost/javascript-serialization-benchmark](https://github.com/Adelost/javascript-serialization-benchmark)

**SuperJSON / devalue (type-rich JSON; tRPC/SvelteKit)**
- Rich Harris's comparison (OLD: Node 16, M1 Max), 1M iterations: superjson stringify 8,543 ms vs devalue 3,190 ms. Parse 3,343 ms vs 261 ms, but the devalue parse figure uses `eval`. Output 183 vs 116 bytes. superjson adds 12.3 kB to the client bundle — [Rich-Harris/superjson-and-devalue](https://github.com/Rich-Harris/superjson-and-devalue)
- Recent comment (Oct 22, 2026, superjson issue #25): on a 400 KB React Query cache in Brave at 3.79x CPU throttle:
  - stringify: superjson 2.2.3 45.8 ms, PR #364 10.2 ms, devalue 6.0.3 9.9 ms
  - parse: 9.1 / 7.4 / 4.7 ms
  - devalue rejected 5 of 40 fixtures (Error, class instances, symbols…) — [superjson issue #25](https://github.com/ravionhq/superjson/issues/25)
- Civitai (Node 24, devalue 5.9.4, ~71 KB state): devalue.stringify about 575–615 µs/op, parse about 241 µs/op. They try devalue first and fall back to superjson — [civitai PR #7405](https://github.com/civitai/civitai/pull/7405)
- tRPC docs describe devalue as focused on "performance and compact payloads", at the cost of readability — [tRPC data transformers](https://trpc.io/docs/server/data-transformers)

**Schema-based JS decoders, for comparison**
- protobuf.js README (Node 24.15.0, Ryzen 9 9950X3D): for decode, static protobuf.js was fastest. JSON decode was 4.6x slower and **protobuf-es (protoc-gen-es) 8.8x slower**. The benchmark file itself calls the JSON comparison "flawed" — [protobuf.js README](https://github.com/protobufjs/protobuf.js/blob/master/README.md)
- Old bytebuffer.js issue, string-heavy ~196 KB payload in Safari: JSON about 60 ms vs protobufjs about 2,930 ms. After a UTF-8 fix, Safari took 325 ms and IE/Edge went from 11 s to 278 ms. UTF-8 decoding was the bottleneck — [bytebuffer.js #60](https://github.com/protobufjs/bytebuffer.js/issues/60)

### Inferences
- msgpackr/cbor-x "records" are essentially your design with the schema discovered at runtime and shipped once. Their 4–5x over JSON.parse comes from (a) no key strings on the wire or in decode, (b) monomorphic object construction via generated code, and (c) bundled or short-string-optimized string decoding. Without (a) and (b) they are roughly at JSON.parse parity on V8.
- Because the headline numbers are from Node 14/15 with a native addon, they say little about browsers. The browser-side string path (bundleStrings, fromCharCode) is the relevant one for you.
- Your 50–70 ns per-call TextDecoder overhead matches the reason all these libraries use JS loops or `fromCharCode` for short strings and batch long strings into one decode (bundleStrings).

### Gaps
- No current (2025–2026) per-browser msgpackr or cbor-x numbers. Faulkner (Q2) gives only qualitative "among the slowest" for them in browsers.
- No JS-specific perf data found for Smile, Ion or UBJSON libraries. They appear to be little used in JS.
- I could not read Kris Zyp's article directly (HTTP 403); its details come via a search snippet.

---

## Q2. Under what payload shapes does binary beat JSON in browsers, by how much, and where does JSON win? (Includes the browser engine landscape.)

### Takeaway
JSON.parse is native, heavily optimized (V8 7.6 rewrite, 2025 hidden-class tricks, JSC's atom-string cache) and hard to beat in browsers for **string-heavy, fully materialized** payloads. Binary wins mainly when:
- the payload is numeric-heavy or contains typed arrays or 64-bit integers,
- the decoder is schema-specialized and avoids per-key work,
- or access is **lazy/partial** (FlatBuffers-style), where you don't pay for unused fields.

When a lazy format must be fully materialized into plain objects, it loses. Schemaless msgpack/CBOR libraries tend to lose to JSON.parse in browsers.

### Cited Findings

**Browser head-to-heads**
- Adam Faulkner, "Binary Formats are Better Than JSON in Browsers!" (2025-04-23):
  - Setup: 1M Citibike trips, 340 MB as JSON, **string-heavy**. End-to-end timing including decompression and building plain JS objects (with Dates).
  - **msgpackr and cbor-x were "among the slowest" in browsers, though fast on the server.**
  - Avro (avsc master, after replacing the Buffer polyfill with Uint8Array), protobuf.js (after his string-decoding fix, PR #2062) and Bebop beat JSON.
  - protobuf-es "did not perform well". capnp-es was dropped.
  - FlatBuffers is good when the whole message won't be read, but **worse than alternatives when materializing full objects**.
  - Node benchmarks overstated avsc/protobuf.js because Node's `Buffer` has faster UTF-8 slicing than Uint8Array.
  - Results are shown only as graphs, with no browser versions in the text — [Faulkner 2025](https://adamfaulkner.github.io/binary_formats_are_better_than_json_in_browsers.html)
- A Medium author decoded MessagePack vs JSON 100,000 times in a browser and found msgpack decoding "slower than JSON in the browser", especially for small payloads. Load was faster (~155 ms vs ~249 ms); compressed size was ~11 kB vs ~13 kB (about 2 years old) — [Medium, onegreyonewhite](https://medium.com/@onegreyonewhite/should-you-switch-from-json-to-messagepack-for-browser-to-server-data-transfer-04b64a70033a) (search snippet)
- HN (2022): one user measured decode-JSON at about 436 µs, protobuf-es about 771 µs and protobufjs about 455 µs. Another found protobuf "slower than JSON.parse in node by 4-8x" on large reference data — [HN 40676134](https://news.ycombinator.com/item?id=40676134), [HN 33381571](https://news.ycombinator.com/item?id=33381571) (search snippets)
- adelost benchmark (Node, OLD): protobufjs decoded 1–3x faster than JSON; pbf about equal to JSON; google-protobuf slightly slower — [adelost](https://github.com/Adelost/javascript-serialization-benchmark)

**V8 JSON.parse / JSON.stringify**
- V8 v7.6 (2019) rewrote JSON.parse, making it "up to 2.7×" faster on data from popular pages — [V8 v7.6 release](https://v8.dev/blog/v8-release-76)
- "How we made JSON.stringify more than twice as fast" (Patrick Thier, 2025-08-04; V8 13.8 / Chrome 138), >2x on JetStream2 json-stringify-inspector:
  - side-effect-free iterative fast path
  - serializer templated on **one-byte vs two-byte strings**
  - SIMD (Neon) / SWAR escape scanning
  - Dragonbox number printing
  - segmented output buffer
  - hidden-class "fast-json-iterable" flag; **the same idea was added to JSON.parse to speed up key comparison when parsing arrays of same-shaped objects**
  - The fast path is lost with a replacer/space argument, `.toJSON`, indexed properties, or ConsStrings — [v8.dev/blog/json-stringify](https://v8.dev/blog/json-stringify)
- The same post: a string containing even one non-ASCII character is stored two-byte, doubling memory — [v8.dev/blog/json-stringify](https://v8.dev/blog/json-stringify)
- I found no dedicated 2025–2026 V8 blog post on new JSON.parse speedups — (search; see Gaps)
- JSON.parse of a string literal is about 1.7x faster than the equivalent JS object literal in V8 and faster in all major engines (2019, for objects of 10 kB or more, evaluated once) — [V8 cost of JavaScript 2019](https://v8.dev/blog/cost-of-javascript-2019); [GoogleChromeLabs/json-parse-benchmark](https://github.com/GoogleChromeLabs/json-parse-benchmark)

**JavaScriptCore**
- JSC's JSON.parse has a **JSONAtomStringCache** that reuses atomized short strings (keys and short values). The commit "[JSC] Accelerate JSONAtomStringCache" stores inline copies of characters in 256 slots of at most 64 bytes, with a max length of 27 chars (previously 32 chars and 512 entries), to cut cache misses. No numbers given — [WebKit commit 35a17ac](https://github.com/WebKit/WebKit/commit/35a17ac7fc544202144f2d0f1e93be9ee8402ad4)

**Response.json()**
- Response.json() is not off-main-thread in practice: it reads the body to a string and then runs JSON.parse synchronously.
- MeasureThat shows near-identical speed (10,919 vs 10,570 op/s; 161.6 vs 165.8 op/s).
- Parsing in a worker doesn't help if you need the whole object back, because postMessage re-serializes it — [yceffort 2026](https://yceffort.kr/en/2026/01/handling-large-json-responses); [MeasureThat](https://www.measurethat.net/Benchmarks/Show/32582/1/comparing-responsejson-and-jsonparseresponsetext); [HN 21007207](https://news.ycombinator.com/item?id=21007207); [raji README](https://npmjs.com/package/raji)
- No official Chromium or V8 source confirms the internals of Body.json(); the claims above are from secondary sources.

**DataView vs TypedArray**
- V8 v6.9 (2018, OLD but still the reference): DataView getters were inlined in TurboFan. They became about 16x faster than the original and **"almost the same as TypedArray" for aligned native-endian (little-endian) access**. Non-native endianness, offsets outside the Smi range, and throwing (OOB) paths remain slower or deoptimize — [v8.dev/blog/dataview](https://v8.dev/blog/dataview)

**structuredClone**
- For plain JSON-safe data, JSON.parse(JSON.stringify()) is generally faster than structuredClone:
  - desktop Chrome: about 2.3x (1,042,025 vs 444,876 op/s)
  - Firefox: about 1.3x
  - mobile Chrome: about 4.1x
  - Firefox sometimes favors structuredClone (a bigger-object test showed 1.6x for SC)
  - These are crowd-sourced MeasureThat numbers of modest quality — [MeasureThat 29524](https://www.measurethat.net/Benchmarks/Show/29524/0/jsonparsejsonstringify-vs-structuredclone); [MeasureThat 31723](https://benchmarklab.azurewebsites.net/Benchmarks/Show/31723/0/json-parse-vs-structuredclone-bigger-object); [web.dev structured-clone](https://web.dev/articles/structured-clone)

**Server-side wins (not browser)**
- LinkedIn Rest.li → Protobuf (2023, Java server-to-server):
  - "**up to** 60%" latency improvement, **for large payloads, at P99 under heavy load**
  - average per-host throughput +6.25% (responses) and +1.77% (requests)
  - no statistically significant regressions
  - Secondary blogs misreport this as a flat 60% — [LinkedIn Engineering](https://www.linkedin.com/blog/engineering/infrastructure/linkedin-integrates-protocol-buffers-with-rest-li-for-improved-m); [InfoQ](https://www.infoq.com/news/2023/07/linkedin-protocol-buffers-restli)
- Discord: the gateway offers JSON or ETF. The official docs say "JSON is generally recommended", and payload compression (as opposed to transport compression) is only available with JSON — [Discord Gateway docs](https://docs.discord.com/developers/events/gateway)
- In a third-party Node benchmark (raw TCP → event, including zlib), ETF generally scored below JSON per library (e.g., discord.js "guilds" 976 JSON vs 681 ETF), and a pure-JS ETF unpacker beat native erlpack — [discord-websocket-benchmark](https://github.com/timotejroiko/discord-websocket-benchmark)
- Figma uses its own schema-based **Kiwi** binary format for multiplayer and file snapshots. The web app knows the schema, so the schema isn't sent (a 2026 reverse-engineering project reports a zstd-compressed schema in the first WS frame). The multiplayer server was ported TS → Rust for performance. No public JSON-vs-Kiwi numbers — [Evan Wallace, madebyevan.com/figma](https://madebyevan.com/figma/); [figma-kiwi-protocol](https://github.com/allan-simon/figma-kiwi-protocol)

### Inferences
- Binary wins in browsers when:
  - fields are mostly numbers, bools or typed arrays (DataView/TypedArray reads are near-native),
  - there are 64-bit IDs (JSON loses precision above 2^53, per Faulkner),
  - the client touches a small fraction of a large payload (lazy access avoids allocating unused objects and strings),
  - or the decoder is schema-specialized/monomorphic.
- JSON wins when payloads are string-heavy and fully materialized, because UTF-8→JS string conversion dominates and JSON.parse does it in native code in one pass with one-byte string fast paths and key/atom caching. Generic schemaless JS decoders without records also lose.
- Your measurement (470 µs total, ~150 µs UTF-8 decode) fits this picture. Decode is about 1/3 of the cost, so lazily reading only the fields actually used is your main lever. Full materialization through getters would likely lose to JSON.parse, as Faulkner's FlatBuffers result suggests.
- Cost of getters/classes vs plain objects: no authoritative source found (see Gaps). The V8 hidden-class/monomorphism advice in the stringify post suggests same-shape objects are what make JSON.parse output cheap downstream.

### Gaps
- No recent rigorous Chrome/Firefox/Safari per-browser table for binary vs JSON. Faulkner gives graphs with no versions in the text.
- No official V8/SpiderMonkey/JSC post found on 2025–2026 JSON.parse-specific speedups, beyond the hidden-class key-compare note.
- No authoritative benchmark found on getter-based (class prototype accessor) objects vs plain object property access in modern V8/JSC/SM.
- No Discord engineering post with ETF vs JSON decode numbers; the official docs recommend JSON.

---

## Q3. Is "binary + string heap compresses worse than JSON under brotli" a known effect, and what mitigations exist? (Includes compression and zstd status.)

### Takeaway
Yes, this is well documented. After brotli or gzip, JSON is typically as small as or smaller than MessagePack/CBOR, and the format matters much less than the compressor. Both msgpackr and cbor-x state this in their READMEs. Mitigations that are actually used:
- string dedup tables (Packed CBOR, Ion symbol tables, Smile back-refs),
- shared structures and records (no repeated keys),
- shared or trained dictionaries (Discord zstd),
- streaming compression contexts.

zstd Content-Encoding is now Baseline in all major browsers (Safari since 26.3, Feb 2026), but CompressionStream still lacks brotli/zstd in Chrome as of mid-2026.

### Cited Findings

**Known effect**
- msgpackr README: MessagePack data compresses less well with gzip/brotli than compressed JSON — [msgpackr](https://github.com/kriszyp/msgpackr)
- cbor-x README: CBOR's character frequency "tends to defeat Huffman encoding", so compressed CBOR is often less compact than compressed JSON. Its `pack` (string dedup) option "generally does not yield as much compaction as standard compression tools" — [cbor-x](https://github.com/kriszyp/cbor-x)
- Lucid (2019, OLD):
  - Top compressed results in bytes: textual Ion+Brotli11 11,903,951; **JSON+Brotli11 11,999,727**; MessagePack+Brotli11 12,194,016; CBOR+Brotli11 12,861,137
  - CBOR+zstd3 15,923,174; Smile+zstd0 16,476,903
  - "Compression seems to level the playing field"; the final size depends almost entirely on the compressor
  - Lowest total cost: JSON+Brotli10 — [Lucid techblog](https://lucid.co/techblog/2019/12/06/json-compression-alternative-binary-formats-and-compression-methods)
- Uber (2016, OLD; Python, zlib/snappy/bzip2 only):
  - MessagePack+zlib was 78% of the JSON+zlib size (18,312,106 vs 23,560,699 bytes); a 20 KB trip shrank to 2,822 bytes
  - Protobuf+zlib was smallest, at about 8% of raw JSON — [Uber Engineering](https://eng.uber.com/trip-data-squeeze-json-encoding-compression/); [High Scalability summary](https://highscalability.com/to-compress-or-not-to-compress-that-was-ubers-question/)
  - This partially contradicts Lucid: under weaker compressors (zlib) binary still saves about 20%; under Brotli-11 the gap disappears or reverses.
- Faulkner (2025): compression "almost totally wipes out the size differences between different encodings" — [Faulkner](https://adamfaulkner.github.io/binary_formats_are_better_than_json_in_browsers.html)
- Old HN measurement: gzip sizes of JSON vs msgpack were nearly equal (4,291 vs 4,073 bytes) — [HN 4090831](https://news.ycombinator.com/item?id=4090831)

**Dictionaries and streaming (Discord, 2024-09-20)**
- Moving zlib → zstd with **streaming** cut MESSAGE_CREATE from ~250–270 bytes to ~166 bytes; the compression ratio rose from ~6 to almost 10.
- Non-streaming zstd was worse than zlib for small messages (>750 bytes).
- Trained dictionaries (120k messages): TYPING_START 636 → 466 (no dict) → 187 bytes (dict). READY ratio 6.63 vs 6.4.
- Dictionaries made MESSAGE_CREATE worse and were dropped as not worth the complexity.
- **Separate dictionaries were needed for JSON vs ETF** ("a JSON dictionary wouldn't perform as well on ETF").
- Combined with Passive Sessions v2, bandwidth fell ~40% — [Discord blog](https://discord.com/blog/how-discord-reduced-websocket-traffic-by-40-percent)

**zstd and CompressionStream in browsers**
- zstd Content-Encoding is Baseline Newly Available since 2026-02-11 (Widely Available expected 2028-08-11): Chrome/Edge 123 (Mar 2024), Firefox 126 (May 2024), **Safari / iOS 26.3 (2026-02-11)**. Browsers advertise it only over HTTPS. About 40% of page loads per Chrome Platform Status — [web-features explorer: zstd](https://web-platform-dx.github.io/web-features-explorer/features/zstd); [MDN BCD PR #22838](https://github.com/mdn/browser-compat-data/pull/22838)
- Compression Streams API:
  - gzip/deflate/deflate-raw have been Baseline since 2023. MDN now lists "brotli" and "zstd" formats.
  - **Chrome throws TypeError for `new CompressionStream("brotli")` as of June–July 2026** and BCD lists brotli/zstd as unsupported in Chrome.
  - Bun supports both (and is adding a level option) — [MDN CompressionStream()](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream/CompressionStream); [BCD issue #29824](https://github.com/mdn/browser-compat-data/issues/29824); [Bun PR #40100](https://github.com/oven-sh/bun/pull/40100)
- Dated secondary guide (2026): gzip saves 60–80% on JSON, brotli 70–85%, zstd 70–88%; msgpack is 30–50% smaller raw but only 10–20% smaller after gzip — [jsonic.io](https://jsonic.io/guides/json-compression). This is a low-authority aggregator and conflicts with Lucid's Brotli-11 result.

### Inferences
- Likely causes of your ~45% worse brotli ratio:
  1. Brotli's built-in static dictionary and context modeling are tuned for text/web content (JSON keys, punctuation). Interleaved binary lengths, offsets and varints add high-entropy bytes that break up LZ matches and hurt Huffman/context modeling. This matches cbor-x's "defeats Huffman" note.
  2. A string heap separates strings from their field context, while fixed-width offsets/pointers are nearly incompressible.
  3. JSON repeats keys, which a compressor removes almost for free, so binary's key elimination saves little after compression.
- Mitigations to evaluate, from the sources plus standard column-store practice:
  - Dedup strings into a table (Packed CBOR, Ion symbols, Smile back-refs).
  - Separate streams by column/type (all string bytes together, all ints together, delta-encode IDs and offsets). This is an inference from columnar formats; no JS-web source found.
  - Use varints rather than fixed u32 offsets where lazy access permits.
  - Order fields so similar strings are adjacent.
  - Use zstd with a trained dictionary per message type, and per-connection streaming contexts for WebSockets (Discord).
  - Accept that brotli-11 JSON is a strong baseline, and measure at the compression level your CDN actually uses (often brotli 4–6 dynamically, where the gap may differ).
- Lazy (FlatBuffers-style) layouts conflict with column separation and varints, since random access needs fixed offsets. That is a real design tension.

### Gaps
- No published measurement found specifically for FlatBuffers/Cap'n Proto vs JSON under brotli/zstd on web payloads.
- No data on how dynamic (low-level) brotli on CDNs changes the JSON-vs-binary ratio.
- No exact browser versions for CompressionStream brotli/zstd beyond Chrome being unsupported in mid-2026.

---

## Q4. Is there a well-known fast path for ASCII/Latin-1 string decoding from bytes in browsers, and is per-call TextDecoder overhead / slow non-ASCII decoding a known issue?

### Takeaway
Yes on all counts:
- TextDecoder has a large fixed per-call cost, so pure-JS `String.fromCharCode` decoding wins for short strings (under ~18–32 bytes in various tests), which is why msgpackr, protobuf.js and others do it.
- V8 has one-byte (Latin-1) vs two-byte string representations. ASCII input decodes much faster than non-ASCII (Cyrillic/Arabic/CJK becomes a two-byte string and takes a slow path).
- Node's TextDecoder is bottlenecked inside V8's UTF-8 decoder, with an open bug as of Oct 2026.

There is no standard "decode as Latin-1 into a one-byte string" API besides TextDecoder("latin1"), which is actually windows-1252 and is itself slow in Node.

### Cited Findings
- Node issue #61041 "TextDecoder is wrong and very slow" (opened 2025-12-13, still open, `confirmed-bug` 2026-07-31):
  - default UTF-8 TextDecoder is about 1.3x slower than optimized JS on 4 KiB ASCII and ~3x on 1 MiB
  - lemire on Node 24 (Apple M4): ~19.7 GiB/s Latin/ASCII vs 55.8 GiB/s on Bun; **Arabic/Chinese ~0.4 GiB/s on Node vs 2.5–5.7 on Bun**
  - profile: ~50% in V8's `Utf8DecoderBase` constructor, ~30% in `Decode` ("Node is bottlenecked by v8")
  - `fatal: true` costs ~15% more
  - `latin1`/`ascii` labels (= windows-1252) are 2–4x slower than JS on ASCII and 6–12x slower on Latin-1
  - fix PRs #61119 (ASCII fast path), #61549, #61559 are pending — [nodejs/node #61041](https://github.com/nodejs/node/issues/61041)
- Kris Zyp: for strings under 32 bytes, `String.fromCharCode` is faster ("much faster for very small strings") than native decoding, due to the JS↔C++ crossing cost — [Kris Zyp](https://kriszyp.medium.com/building-the-fastest-js-de-serializer-a413a2b4fb72) (search snippet)
- A Medium benchmark found strings under ~18 characters benefit from a custom JS decoder — [petermakeswebsites, Medium](https://petermakeswebsites.medium.com/performance-of-low-level-string-decoding-in-javascript-6f9a422bfced) (search snippet)
- protobuf-ts #184 (Firefox 95, Safari 15, Chrome 96; OLD): TextDecoder was "an order of magnitude worse" for short strings, and the commenter estimated most protobuf strings are under 256 chars — [protobuf-ts #184](https://www.github.com/timostamm/protobuf-ts/issues/184)
- wasm-bindgen #1776 (OLD): a manual ASCII bypass gave +45% in Firefox and +80% in Chrome. A Firefox developer called needing it a perf bug, mostly relevant for tiny strings where `charCodeAt` inlines — [wasm-bindgen #1776](https://github.com/rustwasm/wasm-bindgen/issues/1776)
- V8 stores ASCII/Latin-1 strings as one-byte and anything with a non-Latin-1 char as two-byte (2x memory). V8's JSON serializer is templated on both — [v8.dev/blog/json-stringify](https://v8.dev/blog/json-stringify)
- JSC JSON.parse caches short atom strings (≤27 chars) with inline character copies — [WebKit commit](https://github.com/WebKit/WebKit/commit/35a17ac7fc544202144f2d0f1e93be9ee8402ad4)
- msgpackr/cbor-x `bundleStrings`: concatenate all strings and decode once in the browser (claimed 30–50% gain), amortizing per-call overhead — [msgpackr](https://github.com/kriszyp/msgpackr); [cbor-x](https://github.com/kriszyp/cbor-x)
- Key caching by raw bytes: @msgpack/msgpack CachedKeyDecoder, ~1.5x — [PR #54](https://github.com/msgpack/msgpack-javascript/pull/54)
- MeasureThat ASCII-decoding results conflict:
  - one test: JS 13.7M op/s vs TextDecoder 4.9M
  - another: TextDecoder 9.1M vs fromCharCode 5.5M
  - browser unspecified — [MeasureThat 15951](https://www.measurethat.net/Benchmarks/Show/15951/0/decoding-ascii-textdecoder-vs-js-2); [MeasureThat 10468](https://www.measurethat.net/Benchmarks/Show/10468/0/textdecoder-ascii-vs-stringfromcharcode)

### Inferences
- Your observations are confirmed:
  - 50–70 ns per TextDecoder call: consistent with the fixed-cost findings (constructor/setup-dominated in V8).
  - Cyrillic much slower: consistent with the ~50x Latin vs Arabic/Chinese throughput gap in Node/V8 and the two-byte string path.
  - ~1/3 of JSON time in UTF-8 decode: consistent with the V8 UTF-8 decoder being a known bottleneck.
- Practical recipe used in the ecosystem:
  - Per string, branch on length and an encoder-provided "is ASCII" flag. Short ASCII goes through `String.fromCharCode.apply` or a loop; long strings, or strings with non-ASCII, go through one TextDecoder call.
  - Better still, decode a whole string heap once and slice JS substrings (bundleStrings-style).
  - Cache repeated short strings (keys, enums) by bytes.
  - An "all ASCII" bit set by the encoder lets the decoder skip validation.
- For Cyrillic payloads, the target JS strings are two-byte anyway. A JS loop must build UTF-16 from UTF-8, which TextDecoder should do better for long strings. The crossover length likely differs from ASCII and should be measured per browser.

### Gaps
- No official V8/SpiderMonkey/JSC documentation found describing TextDecoder ASCII fast paths or per-call overhead in current browsers. Evidence is from Node issues and older cross-browser tests (2019–2021).
- No current numbers for Safari or Firefox TextDecoder on short Cyrillic strings.
