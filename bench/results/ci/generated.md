# Suite `generated`

2026-11-06, Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, linux 7.0.0-1019-azure, commit 343e17e.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 9.04 µs | 4.26 µs | 6.41 µs | 4.70 µs |
| 10 users, all fields | hand-written (codec3) | 2.13 µs (4.24x) | 2.23 µs (1.90x) | 3.76 µs (1.71x) | 3.07 µs (1.53x) |
| 10 users, all fields | generated | 2.54 µs (3.55x) | 2.64 µs (1.61x) | 4.32 µs (1.49x) | 3.13 µs (1.50x) |
| 10 users, all fields | generated + verify | 3.16 µs (2.86x) | 3.11 µs (1.36x) | 5.08 µs (1.26x) | 3.65 µs (1.29x) |
| 10 users, all fields | generated, decode (plain) | 2.51 µs (3.60x) | 2.61 µs (1.64x) | 4.33 µs (1.47x) | 3.18 µs (1.48x) |
| 1000 users, all fields | JSON | 1.0 ms | 562 µs | 566 µs | 538 µs |
| 1000 users, all fields | hand-written (codec3) | 90 µs (11.43x) | 108 µs (5.22x) | 122 µs (4.64x) | 123 µs (4.36x) |
| 1000 users, all fields | generated | 110 µs (9.25x) | 144 µs (3.90x) | 139 µs (4.08x) | 129 µs (4.18x) |
| 1000 users, all fields | generated + verify | 122 µs (8.39x) | 154 µs (3.65x) | 154 µs (3.67x) | 144 µs (3.75x) |
| 1000 users, all fields | generated, decode (plain) | 95 µs (10.79x) | 110 µs (5.12x) | 142 µs (3.98x) | 133 µs (4.05x) |
| 1000 users, 2 fields | JSON | 1.0 ms | 555 µs | 556 µs | 535 µs |
| 1000 users, 2 fields | hand-written (codec3) | 49 µs (20.86x) | 54 µs (10.27x) | 62 µs (9.01x) | 78 µs (6.84x) |
| 1000 users, 2 fields | generated | 48 µs (21.02x) | 61 µs (9.15x) | 66 µs (8.50x) | 77 µs (6.95x) |
| 1000 users, 2 fields | generated + verify | 59 µs (17.12x) | 71 µs (7.80x) | 81 µs (6.93x) | 91 µs (5.88x) |
| 1000 users, 2 fields | generated, decode (plain) | 89 µs (11.47x) | 104 µs (5.35x) | 137 µs (4.06x) | 124 µs (4.33x) ~ |
| 1000 users, numbers only | JSON | 1.0 ms | 554 µs | 555 µs | 537 µs |
| 1000 users, numbers only | hand-written (codec3) | 20 µs (51.61x) | 17 µs (31.87x) | 18 µs (31.51x) | 18 µs (29.94x) |
| 1000 users, numbers only | generated | 24 µs (42.33x) | 22 µs (25.24x) | 20 µs (28.14x) | 18 µs (29.51x) ~ |
| 1000 users, numbers only | generated + verify | 42 µs (24.30x) | 49 µs (11.35x) | 41 µs (13.59x) | 66 µs (8.16x) |
| 1000 users, numbers only | generated, decode (plain) | 91 µs (11.29x) | 103 µs (5.39x) | 138 µs (4.04x) | 130 µs (4.12x) |
| 1 user, all fields | JSON | 1.06 µs | 0.87 µs | 1.11 µs | 0.84 µs |
| 1 user, all fields | generated | 0.75 µs (1.40x) | 0.76 µs (1.15x) | 1.18 µs (0.94x) | 0.96 µs (0.88x) |
| 1 user, all fields | generated + verify | 0.93 µs (1.13x) | 0.93 µs (0.93x) | 1.60 µs (0.70x) | 1.21 µs (0.70x) |
| page of 1000 users, all fields | JSON | 1.0 ms | 562 µs | 554 µs | 537 µs |
| page of 1000 users, all fields | generated | 132 µs (7.79x) | 125 µs (4.49x) | 139 µs (3.99x) | 137 µs (3.96x) |
| page of 1000 users, all fields | generated, decode (plain) | 102 µs (10.12x) | 114 µs (4.96x) | 141 µs (3.92x) | 134 µs (4.02x) |
| 500 products (long text), all fields | JSON | 449 µs | 197 µs | 448 µs | 296 µs |
| 500 products (long text), all fields | generated | 83 µs (5.42x) | 84 µs (2.34x) | 148 µs (3.04x) | 112 µs (2.63x) |
| 500 products (long text), all fields | generated + verify | 104 µs (4.30x) | 105 µs (1.88x) | 174 µs (2.58x) | 130 µs (2.28x) |
| 100k points, every value | JSON, number arrays | 24.7 ms | 15.8 ms | 25.8 ms | 16.3 ms |
| 100k points, every value | generated | 205 µs (120.89x) | 821 µs (19.20x) | 235 µs (109.85x) ~ | 774 µs (21.14x) |
| 100k points, every value | generated + verify | 205 µs (120.11x) | 794 µs (19.96x) | 207 µs (124.72x) | 773 µs (21.12x) |
| encode 1000 users | JSON | 751 µs | 821 µs | 509 µs | 451 µs |
| encode 1000 users | hand-written (codec3) | 442 µs (1.70x) | 326 µs (2.52x) | 345 µs (1.48x) | 192 µs (2.32x) ~ |
| encode 1000 users | generated | 327 µs (2.30x) | 310 µs (2.65x) | 346 µs (1.47x) | 237 µs (1.93x) |
| encode 500 products | JSON | 424 µs | 516 µs | 334 µs | 483 µs |
| encode 500 products | generated | 292 µs (1.45x) | 504 µs (1.03x) | 317 µs (1.06x) | 459 µs (1.06x) |
| encode 100k points | JSON, number arrays | 42.2 ms | 33.0 ms | 43.6 ms | 27.9 ms |
| encode 100k points | generated | 704 µs (60.36x) ~ | 882 µs (37.40x) | 951 µs (45.83x) | 1.0 ms (26.76x) |
