---
title: Performance
description: Measured speed and size against JSON, in Node and three browsers, including where JSON wins.
---

# Performance

All numbers come from the benchmarks in the repository: headless Chromium 156, Firefox 157 and
WebKit 27.2 on an Apple M3 Pro, and Node 22. The baseline is `JSON.parse` over the same bytes,
decoded with `TextDecoder`, which is what `response.json()` does. Run-to-run noise reaches 20–40% on
some rows. Synthetic data.

## Reading

Generated codecs, speed relative to JSON
([generated.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/generated.md)).
Users have 7 fields: three numbers, a boolean and three strings, 30% of names in Cyrillic.
Products have a 12–52 word description. Points are a `Float64Array` time and three `Float32Array`
columns, against JSON's best shape for them, an object of four number arrays.

| Reading | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 1000 users, every field | 5.6× | 2.3× | 3.4× | 3.3× |
| 1000 users, every field, `verify: false` | 8.0× | 2.9× | 4.1× | 4.1× |
| 1000 users, 2 of 7 fields | 8.8× | 4.1× | 6.0× | 4.7× |
| 1000 users, numeric fields only | 11× | 5.5× | 11× | 6.1× |
| 1000 users, `decode: 'eager'`, `verify: false` | 7.0× | 3.0× | 3.6× | 4.0× |
| 100k points, every value | 137× | 18× | 118× | 22× |
| 10 users, every field | 2.8× | 1.3× | 1.4× | 1.3× |
| 500 products with long text | 1.7× | 0.91× | 2.0× | 1.5× |
| 1 user | 1.5× | 0.94× | 0.66× | 0.83× |

The client verifies every response by default, so rows without a note include verification.
`verify: false` skips it for a server you trust completely; see [Views](./views.md#verification).
`decode: 'eager'` reads every field into plain objects, so it costs the same whichever fields you
use later; see [plain objects](./views.md#plain-objects).

Views read only what you touch, and arrays of objects are stored column by column. That is why the
gap grows when you read fewer fields. Typed-array columns need no parsing at all: the time in the
points row is the loop that sums them.

## Writing

| Encoding | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 1000 users | 2.3× | 1.9× | 1.7× | 1.9× |
| 500 products with long text | 1.5× | 0.88× | 1.1× | 0.31× |
| 100k points | 476× | 84× | 150× | 125× |

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

- **One small object.** Verifying a message and setting up a view cost more than parsing 150 bytes
  of JSON: 0.4–0.7 µs against 0.4–0.6 µs. Either way it is under a microsecond.
- **Long text with verification.** Verification more than doubles the read time of text-heavy
  rows: in Chromium 51 µs without it and 117 µs with it, against 107 µs for JSON.
- **Encoding text in WebKit.** JavaScriptCore's `JSON.stringify` is about 3× faster than the
  generated encoder on the products payload.
- **Small responses are 9–13% larger** after compression. JSON's repeated keys compress well, and
  a binary message carries its layout.
- **Numeric series are no smaller than JSON number arrays** after compression. Numbers rounded to
  a few decimals compress well as text, while float32 mantissas look like noise to a compressor.
  Against an array of objects the binary series is 20–27% smaller.
- **Decompression time is not measured.** Binary messages are often smaller, so there is less to
  decompress, but this has not been checked.

## Bundle size

Client bundles, minified and gzipped with esbuild
([size.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/size.md)):

| | Client, min + gz |
|---|---|
| Runtime and client, no procedures | 3.9 KB |
| Dashboard example (3 procedures) | 9.1 KB |
| Test fixture with every supported type | 11.1 KB |

The client gets only input encoders and output decoders. CI fails if the runtime grows past 5 KB or
the fixture past 12 KB.

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
```
