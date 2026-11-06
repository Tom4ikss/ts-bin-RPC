# Batching: n calls at once

2026-11-06, Apple M3 Pro, darwin 25.6.0, Node v26.13.0, Chromium 156.0.8078.4. Median of 9 runs.

A Chromium page calls `quote({ symbol, delay })` n times in one `Promise.all` and waits for every answer; the procedure waits `delay` ms, as a call to a database would, and returns `{ symbol, bid, ask, at }`. Node serves HTTP/1.1 and, on another port, HTTP/2 over TLS (`node:http2`), both through `toNodeListener`, on 127.0.0.1. `batch()` puts at most 32 calls in one request (its default). The WebSocket stays open between runs. HTTP requests: what the server got for one run; the WebSocket sends none.

| Calls | Transport | Wall, until the last answer | HTTP requests |
|---|---|---|---|
| 10 calls | HTTP/1.1, a request per call | 2.40 ms | 10 |
| 10 calls | HTTP/1.1, `batch()` | 0.70 ms | 1 |
| 10 calls | HTTP/2, a request per call | 2.90 ms | 10 |
| 10 calls | HTTP/2, `batch()` | 1.00 ms | 1 |
| 10 calls | WebSocket, `calls: true` | 0.40 ms | 0 |
| 50 calls | HTTP/1.1, a request per call | 9.30 ms | 50 |
| 50 calls | HTTP/1.1, `batch()` | 1.20 ms | 2 |
| 50 calls | HTTP/2, a request per call | 9.10 ms | 50 |
| 50 calls | HTTP/2, `batch()` | 1.40 ms | 2 |
| 50 calls | WebSocket, `calls: true` | 1.50 ms | 0 |
| 200 calls | HTTP/1.1, a request per call | 29.3 ms | 200 |
| 200 calls | HTTP/1.1, `batch()` | 3.50 ms | 7 |
| 200 calls | HTTP/2, a request per call | 33.4 ms | 200 |
| 200 calls | HTTP/2, `batch()` | 3.70 ms | 7 |
| 200 calls | WebSocket, `calls: true` | 4.70 ms | 0 |
| 10 calls, 20 ms each | HTTP/1.1, a request per call | 46.0 ms | 10 |
| 10 calls, 20 ms each | HTTP/1.1, `batch()` | 22.6 ms | 1 |
| 10 calls, 20 ms each | HTTP/2, a request per call | 25.1 ms | 10 |
| 10 calls, 20 ms each | HTTP/2, `batch()` | 23.1 ms | 1 |
| 10 calls, 20 ms each | WebSocket, `calls: true` | 22.4 ms | 0 |
| 50 calls, 20 ms each | HTTP/1.1, a request per call | 207 ms | 50 |
| 50 calls, 20 ms each | HTTP/1.1, `batch()` | 26.2 ms | 2 |
| 50 calls, 20 ms each | HTTP/2, a request per call | 27.3 ms | 50 |
| 50 calls, 20 ms each | HTTP/2, `batch()` | 22.6 ms | 2 |
| 50 calls, 20 ms each | WebSocket, `calls: true` | 23.2 ms | 0 |
