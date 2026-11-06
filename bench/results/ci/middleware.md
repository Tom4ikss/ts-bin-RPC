# Middleware overhead

2026-11-06, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 50 ns | 7.76 µs |
| 1 context step | 79 ns (+29 ns) | 7.81 µs (+50 ns) |
| 1 async context step | 172 ns (+122 ns) | 7.99 µs (+232 ns) |
| 1 around | 289 ns (+239 ns) | 8.08 µs (+319 ns) |
| around + 2 context steps | 293 ns (+243 ns) | 8.11 µs (+356 ns) |
