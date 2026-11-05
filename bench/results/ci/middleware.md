# Middleware overhead

2026-11-05, AMD EPYC 9V45 96-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 35 ns | 5.64 µs |
| 1 context step | 48 ns (+13 ns) | 5.70 µs (+60 ns) |
| 1 async context step | 106 ns (+71 ns) | 5.76 µs (+122 ns) |
| 1 around | 168 ns (+133 ns) | 5.81 µs (+168 ns) |
| around + 2 context steps | 197 ns (+162 ns) | 5.84 µs (+197 ns) |
