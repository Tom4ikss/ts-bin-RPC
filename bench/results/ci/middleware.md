# Middleware overhead

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 67 ns | 10.51 µs |
| 1 context step | 94 ns (+27 ns) | 10.58 µs (+63 ns) |
| 1 async context step | 202 ns (+134 ns) | 10.72 µs (+203 ns) |
| 1 around | 324 ns (+257 ns) | 10.89 µs (+377 ns) |
| around + 2 context steps | 402 ns (+334 ns) | 11.19 µs (+676 ns) |
