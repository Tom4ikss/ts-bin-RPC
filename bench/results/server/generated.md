# Suite `generated`

2026-11-07, Intel Xeon Processor (Icelake), linux 6.8.0-147-generic, commit 491f807.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v26.13.0
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 6.14 µs | 4.59 µs | 6.91 µs | 5.25 µs |
| 10 users, all fields | hand-written for this type | 2.32 µs (2.64x) | 2.37 µs (1.94x) | 4.14 µs (1.67x) | 3.53 µs (1.49x) |
| 10 users, all fields | generated | 2.91 µs (2.11x) | 2.93 µs (1.58x) | 4.67 µs (1.48x) | 3.60 µs (1.46x) |
| 10 users, all fields | generated + verify | 3.55 µs (1.74x) | 3.57 µs (1.29x) | 5.77 µs (1.20x) | 4.27 µs (1.23x) |
| 10 users, all fields | generated, decode (plain) | 2.80 µs (2.20x) | 2.87 µs (1.60x) | 4.74 µs (1.47x) | 3.58 µs (1.46x) |
| 1000 users, all fields | JSON | 573 µs | 635 µs | 613 µs | 607 µs |
| 1000 users, all fields | hand-written for this type | 122 µs (4.70x) | 120 µs (5.30x) | 134 µs (4.56x) | 130 µs (4.62x) |
| 1000 users, all fields | generated | 138 µs (4.17x) | 159 µs (4.00x) | 154 µs (4.00x) | 131 µs (4.58x) |
| 1000 users, all fields | generated + verify | 151 µs (3.80x) | 174 µs (3.65x) | 178 µs (3.45x) | 143 µs (4.12x) |
| 1000 users, all fields | generated, decode (plain) | 106 µs (5.37x) | 121 µs (5.26x) | 156 µs (3.93x) | 130 µs (4.60x) |
| 1000 users, 2 fields | JSON | 567 µs | 633 µs | 610 µs | 590 µs |
| 1000 users, 2 fields | hand-written for this type | 48 µs (11.88x) | 60 µs (10.63x) | 68 µs (8.92x) | 84 µs (7.07x) |
| 1000 users, 2 fields | generated | 56 µs (10.14x) | 67 µs (9.29x) | 72 µs (8.45x) | 83 µs (7.06x) |
| 1000 users, 2 fields | generated + verify | 70 µs (8.10x) | 81 µs (7.76x) | 96 µs (6.34x) | 98 µs (6.09x) |
| 1000 users, 2 fields | generated, decode (plain) | 102 µs (5.57x) | 115 µs (5.49x) | 151 µs (4.02x) | 125 µs (4.73x) |
| 1000 users, numbers only | JSON | 564 µs | 630 µs | 600 µs | 604 µs |
| 1000 users, numbers only | hand-written for this type | 21 µs (27.52x) | 19 µs (32.85x) | 19 µs (31.75x) | 20 µs (31.00x) |
| 1000 users, numbers only | generated | 26 µs (21.41x) | 24 µs (26.13x) | 22 µs (27.78x) | 20 µs (29.90x) |
| 1000 users, numbers only | generated + verify | 47 µs (11.92x) | 57 µs (11.10x) | 53 µs (11.46x) | 74 µs (8.12x) |
| 1000 users, numbers only | generated, decode (plain) | 104 µs (5.48x) | 114 µs (5.51x) | 152 µs (3.94x) | 135 µs (4.48x) |
| 1 user, all fields | JSON | 0.98 µs | 0.95 µs | 1.20 µs | 1.04 µs |
| 1 user, all fields | generated | 0.78 µs (1.26x) | 0.83 µs (1.14x) | 1.34 µs (0.90x) | 1.07 µs (0.96x) |
| 1 user, all fields | generated + verify | 1.04 µs (0.94x) | 1.04 µs (0.91x) | 1.81 µs (0.66x) | 1.38 µs (0.76x) |
| page of 1000 users, all fields | JSON | 574 µs | 637 µs | 601 µs | 592 µs |
| page of 1000 users, all fields | generated | 121 µs (4.73x) | 137 µs (4.66x) | 152 µs (3.95x) | 132 µs (4.51x) |
| page of 1000 users, all fields | generated, decode (plain) | 111 µs (5.22x) | 125 µs (5.10x) | 156 µs (3.84x) | 133 µs (4.45x) |
| 500 products (long text), all fields | JSON | 383 µs | 222 µs | 492 µs | 327 µs |
| 500 products (long text), all fields | generated | 86 µs (4.42x) | 94 µs (2.38x) | 164 µs (3.01x) | 105 µs (3.10x) |
| 500 products (long text), all fields | generated + verify | 108 µs (3.55x) | 115 µs (1.93x) | 196 µs (2.52x) | 129 µs (2.54x) |
| 100k points, every value | JSON, number arrays | 19.2 ms | 17.1 ms | 28.9 ms | 20.2 ms |
| 100k points, every value | generated | 790 µs (24.94x) | 905 µs (18.99x) | 230 µs (125.96x) | 861 µs (23.45x) |
| 100k points, every value | generated + verify | 790 µs (24.30x) | 918 µs (18.74x) | 229 µs (126.07x) | 861 µs (23.40x) |
| encode 1000 users | JSON | 359 µs | 932 µs | 557 µs | 463 µs |
| encode 1000 users | hand-written for this type | 364 µs (0.98x) ~ | 364 µs (2.56x) | 376 µs (1.49x) | 202 µs (2.31x) |
| encode 1000 users | generated | 298 µs (1.19x) ~ | 353 µs (2.65x) | 376 µs (1.48x) | 246 µs (1.90x) |
| encode 500 products | JSON | 184 µs | 593 µs | 370 µs | 508 µs |
| encode 500 products | generated | 255 µs (0.70x) | 576 µs (1.03x) | 347 µs (1.07x) | 470 µs (1.07x) |
| encode 100k points | JSON, number arrays | 19.6 ms | 36.3 ms | 48.6 ms | 30.2 ms |
| encode 100k points | generated | 487 µs (40.28x) ~ | 998 µs (36.42x) | 1.1 ms (43.56x) | 1.1 ms (28.35x) |
