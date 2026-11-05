# Suite `generated`

2026-11-05, AMD EPYC 7763 64-Core Processor, linux 7.0.0-1019-azure, commit 9ab7004.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 8.15 µs | 4.12 µs | 6.02 µs | 4.48 µs |
| 10 users, all fields | hand-written (codec3) | 1.96 µs (4.15x) | 2.00 µs (2.06x) | 3.42 µs (1.76x) | 3.30 µs (1.36x) |
| 10 users, all fields | generated | 2.32 µs (3.52x) | 2.40 µs (1.72x) | 3.72 µs (1.62x) | 3.39 µs (1.32x) |
| 10 users, all fields | generated + verify | 2.86 µs (2.84x) | 2.86 µs (1.44x) | 4.68 µs (1.29x) | 3.95 µs (1.13x) |
| 10 users, all fields | generated, decode (plain) | 2.25 µs (3.62x) | 2.34 µs (1.76x) | 3.73 µs (1.61x) | 3.28 µs (1.38x) |
| 1000 users, all fields | JSON | 919 µs | 614 µs | 541 µs | 511 µs |
| 1000 users, all fields | hand-written (codec3) | 87 µs (10.57x) | 104 µs (5.90x) | 116 µs (4.66x) | 132 µs (3.89x) |
| 1000 users, all fields | generated | 104 µs (8.86x) | 132 µs (4.64x) | 126 µs (4.31x) | 119 µs (4.29x) |
| 1000 users, all fields | generated + verify | 117 µs (7.86x) | 142 µs (4.32x) | 139 µs (3.90x) | 131 µs (3.90x) |
| 1000 users, all fields | generated, decode (plain) | 88 µs (10.49x) | 101 µs (6.09x) | 123 µs (4.40x) | 116 µs (4.39x) |
| 1000 users, 2 fields | JSON | 912 µs | 609 µs | 538 µs | 509 µs |
| 1000 users, 2 fields | hand-written (codec3) | 43 µs (21.05x) | 50 µs (12.18x) | 56 µs (9.57x) | 81 µs (6.30x) |
| 1000 users, 2 fields | generated | 45 µs (20.28x) | 58 µs (10.43x) | 59 µs (9.16x) | 72 µs (7.10x) |
| 1000 users, 2 fields | generated + verify | 56 µs (16.12x) | 68 µs (9.01x) | 71 µs (7.61x) | 84 µs (6.09x) |
| 1000 users, 2 fields | generated, decode (plain) | 81 µs (11.20x) | 98 µs (6.22x) | 120 µs (4.49x) | 110 µs (4.62x) |
| 1000 users, numbers only | JSON | 912 µs | 609 µs | 537 µs | 515 µs |
| 1000 users, numbers only | hand-written (codec3) | 16 µs (55.32x) | 16 µs (37.78x) | 14 µs (37.19x) | 12 µs (42.85x) |
| 1000 users, numbers only | generated | 22 µs (41.79x) | 21 µs (28.91x) | 16 µs (32.80x) | 12 µs (41.13x) |
| 1000 users, numbers only | generated + verify | 40 µs (22.97x) | 46 µs (13.30x) | 34 µs (15.72x) | 68 µs (7.57x) |
| 1000 users, numbers only | generated, decode (plain) | 82 µs (11.09x) | 98 µs (6.25x) | 120 µs (4.47x) | 117 µs (4.37x) |
| 1 user, all fields | JSON | 1.19 µs | 0.85 µs | 1.11 µs | 0.84 µs |
| 1 user, all fields | generated | 0.71 µs (1.67x) | 0.72 µs (1.18x) | 1.23 µs (0.90x) | 1.04 µs (0.81x) |
| 1 user, all fields | generated + verify | 0.90 µs (1.32x) | 0.89 µs (0.96x) | 1.65 µs (0.67x) | 1.28 µs (0.66x) |
| page of 1000 users, all fields | JSON | 931 µs | 619 µs | 527 µs | 509 µs |
| page of 1000 users, all fields | generated | 123 µs (7.56x) | 120 µs (5.21x) | 126 µs (4.16x) | 127 µs (4.03x) |
| page of 1000 users, all fields | generated, decode (plain) | 95 µs (9.76x) | 109 µs (5.70x) | 123 µs (4.28x) | 117 µs (4.36x) |
| 500 products (long text), all fields | JSON | 496 µs | 202 µs | 405 µs | 286 µs |
| 500 products (long text), all fields | generated | 77 µs (6.42x) | 84 µs (2.41x) | 132 µs (3.06x) | 87 µs (3.29x) |
| 500 products (long text), all fields | generated + verify | 98 µs (5.05x) | 104 µs (1.97x) | 156 µs (2.58x) | 104 µs (2.73x) |
| 100k points, every value | JSON, number arrays | 24.2 ms | 15.4 ms | 28.8 ms | 15.7 ms |
| 100k points, every value | generated | 159 µs (152.45x) | 774 µs (19.76x) | 222 µs (127.64x) ~ | 789 µs (20.01x) |
| 100k points, every value | generated + verify | 159 µs (152.12x) | 803 µs (19.34x) | 222 µs (127.59x) ~ | 786 µs (20.18x) |
| encode 1000 users | JSON | 766 µs | 913 µs | 508 µs | 425 µs |
| encode 1000 users | hand-written (codec3) | 445 µs (1.72x) | 329 µs (2.76x) | 355 µs (1.43x) | 650 µs (0.66x) ~ |
| encode 1000 users | generated | 333 µs (2.35x) | 321 µs (2.85x) | 352 µs (1.44x) | 241 µs (1.76x) |
| encode 500 products | JSON | 459 µs | 537 µs | 330 µs | 500 µs |
| encode 500 products | generated | 261 µs (1.73x) ~ | 534 µs (1.01x) | 315 µs (1.05x) | 475 µs (1.05x) |
| encode 100k points | JSON, number arrays | 41.6 ms | 35.7 ms | 40.5 ms | 28.3 ms |
| encode 100k points | generated | 440 µs (95.67x) ~ | 902 µs (39.52x) | 998 µs (40.71x) | 1.1 ms (26.05x) |
