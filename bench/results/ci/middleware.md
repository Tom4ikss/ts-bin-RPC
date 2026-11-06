# Middleware overhead

2026-11-06, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 65 ns | 10.78 µs |
| 1 context step | 92 ns (+27 ns) | 10.87 µs (+83 ns) |
| 1 async context step | 196 ns (+130 ns) | 11.15 µs (+370 ns) |
| 1 around | 330 ns (+264 ns) | 11.44 µs (+660 ns) |
| around + 2 context steps | 398 ns (+333 ns) | 11.69 µs (+904 ns) |
