# Streams: ts-bin-rpc over HTTP and WebSocket, NDJSON, SSE, JSON over WebSocket

2026-11-06, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. Every transport gets the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON, SSE and JSON over a WebSocket write once per timer tick, not once per tick (JSON: one text message with an array of the ticks). ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`. The WebSocket server is the small one of the tests (`e2e/src/ws-server.ts`), without compression; the ts-bin-rpc socket stays open between runs.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included (for WebSockets, frame headers), without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.77 ms | 16.7 ms | 32.4 ms | 149 ms | 106 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5001 ms | 0.10 ms | 0.15 ms | 166 ms | 333 ms | 391 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.12 ms | 0.15 ms | 197 ms | 334 ms | 336 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.09 ms | 0.13 ms | 135 ms | 363 ms | 373 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 16 ms | 5001 ms | 8.71 ms | 16.5 ms | 26.8 ms | 98.4 ms | 107 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 0 | 5000 ms | 0.09 ms | 0.12 ms | 140 ms | 344 ms | 385 KB |
| 1 000 ticks/s for 5 s | JSON over WebSocket | 5001 ms | 0.08 ms | 0.11 ms | 106 ms | 337 ms | 327 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3002 ms | 8.82 ms | 16.7 ms | 56.9 ms | 63.2 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.11 ms | 0.15 ms | 139 ms | 226 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.13 ms | 0.17 ms | 180 ms | 227 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.16 ms | 0.59 ms | 348 ms | 672 ms | 4.1 MB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 16 ms | 3001 ms | 8.82 ms | 16.8 ms | 55.8 ms | 62.6 ms | 1011 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 0 | 3001 ms | 0.09 ms | 0.12 ms | 127 ms | 254 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | JSON over WebSocket | 3002 ms | 0.11 ms | 0.14 ms | 121 ms | 254 ms | 3.7 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 73.9 ms | 24.4 ms | 42.8 ms | 95.7 ms | 33.9 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 77.6 ms | 26.1 ms | 43.4 ms | 100 ms | 34.9 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 152 ms | 25.0 ms | 43.9 ms | 200 ms | 114 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2137 ms | 968 ms | 1951 ms | 1303 ms | 1302 ms | 13.6 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 16 ms | 124 ms | 36.9 ms | 60.1 ms | 137 ms | 136 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 0 | 108 ms | 34.6 ms | 66.3 ms | 121 ms | 65.0 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | JSON over WebSocket | 189 ms | 39.9 ms | 77.5 ms | 167 ms | 145 ms | 12.2 MB |
