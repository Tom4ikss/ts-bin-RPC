# Queries: GET against POST

2026-11-04, Apple M3 Pro, darwin 25.6.0, Node v22.13.1. Median of 9 rounds of 50,000 sequential awaited calls.

Client and handler in one process, no network: what a call costs on both sides together. The two procedures take `{ id: u32 }` and return the same 7-field user. The GET call also encodes the input as base64url, builds and parses the URL, and hashes the response for its ETag. The 304 row is the handler alone answering a request whose If-None-Match matches: the procedure still runs, the body is not sent.

| Call | Time | Over POST |
|---|---|---|
| POST, user.get | 11.26 µs |  |
| GET, catalog.user | 9.32 µs | −1.95 µs |
| GET, catalog.user, 304 | 4.29 µs | −6.98 µs |
