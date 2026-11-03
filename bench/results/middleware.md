# Middleware overhead

2026-11-03, Apple M3 Pro, darwin 25.6.0, Node v22.13.1. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 35 ns | 4.13 µs |
| 1 context step | 56 ns (+21 ns) | 4.13 µs (−8 ns) |
| 1 async context step | 109 ns (+74 ns) | 4.21 µs (+77 ns) |
| 1 around | 157 ns (+122 ns) | 4.29 µs (+154 ns) |
| around + 2 context steps | 195 ns (+160 ns) | 4.36 µs (+231 ns) |
