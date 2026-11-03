# Suite `generated`

2026-11-03, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.48 µs | 2.12 µs | 3.41 µs | 2.68 µs |
| 10 users, all fields | hand-written (codec3) | 1.05 µs (4.27x) | 1.14 µs (1.86x) | 1.55 µs (2.20x) | 1.67 µs (1.60x) |
| 10 users, all fields | generated | 1.13 µs (3.97x) | 1.23 µs (1.72x) | 1.87 µs (1.82x) | 1.71 µs (1.57x) |
| 10 users, all fields | generated + verify | 1.61 µs (2.78x) | 1.61 µs (1.31x) | 2.45 µs (1.39x) | 2.08 µs (1.29x) |
| 10 users, all fields | generated, decode (plain) | 1.25 µs (3.59x) | 1.30 µs (1.63x) | 1.98 µs (1.72x) | 1.80 µs (1.49x) |
| 1000 users, all fields | JSON | 476 µs | 213 µs | 328 µs | 292 µs |
| 1000 users, all fields | hand-written (codec3) | 57 µs (8.34x) | 63 µs (3.36x) | 70 µs (4.68x) | 77 µs (3.78x) |
| 1000 users, all fields | generated | 58 µs (8.13x) | 68 µs (3.15x) | 79 µs (4.17x) | 71 µs (4.14x) |
| 1000 users, all fields | generated + verify | 83 µs (5.70x) | 85 µs (2.50x) | 94 µs (3.50x) | 85 µs (3.42x) |
| 1000 users, all fields | generated, decode (plain) | 65 µs (7.37x) | 73 µs (2.90x) | 86 µs (3.82x) | 74 µs (3.95x) |
| 1000 users, 2 fields | JSON | 469 µs | 210 µs | 329 µs | 281 µs |
| 1000 users, 2 fields | hand-written (codec3) | 30 µs (15.71x) | 37 µs (5.75x) | 34 µs (9.69x) | 48 µs (5.90x) |
| 1000 users, 2 fields | generated | 28 µs (16.74x) | 33 µs (6.38x) | 37 µs (8.96x) | 47 µs (5.99x) |
| 1000 users, 2 fields | generated + verify | 53 µs (8.87x) | 51 µs (4.09x) | 53 µs (6.22x) | 63 µs (4.46x) |
| 1000 users, 2 fields | generated, decode (plain) | 62 µs (7.60x) | 66 µs (3.21x) | 86 µs (3.84x) | 69 µs (4.07x) |
| 1000 users, numbers only | JSON | 471 µs | 211 µs | 323 µs | 287 µs |
| 1000 users, numbers only | hand-written (codec3) | 12 µs (40.00x) | 9.85 µs (21.40x) | 8.75 µs (36.95x) | 8.22 µs (34.91x) |
| 1000 users, numbers only | generated | 13 µs (37.12x) | 11 µs (19.05x) | 9.27 µs (34.86x) ~ | 8.31 µs (34.52x) |
| 1000 users, numbers only | generated + verify | 42 µs (11.12x) | 40 µs (5.30x) | 30 µs (10.95x) ~ | 48 µs (6.02x) |
| 1000 users, numbers only | generated, decode (plain) | 62 µs (7.57x) | 66 µs (3.17x) | 83 µs (3.92x) ~ | 70 µs (4.09x) |
| encode 1000 users | JSON | 379 µs | 252 µs | 295 µs | 205 µs |
| encode 1000 users | hand-written (codec3) | 229 µs (1.66x) | 151 µs (1.67x) | 199 µs (1.48x) | 99 µs (2.07x) |
| encode 1000 users | generated | 158 µs (2.40x) | 132 µs (1.91x) | 176 µs (1.67x) | 107 µs (1.92x) |
