# Middleware overhead

2026-11-06, AMD EPYC 9V45 96-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 36 ns | 5.96 µs |
| 1 context step | 54 ns (+18 ns) | 5.93 µs (−28 ns) |
| 1 async context step | 107 ns (+71 ns) | 5.97 µs (+5 ns) |
| 1 around | 168 ns (+133 ns) | 6.14 µs (+181 ns) |
| around + 2 context steps | 205 ns (+169 ns) | 6.19 µs (+230 ns) |
