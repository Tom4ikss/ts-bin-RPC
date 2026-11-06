# Middleware overhead

2026-11-06, Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 61 ns | 10.50 µs |
| 1 context step | 99 ns (+38 ns) | 10.52 µs (+17 ns) |
| 1 async context step | 202 ns (+141 ns) | 10.75 µs (+253 ns) |
| 1 around | 379 ns (+318 ns) | 11.05 µs (+550 ns) |
| around + 2 context steps | 408 ns (+347 ns) | 11.07 µs (+574 ns) |
