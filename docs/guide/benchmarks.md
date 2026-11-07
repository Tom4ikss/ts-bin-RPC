---
title: Benchmarks
description: "Every benchmark table, measured on one Linux server: ts-bin-rpc against JSON, Arrow JS, Flechette and Colyseus, streams over HTTP and WebSocket, middleware, queries and sizes."
---

# Benchmarks

The full tables behind [Performance](./performance.md), which explains what they mean for an app.
Speed was measured on a rented Linux server with an Intel Xeon (Icelake): Node 26.13, and headless
Chromium 156, Firefox 157 and WebKit 27.2 through Playwright, each run in a fresh process or browser.
Every table names its date and the commit it measured.

How to read the speed tables: a group compares variants that do the same work; the ratio is speed
relative to the first variant of the group, JSON unless the group says otherwise, so higher is
better. `~` marks a row whose ratio ranged over 25% between runs. On the site, within each group
green marks the best value of a column, light green the second and red the worst, for times and
bytes alike; a column whose values differ by less than 5% is left plain. Data is synthetic, from
[bench/lib/data.mjs](../../bench/lib/data.mjs), with 30% of names in Cyrillic.

The bench workflow also runs the JSON suite on GitHub Actions for every release and publishes it to
[bench/results/ci](../../bench/results/ci/generated.md); shared runners move absolute times by tens
of percent, so this page uses the server.

## Against JSON

Generated codecs against `JSON.parse` over the same bytes decoded with `TextDecoder`, which is what
`response.json()` does, and against `JSON.stringify` for encoding. Source:
[server/generated.md](../../bench/results/server/generated.md).

<!-- include ../../bench/results/server/generated.md -->

## Against Arrow JS, Flechette and Colyseus

Tables and series against Apache Arrow JS and Flechette, game state and its patches against
Colyseus schema. Source: [libs.md](../../bench/results/libs.md).

<!-- include ../../bench/results/libs.md -->

## Streams over a real transport

A Node server streams ticks to a Chromium page over HTTP and over a WebSocket, against NDJSON, SSE
and JSON over a WebSocket. Source:
[server/stream-transport.md](../../bench/results/server/stream-transport.md).

On 0.6.0 the row of ts-bin-rpc over a WebSocket with `window: 0` is unstable: page main thread from
118 to 268 ms at 1 000 ticks/s over four runs, against 111–119 ms on 0.5.1. The cause is not found
yet; the default window of 16 ms is the same on both.

<!-- include ../../bench/results/server/stream-transport.md -->

## Middleware

Source: [server/middleware.md](../../bench/results/server/middleware.md).

<!-- include ../../bench/results/server/middleware.md -->

## Queries

Source: [server/query.md](../../bench/results/server/query.md).

<!-- include ../../bench/results/server/query.md -->

## Size after compression

Sizes do not depend on the machine. Source:
[generated-size.md](../../bench/results/generated-size.md).

<!-- include ../../bench/results/generated-size.md -->

## Bundle size

Source: [size.md](../../bench/results/size.md).

<!-- include ../../bench/results/size.md -->

## Running them yourself

```sh
pnpm --filter @tbr/bench gen && node bench/run.mjs generated   # Node, Chromium, Firefox, WebKit
node bench/gen/libs.mjs && node bench/run.mjs libs             # against Arrow, Flechette, Colyseus
node --experimental-strip-types --no-warnings bench/transport.mjs
node --experimental-strip-types --no-warnings bench/middleware.mjs
node --experimental-strip-types --no-warnings bench/query.mjs
node bench/node/generated-size.mjs                             # sizes; needs the zstd CLI
node bench/size.mjs
```

`--repeat=n` sets the runs per runtime, `--runtimes=node,chromium` picks runtimes, and `--out=dir`
writes the results elsewhere. `node bench/compare.mjs old.json new.json` compares two runs of a
suite.
