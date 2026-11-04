# ts-bin-rpc

A code-first TypeScript RPC with a binary wire format. Your router's TypeScript types are the
schema: `tbr` reads them, keeps a lockfile of field ids and generates codecs. The client gets lazy
views over the response bytes, and numeric arrays arrive as `TypedArray` columns with no parsing.

**Docs:** https://tom4ikss.github.io/ts-bin-RPC/ (sources in [docs/guide](docs/guide/index.md)).

**Status:** alpha. The wire format may change before 1.0, see the [changelog](CHANGELOG.md) and
the [security notes](SECURITY.md).

```sh
npm install ts-bin-rpc@alpha
npm install -D typescript@7.1.0-beta   # for the tbr code generator
```

```ts
// server: a router is a plain object of async functions
export const appRouter = {
  user: {
    get: async (input: { id: u32 }): Promise<User> => db.user(input.id),
  },
  metrics: async (): Promise<{ t: Float64Array; cpu: Float32Array }> => sample(),
};
Bun.serve({ fetch: createHandler(appRouter, { procedures: serverProcedures, prefix: '/rpc' }) });

// client: types come from the router, codecs from `tbr generate`
const api = createClient<typeof appRouter>({ url: '/rpc', procedures: clientProcedures });
const user = await api.user.get({ id: 1 }); // a view: fields are read from the bytes on access
const { t, cpu } = await api.metrics();     // Float64Array and Float32Array over the response
```

Procedures can also stream rows: return `stream<T>(…)` and subscribe on the client. Rows arrive
in batches over one HTTP response, with typed-array columns per batch
([guide](docs/guide/streams.md)).

```ts
ticks: async (input: { symbol: string }) => stream<Tick>((emit) => feed.on(input.symbol, emit)),

const sub = api.ticks.subscribe({ symbol: 'BTC' }, { batch: (b) => chart.append(b.columns.price!) });
```

A whole app: [`examples/dashboard`](examples/dashboard), a Node server and a Vite + React client
drawing response columns with uPlot, with a live chart over a stream.

## Benchmarks

Generated codecs against `JSON.parse(new TextDecoder().decode(bytes))` and
`TextEncoder.encode(JSON.stringify(value))`, speed relative to JSON (higher is better). The read rows
include verification, which the client does by default in development and skips in production
builds, so they are the slower case. The tables are written by the
[bench workflow](.github/workflows/bench.yml) on a GitHub runner: each runtime runs the suite 10
times in a fresh process or browser, and a row is the median ratio. Runner CPUs vary between runs,
which moves some rows by 10–25%, and a few rows in Firefox change by up to 2× from one browser
launch to the next.

