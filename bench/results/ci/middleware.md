# Middleware overhead

2026-11-05, AMD EPYC 9V45 96-Core Processor, linux 7.0.0-1017-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 34 ns | 5.63 µs |
| 1 context step | 49 ns (+15 ns) | 5.65 µs (+18 ns) |
| 1 async context step | 103 ns (+69 ns) | 5.82 µs (+188 ns) |
| 1 around | 167 ns (+133 ns) | 5.92 µs (+293 ns) |
| around + 2 context steps | 199 ns (+165 ns) | 5.98 µs (+348 ns) |
