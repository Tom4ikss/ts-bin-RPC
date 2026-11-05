# Suite `generated`

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, commit 0fad8d0.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 8.17 µs | 4.13 µs | 6.03 µs | 4.53 µs |
| 10 users, all fields | hand-written (codec3) | 1.96 µs (4.20x) | 2.01 µs (2.06x) | 3.43 µs (1.76x) | 3.36 µs (1.35x) |
| 10 users, all fields | generated | 2.31 µs (3.54x) | 2.41 µs (1.71x) | 3.64 µs (1.65x) | 3.47 µs (1.31x) |
| 10 users, all fields | generated + verify | 2.88 µs (2.84x) | 2.86 µs (1.44x) | 4.67 µs (1.29x) | 4.05 µs (1.12x) |
| 10 users, all fields | generated, decode (plain) | 2.27 µs (3.60x) | 2.36 µs (1.76x) | 3.83 µs (1.57x) | 3.36 µs (1.35x) |
| 1000 users, all fields | JSON | 915 µs | 617 µs | 541 µs | 515 µs |
| 1000 users, all fields | hand-written (codec3) | 88 µs (10.35x) | 105 µs (5.88x) | 116 µs (4.65x) | 133 µs (3.88x) |
| 1000 users, all fields | generated | 105 µs (8.72x) | 133 µs (4.65x) | 126 µs (4.29x) | 123 µs (4.19x) |
| 1000 users, all fields | generated + verify | 117 µs (7.82x) | 145 µs (4.29x) | 139 µs (3.89x) | 134 µs (3.83x) |
| 1000 users, all fields | generated, decode (plain) | 89 µs (10.32x) | 101 µs (6.07x) | 124 µs (4.38x) | 117 µs (4.37x) |
| 1000 users, 2 fields | JSON | 908 µs | 614 µs | 539 µs | 515 µs |
| 1000 users, 2 fields | hand-written (codec3) | 44 µs (20.41x) | 50 µs (12.16x) | 56 µs (9.55x) | 83 µs (6.22x) |
| 1000 users, 2 fields | generated | 46 µs (19.91x) | 59 µs (10.43x) | 60 µs (9.05x) | 74 µs (6.92x) |
| 1000 users, 2 fields | generated + verify | 58 µs (15.82x) | 68 µs (9.03x) | 71 µs (7.55x) | 88 µs (5.89x) |
| 1000 users, 2 fields | generated, decode (plain) | 83 µs (10.98x) | 99 µs (6.23x) | 120 µs (4.47x) | 113 µs (4.56x) |
| 1000 users, numbers only | JSON | 916 µs | 614 µs | 539 µs | 520 µs |
| 1000 users, numbers only | hand-written (codec3) | 17 µs (54.47x) | 16 µs (37.68x) | 14 µs (37.27x) | 13 µs (39.51x) |
| 1000 users, numbers only | generated | 22 µs (41.70x) | 21 µs (28.93x) | 17 µs (32.64x) | 13 µs (38.69x) |
| 1000 users, numbers only | generated + verify | 40 µs (22.83x) | 46 µs (13.31x) | 34 µs (15.70x) | 69 µs (7.51x) |
| 1000 users, numbers only | generated, decode (plain) | 84 µs (10.90x) | 99 µs (6.23x) | 121 µs (4.47x) | 119 µs (4.39x) |
| 1 user, all fields | JSON | 1.18 µs | 0.85 µs | 1.13 µs | 0.85 µs |
| 1 user, all fields | generated | 0.72 µs (1.64x) | 0.73 µs (1.18x) | 1.24 µs (0.91x) | 1.05 µs (0.81x) |
| 1 user, all fields | generated + verify | 0.91 µs (1.29x) | 0.91 µs (0.95x) | 1.66 µs (0.68x) | 1.30 µs (0.66x) |
| page of 1000 users, all fields | JSON | 930 µs | 619 µs | 528 µs | 515 µs |
| page of 1000 users, all fields | generated | 125 µs (7.44x) | 120 µs (5.14x) | 127 µs (4.15x) | 129 µs (4.03x) |
| page of 1000 users, all fields | generated, decode (plain) | 97 µs (9.64x) | 109 µs (5.67x) | 123 µs (4.29x) | 119 µs (4.31x) |
| 500 products (long text), all fields | JSON | 498 µs | 206 µs | 403 µs | 297 µs |
| 500 products (long text), all fields | generated | 79 µs (6.25x) | 84 µs (2.44x) | 132 µs (3.06x) | 91 µs (3.28x) |
| 500 products (long text), all fields | generated + verify | 100 µs (4.96x) | 104 µs (1.97x) | 156 µs (2.59x) | 109 µs (2.74x) |
| 100k points, every value | JSON, number arrays | 24.3 ms | 15.6 ms | 28.9 ms | 15.9 ms |
| 100k points, every value | generated | 159 µs (152.52x) | 789 µs (19.87x) | 253 µs (114.36x) ~ | 791 µs (20.13x) ~ |
| 100k points, every value | generated + verify | 160 µs (152.23x) | 789 µs (19.83x) | 253 µs (114.36x) ~ | 789 µs (20.15x) ~ |
| encode 1000 users | JSON | 790 µs | 920 µs | 513 µs | 434 µs |
| encode 1000 users | hand-written (codec3) | 457 µs (1.73x) | 332 µs (2.78x) | 355 µs (1.45x) | 667 µs (0.66x) ~ |
| encode 1000 users | generated | 332 µs (2.35x) | 317 µs (2.89x) | 353 µs (1.45x) | 247 µs (1.74x) |
| encode 500 products | JSON | 476 µs | 546 µs | 333 µs | 511 µs |
| encode 500 products | generated | 269 µs (1.75x) | 533 µs (1.03x) | 318 µs (1.05x) | 486 µs (1.05x) |
| encode 100k points | JSON, number arrays | 42.5 ms | 36.0 ms | 40.7 ms | 28.6 ms |
| encode 100k points | generated | 485 µs (88.04x) ~ | 909 µs (39.50x) | 1.0 ms (40.35x) | 1.1 ms (25.55x) |
