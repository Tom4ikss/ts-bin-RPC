# Suite `generated`

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, commit 47adeba.
Median of 5 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 8.46 µs | 4.57 µs | 6.31 µs | 4.54 µs |
| 10 users, all fields | hand-written (codec3) | 2.00 µs (4.22x) | 2.00 µs (2.30x) | 3.44 µs (1.82x) | 3.35 µs (1.36x) |
| 10 users, all fields | generated | 3.69 µs (2.29x) | 2.70 µs (1.77x) | 6.65 µs (0.95x) | 3.71 µs (1.23x) |
| 10 users, all fields | generated + verify | 4.14 µs (2.04x) | 4.18 µs (1.12x) ~ | 9.42 µs (0.65x) ~ | 4.35 µs (1.04x) |
| 10 users, all fields | generated, decode (plain) | 3.93 µs (2.15x) | 3.17 µs (1.47x) | 8.07 µs (0.78x) | 3.92 µs (1.17x) |
| 1000 users, all fields | JSON | 915 µs | 620 µs | 618 µs | 517 µs |
| 1000 users, all fields | hand-written (codec3) | 90 µs (10.16x) | 109 µs (5.68x) | 121 µs (5.12x) | 135 µs (3.85x) |
| 1000 users, all fields | generated | 124 µs (7.39x) | 118 µs (5.24x) | 155 µs (3.87x) ~ | 121 µs (4.30x) |
| 1000 users, all fields | generated + verify | 136 µs (6.83x) | 140 µs (4.43x) | 284 µs (2.17x) | 131 µs (3.94x) |
| 1000 users, all fields | generated, decode (plain) | 149 µs (6.14x) | 145 µs (4.28x) | 392 µs (1.53x) ~ | 129 µs (4.03x) |
| 1000 users, 2 fields | JSON | 969 µs | 621 µs | 598 µs | 517 µs |
| 1000 users, 2 fields | hand-written (codec3) | 45 µs (21.67x) | 51 µs (12.47x) | 58 µs (10.27x) | 82 µs (6.40x) |
| 1000 users, 2 fields | generated | 56 µs (17.34x) | 54 µs (11.50x) | 81 µs (7.21x) | 75 µs (6.96x) |
| 1000 users, 2 fields | generated + verify | 68 µs (14.19x) | 71 µs (8.96x) | 114 µs (5.26x) | 87 µs (6.05x) |
| 1000 users, 2 fields | generated, decode (plain) | 137 µs (7.10x) | 126 µs (5.01x) | 323 µs (1.85x) | 124 µs (4.19x) |
| 1000 users, numbers only | JSON | 977 µs | 626 µs | 539 µs | 517 µs |
| 1000 users, numbers only | hand-written (codec3) | 17 µs (58.13x) | 17 µs (37.05x) | 19 µs (27.65x) ~ | 13 µs (39.91x) |
| 1000 users, numbers only | generated | 19 µs (52.13x) | 18 µs (34.96x) | 16 µs (32.92x) ~ | 13 µs (40.52x) |
| 1000 users, numbers only | generated + verify | 38 µs (25.31x) | 43 µs (14.66x) | 35 µs (15.62x) ~ | 67 µs (7.63x) |
| 1000 users, numbers only | generated, decode (plain) | 138 µs (7.09x) | 114 µs (5.44x) | 148 µs (3.82x) ~ | 130 µs (3.95x) |
| 1 user, all fields | JSON | 1.19 µs | 0.84 µs | 1.12 µs | 0.84 µs |
| 1 user, all fields | generated | 0.72 µs (1.64x) | 0.71 µs (1.19x) | 1.22 µs (0.92x) | 1.04 µs (0.81x) |
| 1 user, all fields | generated + verify | 0.92 µs (1.29x) | 0.90 µs (0.94x) | 1.63 µs (0.69x) | 1.26 µs (0.66x) |
| 500 products (long text), all fields | JSON | 527 µs | 242 µs | 510 µs | 293 µs |
| 500 products (long text), all fields | generated | 129 µs (4.09x) | 90 µs (2.82x) | 375 µs (1.36x) ~ | 88 µs (3.34x) |
| 500 products (long text), all fields | generated + verify | 159 µs (3.28x) | 138 µs (1.83x) | 438 µs (1.18x) ~ | 107 µs (2.77x) |
| 100k points, every value | JSON, number arrays | 24.5 ms | 15.3 ms | 28.8 ms | 15.7 ms |
| 100k points, every value | generated | 159 µs (153.53x) | 818 µs (18.59x) | 191 µs (147.36x) ~ | 764 µs (20.74x) ~ |
| 100k points, every value | generated + verify | 160 µs (153.28x) | 801 µs (19.22x) | 192 µs (147.36x) ~ | 762 µs (20.65x) ~ |
| encode 1000 users | JSON | 795 µs | 926 µs | 510 µs | 427 µs |
| encode 1000 users | hand-written (codec3) | 404 µs (1.95x) | 334 µs (2.78x) | 372 µs (1.37x) | 186 µs (2.31x) ~ |
| encode 1000 users | generated | 297 µs (2.64x) | 316 µs (2.93x) | 337 µs (1.51x) | 245 µs (1.74x) |
| encode 500 products | JSON | 423 µs | 552 µs | 332 µs | 505 µs |
| encode 500 products | generated | 264 µs (1.59x) ~ | 549 µs (1.04x) | 296 µs (1.12x) | 483 µs (1.05x) |
| encode 100k points | JSON, number arrays | 42.0 ms | 36.3 ms | 40.7 ms | 28.5 ms |
| encode 100k points | generated | 434 µs (96.22x) ~ | 925 µs (39.49x) | 1.0 ms (40.66x) | 1.1 ms (25.05x) |
