# Middleware overhead

2026-11-07, Intel Xeon Processor (Icelake), linux 6.8.0-147-generic, Node v26.13.0. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 53 ns | 6.77 µs |
| 1 context step | 102 ns (+49 ns) | 6.84 µs (+64 ns) |
| 1 async context step | 207 ns (+154 ns) | 7.07 µs (+299 ns) |
| 1 around | 327 ns (+274 ns) | 7.25 µs (+475 ns) |
| around + 2 context steps | 407 ns (+353 ns) | 7.42 µs (+646 ns) |
