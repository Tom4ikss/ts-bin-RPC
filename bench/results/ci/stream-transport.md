# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 9.17 ms | 17.3 ms | 62.6 ms | 255 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.17 ms | 0.24 ms | 241 ms | 486 ms | 356 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5002 ms | 0.17 ms | 0.24 ms | 258 ms | 419 ms | 333 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.17 ms | 0.25 ms | 206 ms | 500 ms | 368 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 9.23 ms | 16.7 ms | 92.5 ms | 114 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3003 ms | 0.18 ms | 0.29 ms | 203 ms | 336 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3003 ms | 0.21 ms | 0.28 ms | 249 ms | 315 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.27 ms | 2.01 ms | 484 ms | 960 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 108 ms | 36.5 ms | 50.0 ms | 141 ms | 62.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 102 ms | 31.0 ms | 48.7 ms | 133 ms | 58.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 202 ms | 33.1 ms | 52.9 ms | 263 ms | 157 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2965 ms | 1296 ms | 2659 ms | 1854 ms | 1918 ms | 13.6 MB |
