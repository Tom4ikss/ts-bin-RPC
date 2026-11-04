# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5003 ms | 8.83 ms | 16.8 ms | 29.3 ms | 178 ms | 106 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.16 ms | 0.20 ms | 198 ms | 489 ms | 360 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.16 ms | 0.20 ms | 223 ms | 376 ms | 334 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.14 ms | 0.17 ms | 187 ms | 478 ms | 372 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 8.92 ms | 16.9 ms | 68.1 ms | 79.5 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.18 ms | 0.22 ms | 176 ms | 293 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.20 ms | 0.27 ms | 240 ms | 304 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.25 ms | 1.21 ms | 389 ms | 802 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 106 ms | 32.4 ms | 47.3 ms | 136 ms | 57.9 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 98.9 ms | 32.2 ms | 49.5 ms | 128 ms | 50.2 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 202 ms | 28.2 ms | 46.6 ms | 262 ms | 152 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2822 ms | 1258 ms | 2542 ms | 1713 ms | 1856 ms | 13.6 MB |
