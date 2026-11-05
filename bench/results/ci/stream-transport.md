# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.79 ms | 16.7 ms | 33.6 ms | 167 ms | 106 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.14 ms | 0.19 ms | 204 ms | 440 ms | 372 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.15 ms | 0.20 ms | 244 ms | 398 ms | 336 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.13 ms | 0.17 ms | 173 ms | 442 ms | 370 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3002 ms | 8.86 ms | 16.8 ms | 64.8 ms | 70.0 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.16 ms | 0.20 ms | 185 ms | 291 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3003 ms | 0.18 ms | 0.24 ms | 254 ms | 313 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.24 ms | 1.09 ms | 449 ms | 924 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 99.2 ms | 32.4 ms | 51.7 ms | 127 ms | 47.0 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 105 ms | 32.8 ms | 53.1 ms | 132 ms | 52.5 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 200 ms | 28.4 ms | 48.3 ms | 262 ms | 155 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2855 ms | 1282 ms | 2560 ms | 1814 ms | 1956 ms | 13.6 MB |
