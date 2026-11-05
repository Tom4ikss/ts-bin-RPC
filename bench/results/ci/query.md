# Queries: GET against POST

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 50,000 sequential awaited calls.

Client and handler in one process, no network: what a call costs on both sides together. The two procedures take `{ id: u32 }` and return the same 7-field user. The GET call also encodes the input as base64url, builds and parses the URL, and hashes the response for its ETag. The 304 row is the handler alone answering a request whose If-None-Match matches: the procedure still runs, the body is not sent.

| Call | Time | Over POST |
|---|---|---|
| POST, user.get | 32.87 µs |  |
| GET, catalog.user | 28.93 µs | −3.95 µs |
| GET, catalog.user, 304 | 11.05 µs | −21.82 µs |
