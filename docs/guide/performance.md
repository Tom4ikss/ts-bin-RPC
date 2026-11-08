---
title: Performance
description: Measured speed and size against JSON, in Node and three browsers, including where JSON wins.
---

# Performance

All numbers come from the benchmarks in the repository: headless Chromium 156, Firefox 157 and
WebKit 27.2 on an Apple M3 Pro, and Node 22. The baseline is `JSON.parse` over the same bytes,
decoded with `TextDecoder`, which is what `response.json()` does. Run-to-run noise reaches 20–40% on
some rows. Synthetic data. [Benchmarks](./benchmarks.md) has every table, measured on a Linux server.

## Reading

Generated codecs, speed relative to JSON
([generated.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/generated.md)).
Users have 7 fields: three numbers, a boolean and three strings, 30% of names in Cyrillic.
Products have a 12–52 word description. Points are a `Float64Array` time and three `Float32Array`
columns, against JSON's best shape for them, an object of four number arrays.

| Reading | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 1000 users, every field | 7.1× | 2.6× | 3.7× | 3.7× |
| 1000 users, every field, no verification | 8.1× | 2.9× | 4.1× | 4.2× |
| 1000 users, 2 of 7 fields | 13× | 4.9× | 7.0× | 5.3× |
| 1000 users, numeric fields only | 18× | 7.3× | 14× | 7.2× |
| 1000 users, `decode: 'eager'`, no verification | 7.3× | 3.0× | 3.6× | 4.0× |
| 100k points, every value | 136× | 18× | 97× | 21× |
| 10 users, every field | 3.3× | 1.4× | 1.5× | 1.4× |
| 500 products with long text | 4.0× | 1.6× | 2.7× | 2.1× |
| 1 user | 1.6× | 0.94× | 0.74× | 0.92× |

Rows without a note include verification. The client verifies responses by default in
development and skips verification in production builds, where reads get the faster numbers; see
[Views](./views.md#verification).
`decode: 'eager'` reads every field into plain objects, so it costs the same whichever fields you
use later; see [plain objects](./views.md#plain-objects).

Views read only what you touch, and arrays of objects are stored column by column. That is why the
gap grows when you read fewer fields. Typed-array columns need no parsing at all: the time in the
points row is the loop that sums them. Measured alone, that loop takes 74–159 µs in every engine,
the same as over a plain object; next to the JSON case, which allocates about 13 MB per call, V8
and JavaScriptCore run it 3–6× slower, and the table keeps that number.

## Writing

| Encoding | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 1000 users | 2.4× | 1.9× | 1.7× | 2.3× |
| 500 products with long text | 1.4× | 0.93× | 1.1× | 0.62× |
| 100k points | 496× | 90× | 179× | 146× |

## Size

Size relative to JSON compressed the same way
([generated-size.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/generated-size.md)):

| Payload | raw | gzip-6 | brotli-4 | brotli-6 | zstd-3 |
|---|---|---|---|---|---|
| 1000 users | −52% | −8% | −18% | −19% | −6% |
| 500 products with long text | −18% | 0% | −9% | −9% | −3% |
| 20 users | −37% | +10% | +13% | +10% | +9% |
| 100k points, JSON as number arrays | −51% | −1% | +9% | +12% | +2% |
| 100k points, JSON as an array of objects | −66% | −21% | −24% | −24% | −27% |

Without compression the binary format is 1.5–2.6× smaller in the dashboard example, against JSON with values rounded to two decimals.

## Where JSON wins

> [!NOTE]
> The format is built for many objects, numbers and partial reads. It does not try to beat JSON on
> small text-heavy payloads at any cost.

- **One small object in browsers.** Verifying a message and setting up a view cost more than
  parsing 150 bytes of JSON: 0.43–0.62 µs against 0.40–0.47 µs. Either way it is under a
  microsecond.
- **Encoding text in Chromium and WebKit.** On the products payload the generated encoder is 7%
  slower than `JSON.stringify` in Chromium and 1.6× slower in WebKit, whose `JSON.stringify` is
  2.5× faster than Chromium's here.
- **Small responses are 9–13% larger** after compression. JSON's repeated keys compress well, and
  a binary message carries its layout.
- **Numeric series are no smaller than JSON number arrays** after compression. Numbers rounded to
  a few decimals compress well as text, while float32 mantissas look like noise to a compressor.
  Against an array of objects the binary series is 20–27% smaller.
- **Decompression time is not measured.** Binary messages are often smaller, so there is less to
  decompress, but this has not been checked.

## Against other binary formats

The [`libs` suite](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/libs.md) puts
ts-bin-rpc next to Apache Arrow JS and Flechette for tables and series, and Colyseus schema for game
state, on one Linux server in Node, Chromium, Firefox and WebKit:

- **1000 users, every field read:** 3–5× faster than JSON; Arrow and Flechette are slower than JSON
  here (0.35–0.86×), since they decode every string of a column.
- **Numbers of 1000 users:** 1.3–3× faster to decode than Arrow and Flechette. **100k-point
  series:** 1.7× in Node and Chromium, 1.0–1.2× in Firefox and WebKit, with the same bytes.
- **Full state of 100 and 1000 entities:** 11–17× faster than Colyseus, and a quarter to a third
  smaller.
- **Small patches** (5 of 100 entities move): 1.4–2× faster than Colyseus, but 180 bytes against its
  75, since every message carries a header, a row table and a column catalog. Larger patches (50 of
  1000) are 6–7× faster, 824 bytes against 750, and the same after gzip.

## Bundle size

Client bundles, minified and gzipped with esbuild
([size.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/size.md)):

| | Client, min + gz |
|---|---|
| Runtime and client, no procedures | 5.3 KB |
| Dashboard example (3 procedures and a stream) | 13.3 KB |
| Test fixture with every supported type | 13.3 KB |

The client gets only input encoders and output decoders, and the stream client only when the router
has streams. CI fails if the runtime grows past 5.5 KB or the fixture past 13.5 KB.

## What made it fast

- **Two string blocks per message**, one ASCII and one UTF-16, each decoded with a single
  `TextDecoder` call, so fields are `substring`s. Calling `TextDecoder` once per field costs about
  100 ns in browsers and made full reads slower than JSON.
- **Arrays of objects stored column by column**, with string columns holding lengths and
  back-references instead of offsets. Per-row offsets look like noise to compressors: row-based
  layouts were 48–61% larger than JSON after compression.
- **Code generated for each type** instead of a schema interpreter, and no `eval`.

## Running the benchmarks

```sh
pnpm --filter @tbr/bench gen && node bench/run.mjs generated   # Node, Chromium, Firefox, WebKit
node bench/node/generated-size.mjs                             # sizes; needs the zstd CLI
node bench/size.mjs
node bench/gen/libs.mjs && node bench/run.mjs libs             # against Arrow, Flechette, Colyseus
```
