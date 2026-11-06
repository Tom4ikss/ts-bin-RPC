# Streams: ts-bin-rpc over HTTP and WebSocket, NDJSON, SSE, JSON over WebSocket

2026-11-06, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. Every transport gets the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON, SSE and JSON over a WebSocket write once per timer tick, not once per tick (JSON: one text message with an array of the ticks). ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`. The WebSocket server is the small one of the tests (`e2e/src/ws-server.ts`), without compression; the ts-bin-rpc socket stays open between runs.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included (for WebSockets, frame headers), without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.76 ms | 16.6 ms | 27.4 ms | 162 ms | 106 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.15 ms | 0.19 ms | 187 ms | 402 ms | 354 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.16 ms | 0.20 ms | 266 ms | 424 ms | 338 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.14 ms | 0.17 ms | 162 ms | 444 ms | 371 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 16 ms | 5000 ms | 8.71 ms | 16.6 ms | 23.5 ms | 107 ms | 107 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 0 | 5001 ms | 0.13 ms | 0.17 ms | 171 ms | 425 ms | 366 KB |
| 1 000 ticks/s for 5 s | JSON over WebSocket | 5002 ms | 0.12 ms | 0.15 ms | 156 ms | 502 ms | 327 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 8.86 ms | 16.8 ms | 67.5 ms | 72.1 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3003 ms | 0.17 ms | 0.21 ms | 179 ms | 297 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3003 ms | 0.19 ms | 0.24 ms | 245 ms | 312 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.24 ms | 0.84 ms | 425 ms | 892 ms | 4.1 MB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 16 ms | 3001 ms | 8.87 ms | 16.9 ms | 66.2 ms | 75.6 ms | 1011 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 0 | 3002 ms | 0.14 ms | 0.18 ms | 169 ms | 333 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | JSON over WebSocket | 3003 ms | 0.15 ms | 0.20 ms | 157 ms | 332 ms | 3.7 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 98.1 ms | 32.8 ms | 53.2 ms | 127 ms | 47.3 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 110 ms | 36.9 ms | 51.0 ms | 140 ms | 61.7 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 199 ms | 24.0 ms | 49.8 ms | 263 ms | 162 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2804 ms | 1237 ms | 2525 ms | 1753 ms | 1892 ms | 13.6 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 16 ms | 160 ms | 46.1 ms | 83.6 ms | 175 ms | 101 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 0 | 155 ms | 46.5 ms | 88.2 ms | 169 ms | 88.3 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | JSON over WebSocket | 228 ms | 33.0 ms | 65.5 ms | 201 ms | 180 ms | 12.2 MB |
