# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-03, Apple M3 Pro, darwin 25.6.0, Node v22.13.1, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 9.08 ms | 17.2 ms | 61.8 ms | 325 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.30 ms | 0.77 ms | 312 ms | 783 ms | 333 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5002 ms | 0.23 ms | 0.66 ms | 287 ms | 542 ms | 335 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5002 ms | 0.20 ms | 0.55 ms | 187 ms | 578 ms | 368 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3004 ms | 9.58 ms | 17.5 ms | 147 ms | 202 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3003 ms | 0.35 ms | 0.73 ms | 261 ms | 512 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3003 ms | 0.30 ms | 0.71 ms | 279 ms | 447 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.26 ms | 0.79 ms | 429 ms | 828 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 46.1 ms | 13.7 ms | 23.0 ms | 62.8 ms | 22.0 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 44.7 ms | 13.7 ms | 23.9 ms | 61.0 ms | 19.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 84.5 ms | 9.26 ms | 15.7 ms | 113 ms | 67.2 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 751 ms | 323 ms | 648 ms | 472 ms | 802 ms | 13.6 MB |
