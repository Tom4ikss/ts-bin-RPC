# Streams: ts-bin-rpc over HTTP and WebSocket, NDJSON, SSE, JSON over WebSocket

2026-11-07, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. Every transport gets the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON, SSE and JSON over a WebSocket write once per timer tick, not once per tick (JSON: one text message with an array of the ticks). ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`. The WebSocket server is the small one of the tests (`e2e/src/ws-server.ts`), without compression; the ts-bin-rpc socket stays open between runs.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included (for WebSockets, frame headers), without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.75 ms | 16.7 ms | 34.6 ms | 153 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.10 ms | 0.15 ms | 170 ms | 336 ms | 378 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.11 ms | 0.16 ms | 189 ms | 307 ms | 335 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5000 ms | 0.10 ms | 0.15 ms | 134 ms | 343 ms | 369 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 16 ms | 5000 ms | 8.85 ms | 16.9 ms | 44.7 ms | 124 ms | 106 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 0 | 5000 ms | 0.09 ms | 0.13 ms | 147 ms | 346 ms | 385 KB |
| 1 000 ticks/s for 5 s | JSON over WebSocket | 5001 ms | 0.08 ms | 0.11 ms | 105 ms | 331 ms | 327 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 8.82 ms | 16.7 ms | 57.6 ms | 61.0 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.11 ms | 0.15 ms | 136 ms | 232 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.13 ms | 0.19 ms | 186 ms | 241 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3001 ms | 0.17 ms | 0.50 ms | 358 ms | 663 ms | 4.1 MB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 16 ms | 3001 ms | 8.84 ms | 16.8 ms | 61.8 ms | 66.7 ms | 1011 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 0 | 3001 ms | 0.09 ms | 0.14 ms | 136 ms | 256 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | JSON over WebSocket | 3003 ms | 0.11 ms | 0.14 ms | 122 ms | 253 ms | 3.7 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 79.3 ms | 27.0 ms | 45.9 ms | 103 ms | 34.2 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 78.7 ms | 26.2 ms | 43.0 ms | 104 ms | 35.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 149 ms | 22.4 ms | 41.0 ms | 198 ms | 112 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 2143 ms | 959 ms | 1928 ms | 1348 ms | 1292 ms | 13.6 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 16 ms | 115 ms | 40.9 ms | 64.6 ms | 128 ms | 65.7 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 0 | 112 ms | 33.7 ms | 63.3 ms | 125 ms | 62.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | JSON over WebSocket | 180 ms | 31.5 ms | 54.2 ms | 165 ms | 139 ms | 12.2 MB |
