# Streams: ts-bin-rpc over HTTP and WebSocket, NDJSON, SSE, JSON over WebSocket

2026-11-06, Apple M3 Pro, darwin 25.6.0, Node v26.13.0, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. Every transport gets the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON, SSE and JSON over a WebSocket write once per timer tick, not once per tick (JSON: one text message with an array of the ticks). ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`. The WebSocket server is the small one of the tests (`e2e/src/ws-server.ts`), without compression; the ts-bin-rpc socket stays open between runs.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included (for WebSockets, frame headers), without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5001 ms | 8.90 ms | 16.6 ms | 21.9 ms | 99.8 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.14 ms | 0.63 ms | 164 ms | 439 ms | 362 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.15 ms | 0.69 ms | 230 ms | 430 ms | 334 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.15 ms | 0.60 ms | 156 ms | 459 ms | 368 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 16 ms | 5001 ms | 9.01 ms | 17.3 ms | 78.0 ms | 272 ms | 107 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 0 | 5001 ms | 0.10 ms | 0.50 ms | 114 ms | 329 ms | 372 KB |
| 1 000 ticks/s for 5 s | JSON over WebSocket | 5002 ms | 0.12 ms | 0.51 ms | 116 ms | 436 ms | 326 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 9.27 ms | 17.2 ms | 88.5 ms | 140 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.10 ms | 0.28 ms | 91.0 ms | 200 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.11 ms | 0.27 ms | 106 ms | 154 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3001 ms | 0.13 ms | 0.28 ms | 195 ms | 391 ms | 4.1 MB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 16 ms | 3002 ms | 9.16 ms | 17.1 ms | 83.2 ms | 106 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 0 | 3001 ms | 0.09 ms | 0.22 ms | 79.1 ms | 166 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | JSON over WebSocket | 3002 ms | 0.10 ms | 0.24 ms | 85.9 ms | 237 ms | 3.7 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 47.1 ms | 13.0 ms | 19.5 ms | 68.3 ms | 30.5 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 46.2 ms | 8.14 ms | 12.9 ms | 69.0 ms | 30.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 88.3 ms | 26.0 ms | 45.7 ms | 113 ms | 46.2 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 724 ms | 325 ms | 666 ms | 449 ms | 733 ms | 13.6 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 16 ms | 55.6 ms | 19.4 ms | 35.2 ms | 69.9 ms | 26.3 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 0 | 57.0 ms | 19.8 ms | 37.0 ms | 70.1 ms | 25.1 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | JSON over WebSocket | 118 ms | 42.0 ms | 80.0 ms | 91.7 ms | 57.6 ms | 12.2 MB |
