# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-05, AMD EPYC 9V45 96-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.63 ms | 16.4 ms | 17.6 ms | 105 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.06 ms | 0.27 ms | 89.5 ms | 195 ms | 401 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.07 ms | 0.35 ms | 119 ms | 187 ms | 337 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.06 ms | 0.34 ms | 77.9 ms | 197 ms | 373 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3002 ms | 8.65 ms | 16.4 ms | 40.1 ms | 42.9 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.07 ms | 0.41 ms | 87.0 ms | 128 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.09 ms | 0.38 ms | 124 ms | 147 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.12 ms | 0.44 ms | 266 ms | 476 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 61.8 ms | 18.6 ms | 35.0 ms | 83.6 ms | 27.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 59.1 ms | 19.9 ms | 31.5 ms | 80.7 ms | 27.9 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 114 ms | 18.0 ms | 32.7 ms | 155 ms | 83.9 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 1625 ms | 735 ms | 1481 ms | 1026 ms | 952 ms | 13.6 MB |
