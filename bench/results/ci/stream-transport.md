# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.77 ms | 16.6 ms | 26.7 ms | 161 ms | 106 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5001 ms | 0.15 ms | 0.19 ms | 194 ms | 422 ms | 354 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5002 ms | 0.16 ms | 0.20 ms | 226 ms | 376 ms | 334 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.14 ms | 0.18 ms | 163 ms | 423 ms | 368 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3002 ms | 8.86 ms | 16.8 ms | 69.9 ms | 69.3 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.16 ms | 0.22 ms | 185 ms | 293 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3003 ms | 0.19 ms | 0.24 ms | 253 ms | 326 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.24 ms | 0.89 ms | 441 ms | 919 ms | 4.1 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 111 ms | 39.6 ms | 52.9 ms | 138 ms | 60.6 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 99.3 ms | 32.7 ms | 51.8 ms | 128 ms | 49.0 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 197 ms | 27.4 ms | 47.8 ms | 260 ms | 152 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2769 ms | 1204 ms | 2487 ms | 1732 ms | 1806 ms | 13.6 MB |
