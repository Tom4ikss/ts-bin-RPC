# Dashboard example

A metrics dashboard: a Node server with synthetic metrics for eight hosts, a Vite + React client,
charts drawn with [uPlot](https://github.com/leeoniya/uPlot), and a live chart fed by a stream.

```sh
pnpm install            # at the repository root
cd examples/dashboard
pnpm dev                # Vite at http://localhost:5173, the API at /rpc, tbr generate --watch alongside
pnpm build && pnpm start   # production: dist/ and the API on http://localhost:3001
```

| File | What |
|---|---|
| [`src/server/router.ts`](src/server/router.ts) | the API: plain async functions, types written in TypeScript |
| [`src/server/data.ts`](src/server/data.ts) | synthetic metrics, a deterministic function of host, metric and time |
| [`src/server/handler.ts`](src/server/handler.ts) | `createHandler` with `serverProcedures`, shared by dev and production |
| [`src/server/main.ts`](src/server/main.ts) | production server: the handler plus static files |
| [`vite.config.ts`](vite.config.ts) | dev: a plugin serves `/rpc/*` from `handler.ts` through `ssrLoadModule` and runs `tbr generate --watch`, so router edits apply on the next call |
| [`src/client/api.ts`](src/client/api.ts) | `createClient<AppRouter>` with `clientProcedures`; a `fetch` wrapper records response sizes |
| [`src/client/Chart.tsx`](src/client/Chart.tsx) | uPlot wrapper |
| [`src/client/App.tsx`](src/client/App.tsx) | the dashboard |
| [`src/client/Live.tsx`](src/client/Live.tsx) | the live chart: `api.live.subscribe` and batch columns |

What to look at:

- **Columns go to the chart as they are.** `series` returns `{ t: Float64Array; v: Float32Array }`.
  On the client these are typed arrays over the response bytes, and uPlot takes them directly
  (`ms: 1` for millisecond timestamps). Nothing is copied or parsed per point.
- **Types come from the router.** The client imports `type AppRouter` and the generated
  `clientProcedures`. No server code reaches the bundle; the client bundle is ~9 KB gz without React
  and uPlot (`node bench/size.mjs` at the root).
- **Sizes.** The Calls table shows each response next to the same values as JSON, rounded to 0.01.
  Expect about 1.5–2.6× smaller before HTTP compression. 100k points of 7 days is ~1.2 MB.
- **Live data is one stream.** `live` returns `stream<Sample>(…)`: a sample of every host each
  100 ms over a single `fetch`. The client subscribes with a `batch` handler and reads
  `batch.columns` (`host` as `Uint16Array`, `t` as `Float64Array`, `rps` as `Float32Array`, over
  the frame bytes). Rows go out in batches of up to 16 ms; unmounting calls `stop()`, which runs the
  server's cleanup.
- **Cancellation.** Each refresh aborts the previous one via `AbortController`, passed as
  `{ signal }` to the call.
- **Errors.** `range` throws `RpcError('BAD_INPUT', …)`; the client rethrows it with the same code.

Under `pnpm dev`, saving `router.ts` regenerates `src/server/tbr.gen.ts` in ~15 ms and Vite reloads
both sides. Without the watcher, the generated `Contract` type fails `pnpm typecheck` until you run
`pnpm gen`.
