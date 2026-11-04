# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-04, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.79 ms | 16.7 ms | 32.1 ms | 141 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.12 ms | 0.24 ms | 186 ms | 383 ms | 428 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.13 ms | 0.27 ms | 209 ms | 356 ms | 336 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5000 ms | 0.11 ms | 0.24 ms | 149 ms | 358 ms | 369 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 8.87 ms | 16.9 ms | 59.7 ms | 66.1 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.12 ms | 0.25 ms | 150 ms | 251 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3003 ms | 0.15 ms | 0.30 ms | 221 ms | 272 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.20 ms | 0.68 ms | 376 ms | 679 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 85.8 ms | 27.0 ms | 44.9 ms | 110 ms | 48.3 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 86.3 ms | 29.5 ms | 42.3 ms | 110 ms | 45.7 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 154 ms | 23.7 ms | 40.8 ms | 203 ms | 116 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2190 ms | 979 ms | 1967 ms | 1389 ms | 1357 ms | 13.6 MB |
