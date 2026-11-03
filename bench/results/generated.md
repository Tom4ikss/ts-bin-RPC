# Suite `generated`

2026-11-03, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.45 µs | 2.08 µs | 3.27 µs | 2.62 µs |
| 10 users, all fields | hand-written (codec3) | 1.07 µs (4.15x) | 1.12 µs (1.86x) | 1.51 µs (2.17x) | 1.62 µs (1.62x) |
| 10 users, all fields | generated | 1.10 µs (4.06x) | 1.23 µs (1.70x) | 1.84 µs (1.78x) | 1.64 µs (1.60x) |
| 10 users, all fields | generated + verify | 1.59 µs (2.80x) | 1.61 µs (1.29x) | 2.39 µs (1.37x) | 1.99 µs (1.31x) |
| 10 users, all fields | generated, decode (plain) | 1.21 µs (3.68x) ~ | 1.28 µs (1.63x) | 1.98 µs (1.65x) | 1.70 µs (1.54x) ~ |
| 1000 users, all fields | JSON | 448 µs | 209 µs | 310 µs | 283 µs |
| 1000 users, all fields | hand-written (codec3) | 56 µs (8.00x) | 62 µs (3.37x) | 66 µs (4.73x) | 75 µs (3.80x) |
| 1000 users, all fields | generated | 56 µs (8.02x) | 71 µs (2.93x) | 76 µs (4.07x) | 69 µs (4.12x) |
| 1000 users, all fields | generated + verify | 80 µs (5.58x) | 90 µs (2.34x) | 92 µs (3.38x) | 85 µs (3.34x) |
| 1000 users, all fields | generated, decode (plain) | 64 µs (7.04x) | 71 µs (2.96x) | 86 µs (3.61x) | 72 µs (3.96x) |
| 1000 users, 2 fields | JSON | 440 µs | 209 µs | 311 µs | 283 µs |
| 1000 users, 2 fields | hand-written (codec3) | 29 µs (15.36x) | 35 µs (5.90x) | 32 µs (9.65x) | 47 µs (5.99x) |
| 1000 users, 2 fields | generated | 27 µs (16.21x) | 32 µs (6.45x) | 36 µs (8.62x) ~ | 46 µs (6.11x) |
| 1000 users, 2 fields | generated + verify | 50 µs (8.82x) | 51 µs (4.13x) | 51 µs (6.04x) | 61 µs (4.66x) |
| 1000 users, 2 fields | generated, decode (plain) | 60 µs (7.28x) | 65 µs (3.24x) | 86 µs (3.63x) | 68 µs (4.16x) |
| 1000 users, numbers only | JSON | 449 µs | 211 µs | 308 µs | 285 µs |
| 1000 users, numbers only | hand-written (codec3) | 11 µs (40.35x) | 9.61 µs (21.93x) | 8.36 µs (36.86x) | 8.33 µs (34.20x) |
| 1000 users, numbers only | generated | 13 µs (35.21x) | 10 µs (20.41x) | 9.21 µs (33.48x) | 8.35 µs (34.10x) |
| 1000 users, numbers only | generated + verify | 40 µs (11.13x) | 38 µs (5.49x) | 28 µs (10.86x) | 47 µs (6.08x) |
| 1000 users, numbers only | generated, decode (plain) | 62 µs (7.26x) | 65 µs (3.22x) | 85 µs (3.64x) | 70 µs (4.06x) |
| 1 user, all fields | JSON | 0.59 µs | 0.40 µs | 0.47 µs | 0.47 µs |
| 1 user, all fields | generated | 0.28 µs (2.08x) | 0.33 µs (1.19x) | 0.49 µs (0.94x) | 0.45 µs (1.04x) |
| 1 user, all fields | generated + verify | 0.39 µs (1.51x) ~ | 0.42 µs (0.94x) | 0.70 µs (0.66x) | 0.56 µs (0.83x) |
| 500 products (long text), all fields | JSON | 223 µs | 107 µs | 262 µs | 165 µs |
| 500 products (long text), all fields | generated | 41 µs (5.39x) | 51 µs (2.09x) | 82 µs (3.20x) | 62 µs (2.68x) |
| 500 products (long text), all fields | generated + verify | 134 µs (1.66x) | 117 µs (0.91x) | 133 µs (1.97x) | 111 µs (1.48x) |
| 100k points, every value | JSON, number arrays | 13.2 ms ~ | 7.8 ms | 15.9 ms ~ | 9.5 ms |
| 100k points, every value | generated | 97 µs (136.80x) | 515 µs (15.10x) | 134 µs (118.53x) ~ | 441 µs (21.53x) |
| 100k points, every value | generated + verify | 97 µs (137.19x) | 442 µs (17.60x) | 135 µs (117.51x) ~ | 440 µs (21.56x) |
| encode 1000 users | JSON | 377 µs | 263 µs | 282 µs | 207 µs |
| encode 1000 users | hand-written (codec3) | 236 µs (1.60x) | 159 µs (1.65x) | 188 µs (1.50x) | 101 µs (2.04x) |
| encode 1000 users | generated | 161 µs (2.34x) | 137 µs (1.91x) | 166 µs (1.70x) | 111 µs (1.86x) |
| encode 500 products | JSON | 188 µs | 142 µs | 187 µs | 62 µs |
| encode 500 products | generated | 126 µs (1.50x) | 161 µs (0.88x) | 175 µs (1.07x) | 200 µs (0.31x) |
| encode 100k points | JSON, number arrays | 21.1 ms | 10.6 ms | 22.6 ms | 7.4 ms |
| encode 100k points | generated | 44 µs (476.13x) ~ | 127 µs (83.51x) ~ | 151 µs (149.75x) | 59 µs (124.96x) |
