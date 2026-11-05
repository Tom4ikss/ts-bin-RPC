# Suite `generated`

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, commit 9c39e84.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 8.19 µs | 4.11 µs | 6.04 µs | 4.53 µs |
| 10 users, all fields | hand-written (codec3) | 1.95 µs (4.20x) | 2.01 µs (2.05x) | 3.41 µs (1.76x) | 3.35 µs (1.35x) |
| 10 users, all fields | generated | 2.30 µs (3.55x) | 2.40 µs (1.70x) | 3.65 µs (1.65x) | 3.44 µs (1.31x) |
| 10 users, all fields | generated + verify | 2.87 µs (2.85x) | 2.87 µs (1.43x) | 4.68 µs (1.29x) | 4.03 µs (1.12x) |
| 10 users, all fields | generated, decode (plain) | 2.26 µs (3.63x) | 2.35 µs (1.76x) | 3.78 µs (1.60x) | 3.35 µs (1.35x) |
| 1000 users, all fields | JSON | 919 µs | 614 µs | 542 µs | 515 µs |
| 1000 users, all fields | hand-written (codec3) | 88 µs (10.45x) | 104 µs (5.89x) | 117 µs (4.64x) | 132 µs (3.90x) |
| 1000 users, all fields | generated | 106 µs (8.69x) | 134 µs (4.59x) | 126 µs (4.31x) | 121 µs (4.25x) |
| 1000 users, all fields | generated + verify | 118 µs (7.80x) | 144 µs (4.28x) | 139 µs (3.92x) | 132 µs (3.91x) |
| 1000 users, all fields | generated, decode (plain) | 89 µs (10.36x) | 102 µs (6.04x) | 124 µs (4.39x) | 117 µs (4.37x) |
| 1000 users, 2 fields | JSON | 919 µs | 612 µs | 539 µs | 516 µs |
| 1000 users, 2 fields | hand-written (codec3) | 44 µs (20.86x) | 50 µs (12.18x) | 56 µs (9.60x) | 83 µs (6.29x) |
| 1000 users, 2 fields | generated | 45 µs (20.26x) | 59 µs (10.45x) | 59 µs (9.13x) | 74 µs (6.97x) |
| 1000 users, 2 fields | generated + verify | 57 µs (16.13x) | 68 µs (9.01x) | 71 µs (7.61x) | 86 µs (5.97x) |
| 1000 users, 2 fields | generated, decode (plain) | 82 µs (11.14x) | 99 µs (6.18x) | 121 µs (4.47x) | 112 µs (4.60x) |
| 1000 users, numbers only | JSON | 921 µs | 608 µs | 538 µs | 517 µs |
| 1000 users, numbers only | hand-written (codec3) | 17 µs (54.95x) | 16 µs (37.62x) | 14 µs (37.22x) | 13 µs (40.90x) |
| 1000 users, numbers only | generated | 22 µs (41.99x) | 21 µs (28.75x) | 16 µs (32.91x) | 13 µs (39.92x) |
| 1000 users, numbers only | generated + verify | 40 µs (23.10x) | 46 µs (13.22x) | 34 µs (15.74x) | 69 µs (7.53x) |
| 1000 users, numbers only | generated, decode (plain) | 84 µs (11.04x) | 99 µs (6.18x) | 121 µs (4.46x) | 120 µs (4.29x) |
| 1 user, all fields | JSON | 1.19 µs | 0.86 µs | 1.13 µs | 0.84 µs |
| 1 user, all fields | generated | 0.71 µs (1.66x) | 0.73 µs (1.19x) | 1.22 µs (0.92x) | 1.05 µs (0.80x) |
| 1 user, all fields | generated + verify | 0.89 µs (1.32x) | 0.90 µs (0.95x) | 1.66 µs (0.68x) | 1.30 µs (0.65x) |
| page of 1000 users, all fields | JSON | 937 µs | 617 µs | 531 µs | 519 µs |
| page of 1000 users, all fields | generated | 126 µs (7.51x) | 121 µs (5.10x) | 127 µs (4.19x) | 131 µs (3.97x) |
| page of 1000 users, all fields | generated, decode (plain) | 96 µs (9.71x) | 110 µs (5.62x) | 124 µs (4.31x) | 121 µs (4.26x) |
| 500 products (long text), all fields | JSON | 496 µs | 205 µs | 401 µs | 291 µs |
| 500 products (long text), all fields | generated | 79 µs (6.27x) | 84 µs (2.44x) | 133 µs (3.03x) | 91 µs (3.19x) |
| 500 products (long text), all fields | generated + verify | 100 µs (4.97x) | 103 µs (1.99x) | 157 µs (2.55x) | 107 µs (2.71x) |
| 100k points, every value | JSON, number arrays | 24.3 ms | 15.5 ms | 28.9 ms | 15.6 ms |
| 100k points, every value | generated | 159 µs (152.58x) | 816 µs (19.07x) | 222 µs (130.25x) ~ | 789 µs (20.08x) ~ |
| 100k points, every value | generated + verify | 159 µs (152.47x) | 816 µs (19.03x) | 222 µs (127.91x) ~ | 778 µs (20.09x) ~ |
| encode 1000 users | JSON | 765 µs | 915 µs | 509 µs | 425 µs |
| encode 1000 users | hand-written (codec3) | 432 µs (1.76x) | 330 µs (2.77x) | 349 µs (1.45x) | 187 µs (2.22x) ~ |
| encode 1000 users | generated | 333 µs (2.30x) | 316 µs (2.89x) | 351 µs (1.45x) | 244 µs (1.75x) |
| encode 500 products | JSON | 453 µs | 544 µs | 330 µs | 499 µs |
| encode 500 products | generated | 277 µs (1.70x) | 534 µs (1.01x) | 311 µs (1.06x) | 480 µs (1.04x) |
| encode 100k points | JSON, number arrays | 43.0 ms | 35.8 ms | 40.6 ms | 28.6 ms |
| encode 100k points | generated | 508 µs (84.92x) ~ | 905 µs (39.72x) | 998 µs (40.70x) | 1.1 ms (25.92x) |