<!-- bench:start -->
GitHub Actions `ubuntu-latest` (AMD EPYC 7763 64-Core Processor), Chromium 156, Firefox 157, WebKit 27.2, Node 22.23 through Playwright, 2026-11-04, commit [`772fde7`](https://github.com/Tom4ikss/ts-bin-RPC/commit/772fde741ffcb7c3eeeaf2dcaa9c23135815a393).
Full tables, with times: [generated.md](bench/results/ci/generated.md).

| Reading | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 1000 users, every field | 7.0× | 4.4× | 1.9× | 4.0× |
| 1000 users, 2 of 7 fields | 14× | 8.8× | 5.4× | 6.0× |
| 1000 users, numeric fields only | 26× | 15× | 15× | 7.4× |
| 100k points, every value | 152× | 20× | 128× | 20× |
| 10 users, every field | 2.1× | 1.1× | **0.75×** | 1.1× |
| 500 products with long text | 3.4× | 1.7× | 1.1× | 2.8× |
| 1 user | 1.3× | **0.94×** | **0.68×** | **0.67×** |

| Encoding | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 1000 users | 2.4× | 3.0× | 1.5× | 1.8× |
| 500 products with long text | 1.9× | 1.0× | 1.1× | 1.1× |
| 100k points | 134× | 39× | 40× | 26× |
<!-- bench:end -->

Users have 7 fields: three numbers, a boolean and three strings, 30% of names in Cyrillic. Products
have a 12–52 word description. Points are four columns, a `Float64Array` time and three
`Float32Array` values; JSON gets its best shape for them, an object of four number arrays.

In Chromium and WebKit the 100k points row is lower than in Node and Firefox for a reason outside
the codec: measured alone on an Apple M3 Pro, summing the points through a view takes 74–159 µs in
every engine, the same as over a plain object. Next to the JSON case, which allocates about 13 MB
per call, V8 and JavaScriptCore run the same loop 3–6× slower; the table keeps that slower number.

### Where JSON wins

From the CI run of 2026-11-04 at `47adeba` unless said otherwise; the tables above may be newer.

- **One small object in browsers.** Verifying a message and setting up a view cost more than
  parsing 150 bytes of JSON: 0.90–1.63 µs against 0.84–1.12 µs. Either way it is under two
  microseconds.
- **Small responses in Firefox on Linux.** 10 users take 9.4 µs with verification against 6.3 µs
  for JSON, and 6.7 µs without. On an Apple M3 Pro the same row is 1.5× faster than JSON.
- **Encoding text in WebKit and Chromium on macOS.** On an Apple M3 Pro the products payload
  encodes 7% slower than `JSON.stringify` in Chromium and 1.6× slower in WebKit. On the Linux
  runner both are on par with JSON.
- **Size of small and numeric responses after compression**, see below.

### Size

Bytes against JSON compressed the same way
([generated-size.md](bench/results/generated-size.md)):

| Payload | raw | gzip-6 | brotli-4 | brotli-6 | zstd-3 |
|---|---|---|---|---|---|
| 1000 users | −52% | −8% | −18% | −19% | −6% |
| 500 products with long text | −18% | 0% | −9% | −9% | −3% |
| 20 users | −37% | +10% | +13% | +10% | +9% |
| 100k points, JSON as number arrays | −51% | −1% | +9% | +12% | +2% |
| 100k points, JSON as an array of objects | −66% | −21% | −24% | −24% | −27% |

Small responses are 9–13% larger after compression: JSON's repeated keys compress well, and a
binary message carries its layout. Numbers in the test data are rounded to 1–3 decimals, which
compress well as text, while float32 mantissas look like noise to a compressor.

### Bundle

The client runtime is 4.2 KB min + gzip. The stream client adds 1.4 KB, only when the router has
stream procedures. The client bundle of the dashboard example, codecs, runtime and the stream
client, is 11.4 KB ([size.md](bench/results/size.md)). CI fails if the runtime grows past 5 KB.

### Caveats

- One machine. Run-to-run noise reaches 20–40% on some rows, marked `~` in the result tables.
- Synthetic data, codecs only: no network, `fetch` or `arrayBuffer()` time, and decompression is
  not measured.
- No comparison yet against protobuf-es, msgpackr, Apache Arrow JS or Colyseus.

## How the format was chosen

Phase 0 measured layout variants before any code generation
([layout.md](bench/results/layout.md), [strings.md](bench/results/strings.md),
[compression.md](bench/results/compression.md)):

- **Strings in two blocks per message** (ASCII and UTF-16LE), each decoded with one `TextDecoder`
  call, fields as `substring`. Per-field `TextDecoder` calls cost ~100 ns each in browsers and made
  full reads slower than JSON in Chromium.
- **Vectors of objects stored column by column**, string columns holding lengths and back-references
  instead of offsets. Per-row offsets were noise to compressors: row tables were 48–61% larger than
  JSON after compression.
- **Memoized strings and views**: repeated reads and sorting stay ahead of JSON.

Design notes, the wire format and the roadmap are in Russian: [design](docs/DESIGN.md),
[wire format v0](docs/FORMAT.md), [roadmap](docs/ROADMAP.md),
[landscape research](reports/Обзор%20TS%20RPC%20и%20бинарных%20форматов.md),
[string and verification optimizations](reports/Оптимизации%20строк%20и%20верификации.md).

## Repository

| Path | What |
|---|---|
| `packages/ts-bin-rpc/` | numeric brands (`u8` … `i64`), `RpcError`, `toPlain`; `/server` (`createHandler`, Fetch API), `/client` (`createClient`), `/node` (adapter for `node:http`), `/runtime` (codec runtime for generated code) |
| `packages/cli/` | `tbr`: reads the router's types through TypeScript 7.1, builds the schema IR, maintains `tbr.lock.json`, emits codecs |
| `e2e/` | fixture app tested in process, over HTTP under Node, Bun and Deno, and from Chromium |
| `examples/dashboard/` | Node server and a Vite + React client: a metrics dashboard drawing response columns with uPlot |
| `playground/` | a router to play with: `pnpm watch` regenerates on save, `pnpm demo` encodes and reads a message |
| `docs/guide/` | user guide; `site/` builds it into the docs website (Astro Starlight) |
| `bench/` | suites that run in Node and in Chromium, Firefox and WebKit (`suites/`), Node-only size and compression scripts (`node/`), hand-written phase-0 codecs (`lib/`), results (`results/`) |
| `spikes/ts71/` | checks that the TypeScript 7.1 API exposes what the codegen needs |

## Running

Node 22+, pnpm.

```sh
pnpm install
pnpm test                                   # golden, round-trip, fuzzing and end-to-end tests
pnpm --filter @tbr/bench exec playwright install chromium firefox webkit
pnpm --filter @tbr/bench gen && node bench/run.mjs generated   # the tables above; --quick for a smoke run
node bench/node/generated-size.mjs          # the size table; needs the zstd CLI for its column
node bench/size.mjs                         # bundle sizes
pnpm --filter tbr-site dev                  # the docs site at http://localhost:4321/ts-bin-RPC/
```

In `playground/`: `pnpm gen` writes `tbr.lock.json` and `src/tbr.gen.ts`, `pnpm watch` does it on
every save, `pnpm check` classifies changes against the lockfile. `tbr decode response.bin --proc
user.get` prints a captured message as JSON.
