# Suite `generated`

2026-11-04, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1017-azure, commit 25e4c10.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 8.16 µs | 4.12 µs | 6.05 µs | 4.50 µs |
| 10 users, all fields | hand-written (codec3) | 1.97 µs (4.15x) | 2.03 µs (2.03x) | 3.32 µs (1.82x) | 3.36 µs (1.34x) |
| 10 users, all fields | generated | 2.34 µs (3.48x) | 2.46 µs (1.66x) | 3.98 µs (1.51x) | 3.64 µs (1.24x) |
| 10 users, all fields | generated + verify | 2.91 µs (2.80x) | 2.90 µs (1.42x) | 5.04 µs (1.20x) | 4.27 µs (1.06x) |
| 10 users, all fields | generated, decode (plain) | 2.53 µs (3.22x) | 2.52 µs (1.64x) | 4.46 µs (1.36x) | 3.81 µs (1.19x) |
| 1000 users, all fields | JSON | 921 µs | 625 µs | 540 µs | 515 µs |
| 1000 users, all fields | hand-written (codec3) | 87 µs (10.58x) | 106 µs (5.94x) | 117 µs (4.62x) | 133 µs (3.86x) |
| 1000 users, all fields | generated | 95 µs (9.67x) | 131 µs (4.76x) | 122 µs (4.44x) | 120 µs (4.28x) |
| 1000 users, all fields | generated + verify | 108 µs (8.62x) | 140 µs (4.44x) | 135 µs (4.01x) | 130 µs (3.96x) |
| 1000 users, all fields | generated, decode (plain) | 111 µs (8.34x) | 119 µs (5.24x) | 139 µs (3.89x) | 131 µs (3.96x) |
| 1000 users, 2 fields | JSON | 918 µs | 621 µs | 539 µs | 508 µs |
| 1000 users, 2 fields | hand-written (codec3) | 44 µs (20.80x) | 50 µs (12.26x) | 57 µs (9.54x) | 82 µs (6.25x) |
| 1000 users, 2 fields | generated | 45 µs (20.35x) | 58 µs (10.71x) | 58 µs (9.30x) | 74 µs (6.93x) |
| 1000 users, 2 fields | generated + verify | 57 µs (15.97x) | 67 µs (9.23x) | 70 µs (7.68x) | 86 µs (5.93x) |
| 1000 users, 2 fields | generated, decode (plain) | 105 µs (8.73x) | 116 µs (5.32x) | 136 µs (3.96x) | 125 µs (4.10x) |
| 1000 users, numbers only | JSON | 921 µs | 619 µs | 539 µs | 518 µs |
| 1000 users, numbers only | hand-written (codec3) | 17 µs (54.91x) | 16 µs (38.01x) | 14 µs (37.24x) | 12 µs (42.67x) |
| 1000 users, numbers only | generated | 21 µs (43.84x) | 20 µs (30.29x) | 15 µs (34.93x) | 12 µs (42.99x) |
| 1000 users, numbers only | generated + verify | 39 µs (23.47x) | 45 µs (13.66x) | 34 µs (16.05x) | 68 µs (7.66x) |
| 1000 users, numbers only | generated, decode (plain) | 106 µs (8.67x) | 107 µs (5.79x) | 137 µs (3.97x) | 132 µs (3.93x) |
| 1 user, all fields | JSON | 1.18 µs | 0.86 µs | 1.13 µs | 0.85 µs |
| 1 user, all fields | generated | 0.71 µs (1.66x) | 0.72 µs (1.20x) | 1.22 µs (0.92x) | 1.05 µs (0.81x) |
| 1 user, all fields | generated + verify | 0.92 µs (1.28x) | 0.91 µs (0.94x) | 1.64 µs (0.69x) | 1.30 µs (0.66x) |
| 500 products (long text), all fields | JSON | 499 µs | 204 µs | 405 µs | 290 µs |
| 500 products (long text), all fields | generated | 77 µs (6.49x) | 84 µs (2.43x) | 129 µs (3.13x) | 87 µs (3.32x) |
| 500 products (long text), all fields | generated + verify | 98 µs (5.10x) | 103 µs (1.98x) | 154 µs (2.63x) | 106 µs (2.74x) |
| 100k points, every value | JSON, number arrays | 24.4 ms | 15.7 ms | 29.0 ms | 15.3 ms |
| 100k points, every value | generated | 159 µs (153.08x) | 817 µs (19.24x) | 253 µs (114.71x) | 788 µs (19.59x) |
| 100k points, every value | generated + verify | 159 µs (153.23x) | 775 µs (20.11x) | 239 µs (121.18x) ~ | 788 µs (19.72x) |
| encode 1000 users | JSON | 774 µs | 925 µs | 508 µs | 430 µs |
| encode 1000 users | hand-written (codec3) | 420 µs (1.87x) | 336 µs (2.74x) | 337 µs (1.51x) | 193 µs (2.21x) ~ |
| encode 1000 users | generated | 318 µs (2.42x) | 317 µs (2.91x) | 344 µs (1.47x) | 247 µs (1.74x) |
| encode 500 products | JSON | 451 µs | 550 µs | 332 µs | 506 µs |
| encode 500 products | generated | 265 µs (1.72x) ~ | 550 µs (1.01x) | 301 µs (1.11x) | 482 µs (1.05x) |
| encode 100k points | JSON, number arrays | 41.8 ms | 36.8 ms | 40.9 ms | 28.7 ms |
| encode 100k points | generated | 335 µs (126.04x) ~ | 935 µs (39.28x) | 1.0 ms (39.23x) | 1.1 ms (25.38x) |
