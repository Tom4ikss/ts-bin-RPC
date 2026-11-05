# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.82 ms | 16.8 ms | 37.7 ms | 180 ms | 106 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.15 ms | 0.21 ms | 220 ms | 437 ms | 385 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5002 ms | 0.16 ms | 0.22 ms | 228 ms | 385 ms | 334 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.13 ms | 0.19 ms | 168 ms | 448 ms | 369 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 8.88 ms | 16.9 ms | 75.1 ms | 77.3 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.16 ms | 0.22 ms | 187 ms | 293 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.18 ms | 0.24 ms | 251 ms | 321 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3001 ms | 0.24 ms | 1.28 ms | 446 ms | 923 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 103 ms | 31.1 ms | 50.8 ms | 131 ms | 53.3 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 103 ms | 34.1 ms | 53.9 ms | 132 ms | 50.3 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 196 ms | 26.2 ms | 41.5 ms | 258 ms | 155 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2821 ms | 1262 ms | 2521 ms | 1739 ms | 1879 ms | 13.6 MB |
