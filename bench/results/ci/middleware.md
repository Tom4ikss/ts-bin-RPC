# Middleware overhead

2026-11-07, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 53 ns | 6.68 µs |
| 1 context step | 74 ns (+21 ns) | 6.65 µs (−32 ns) |
| 1 async context step | 165 ns (+112 ns) | 6.84 µs (+162 ns) |
| 1 around | 258 ns (+205 ns) | 6.99 µs (+314 ns) |
| around + 2 context steps | 318 ns (+264 ns) | 7.08 µs (+405 ns) |
