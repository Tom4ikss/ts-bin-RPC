# Streams: ts-bin-rpc over HTTP and WebSocket, NDJSON, SSE, JSON over WebSocket

2026-11-06, Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. Every transport gets the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON, SSE and JSON over a WebSocket write once per timer tick, not once per tick (JSON: one text message with an array of the ticks). ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`. The WebSocket server is the small one of the tests (`e2e/src/ws-server.ts`), without compression; the ts-bin-rpc socket stays open between runs.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included (for WebSockets, frame headers), without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.95 ms | 17.1 ms | 46.9 ms | 177 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.12 ms | 0.20 ms | 204 ms | 391 ms | 389 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.13 ms | 0.19 ms | 238 ms | 348 ms | 336 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.12 ms | 0.17 ms | 168 ms | 416 ms | 369 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 16 ms | 5001 ms | 8.88 ms | 17.0 ms | 46.0 ms | 136 ms | 107 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 0 | 5001 ms | 0.11 ms | 0.17 ms | 201 ms | 454 ms | 423 KB |
| 1 000 ticks/s for 5 s | JSON over WebSocket | 5002 ms | 0.10 ms | 0.14 ms | 128 ms | 381 ms | 326 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 9.07 ms | 17.2 ms | 85.3 ms | 83.5 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.13 ms | 0.20 ms | 170 ms | 251 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.17 ms | 0.24 ms | 250 ms | 296 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.22 ms | 0.92 ms | 448 ms | 873 ms | 4.1 MB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 16 ms | 3002 ms | 9.02 ms | 17.2 ms | 81.1 ms | 83.1 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 0 | 3002 ms | 0.11 ms | 0.17 ms | 174 ms | 297 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | JSON over WebSocket | 3002 ms | 0.12 ms | 0.17 ms | 158 ms | 313 ms | 3.7 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 94.5 ms | 30.7 ms | 50.8 ms | 122 ms | 44.2 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 107 ms | 34.6 ms | 55.0 ms | 139 ms | 53.2 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 188 ms | 25.5 ms | 42.7 ms | 252 ms | 150 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2835 ms | 1232 ms | 2568 ms | 1674 ms | 2068 ms | 13.6 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 16 ms | 142 ms | 39.6 ms | 75.1 ms | 163 ms | 87.5 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 0 | 144 ms | 45.2 ms | 85.5 ms | 163 ms | 84.0 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | JSON over WebSocket | 243 ms | 55.6 ms | 74.4 ms | 225 ms | 169 ms | 12.2 MB |
