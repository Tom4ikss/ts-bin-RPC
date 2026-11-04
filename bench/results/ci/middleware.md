# Middleware overhead

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 63 ns | 10.46 µs |
| 1 context step | 93 ns (+30 ns) | 10.59 µs (+126 ns) |
| 1 async context step | 206 ns (+144 ns) | 10.70 µs (+243 ns) |
| 1 around | 334 ns (+271 ns) | 10.94 µs (+486 ns) |
| around + 2 context steps | 399 ns (+336 ns) | 11.06 µs (+598 ns) |
