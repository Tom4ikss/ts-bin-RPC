# Dashboard example

A metrics dashboard: a Node server with synthetic metrics for eight hosts, a Vite + React client,
charts drawn with [uPlot](https://github.com/leeoniya/uPlot).

```sh
pnpm install            # at the repository root
cd examples/dashboard
pnpm dev                # tbr generate, then Vite at http://localhost:5173 with the API at /rpc
pnpm build && pnpm start   # production: dist/ and the API on http://localhost:3001
```

| File | What |
|---|---|
| [`src/server/router.ts`](src/server/router.ts) | the API: plain async functions, types written in TypeScript |
| [`src/server/data.ts`](src/server/data.ts) | synthetic metrics, a deterministic function of host, metric and time |
| [`src/server/handler.ts`](src/server/handler.ts) | `createHandler` with `serverProcedures`, shared by dev and production |
| [`src/server/main.ts`](src/server/main.ts) | production server: the handler plus static files |
| [`vite.config.ts`](vite.config.ts) | dev: a plugin serves `/rpc/*` from `handler.ts` through `ssrLoadModule`, so router edits apply on the next call |
| [`src/client/api.ts`](src/client/api.ts) | `createClient<AppRouter>` with `clientProcedures`; a `fetch` wrapper records response sizes |
| [`src/client/Chart.tsx`](src/client/Chart.tsx) | uPlot wrapper |
| [`src/client/App.tsx`](src/client/App.tsx) | the dashboard |

What to look at:

- **Columns go to the chart as they are.** `series` returns `{ t: Float64Array; v: Float32Array }`.
  On the client these are typed arrays over the response bytes, and uPlot takes them directly
  (`ms: 1` for millisecond timestamps). Nothing is copied or parsed per point.
- **Types come from the router.** The client imports `type AppRouter` and the generated
  `clientProcedures`. No server code reaches the bundle; the client bundle is ~9 KB gz without React
  and uPlot (`node bench/size.mjs` at the root).
- **Sizes.** The Calls table shows each response next to the same values as JSON, rounded to 0.01.
  Expect about 1.5–2.6× smaller before HTTP compression. 100k points of 7 days is ~1.2 MB.
- **Cancellation.** Each refresh aborts the previous one via `AbortController`, passed as
  `{ signal }` to the call.
- **Errors.** `range` throws `RpcError('BAD_INPUT', …)`; the client rethrows it with the same code.

After changing types in `router.ts`, run `pnpm gen` (or restart `pnpm dev`): the generated
`Contract` type fails `pnpm typecheck` until you do.
