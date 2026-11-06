# Suite `generated`

2026-11-06, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, commit d7daf4e.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 8.14 µs | 4.12 µs | 6.02 µs | 4.47 µs |
| 10 users, all fields | hand-written (codec3) | 1.96 µs (4.16x) | 2.02 µs (2.04x) | 3.32 µs (1.80x) | 3.29 µs (1.36x) |
| 10 users, all fields | generated | 2.35 µs (3.46x) | 2.45 µs (1.68x) | 3.88 µs (1.55x) | 3.41 µs (1.31x) |
| 10 users, all fields | generated + verify | 2.95 µs (2.76x) | 2.92 µs (1.41x) | 4.71 µs (1.28x) | 3.98 µs (1.12x) |
| 10 users, all fields | generated, decode (plain) | 2.29 µs (3.55x) | 2.38 µs (1.73x) | 3.83 µs (1.57x) | 3.31 µs (1.35x) |
| 1000 users, all fields | JSON | 916 µs | 612 µs | 541 µs | 509 µs |
| 1000 users, all fields | hand-written (codec3) | 87 µs (10.54x) | 104 µs (5.89x) | 116 µs (4.66x) | 130 µs (3.91x) |
| 1000 users, all fields | generated | 105 µs (8.71x) | 132 µs (4.65x) | 126 µs (4.32x) | 121 µs (4.25x) |
| 1000 users, all fields | generated + verify | 117 µs (7.79x) | 142 µs (4.32x) | 138 µs (3.93x) | 132 µs (3.88x) |
| 1000 users, all fields | generated, decode (plain) | 87 µs (10.47x) | 101 µs (6.06x) | 123 µs (4.43x) | 116 µs (4.41x) |
| 1000 users, 2 fields | JSON | 906 µs | 609 µs | 538 µs | 507 µs |
| 1000 users, 2 fields | hand-written (codec3) | 43 µs (20.99x) | 50 µs (12.14x) | 56 µs (9.61x) | 81 µs (6.28x) |
| 1000 users, 2 fields | generated | 45 µs (20.33x) | 59 µs (10.38x) | 59 µs (9.17x) | 72 µs (7.06x) |
| 1000 users, 2 fields | generated + verify | 56 µs (16.14x) | 68 µs (8.95x) | 71 µs (7.59x) | 83 µs (6.04x) |
| 1000 users, 2 fields | generated, decode (plain) | 81 µs (11.17x) | 98 µs (6.22x) | 119 µs (4.52x) | 109 µs (4.64x) |
| 1000 users, numbers only | JSON | 915 µs | 608 µs | 536 µs | 508 µs |
| 1000 users, numbers only | hand-written (codec3) | 16 µs (55.49x) | 16 µs (37.73x) | 14 µs (37.30x) | 12 µs (43.06x) |
| 1000 users, numbers only | generated | 22 µs (41.87x) | 21 µs (28.75x) | 16 µs (32.71x) | 12 µs (40.82x) |
| 1000 users, numbers only | generated + verify | 40 µs (23.06x) | 46 µs (13.16x) | 34 µs (15.55x) | 67 µs (7.55x) |
| 1000 users, numbers only | generated, decode (plain) | 82 µs (11.11x) | 98 µs (6.22x) | 120 µs (4.47x) | 116 µs (4.40x) |
| 1 user, all fields | JSON | 1.20 µs | 0.86 µs | 1.13 µs | 0.82 µs |
| 1 user, all fields | generated | 0.70 µs (1.71x) | 0.74 µs (1.16x) | 1.23 µs (0.92x) | 1.05 µs (0.80x) |
| 1 user, all fields | generated + verify | 0.89 µs (1.35x) | 0.92 µs (0.93x) | 1.65 µs (0.68x) | 1.27 µs (0.66x) |
| page of 1000 users, all fields | JSON | 929 µs | 622 µs | 527 µs | 509 µs |
| page of 1000 users, all fields | generated | 124 µs (7.53x) | 119 µs (5.15x) | 126 µs (4.19x) | 127 µs (4.02x) |
| page of 1000 users, all fields | generated, decode (plain) | 95 µs (9.74x) | 109 µs (5.68x) | 123 µs (4.30x) | 117 µs (4.36x) |
| 500 products (long text), all fields | JSON | 497 µs | 203 µs | 405 µs | 287 µs |
| 500 products (long text), all fields | generated | 77 µs (6.41x) | 84 µs (2.42x) | 132 µs (3.07x) | 88 µs (3.24x) |
| 500 products (long text), all fields | generated + verify | 98 µs (5.07x) | 103 µs (1.96x) | 156 µs (2.59x) | 104 µs (2.77x) |
| 100k points, every value | JSON, number arrays | 24.3 ms | 15.4 ms | 28.8 ms | 15.8 ms |
| 100k points, every value | generated | 159 µs (152.54x) | 790 µs (19.32x) | 222 µs (129.80x) ~ | 785 µs (20.47x) ~ |
| 100k points, every value | generated + verify | 159 µs (152.42x) | 788 µs (19.57x) | 238 µs (119.94x) ~ | 775 µs (20.51x) ~ |
| encode 1000 users | JSON | 777 µs | 912 µs | 507 µs | 422 µs |
| encode 1000 users | hand-written (codec3) | 413 µs (1.86x) | 328 µs (2.78x) | 347 µs (1.46x) | 188 µs (2.22x) ~ |
| encode 1000 users | generated | 312 µs (2.48x) | 320 µs (2.86x) | 345 µs (1.47x) | 237 µs (1.76x) |
| encode 500 products | JSON | 464 µs | 540 µs | 331 µs | 502 µs |
| encode 500 products | generated | 258 µs (1.80x) ~ | 531 µs (1.02x) | 301 µs (1.09x) | 476 µs (1.06x) |
| encode 100k points | JSON, number arrays | 42.8 ms | 35.4 ms | 40.6 ms | 28.2 ms |
| encode 100k points | generated | 605 µs (71.65x) ~ | 895 µs (39.51x) | 1.0 ms (40.39x) | 1.1 ms (25.94x) |
