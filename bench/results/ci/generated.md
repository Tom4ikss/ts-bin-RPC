# Suite `generated`

2026-11-07, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, commit 445c39f.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 6.36 µs | 3.26 µs | 4.41 µs | 3.65 µs |
| 10 users, all fields | hand-written (codec3) | 1.53 µs (4.18x) | 1.57 µs (2.07x) | 2.78 µs (1.61x) | 2.75 µs (1.33x) |
| 10 users, all fields | generated | 1.81 µs (3.51x) | 1.89 µs (1.72x) | 3.13 µs (1.43x) | 2.79 µs (1.31x) |
| 10 users, all fields | generated + verify | 2.30 µs (2.76x) | 2.34 µs (1.39x) | 3.99 µs (1.11x) | 3.36 µs (1.09x) |
| 10 users, all fields | generated, decode (plain) | 1.84 µs (3.46x) | 1.88 µs (1.72x) | 3.09 µs (1.43x) | 2.74 µs (1.33x) |
| 1000 users, all fields | JSON | 761 µs | 505 µs | 388 µs | 396 µs |
| 1000 users, all fields | hand-written (codec3) | 68 µs (11.15x) | 82 µs (6.20x) | 89 µs (4.34x) | 102 µs (3.91x) |
| 1000 users, all fields | generated | 81 µs (9.36x) | 103 µs (4.95x) | 99 µs (3.92x) | 95 µs (4.20x) |
| 1000 users, all fields | generated + verify | 92 µs (8.20x) | 111 µs (4.54x) | 115 µs (3.36x) | 104 µs (3.80x) |
| 1000 users, all fields | generated, decode (plain) | 72 µs (10.53x) | 83 µs (6.12x) | 98 µs (3.97x) | 90 µs (4.42x) |
| 1000 users, 2 fields | JSON | 751 µs | 503 µs | 384 µs | 395 µs |
| 1000 users, 2 fields | hand-written (codec3) | 36 µs (20.89x) | 42 µs (11.97x) | 47 µs (8.14x) | 65 µs (6.13x) |
| 1000 users, 2 fields | generated | 37 µs (20.43x) | 48 µs (10.47x) | 50 µs (7.74x) | 59 µs (6.70x) |
| 1000 users, 2 fields | generated + verify | 48 µs (15.66x) | 58 µs (8.58x) | 66 µs (5.80x) | 70 µs (5.67x) |
| 1000 users, 2 fields | generated, decode (plain) | 68 µs (11.02x) | 80 µs (6.25x) | 96 µs (4.03x) | 83 µs (4.77x) |
| 1000 users, numbers only | JSON | 757 µs | 502 µs | 382 µs | 401 µs |
| 1000 users, numbers only | hand-written (codec3) | 14 µs (53.16x) | 13 µs (37.61x) | 12 µs (32.80x) | 11 µs (34.30x) |
| 1000 users, numbers only | generated | 18 µs (41.63x) | 17 µs (28.99x) | 14 µs (28.21x) | 11 µs (35.00x) |
| 1000 users, numbers only | generated + verify | 35 µs (21.55x) | 40 µs (12.54x) | 36 µs (10.65x) | 56 µs (7.11x) |
| 1000 users, numbers only | generated, decode (plain) | 70 µs (10.79x) | 81 µs (6.16x) | 96 µs (4.02x) | 89 µs (4.50x) |
| 1 user, all fields | JSON | 0.87 µs | 0.66 µs | 0.89 µs | 0.65 µs |
| 1 user, all fields | generated | 0.51 µs (1.69x) | 0.51 µs (1.28x) | 0.90 µs (0.99x) | 0.79 µs (0.82x) |
| 1 user, all fields | generated + verify | 0.71 µs (1.21x) | 0.71 µs (0.92x) | 1.36 µs (0.65x) | 1.03 µs (0.64x) |
| page of 1000 users, all fields | JSON | 766 µs | 509 µs | 387 µs | 397 µs |
| page of 1000 users, all fields | generated | 95 µs (8.15x) | 92 µs (5.55x) | 99 µs (3.91x) | 100 µs (3.96x) |
| page of 1000 users, all fields | generated, decode (plain) | 78 µs (9.90x) | 86 µs (5.92x) | 98 µs (3.96x) | 89 µs (4.45x) |
| 500 products (long text), all fields | JSON | 425 µs | 141 µs | 309 µs | 228 µs |
| 500 products (long text), all fields | generated | 65 µs (6.53x) | 68 µs (2.09x) | 107 µs (2.91x) | 70 µs (3.28x) |
| 500 products (long text), all fields | generated + verify | 83 µs (5.13x) | 85 µs (1.68x) | 130 µs (2.38x) | 86 µs (2.69x) |
| 100k points, every value | JSON, number arrays | 19.2 ms | 12.9 ms | 22.9 ms | 12.9 ms |
| 100k points, every value | generated | 139 µs (138.10x) | 619 µs (20.76x) | 194 µs (117.73x) ~ | 664 µs (19.45x) |
| 100k points, every value | generated + verify | 139 µs (138.06x) | 609 µs (20.85x) | 194 µs (117.79x) ~ | 663 µs (19.43x) |
| encode 1000 users | JSON | 665 µs | 696 µs | 387 µs | 335 µs |
| encode 1000 users | hand-written (codec3) | 340 µs (1.96x) | 254 µs (2.75x) | 249 µs (1.56x) | 137 µs (2.46x) ~ |
| encode 1000 users | generated | 229 µs (2.85x) | 233 µs (3.04x) | 227 µs (1.71x) | 163 µs (2.05x) |
| encode 500 products | JSON | 400 µs | 444 µs | 260 µs | 353 µs |
| encode 500 products | generated | 210 µs (1.84x) ~ | 450 µs (0.99x) | 222 µs (1.17x) | 344 µs (1.03x) |
| encode 100k points | JSON, number arrays | 36.4 ms | 31.2 ms | 33.1 ms | 21.6 ms |
| encode 100k points | generated | 567 µs (63.79x) ~ | 837 µs (37.67x) | 903 µs (36.69x) | 976 µs (22.22x) |
