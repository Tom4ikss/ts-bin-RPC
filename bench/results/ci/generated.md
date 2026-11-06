# Suite `generated`

2026-11-06, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, commit 4068aed.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 6.38 µs | 3.22 µs | 4.36 µs | 3.60 µs |
| 10 users, all fields | hand-written (codec3) | 1.51 µs (4.22x) | 1.56 µs (2.08x) | 2.75 µs (1.58x) | 2.72 µs (1.32x) |
| 10 users, all fields | generated | 1.79 µs (3.57x) | 1.85 µs (1.75x) | 3.04 µs (1.43x) | 2.73 µs (1.32x) |
| 10 users, all fields | generated + verify | 2.26 µs (2.82x) | 2.24 µs (1.44x) | 3.81 µs (1.15x) | 3.28 µs (1.10x) |
| 10 users, all fields | generated, decode (plain) | 1.80 µs (3.53x) | 1.83 µs (1.76x) | 3.04 µs (1.43x) | 2.69 µs (1.34x) |
| 1000 users, all fields | JSON | 762 µs | 503 µs | 384 µs | 396 µs |
| 1000 users, all fields | hand-written (codec3) | 68 µs (11.24x) | 81 µs (6.20x) | 89 µs (4.35x) | 100 µs (3.98x) |
| 1000 users, all fields | generated | 81 µs (9.40x) | 102 µs (4.93x) | 99 µs (3.90x) | 94 µs (4.20x) |
| 1000 users, all fields | generated + verify | 91 µs (8.36x) | 109 µs (4.63x) | 109 µs (3.55x) | 103 µs (3.87x) |
| 1000 users, all fields | generated, decode (plain) | 72 µs (10.57x) | 82 µs (6.16x) | 98 µs (3.94x) | 88 µs (4.48x) |
| 1000 users, 2 fields | JSON | 752 µs | 499 µs | 384 µs | 391 µs |
| 1000 users, 2 fields | hand-written (codec3) | 36 µs (21.09x) | 42 µs (11.92x) | 47 µs (8.18x) | 66 µs (6.01x) |
| 1000 users, 2 fields | generated | 37 µs (20.61x) | 48 µs (10.34x) | 49 µs (7.74x) | 59 µs (6.62x) |
| 1000 users, 2 fields | generated + verify | 46 µs (16.34x) | 56 µs (8.86x) | 59 µs (6.47x) | 70 µs (5.53x) |
| 1000 users, 2 fields | generated, decode (plain) | 68 µs (11.11x) | 80 µs (6.21x) | 95 µs (4.04x) | 83 µs (4.69x) |
| 1000 users, numbers only | JSON | 760 µs | 499 µs | 380 µs | 394 µs |
| 1000 users, numbers only | hand-written (codec3) | 14 µs (53.10x) | 13 µs (37.79x) | 12 µs (32.85x) | 11 µs (36.44x) |
| 1000 users, numbers only | generated | 18 µs (42.04x) | 17 µs (29.03x) | 14 µs (28.07x) | 11 µs (35.78x) |
| 1000 users, numbers only | generated + verify | 34 µs (22.75x) | 38 µs (13.15x) | 29 µs (13.26x) | 55 µs (7.24x) |
| 1000 users, numbers only | generated, decode (plain) | 69 µs (10.94x) | 81 µs (6.20x) | 95 µs (4.02x) | 87 µs (4.55x) |
| 1 user, all fields | JSON | 0.88 µs | 0.66 µs | 0.88 µs | 0.66 µs |
| 1 user, all fields | generated | 0.50 µs (1.74x) | 0.51 µs (1.30x) | 0.90 µs (0.98x) | 0.80 µs (0.82x) |
| 1 user, all fields | generated + verify | 0.66 µs (1.32x) | 0.65 µs (1.01x) | 1.35 µs (0.66x) | 1.02 µs (0.64x) |
| page of 1000 users, all fields | JSON | 772 µs | 508 µs | 384 µs | 399 µs |
| page of 1000 users, all fields | generated | 93 µs (8.30x) | 92 µs (5.50x) | 99 µs (3.90x) | 99 µs (4.03x) |
| page of 1000 users, all fields | generated, decode (plain) | 77 µs (9.99x) | 86 µs (5.91x) | 98 µs (3.94x) | 90 µs (4.47x) |
| 500 products (long text), all fields | JSON | 421 µs | 141 µs | 310 µs | 228 µs |
| 500 products (long text), all fields | generated | 64 µs (6.63x) | 68 µs (2.10x) | 106 µs (2.91x) | 72 µs (3.19x) |
| 500 products (long text), all fields | generated + verify | 82 µs (5.17x) | 84 µs (1.69x) | 128 µs (2.41x) | 86 µs (2.64x) |
| 100k points, every value | JSON, number arrays | 19.2 ms | 12.9 ms | 22.7 ms | 12.9 ms |
| 100k points, every value | generated | 139 µs (137.94x) | 648 µs (20.02x) | 221 µs (102.65x) ~ | 662 µs (19.45x) |
| 100k points, every value | generated + verify | 139 µs (137.95x) | 628 µs (20.59x) | 194 µs (117.05x) ~ | 663 µs (19.46x) |
| encode 1000 users | JSON | 651 µs | 690 µs | 386 µs | 333 µs |
| encode 1000 users | hand-written (codec3) | 327 µs (1.99x) | 257 µs (2.70x) | 247 µs (1.56x) | 135 µs (2.48x) ~ |
| encode 1000 users | generated | 223 µs (2.90x) | 238 µs (2.94x) | 228 µs (1.69x) | 162 µs (2.06x) |
| encode 500 products | JSON | 384 µs | 442 µs | 260 µs | 347 µs |
| encode 500 products | generated | 219 µs (1.76x) | 441 µs (1.00x) | 209 µs (1.25x) | 340 µs (1.01x) |
| encode 100k points | JSON, number arrays | 34.7 ms | 30.8 ms | 33.0 ms | 21.3 ms |
| encode 100k points | generated | 485 µs (72.69x) ~ | 819 µs (37.68x) | 858 µs (38.54x) | 961 µs (22.12x) |
