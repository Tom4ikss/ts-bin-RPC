# Suite `generated`

2026-11-06, AMD EPYC 9V45 96-Core Processor, linux 7.0.0-1019-azure, commit 89208a7.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.57 µs | 2.38 µs | 3.49 µs | 2.67 µs |
| 10 users, all fields | hand-written (codec3) | 1.15 µs (4.03x) | 1.18 µs (2.02x) | 2.12 µs (1.64x) | 1.99 µs (1.34x) |
| 10 users, all fields | generated | 1.35 µs (3.39x) | 1.50 µs (1.59x) | 2.40 µs (1.44x) | 2.05 µs (1.31x) |
| 10 users, all fields | generated + verify | 1.69 µs (2.71x) | 1.81 µs (1.32x) | 2.83 µs (1.22x) | 2.47 µs (1.09x) |
| 10 users, all fields | generated, decode (plain) | 1.34 µs (3.41x) | 1.46 µs (1.64x) | 2.34 µs (1.49x) | 2.01 µs (1.33x) |
| 1000 users, all fields | JSON | 543 µs | 393 µs | 278 µs | 288 µs |
| 1000 users, all fields | hand-written (codec3) | 52 µs (10.54x) | 67 µs (5.90x) | 68 µs (4.12x) | 74 µs (3.91x) |
| 1000 users, all fields | generated | 60 µs (9.12x) | 82 µs (4.78x) | 78 µs (3.59x) | 69 µs (4.20x) |
| 1000 users, all fields | generated + verify | 66 µs (8.25x) | 87 µs (4.47x) | 85 µs (3.30x) | 77 µs (3.77x) |
| 1000 users, all fields | generated, decode (plain) | 49 µs (11.11x) | 62 µs (6.43x) | 78 µs (3.60x) | 65 µs (4.50x) |
| 1000 users, 2 fields | JSON | 539 µs | 389 µs | 276 µs | 286 µs |
| 1000 users, 2 fields | hand-written (codec3) | 25 µs (21.78x) | 31 µs (12.57x) | 32 µs (8.59x) | 46 µs (6.32x) |
| 1000 users, 2 fields | generated | 24 µs (22.05x) | 36 µs (10.92x) | 36 µs (7.67x) | 43 µs (6.67x) |
| 1000 users, 2 fields | generated + verify | 31 µs (17.56x) | 42 µs (9.42x) | 43 µs (6.41x) | 51 µs (5.72x) |
| 1000 users, 2 fields | generated, decode (plain) | 45 µs (11.97x) | 59 µs (6.65x) | 76 µs (3.65x) | 61 µs (4.75x) ~ |
| 1000 users, numbers only | JSON | 545 µs | 388 µs | 276 µs | 284 µs |
| 1000 users, numbers only | hand-written (codec3) | 10 µs (53.76x) | 10 µs (38.62x) | 8.60 µs (32.19x) | 8.73 µs (32.35x) |
| 1000 users, numbers only | generated | 12 µs (44.28x) | 13 µs (30.63x) | 10 µs (27.16x) | 8.78 µs (32.37x) |
| 1000 users, numbers only | generated + verify | 22 µs (24.81x) | 27 µs (14.48x) | 22 µs (12.95x) | 36 µs (7.83x) |
| 1000 users, numbers only | generated, decode (plain) | 47 µs (11.78x) | 58 µs (6.66x) | 76 µs (3.64x) | 62 µs (4.54x) |
| 1 user, all fields | JSON | 0.62 µs | 0.51 µs | 0.69 µs | 0.49 µs |
| 1 user, all fields | generated | 0.37 µs (1.66x) | 0.42 µs (1.21x) | 0.72 µs (0.99x) | 0.61 µs (0.80x) |
| 1 user, all fields | generated + verify | 0.52 µs (1.19x) | 0.54 µs (0.94x) | 1.06 µs (0.65x) | 0.80 µs (0.62x) |
| page of 1000 users, all fields | JSON | 549 µs | 400 µs | 278 µs | 286 µs |
| page of 1000 users, all fields | generated | 72 µs (7.59x) | 74 µs (5.33x) | 78 µs (3.53x) | 72 µs (4.00x) |
| page of 1000 users, all fields | generated, decode (plain) | 53 µs (10.41x) | 64 µs (6.20x) | 78 µs (3.58x) | 65 µs (4.44x) |
| 500 products (long text), all fields | JSON | 292 µs | 108 µs | 216 µs | 182 µs |
| 500 products (long text), all fields | generated | 44 µs (6.65x) | 52 µs (2.09x) | 77 µs (2.82x) | 53 µs (3.50x) |
| 500 products (long text), all fields | generated + verify | 54 µs (5.45x) | 62 µs (1.75x) | 89 µs (2.41x) | 63 µs (2.94x) |
| 100k points, every value | JSON, number arrays | 14.2 ms | 10.2 ms | 15.8 ms | 9.1 ms |
| 100k points, every value | generated | 93 µs (154.03x) | 423 µs (24.14x) | 126 µs (125.68x) | 364 µs (24.89x) |
| 100k points, every value | generated + verify | 93 µs (153.77x) | 426 µs (23.69x) | 128 µs (125.29x) | 365 µs (24.87x) |
| encode 1000 users | JSON | 461 µs | 547 µs | 274 µs | 236 µs |
| encode 1000 users | hand-written (codec3) | 237 µs (1.97x) | 200 µs (2.72x) | 164 µs (1.68x) | 102 µs (2.28x) |
| encode 1000 users | generated | 161 µs (2.87x) | 184 µs (2.96x) | 155 µs (1.77x) | 124 µs (1.91x) |
| encode 500 products | JSON | 282 µs | 372 µs | 203 µs | 267 µs |
| encode 500 products | generated | 159 µs (1.78x) | 358 µs (1.03x) | 162 µs (1.27x) | 259 µs (1.04x) |
| encode 100k points | JSON, number arrays | 26.1 ms | 24.0 ms | 25.1 ms | 17.1 ms |
| encode 100k points | generated | 428 µs (61.28x) ~ | 651 µs (37.15x) | 717 µs (34.74x) | 821 µs (20.84x) |
