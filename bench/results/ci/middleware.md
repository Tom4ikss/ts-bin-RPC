# Middleware overhead

2026-11-04, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, Node v22.23.4. Median of 9 rounds of 200,000 sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, `Request` and `Response` without a codec. Context steps return a new object, as `{ ...ctx, user }` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
| no middleware | 53 ns | 8.23 µs |
| 1 context step | 78 ns (+24 ns) | 8.34 µs (+111 ns) |
| 1 async context step | 166 ns (+112 ns) | 8.45 µs (+221 ns) |
| 1 around | 254 ns (+201 ns) | 8.54 µs (+307 ns) |
| around + 2 context steps | 295 ns (+241 ns) | 8.60 µs (+368 ns) |
