# Middleware overhead

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 62 ns | 10.61 µs |
| 1 context step | 101 ns (+39 ns) | 10.74 µs (+124 ns) |
| 1 async context step | 200 ns (+138 ns) | 10.96 µs (+343 ns) |
| 1 around | 330 ns (+268 ns) | 11.05 µs (+433 ns) |
| around + 2 context steps | 392 ns (+330 ns) | 11.30 µs (+687 ns) |
