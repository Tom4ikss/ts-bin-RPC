# Middleware overhead

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 62 ns | 10.38 µs |
| 1 context step | 94 ns (+32 ns) | 10.47 µs (+93 ns) |
| 1 async context step | 202 ns (+141 ns) | 10.62 µs (+242 ns) |
| 1 around | 338 ns (+276 ns) | 10.89 µs (+515 ns) |
| around + 2 context steps | 397 ns (+335 ns) | 11.08 µs (+701 ns) |
