# Middleware overhead

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 62 ns | 11.02 µs |
| 1 context step | 95 ns (+33 ns) | 10.82 µs (−202 ns) |
| 1 async context step | 205 ns (+143 ns) | 11.06 µs (+33 ns) |
| 1 around | 337 ns (+275 ns) | 11.30 µs (+277 ns) |
| around + 2 context steps | 405 ns (+344 ns) | 11.38 µs (+353 ns) |
