# Suite `generated`

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, commit 772fde7.
Median of 7 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 8.49 µs | 4.59 µs | 6.28 µs | 4.53 µs |
| 10 users, all fields | hand-written (codec3) | 1.98 µs (4.30x) | 2.00 µs (2.30x) | 3.33 µs (1.90x) | 3.30 µs (1.37x) |
| 10 users, all fields | generated | 3.60 µs (2.36x) | 2.53 µs (1.80x) | 6.36 µs (1.00x) ~ | 3.67 µs (1.23x) |
| 10 users, all fields | generated + verify | 4.11 µs (2.07x) | 4.18 µs (1.10x) | 8.40 µs (0.73x) | 4.24 µs (1.07x) |
| 10 users, all fields | generated, decode (plain) | 3.83 µs (2.23x) | 3.08 µs (1.49x) | 7.72 µs (0.82x) | 3.79 µs (1.19x) |
| 1000 users, all fields | JSON | 955 µs | 625 µs | 599 µs | 512 µs |
| 1000 users, all fields | hand-written (codec3) | 89 µs (10.55x) | 110 µs (5.69x) | 122 µs (4.90x) | 131 µs (3.90x) |
| 1000 users, all fields | generated | 123 µs (7.67x) | 118 µs (5.45x) | 194 µs (2.97x) ~ | 119 µs (4.34x) |
| 1000 users, all fields | generated + verify | 135 µs (6.92x) | 143 µs (4.37x) | 308 µs (1.99x) ~ | 129 µs (3.95x) |
| 1000 users, all fields | generated, decode (plain) | 147 µs (6.44x) | 147 µs (4.27x) | 395 µs (1.51x) ~ | 130 µs (3.97x) |
| 1000 users, 2 fields | JSON | 973 µs | 626 µs | 592 µs | 509 µs |
| 1000 users, 2 fields | hand-written (codec3) | 44 µs (22.09x) | 51 µs (11.97x) | 57 µs (10.20x) | 81 µs (6.25x) |
| 1000 users, 2 fields | generated | 56 µs (17.27x) | 58 µs (11.25x) | 88 µs (6.86x) | 72 µs (7.12x) |
| 1000 users, 2 fields | generated + verify | 68 µs (14.18x) | 71 µs (8.95x) | 110 µs (5.43x) | 85 µs (6.00x) |
| 1000 users, 2 fields | generated, decode (plain) | 137 µs (7.04x) | 126 µs (4.96x) | 310 µs (1.87x) | 125 µs (4.09x) |
| 1000 users, numbers only | JSON | 981 µs | 641 µs | 533 µs | 508 µs |
| 1000 users, numbers only | hand-written (codec3) | 17 µs (58.45x) | 17 µs (37.98x) | 22 µs (24.98x) ~ | 12 µs (43.01x) |
| 1000 users, numbers only | generated | 19 µs (52.71x) | 18 µs (36.03x) | 17 µs (32.30x) ~ | 12 µs (42.84x) |
| 1000 users, numbers only | generated + verify | 38 µs (25.76x) | 43 µs (14.83x) | 35 µs (15.31x) ~ | 68 µs (7.47x) |
| 1000 users, numbers only | generated, decode (plain) | 137 µs (7.15x) | 114 µs (5.66x) | 153 µs (3.68x) ~ | 127 µs (4.03x) |
| 1 user, all fields | JSON | 1.18 µs | 0.84 µs | 1.11 µs | 0.84 µs |
| 1 user, all fields | generated | 0.71 µs (1.66x) | 0.71 µs (1.20x) | 1.23 µs (0.89x) | 1.04 µs (0.81x) |
| 1 user, all fields | generated + verify | 0.90 µs (1.27x) | 0.90 µs (0.95x) | 1.63 µs (0.68x) | 1.26 µs (0.67x) |
| 500 products (long text), all fields | JSON | 533 µs | 233 µs | 477 µs | 287 µs |
| 500 products (long text), all fields | generated | 127 µs (4.16x) | 84 µs (2.76x) | 378 µs (1.34x) ~ | 87 µs (3.33x) |
| 500 products (long text), all fields | generated + verify | 159 µs (3.35x) | 137 µs (1.70x) | 442 µs (1.07x) ~ | 104 µs (2.77x) |
| 100k points, every value | JSON, number arrays | 24.3 ms | 15.2 ms | 28.5 ms | 15.8 ms |
| 100k points, every value | generated | 160 µs (152.59x) | 761 µs (19.99x) | 254 µs (113.73x) ~ | 793 µs (19.86x) ~ |
| 100k points, every value | generated + verify | 160 µs (152.45x) | 777 µs (19.71x) | 222 µs (126.11x) ~ | 792 µs (19.97x) ~ |
| encode 1000 users | JSON | 802 µs | 935 µs | 509 µs | 425 µs |
| encode 1000 users | hand-written (codec3) | 451 µs (1.71x) | 342 µs (2.74x) | 381 µs (1.34x) | 668 µs (0.65x) ~ |
| encode 1000 users | generated | 329 µs (2.39x) | 315 µs (2.97x) | 345 µs (1.48x) | 240 µs (1.77x) |
| encode 500 products | JSON | 475 µs | 572 µs | 334 µs | 500 µs |
| encode 500 products | generated | 250 µs (1.92x) | 560 µs (1.04x) | 308 µs (1.10x) | 475 µs (1.05x) |
| encode 100k points | JSON, number arrays | 41.7 ms | 36.8 ms | 41.0 ms | 28.7 ms |
| encode 100k points | generated | 311 µs (133.59x) ~ | 937 µs (39.24x) | 1.0 ms (40.38x) | 1.1 ms (25.89x) |
