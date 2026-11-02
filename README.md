# ts-bin-rpc

Work in progress: a code-first TypeScript RPC with a binary wire format, lazy client-side views,
zero-copy `TypedArray` columns and tRPC-like DX. Nothing is published yet; this repository currently
holds the research, the design and the benchmarks that fixed the wire format.

Project documents (in Russian):
[design](docs/DESIGN.md), [wire format v0](docs/FORMAT.md), [roadmap to alpha](docs/ROADMAP.md),
[landscape research](reports/Обзор%20TS%20RPC%20и%20бинарных%20форматов.md).

## Layout

| Path | What |
|---|---|
| `bench/lib/` | hand-written codecs standing in for generated code (`codec3.mjs` is the chosen layout), test data, harness |
| `bench/suites/` | portable suites that run in Node and in Chromium, Firefox and WebKit |
| `bench/node/` | Node-only experiments: compression, realtime frame sizes, the original exploratory benches |
| `bench/results/` | latest full runs |
| `spikes/ts71/` | checks that the TypeScript 7.1 API exposes what the codegen needs |
| `packages/` | the library, from phase 1 on |

## Running

Node 22+, pnpm.

```sh
pnpm install
pnpm --filter @tbr/bench exec playwright install chromium firefox webkit
node bench/run.mjs layout            # suites: core, layout, strings, realtime; add --quick for a smoke run
node bench/run.mjs strings --runtimes=node,chromium
node bench/node/compression.mjs      # needs the zstd CLI for the zstd column
node bench/node/realtime-size.mjs
pnpm spike:ts71
```

## Results (phase 0)

1000 users (`id`, `score`, `age`, `isActive`, `name`, `email`, `city`; 30% Cyrillic names), chosen
layout against `JSON.parse(TextDecoder.decode(bytes))`, speedup per runtime
([layout.md](bench/results/layout.md)):

| Scenario | Node 22 | Chromium 156 | Firefox 157 | WebKit 27.2 |
|---|---|---|---|---|
| Read all fields | 5.1x | 2.35x | 2.9x | 3.1x |
| Read 2 of 7 fields | 9.4x | 4.2x | 8.2x | 5.1x |
| Encode | 1.8x | 2.1x | 1.5x | 2.1x |

Numeric data as `TypedArray` columns: 100k points read 145–300x and encode 45–96x faster than JSON
([core.md](bench/results/core.md)). Realtime frames of 10–100 entities encode and decode 5–72x faster
([realtime.md](bench/results/realtime.md)).

Size after compression, relative to JSON with the same compressor
([compression.md](bench/results/compression.md)):

| Payload | gzip-6 | brotli-4 | brotli-6 | brotli-11 | zstd-3 |
|---|---|---|---|---|---|
| 1000 users | −8% | −17% | −20% | −10% | −7% |
| 500 products, long text | +5% | −5% | −4% | +1% | +2% |
| 20 users | +5% | +8% | +4% | +8% | +6% |
| 100k points | −21% | −24% | −24% | −21% | −27% |

## What made the difference

- **Strings in two blocks per message** (ASCII and UTF-16LE), each decoded with one `TextDecoder`
  call, fields as `substring`. Per-field `TextDecoder` calls cost ~100 ns each in browsers and made
  full reads slower than JSON in Chromium ([strings.md](bench/results/strings.md)).
- **Vectors of objects stored column by column**, string columns holding lengths and back-references
  instead of offsets. Per-row offsets were noise to compressors: row tables were 48–61% larger than
  JSON after compression.
- **Memoized strings and views**: repeated reads and sorting stay ahead of JSON.

## Caveats

- Headless browsers on one machine (Apple M3 Pro); run-to-run noise reaches 20–40% on some rows,
  marked `~` in result tables.
- Synthetic data. Decompression time is not measured.
- No comparison yet against Apache Arrow JS, Colyseus or TSRPC.
