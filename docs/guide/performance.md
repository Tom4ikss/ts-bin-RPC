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

1000 users with 8 fields each (numbers, strings, a `Date`, an enum, a string array, nullable bytes),
generated codecs, speed relative to JSON
([generated.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/generated.md)):

| Reading | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| every field | 8.1× | 3.2× | 4.2× | 4.1× |
| every field, with verification | 5.7× | 2.5× | 3.5× | 3.4× |
| 2 of 8 fields | 16.7× | 6.4× | 9.0× | 6.0× |
| numeric fields only | 37× | 19× | 35× | 35× |
| `decode` into plain objects | 7.4× | 2.9× | 3.8× | 4.0× |
| 10 users, every field | 4.0× | 1.7× | 1.8× | 1.6× |

The client verifies every response by default, so the second row is what an app sees.
`verify: false` gives the first row, for a server you trust completely; see [Views](./views.md#verification).

Views read only what you touch, and arrays of objects are stored column by column. That is why the
gap grows when you read fewer fields.

Typed-array columns don't need parsing at all. A series of 100k points reads 145–300× faster than
the same numbers in a JSON array, because there is nothing to parse
([core.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/core.md)).

## Writing

Encoding 1000 users is 1.7–2.4× faster than `JSON.stringify`, across all four runtimes.

## Size

Size after compression, relative to JSON compressed the same way
([compression.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/compression.md)):

| Payload | gzip-6 | brotli-4 | brotli-6 | zstd-3 |
|---|---|---|---|---|
| 1000 users | −8% | −17% | −20% | −7% |
| 500 products with long text | +5% | −5% | −4% | +2% |
| 20 users | +5% | +8% | +4% | +6% |
| 100k points | −21% | −24% | −24% | −27% |

Without compression the binary format is 1.5–2.6× smaller in the dashboard example, against JSON with values rounded to two decimals.

## Where JSON wins

> [!NOTE]
> The format is built for many objects, numbers and partial reads. It does not try to beat JSON on
> small text-heavy payloads at any cost.

- **Small, text-heavy responses are a few percent larger** after compression: 20 users, or a
  product page with long descriptions. Strings are stored much like in JSON, and JSON's
  repetitive keys compress well.
- **Tiny messages gain little.** 10 users read 1.6–1.8× faster in browsers, which is a few
  microseconds in absolute terms.
- **Decompression time is not measured.** Binary messages are often smaller, so there is less to
  decompress, but this has not been checked.

## Bundle size

Client bundles, minified and gzipped with esbuild
([size.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/size.md)):

| | Client, min + gz |
|---|---|
| Runtime and client, no procedures | 3.8 KB |
| Dashboard example (3 procedures) | 9.1 KB |
| Test fixture with every supported type | 11.0 KB |

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
node bench/run.mjs core --runtimes=node,chromium
node bench/size.mjs
```
