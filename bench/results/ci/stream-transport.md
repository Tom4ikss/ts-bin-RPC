# Streams: ts-bin-rpc over HTTP and WebSocket, NDJSON, SSE, JSON over WebSocket

2026-11-06, AMD EPYC 9V45 96-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. Every transport gets the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON, SSE and JSON over a WebSocket write once per timer tick, not once per tick (JSON: one text message with an array of the ticks). ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`. The WebSocket server is the small one of the tests (`e2e/src/ws-server.ts`), without compression; the ts-bin-rpc socket stays open between runs.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included (for WebSockets, frame headers), without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 8.75 ms | 16.6 ms | 29.5 ms | 140 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.07 ms | 0.12 ms | 89.7 ms | 192 ms | 394 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5002 ms | 0.07 ms | 0.14 ms | 117 ms | 191 ms | 337 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.07 ms | 0.27 ms | 91.7 ms | 227 ms | 371 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 16 ms | 5001 ms | 8.82 ms | 16.8 ms | 41.3 ms | 113 ms | 107 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 0 | 5001 ms | 0.06 ms | 0.11 ms | 85.7 ms | 220 ms | 410 KB |
| 1 000 ticks/s for 5 s | JSON over WebSocket | 5001 ms | 0.05 ms | 0.09 ms | 61.0 ms | 185 ms | 327 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 8.85 ms | 16.8 ms | 49.7 ms | 62.9 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3002 ms | 0.07 ms | 0.12 ms | 85.2 ms | 125 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.09 ms | 0.14 ms | 124 ms | 148 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.12 ms | 0.56 ms | 264 ms | 460 ms | 4.1 MB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 16 ms | 3002 ms | 8.84 ms | 16.8 ms | 50.6 ms | 61.2 ms | 1011 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 0 | 3001 ms | 0.06 ms | 0.11 ms | 74.9 ms | 141 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | JSON over WebSocket | 3003 ms | 0.07 ms | 0.11 ms | 78.8 ms | 154 ms | 3.7 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 61.7 ms | 19.6 ms | 30.5 ms | 80.4 ms | 31.3 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 62.9 ms | 21.3 ms | 32.2 ms | 84.0 ms | 33.5 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 114 ms | 19.6 ms | 34.4 ms | 152 ms | 81.3 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 1841 ms | 791 ms | 1668 ms | 1053 ms | 1069 ms | 13.6 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 16 ms | 73.7 ms | 24.2 ms | 42.3 ms | 90.0 ms | 44.1 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 0 | 76.4 ms | 24.9 ms | 42.4 ms | 91.4 ms | 43.9 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | JSON over WebSocket | 128 ms | 26.4 ms | 48.3 ms | 119 ms | 92.5 ms | 12.2 MB |
