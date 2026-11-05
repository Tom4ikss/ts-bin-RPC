# Middleware overhead

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 62 ns | 10.75 µs |
| 1 context step | 102 ns (+40 ns) | 10.77 µs (+16 ns) |
| 1 async context step | 209 ns (+148 ns) | 10.87 µs (+113 ns) |
| 1 around | 325 ns (+263 ns) | 11.21 µs (+452 ns) |
| around + 2 context steps | 394 ns (+333 ns) | 11.33 µs (+575 ns) |
