# Middleware overhead

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 64 ns | 10.62 µs |
| 1 context step | 94 ns (+30 ns) | 10.74 µs (+123 ns) |
| 1 async context step | 199 ns (+136 ns) | 10.92 µs (+295 ns) |
| 1 around | 334 ns (+271 ns) | 11.12 µs (+502 ns) |
| around + 2 context steps | 396 ns (+332 ns) | 11.37 µs (+746 ns) |
