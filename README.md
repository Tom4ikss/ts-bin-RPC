# zerocopy-bench

Feasibility benchmarks for a code-first TypeScript RPC with a binary, FlatBuffers-style
wire format and lazy (zero-copy) reads, compared against `JSON.parse`.

Project documents (in Russian):
[design](docs/DESIGN.md), [roadmap to alpha](docs/ROADMAP.md),
[landscape research](reports/Обзор%20TS%20RPC%20и%20бинарных%20форматов.md).
`spikes/ts71` checks that the TypeScript 7.1 API exposes what the codegen needs.

`codec.mjs` is a hand-written stand-in for what the code generator would emit:
fixed-size structs, a UTF-8 string heap at the tail, getter-based views over a
`DataView`, strings memoized on first read, and a struct-of-arrays layout for
numeric data that maps columns straight onto `TypedArray`s.

## Running

Node 22+, no dependencies.

```sh
node bench.mjs     # main comparison: read and encode, plus wire sizes
node memo.mjs      # repeated string reads and sorting: no cache vs. per-view vs. per-message cache
node extra.mjs     # verifier cost and where the time in JSON.parse(decode(bytes)) goes
node strings.mjs   # per-access cost of materializing a string out of the buffer
node --expose-gc strings.mjs  # also reports buffer retention by a single view
node utf16.mjs     # UTF-16 on the wire vs. UTF-8
```

## Results so far

Node v22.13.1, Apple M3 Pro. Median of 15 samples, µs per operation.

| Scenario | JSON | Binary | Speedup |
|---|---|---|---|
| 10 users, all fields | 4.6 | 3.1 (lazy) | 1.5x |
| 1000 users, 2 of 7 fields | 456 | 98 (lazy) | 4.6x |
| 1000 users, all fields | 469 | 307 (lazy) | 1.5x |
| 1000 users, read name ×5 | 408 | 111 (lazy + memo) | 3.7x |
| 1000 users, sort by name | 575 | 327 (lazy + memo) | 1.8x |
| 100k points, sum + max | 22 620 | 71 (SoA `TypedArray`) | ~320x |
| Encode 1000 users | 361 | 186 | 1.9x |
| Encode 100k points | 31 561 | 253 | ~125x |

Wire size after brotli:

| Payload | JSON | Binary |
|---|---|---|
| 1000 users | 14.6 KB | 21.4 KB |
| 100k points | 1.37 MB | 1.09 MB |

## Takeaways

- Numeric and columnar data is where the format pays off: two orders of magnitude
  on both decode and encode.
- Partial reads of large payloads win 2.5–5x. Bounds and UTF-8 verification,
  which is mandatory for untrusted input, roughly halves that.
- Strings cannot be zero-copy in JS: every read allocates. Memoizing on first read
  keeps lazy views at or ahead of JSON. Without it, repeated reads are several
  times slower.
- For string-heavy payloads the binary format is larger on the wire after
  compression, because struct offsets compress poorly.

## Not yet measured

- Browsers (Chrome, Safari). `TextDecoder` and `response.json()` behave
  differently there.
- Decompression time.
- Schema evolution with stable field IDs.
- Comparison against Apache Arrow JS and TSRPC.

Run-to-run noise is noticeable, up to 20–40% on some rows. Repeat runs before
drawing fine-grained conclusions.
