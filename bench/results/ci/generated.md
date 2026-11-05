# Suite `generated`

2026-11-05, AMD EPYC 9V45 96-Core Processor, linux 7.0.0-1017-azure, commit 5590226.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.71 µs | 2.46 µs | 3.73 µs | 2.69 µs |
| 10 users, all fields | hand-written (codec3) | 1.18 µs (4.01x) | 1.22 µs (2.02x) | 2.20 µs (1.70x) | 1.97 µs (1.36x) |
| 10 users, all fields | generated | 1.36 µs (3.50x) | 1.52 µs (1.61x) | 2.45 µs (1.52x) | 2.01 µs (1.35x) |
| 10 users, all fields | generated + verify | 1.74 µs (2.74x) | 1.85 µs (1.34x) | 2.91 µs (1.27x) | 2.39 µs (1.12x) |
| 10 users, all fields | generated, decode (plain) | 1.35 µs (3.51x) | 1.50 µs (1.65x) | 2.40 µs (1.54x) | 1.97 µs (1.36x) |
| 1000 users, all fields | JSON | 563 µs | 413 µs | 300 µs | 293 µs |
| 1000 users, all fields | hand-written (codec3) | 51 µs (10.87x) | 67 µs (6.11x) | 71 µs (4.25x) | 74 µs (4.03x) |
| 1000 users, all fields | generated | 60 µs (9.28x) | 85 µs (4.88x) | 80 µs (3.74x) | 68 µs (4.37x) |
| 1000 users, all fields | generated + verify | 67 µs (8.33x) | 90 µs (4.60x) | 86 µs (3.46x) | 75 µs (3.93x) |
| 1000 users, all fields | generated, decode (plain) | 49 µs (11.24x) | 61 µs (6.70x) | 79 µs (3.78x) | 63 µs (4.65x) |
| 1000 users, 2 fields | JSON | 562 µs | 408 µs | 292 µs | 294 µs |
| 1000 users, 2 fields | hand-written (codec3) | 25 µs (22.46x) | 32 µs (12.83x) | 33 µs (8.70x) | 45 µs (6.61x) |
| 1000 users, 2 fields | generated | 25 µs (22.68x) | 37 µs (11.12x) | 37 µs (7.77x) | 41 µs (6.94x) |
| 1000 users, 2 fields | generated + verify | 31 µs (17.99x) | 42 µs (9.62x) | 44 µs (6.58x) | 49 µs (5.93x) |
| 1000 users, 2 fields | generated, decode (plain) | 46 µs (12.10x) | 59 µs (6.90x) | 78 µs (3.75x) | 60 µs (4.88x) |
| 1000 users, numbers only | JSON | 556 µs | 413 µs | 285 µs | 287 µs |
| 1000 users, numbers only | hand-written (codec3) | 10 µs (53.88x) | 10 µs (39.61x) | 8.89 µs (32.27x) | 7.90 µs (36.45x) ~ |
| 1000 users, numbers only | generated | 12 µs (44.23x) | 13 µs (31.20x) | 10 µs (27.26x) | 7.51 µs (38.53x) ~ |
| 1000 users, numbers only | generated + verify | 22 µs (24.87x) | 28 µs (14.68x) | 22 µs (13.00x) | 36 µs (8.07x) |
| 1000 users, numbers only | generated, decode (plain) | 47 µs (11.86x) | 61 µs (6.82x) | 79 µs (3.64x) | 62 µs (4.72x) |
| 1 user, all fields | JSON | 0.65 µs | 0.54 µs | 0.72 µs | 0.49 µs |
| 1 user, all fields | generated | 0.40 µs (1.63x) | 0.43 µs (1.26x) | 0.76 µs (0.93x) | 0.60 µs (0.81x) |
| 1 user, all fields | generated + verify | 0.53 µs (1.20x) | 0.55 µs (0.96x) | 1.10 µs (0.65x) | 0.78 µs (0.62x) |
| page of 1000 users, all fields | JSON | 574 µs | 415 µs | 288 µs | 291 µs |
| page of 1000 users, all fields | generated | 74 µs (7.72x) | 75 µs (5.59x) | 82 µs (3.56x) | 71 µs (4.13x) |
| page of 1000 users, all fields | generated, decode (plain) | 54 µs (10.47x) | 65 µs (6.41x) | 80 µs (3.60x) | 64 µs (4.58x) |
| 500 products (long text), all fields | JSON | 304 µs | 112 µs | 226 µs | 174 µs |
| 500 products (long text), all fields | generated | 43 µs (7.14x) | 53 µs (2.11x) | 79 µs (2.85x) | 51 µs (3.48x) |
| 500 products (long text), all fields | generated + verify | 53 µs (5.75x) | 63 µs (1.76x) | 92 µs (2.43x) | 60 µs (2.93x) |
| 100k points, every value | JSON, number arrays | 14.7 ms | 10.6 ms | 16.6 ms | 9.5 ms |
| 100k points, every value | generated | 96 µs (152.73x) | 442 µs (23.69x) | 132 µs (125.94x) | 378 µs (24.92x) |
| 100k points, every value | generated + verify | 96 µs (152.18x) | 440 µs (23.78x) | 132 µs (125.80x) | 382 µs (24.80x) |
| encode 1000 users | JSON | 464 µs | 575 µs | 285 µs | 241 µs |
| encode 1000 users | hand-written (codec3) | 238 µs (1.96x) | 205 µs (2.82x) | 169 µs (1.70x) | 101 µs (2.40x) |
| encode 1000 users | generated | 160 µs (2.87x) | 188 µs (3.07x) | 161 µs (1.78x) | 122 µs (1.97x) |
| encode 500 products | JSON | 290 µs | 375 µs | 210 µs | 275 µs |
| encode 500 products | generated | 162 µs (1.79x) | 371 µs (1.01x) | 170 µs (1.24x) | 260 µs (1.05x) |
| encode 100k points | JSON, number arrays | 27.1 ms | 25.2 ms | 26.1 ms | 17.6 ms |
| encode 100k points | generated | 544 µs (50.49x) ~ | 687 µs (36.73x) | 743 µs (34.96x) | 826 µs (21.23x) |
