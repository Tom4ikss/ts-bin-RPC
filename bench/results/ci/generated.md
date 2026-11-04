# Suite `generated`

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, commit 20adab7.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 8.24 µs | 4.12 µs | 6.09 µs | 4.59 µs |
| 10 users, all fields | hand-written (codec3) | 2.01 µs (4.13x) | 2.02 µs (2.04x) | 3.48 µs (1.76x) | 3.44 µs (1.34x) |
| 10 users, all fields | generated | 2.38 µs (3.48x) | 2.40 µs (1.72x) | 4.20 µs (1.46x) | 3.72 µs (1.24x) |
| 10 users, all fields | generated + verify | 2.96 µs (2.80x) | 2.88 µs (1.43x) | 5.09 µs (1.20x) | 4.40 µs (1.05x) |
| 10 users, all fields | generated, decode (plain) | 2.57 µs (3.22x) | 2.45 µs (1.70x) | 4.51 µs (1.35x) | 3.94 µs (1.17x) |
| 1000 users, all fields | JSON | 932 µs | 627 µs | 548 µs | 532 µs |
| 1000 users, all fields | hand-written (codec3) | 89 µs (10.40x) | 106 µs (5.92x) | 117 µs (4.66x) | 137 µs (3.90x) |
| 1000 users, all fields | generated | 97 µs (9.57x) | 132 µs (4.75x) | 122 µs (4.49x) | 124 µs (4.28x) |
| 1000 users, all fields | generated + verify | 110 µs (8.46x) | 143 µs (4.41x) | 136 µs (4.03x) | 135 µs (3.94x) |
| 1000 users, all fields | generated, decode (plain) | 114 µs (8.16x) | 120 µs (5.25x) | 141 µs (3.90x) | 136 µs (3.93x) |
| 1000 users, 2 fields | JSON | 924 µs | 623 µs | 545 µs | 532 µs |
| 1000 users, 2 fields | hand-written (codec3) | 46 µs (20.05x) | 51 µs (12.27x) | 57 µs (9.58x) | 85 µs (6.28x) |
| 1000 users, 2 fields | generated | 47 µs (19.93x) | 58 µs (10.67x) | 59 µs (9.32x) | 78 µs (6.81x) |
| 1000 users, 2 fields | generated + verify | 59 µs (15.69x) | 68 µs (9.22x) | 71 µs (7.72x) | 90 µs (5.91x) |
| 1000 users, 2 fields | generated, decode (plain) | 109 µs (8.59x) | 117 µs (5.31x) | 138 µs (3.97x) | 131 µs (4.05x) |
| 1000 users, numbers only | JSON | 928 µs | 622 µs | 548 µs | 534 µs |
| 1000 users, numbers only | hand-written (codec3) | 17 µs (53.53x) | 17 µs (37.39x) | 15 µs (37.45x) | 15 µs (35.74x) ~ |
| 1000 users, numbers only | generated | 21 µs (43.34x) | 21 µs (30.25x) | 16 µs (35.15x) | 15 µs (36.20x) |
| 1000 users, numbers only | generated + verify | 40 µs (23.12x) | 45 µs (13.68x) | 34 µs (16.10x) | 70 µs (7.60x) |
| 1000 users, numbers only | generated, decode (plain) | 110 µs (8.49x) | 108 µs (5.77x) | 139 µs (3.96x) | 138 µs (3.87x) |
| 1 user, all fields | JSON | 1.20 µs | 0.85 µs | 1.15 µs | 0.86 µs |
| 1 user, all fields | generated | 0.72 µs (1.66x) | 0.72 µs (1.18x) | 1.24 µs (0.93x) | 1.07 µs (0.81x) |
| 1 user, all fields | generated + verify | 0.94 µs (1.28x) | 0.89 µs (0.96x) | 1.66 µs (0.69x) | 1.31 µs (0.66x) |
| 500 products (long text), all fields | JSON | 509 µs | 207 µs | 406 µs | 311 µs |
| 500 products (long text), all fields | generated | 82 µs (6.27x) | 85 µs (2.43x) | 130 µs (3.13x) | 96 µs (3.23x) |
| 500 products (long text), all fields | generated + verify | 103 µs (4.97x) | 104 µs (1.99x) | 155 µs (2.63x) | 114 µs (2.73x) |
| 100k points, every value | JSON, number arrays | 24.7 ms | 16.0 ms | 29.3 ms | 15.9 ms |
| 100k points, every value | generated | 160 µs (154.96x) | 820 µs (19.80x) | 239 µs (123.78x) ~ | 792 µs (19.96x) ~ |
| 100k points, every value | generated + verify | 160 µs (154.77x) | 791 µs (20.16x) | 224 µs (128.27x) ~ | 790 µs (20.09x) ~ |
| encode 1000 users | JSON | 796 µs | 939 µs | 514 µs | 440 µs |
| encode 1000 users | hand-written (codec3) | 442 µs (1.80x) | 334 µs (2.80x) | 342 µs (1.51x) | 196 µs (2.25x) ~ |
| encode 1000 users | generated | 332 µs (2.40x) | 322 µs (2.95x) | 345 µs (1.49x) | 251 µs (1.75x) |
| encode 500 products | JSON | 479 µs | 558 µs | 336 µs | 515 µs |
| encode 500 products | generated | 277 µs (1.69x) ~ | 546 µs (1.03x) | 304 µs (1.10x) | 502 µs (1.03x) |
| encode 100k points | JSON, number arrays | 42.7 ms | 37.3 ms | 40.9 ms | 28.9 ms |
| encode 100k points | generated | 659 µs (65.42x) ~ | 963 µs (38.83x) | 1.1 ms (38.58x) | 1.2 ms (24.21x) |
