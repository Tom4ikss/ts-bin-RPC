# Streams: ts-bin-rpc over HTTP and WebSocket, NDJSON, SSE, JSON over WebSocket

2026-11-07, Intel Xeon Processor (Icelake), linux 6.8.0-147-generic, Node v26.13.0, Chromium 156.0.8078.4. Median of 5 runs.

A Node HTTP server on 127.0.0.1 sends ticks `{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }`; a Chromium page reads every field of every tick. Every transport gets the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON, SSE and JSON over a WebSocket write once per timer tick, not once per tick (JSON: one text message with an array of the ticks). ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with `window: 0`. The WebSocket server is the small one of the tests (`e2e/src/ws-server.ts`), without compression; the ts-bin-rpc socket stays open between runs.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: `TaskDuration` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included (for WebSockets, frame headers), without compression.

| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |
|---|---|---|---|---|---|---|---|
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 16 ms (default) | 5002 ms | 9.09 ms | 16.8 ms | 35.7 ms | 93.2 ms | 105 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc, window 0 | 5002 ms | 0.08 ms | 0.11 ms | 125 ms | 289 ms | 394 KB |
| 1 000 ticks/s for 5 s | NDJSON over fetch | 5001 ms | 0.08 ms | 0.13 ms | 159 ms | 204 ms | 337 KB |
| 1 000 ticks/s for 5 s | SSE, EventSource | 5001 ms | 0.07 ms | 0.10 ms | 111 ms | 213 ms | 371 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 16 ms | 5000 ms | 8.91 ms | 17.2 ms | 35.4 ms | 65.4 ms | 107 KB |
| 1 000 ticks/s for 5 s | ts-bin-rpc over WebSocket, window 0 | 5000 ms | 0.07 ms | 0.11 ms | 166 ms | 315 ms | 436 KB |
| 1 000 ticks/s for 5 s | JSON over WebSocket | 5002 ms | 0.06 ms | 0.09 ms | 92.4 ms | 255 ms | 327 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 16 ms (default) | 3003 ms | 9.25 ms | 16.9 ms | 77.6 ms | 64.5 ms | 1010 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc, window 0 | 3003 ms | 0.10 ms | 0.15 ms | 130 ms | 214 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | NDJSON over fetch | 3002 ms | 0.11 ms | 0.18 ms | 172 ms | 204 ms | 3.7 MB |
| 20 000 ticks/s for 3 s | SSE, EventSource | 3002 ms | 0.15 ms | 0.94 ms | 441 ms | 791 ms | 4.1 MB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 16 ms | 3001 ms | 9.23 ms | 16.9 ms | 73.7 ms | 71.3 ms | 1011 KB |
| 20 000 ticks/s for 3 s | ts-bin-rpc over WebSocket, window 0 | 3001 ms | 0.08 ms | 0.16 ms | 144 ms | 188 ms | 1.2 MB |
| 20 000 ticks/s for 3 s | JSON over WebSocket | 3003 ms | 0.09 ms | 0.13 ms | 134 ms | 184 ms | 3.7 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 16 ms (default) | 102 ms | 33.2 ms | 62.1 ms | 134 ms | 43.9 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc, window 0 | 100 ms | 34.1 ms | 60.9 ms | 133 ms | 41.2 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | NDJSON over fetch | 202 ms | 67.9 ms | 121 ms | 253 ms | 86.0 ms | 12.2 MB |
| 200 000 ticks, as fast as possible | SSE, EventSource | 1972 ms | 890 ms | 1877 ms | 1161 ms | 2228 ms | 13.6 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 16 ms | 122 ms | 39.6 ms | 72.0 ms | 148 ms | 58.8 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | ts-bin-rpc over WebSocket, window 0 | 121 ms | 40.3 ms | 76.1 ms | 144 ms | 55.9 ms | 3.3 MB |
| 200 000 ticks, as fast as possible | JSON over WebSocket | 213 ms | 69.1 ms | 132 ms | 197 ms | 110 ms | 12.2 MB |
