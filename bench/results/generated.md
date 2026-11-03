# Suite `generated`

2026-11-03, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.41 µs ~ | 2.09 µs | 3.32 µs | 2.65 µs |
| 10 users, all fields | hand-written (codec3) | 1.06 µs (4.15x) | 1.12 µs (1.87x) | 1.52 µs (2.19x) | 1.60 µs (1.65x) |
| 10 users, all fields | generated | 1.09 µs (4.03x) | 1.23 µs (1.70x) | 1.86 µs (1.78x) | 1.62 µs (1.63x) |
| 10 users, all fields | generated + verify | 1.35 µs (3.26x) | 1.44 µs (1.45x) | 2.24 µs (1.48x) | 1.85 µs (1.43x) |
| 10 users, all fields | generated, decode (plain) | 1.20 µs (3.68x) | 1.28 µs (1.63x) | 2.05 µs (1.62x) | 1.67 µs (1.59x) |
| 1000 users, all fields | JSON | 471 µs | 211 µs | 318 µs | 282 µs |
| 1000 users, all fields | hand-written (codec3) | 58 µs (8.17x) | 63 µs (3.35x) | 67 µs (4.71x) | 73 µs (3.86x) |
| 1000 users, all fields | generated | 58 µs (8.09x) | 73 µs (2.88x) | 78 µs (4.07x) | 67 µs (4.18x) |
| 1000 users, all fields | generated + verify | 66 µs (7.14x) | 80 µs (2.63x) | 86 µs (3.69x) | 76 µs (3.70x) |
| 1000 users, all fields | generated, decode (plain) | 64 µs (7.31x) ~ | 70 µs (3.03x) | 87 µs (3.63x) | 70 µs (4.03x) |
| 1000 users, 2 fields | JSON | 460 µs | 208 µs | 310 µs | 280 µs |
| 1000 users, 2 fields | hand-written (codec3) | 30 µs (15.56x) | 33 µs (6.34x) | 32 µs (9.63x) | 46 µs (6.03x) |
| 1000 users, 2 fields | generated | 28 µs (16.54x) | 36 µs (5.87x) | 36 µs (8.65x) | 45 µs (6.26x) |
| 1000 users, 2 fields | generated + verify | 36 µs (12.73x) | 42 µs (4.92x) | 44 µs (6.99x) | 53 µs (5.29x) |
| 1000 users, 2 fields | generated, decode (plain) | 60 µs (7.66x) | 63 µs (3.33x) | 85 µs (3.63x) | 66 µs (4.22x) |
| 1000 users, numbers only | JSON | 460 µs | 209 µs | 309 µs | 277 µs |
| 1000 users, numbers only | hand-written (codec3) | 11 µs (40.37x) ~ | 9.63 µs (21.71x) | 8.50 µs (36.32x) | 7.71 µs (35.97x) |
| 1000 users, numbers only | generated | 13 µs (36.69x) | 11 µs (19.79x) | 9.28 µs (33.26x) | 7.71 µs (35.99x) |
| 1000 users, numbers only | generated + verify | 26 µs (17.66x) | 29 µs (7.33x) | 22 µs (14.35x) | 39 µs (7.18x) |
| 1000 users, numbers only | generated, decode (plain) | 61 µs (7.52x) | 63 µs (3.29x) | 85 µs (3.65x) | 67 µs (4.15x) |
| 1 user, all fields | JSON | 0.59 µs ~ | 0.40 µs | 0.46 µs | 0.47 µs |
| 1 user, all fields | generated | 0.28 µs (2.10x) | 0.34 µs (1.19x) | 0.49 µs (0.94x) | 0.44 µs (1.07x) |
| 1 user, all fields | generated + verify | 0.36 µs (1.64x) | 0.43 µs (0.94x) | 0.62 µs (0.74x) | 0.51 µs (0.92x) |
| 500 products (long text), all fields | JSON | 227 µs | 106 µs | 260 µs | 159 µs |
| 500 products (long text), all fields | generated | 42 µs (5.46x) | 51 µs (2.07x) | 81 µs (3.21x) | 60 µs (2.64x) |
| 500 products (long text), all fields | generated + verify | 57 µs (3.99x) | 65 µs (1.64x) | 97 µs (2.68x) | 76 µs (2.08x) |
| 100k points, every value | JSON, number arrays | 12.8 ms | 7.9 ms | 15.7 ms | 9.2 ms |
| 100k points, every value | generated | 94 µs (136.46x) | 519 µs (15.18x) | 136 µs (115.29x) ~ | 436 µs (21.18x) |
| 100k points, every value | generated + verify | 94 µs (135.98x) | 443 µs (17.78x) | 163 µs (96.51x) ~ | 436 µs (21.19x) |
| encode 1000 users | JSON | 366 µs | 269 µs | 290 µs | 205 µs |
| encode 1000 users | hand-written (codec3) | 225 µs (1.63x) | 165 µs (1.63x) | 194 µs (1.49x) ~ | 101 µs (2.02x) |
| encode 1000 users | generated | 155 µs (2.36x) | 143 µs (1.88x) | 175 µs (1.65x) ~ | 90 µs (2.28x) |
| encode 500 products | JSON | 187 µs | 155 µs | 185 µs | 61 µs |
| encode 500 products | generated | 131 µs (1.43x) | 166 µs (0.93x) | 176 µs (1.05x) | 99 µs (0.62x) |
| encode 100k points | JSON, number arrays | 20.6 ms | 10.9 ms | 22.0 ms | 7.3 ms |
| encode 100k points | generated | 42 µs (495.62x) | 121 µs (90.23x) | 123 µs (178.52x) | 50 µs (145.69x) |
