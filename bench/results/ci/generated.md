# Suite `generated`

2026-11-05, AMD EPYC 9V45 96-Core Processor, linux 7.0.0-1019-azure, commit 58a1c71.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.70 µs | 2.45 µs | 3.56 µs | 2.65 µs |
| 10 users, all fields | hand-written (codec3) | 1.18 µs (3.98x) | 1.25 µs (1.97x) | 2.14 µs (1.63x) | 1.93 µs (1.37x) |
| 10 users, all fields | generated | 1.37 µs (3.45x) | 1.56 µs (1.58x) | 2.42 µs (1.47x) | 1.96 µs (1.36x) |
| 10 users, all fields | generated + verify | 1.73 µs (2.72x) | 1.85 µs (1.32x) | 2.85 µs (1.25x) | 2.34 µs (1.14x) |
| 10 users, all fields | generated, decode (plain) | 1.38 µs (3.40x) | 1.51 µs (1.64x) | 2.36 µs (1.50x) | 1.91 µs (1.38x) |
| 1000 users, all fields | JSON | 557 µs | 410 µs | 288 µs | 286 µs |
| 1000 users, all fields | hand-written (codec3) | 52 µs (10.68x) | 68 µs (6.00x) | 70 µs (4.12x) | 72 µs (3.95x) |
| 1000 users, all fields | generated | 61 µs (9.10x) | 84 µs (4.82x) | 80 µs (3.60x) | 69 µs (4.35x) |
| 1000 users, all fields | generated + verify | 67 µs (8.24x) | 90 µs (4.52x) | 86 µs (3.34x) | 76 µs (3.91x) |
| 1000 users, all fields | generated, decode (plain) | 51 µs (11.09x) | 62 µs (6.56x) | 79 µs (3.65x) | 66 µs (4.59x) |
| 1000 users, 2 fields | JSON | 560 µs | 404 µs | 284 µs | 288 µs |
| 1000 users, 2 fields | hand-written (codec3) | 25 µs (22.18x) | 32 µs (12.74x) | 33 µs (8.57x) | 45 µs (6.43x) |
| 1000 users, 2 fields | generated | 25 µs (22.58x) | 37 µs (11.00x) | 37 µs (7.65x) | 43 µs (6.81x) |
| 1000 users, 2 fields | generated + verify | 31 µs (17.84x) | 42 µs (9.61x) | 44 µs (6.51x) | 50 µs (5.90x) |
| 1000 users, 2 fields | generated, decode (plain) | 47 µs (12.01x) | 60 µs (6.78x) | 77 µs (3.67x) | 62 µs (4.92x) |
| 1000 users, numbers only | JSON | 563 µs | 406 µs | 281 µs | 293 µs |
| 1000 users, numbers only | hand-written (codec3) | 10 µs (54.30x) | 10 µs (39.35x) | 8.78 µs (32.07x) | 8.30 µs (35.43x) ~ |
| 1000 users, numbers only | generated | 13 µs (44.68x) | 13 µs (30.93x) | 10 µs (27.18x) | 8.06 µs (36.46x) ~ |
| 1000 users, numbers only | generated + verify | 23 µs (24.90x) | 28 µs (14.58x) | 22 µs (12.95x) | 36 µs (8.21x) |
| 1000 users, numbers only | generated, decode (plain) | 47 µs (11.87x) | 61 µs (6.70x) | 78 µs (3.63x) | 65 µs (4.61x) |
| 1 user, all fields | JSON | 0.63 µs | 0.52 µs | 0.72 µs | 0.49 µs |
| 1 user, all fields | generated | 0.40 µs (1.57x) | 0.45 µs (1.17x) | 0.75 µs (0.97x) | 0.59 µs (0.84x) |
| 1 user, all fields | generated + verify | 0.55 µs (1.15x) | 0.58 µs (0.90x) | 1.09 µs (0.67x) | 0.76 µs (0.65x) |
| page of 1000 users, all fields | JSON | 568 µs | 402 µs | 284 µs | 293 µs |
| page of 1000 users, all fields | generated | 73 µs (7.75x) | 75 µs (5.43x) | 80 µs (3.56x) | 75 µs (4.06x) |
| page of 1000 users, all fields | generated, decode (plain) | 56 µs (10.32x) ~ | 65 µs (6.23x) | 79 µs (3.60x) | 67 µs (4.51x) |
| 500 products (long text), all fields | JSON | 297 µs | 111 µs | 226 µs | 179 µs |
| 500 products (long text), all fields | generated | 44 µs (6.79x) | 53 µs (2.11x) | 78 µs (2.90x) | 54 µs (3.53x) |
| 500 products (long text), all fields | generated + verify | 54 µs (5.51x) | 63 µs (1.77x) | 92 µs (2.48x) | 64 µs (2.96x) |
| 100k points, every value | JSON, number arrays | 14.6 ms | 10.3 ms | 16.2 ms | 9.4 ms |
| 100k points, every value | generated | 95 µs (152.33x) | 439 µs (23.57x) | 130 µs (125.71x) | 382 µs (24.56x) |
| 100k points, every value | generated + verify | 95 µs (152.43x) | 429 µs (24.00x) | 130 µs (126.24x) | 384 µs (24.17x) |
| encode 1000 users | JSON | 455 µs | 558 µs | 281 µs | 241 µs |
| encode 1000 users | hand-written (codec3) | 232 µs (1.97x) | 199 µs (2.85x) | 166 µs (1.70x) | 104 µs (2.34x) |
| encode 1000 users | generated | 158 µs (2.87x) | 186 µs (2.97x) | 157 µs (1.77x) | 123 µs (1.93x) |
| encode 500 products | JSON | 284 µs | 368 µs | 209 µs | 272 µs |
| encode 500 products | generated | 156 µs (1.81x) | 362 µs (1.01x) | 167 µs (1.27x) | 269 µs (1.01x) |
| encode 100k points | JSON, number arrays | 26.8 ms | 24.4 ms | 25.5 ms | 17.4 ms |
| encode 100k points | generated | 573 µs (46.34x) ~ | 665 µs (37.25x) | 724 µs (35.19x) | 837 µs (21.06x) |
