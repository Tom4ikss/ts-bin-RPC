# Suite `generated`

2026-11-03, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.51 µs | 2.08 µs | 3.38 µs | 2.56 µs |
| 10 users, all fields | hand-written (codec3) | 1.09 µs (4.15x) | 1.13 µs (1.83x) | 1.54 µs (2.20x) | 1.62 µs (1.59x) |
| 10 users, all fields | generated | 1.14 µs (3.97x) | 1.25 µs (1.66x) | 1.88 µs (1.80x) | 1.63 µs (1.58x) |
| 10 users, all fields | generated + verify | 1.62 µs (2.79x) | 1.62 µs (1.29x) | 2.47 µs (1.37x) | 1.99 µs (1.29x) |
| 10 users, all fields | generated, decode (plain) | 1.25 µs (3.60x) | 1.29 µs (1.62x) | 2.00 µs (1.69x) | 1.68 µs (1.53x) |
| 1000 users, all fields | JSON | 467 µs | 214 µs | 322 µs | 282 µs |
| 1000 users, all fields | hand-written (codec3) | 56 µs (8.34x) | 63 µs (3.38x) | 67 µs (4.78x) | 74 µs (3.79x) |
| 1000 users, all fields | generated | 58 µs (8.10x) | 72 µs (2.99x) | 77 µs (4.15x) | 68 µs (4.15x) |
| 1000 users, all fields | generated + verify | 81 µs (5.75x) ~ | 89 µs (2.41x) | 94 µs (3.42x) | 83 µs (3.39x) |
| 1000 users, all fields | generated, decode (plain) | 64 µs (7.28x) ~ | 70 µs (3.07x) | 88 µs (3.64x) | 71 µs (3.99x) |
| 1000 users, 2 fields | JSON | 465 µs | 211 µs | 316 µs | 281 µs |
| 1000 users, 2 fields | hand-written (codec3) | 30 µs (15.40x) | 33 µs (6.47x) | 32 µs (9.79x) | 48 µs (5.88x) |
| 1000 users, 2 fields | generated | 28 µs (16.56x) | 35 µs (6.02x) | 36 µs (8.85x) | 46 µs (6.07x) |
| 1000 users, 2 fields | generated + verify | 52 µs (8.96x) | 53 µs (3.98x) | 51 µs (6.17x) | 61 µs (4.57x) |
| 1000 users, 2 fields | generated, decode (plain) | 61 µs (7.59x) | 62 µs (3.42x) | 85 µs (3.70x) | 66 µs (4.24x) |
| 1000 users, numbers only | JSON | 467 µs | 212 µs | 311 µs | 280 µs |
| 1000 users, numbers only | hand-written (codec3) | 11 µs (40.77x) | 9.65 µs (21.95x) | 8.42 µs (36.90x) | 7.92 µs (35.42x) |
| 1000 users, numbers only | generated | 13 µs (37.36x) | 10 µs (20.37x) | 9.18 µs (33.84x) | 7.92 µs (35.39x) |
| 1000 users, numbers only | generated + verify | 42 µs (11.22x) | 39 µs (5.43x) | 28 µs (10.94x) ~ | 46 µs (6.04x) |
| 1000 users, numbers only | generated, decode (plain) | 61 µs (7.62x) | 62 µs (3.40x) | 85 µs (3.64x) | 68 µs (4.10x) |
| encode 1000 users | JSON | 372 µs | 248 µs | 288 µs | 208 µs |
| encode 1000 users | hand-written (codec3) | 236 µs (1.58x) | 151 µs (1.64x) | 193 µs (1.49x) | 101 µs (2.06x) |
| encode 1000 users | generated | 160 µs (2.32x) | 131 µs (1.89x) | 169 µs (1.70x) | 107 µs (1.94x) |
