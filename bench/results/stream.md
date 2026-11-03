# Suite `stream`

2026-11-03, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 1024 ticks: encode, frame, read every field | NDJSON, a line per tick | 754 µs | 782 µs | 692 µs | 409 µs |
| 1024 ticks: encode, frame, read every field | JSON, batches of 32 | 404 µs (1.87x) | 248 µs (3.16x) | 396 µs (1.75x) | 183 µs (2.24x) |
| 1024 ticks: encode, frame, read every field | binary, batches of 1 | 454 µs (1.66x) | 857 µs (0.91x) | 1.1 ms (0.63x) ~ | 425 µs (0.96x) |
| 1024 ticks: encode, frame, read every field | binary, batches of 8 | 114 µs (6.61x) | 132 µs (5.90x) | 291 µs (2.38x) | 102 µs (4.02x) ~ |
| 1024 ticks: encode, frame, read every field | binary, batches of 32 | 47 µs (16.09x) | 52 µs (14.99x) ~ | 116 µs (5.95x) ~ | 47 µs (8.79x) ~ |
| 1024 ticks: encode, frame, read every field | binary, batches of 128 | 32 µs (23.41x) | 31 µs (24.99x) ~ | 68 µs (10.13x) | 27 µs (15.28x) |
| 1024 ticks: encode, frame, read every field | binary, batches of 512 | 29 µs (26.35x) | 26 µs (30.00x) | 57 µs (12.22x) | 20 µs (19.98x) |
| 1024 ticks: encode, frame, read every field | binary, batches of 32, verified | 52 µs (14.40x) | 54 µs (14.42x) | 119 µs (5.80x) | 45 µs (9.14x) |
| 1024 ticks: server encode only | NDJSON | 415 µs | 541 µs ~ | 410 µs | 238 µs |
| 1024 ticks: server encode only | binary, batches of 1 | 257 µs (1.62x) | 324 µs (1.67x) | 543 µs (0.76x) | 225 µs (1.06x) |
| 1024 ticks: server encode only | binary, batches of 32 | 17 µs (24.62x) | 23 µs (23.30x) | 36 µs (11.29x) | 21 µs (11.56x) |
| 1024 ticks: server encode only | binary, batches of 512 | 6.92 µs (59.93x) | 9.49 µs (57.02x) ~ | 10 µs (40.07x) | 6.75 µs (35.31x) |
| 1024 ticks: client read only, every field | NDJSON | 312 µs | 166 µs | 248 µs | 132 µs |
| 1024 ticks: client read only, every field | binary, batches of 1 | 67 µs (4.65x) | 50 µs (3.35x) | 132 µs (1.88x) | 57 µs (2.29x) |
| 1024 ticks: client read only, every field | binary, batches of 32 | 16 µs (19.46x) ~ | 14 µs (12.04x) | 25 µs (10.00x) | 16 µs (8.23x) |
| 1024 ticks: client read only, every field | binary, batches of 512 | 11 µs (29.22x) ~ | 8.33 µs (19.93x) | 11 µs (22.62x) | 9.77 µs (13.51x) |
