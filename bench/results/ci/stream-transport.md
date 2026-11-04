# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5003 ms | 8.87 ms | 16.9 ms | 33.6 ms | 190 ms | 106 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.16 ms | 0.21 ms | 201 ms | 464 ms | 348 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.16 ms | 0.21 ms | 271 ms | 434 ms | 338 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.13 ms | 0.18 ms | 168 ms | 434 ms | 369 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 8.95 ms | 17.0 ms | 70.0 ms | 87.4 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.17 ms | 0.22 ms | 185 ms | 331 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.19 ms | 0.41 ms | 256 ms | 331 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.25 ms | 1.09 ms | 448 ms | 917 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 96.9 ms | 31.1 ms | 48.7 ms | 127 ms | 50.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 93.9 ms | 30.0 ms | 48.4 ms | 122 ms | 47.2 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 203 ms | 29.3 ms | 45.5 ms | 264 ms | 160 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2905 ms | 1295 ms | 2607 ms | 1751 ms | 1931 ms | 13.6 MB |
