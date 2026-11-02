# Suite `layout`

2026-11-02, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.62 µs | 2.08 µs | 3.41 µs ~ | 2.55 µs |
| 10 users, all fields | old: fixed, utf-8 per field | 2.99 µs (1.55x) | 2.61 µs (0.80x) | 3.08 µs (1.11x) | 2.81 µs (0.91x) |
| 10 users, all fields | fixed + string blocks | 0.81 µs (5.72x) | 0.87 µs (2.39x) | 1.17 µs (2.91x) ~ | 1.53 µs (1.67x) |
| 10 users, all fields | vtable + string blocks | 0.91 µs (5.06x) | 0.98 µs (2.12x) | 1.24 µs (2.75x) | 1.49 µs (1.71x) |
| 10 users, all fields | columnar (L) | 1.91 µs (2.42x) ~ | 1.63 µs (1.27x) | 1.70 µs (2.01x) | 1.90 µs (1.34x) |
| 1000 users, all fields | JSON | 536 µs | 242 µs | 317 µs | 294 µs |
| 1000 users, all fields | old: fixed, utf-8 per field | 308 µs (1.74x) | 329 µs (0.74x) | 303 µs (1.04x) | 298 µs (0.98x) |
| 1000 users, all fields | fixed + string blocks | 107 µs (5.01x) | 109 µs (2.22x) | 99 µs (3.21x) | 97 µs (3.03x) |
| 1000 users, all fields | vtable + string blocks | 112 µs (4.78x) | 112 µs (2.16x) | 117 µs (2.71x) | 100 µs (2.95x) |
| 1000 users, all fields | columnar (L) | 105 µs (5.09x) ~ | 103 µs (2.35x) | 111 µs (2.87x) | 95 µs (3.10x) |
| 1000 users, 2 fields | JSON | 471 µs | 211 µs | 311 µs | 274 µs |
| 1000 users, 2 fields | old: fixed, utf-8 per field | 109 µs (4.31x) | 105 µs (2.01x) | 100 µs (3.10x) | 92 µs (2.98x) |
| 1000 users, 2 fields | fixed + string blocks | 36 µs (13.21x) | 41 µs (5.09x) | 37 µs (8.34x) | 58 µs (4.73x) |
| 1000 users, 2 fields | vtable + string blocks | 57 µs (8.31x) ~ | 45 µs (4.72x) | 43 µs (7.28x) | 62 µs (4.40x) |
| 1000 users, 2 fields | columnar (L) | 50 µs (9.39x) ~ | 50 µs (4.21x) | 38 µs (8.20x) | 53 µs (5.13x) |
| 1000 users, numbers only | JSON | 495 µs | 222 µs | 313 µs | 291 µs |
| 1000 users, numbers only | old: fixed, utf-8 per field | 13 µs (37.87x) | 12 µs (19.00x) | 18 µs (17.49x) ~ | 6.49 µs (44.86x) |
| 1000 users, numbers only | fixed + string blocks | 14 µs (35.95x) | 10 µs (21.24x) | 19 µs (16.84x) | 8.42 µs (34.56x) |
| 1000 users, numbers only | vtable + string blocks | 16 µs (31.75x) | 12 µs (18.16x) | 25 µs (12.54x) | 11 µs (27.33x) |
| 1000 users, numbers only | columnar (L) | 33 µs (15.17x) | 25 µs (8.74x) | 19 µs (16.12x) ~ | 8.35 µs (34.84x) |
| encode 1000 users | JSON | 410 µs ~ | 342 µs | 279 µs | 218 µs |
| encode 1000 users | old: fixed, utf-8 | 210 µs (1.95x) ~ | 489 µs (0.70x) ~ | 496 µs (0.56x) ~ | 385 µs (0.57x) |
| encode 1000 users | vtable + string blocks | 258 µs (1.59x) | 199 µs (1.72x) | 236 µs (1.18x) | 148 µs (1.47x) |
| encode 1000 users | columnar (L) | 231 µs (1.78x) | 165 µs (2.07x) | 187 µs (1.49x) | 102 µs (2.12x) |
