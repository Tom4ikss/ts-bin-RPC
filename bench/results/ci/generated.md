# Suite `generated`

2026-11-04, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1019-azure, commit efefb4e.
Median of 10 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.23.4
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 6.42 µs | 3.27 µs | 4.71 µs | 3.63 µs |
| 10 users, all fields | hand-written (codec3) | 1.59 µs (4.03x) | 1.56 µs (2.10x) | 2.86 µs (1.63x) | 2.78 µs (1.30x) ~ |
| 10 users, all fields | generated | 1.86 µs (3.45x) | 1.88 µs (1.74x) | 3.47 µs (1.36x) | 2.96 µs (1.24x) |
| 10 users, all fields | generated + verify | 2.34 µs (2.74x) | 2.28 µs (1.43x) | 4.14 µs (1.13x) | 3.49 µs (1.04x) |
| 10 users, all fields | generated, decode (plain) | 2.05 µs (3.12x) | 1.95 µs (1.66x) | 3.68 µs (1.28x) | 3.11 µs (1.17x) |
| 1000 users, all fields | JSON | 769 µs | 506 µs | 387 µs | 405 µs |
| 1000 users, all fields | hand-written (codec3) | 69 µs (11.20x) | 82 µs (6.12x) | 90 µs (4.26x) | 104 µs (3.87x) ~ |
| 1000 users, all fields | generated | 73 µs (10.51x) | 101 µs (4.99x) | 98 µs (3.97x) | 97 µs (4.12x) |
| 1000 users, all fields | generated + verify | 82 µs (9.26x) | 109 µs (4.63x) | 107 µs (3.64x) | 104 µs (3.91x) |
| 1000 users, all fields | generated, decode (plain) | 88 µs (8.68x) | 96 µs (5.29x) | 113 µs (3.42x) | 101 µs (4.01x) |
| 1000 users, 2 fields | JSON | 766 µs | 502 µs | 386 µs | 399 µs |
| 1000 users, 2 fields | hand-written (codec3) | 36 µs (20.89x) | 43 µs (11.82x) | 48 µs (7.93x) | 66 µs (5.95x) ~ |
| 1000 users, 2 fields | generated | 37 µs (20.68x) | 48 µs (10.42x) | 50 µs (7.70x) | 62 µs (6.48x) |
| 1000 users, 2 fields | generated + verify | 47 µs (16.24x) | 56 µs (8.96x) | 60 µs (6.41x) | 70 µs (5.65x) |
| 1000 users, 2 fields | generated, decode (plain) | 86 µs (8.96x) | 90 µs (5.51x) | 110 µs (3.50x) | 95 µs (4.15x) |
| 1000 users, numbers only | JSON | 765 µs | 503 µs | 387 µs | 403 µs |
| 1000 users, numbers only | hand-written (codec3) | 15 µs (52.54x) | 14 µs (37.33x) | 12 µs (31.90x) | 12 µs (35.24x) |
| 1000 users, numbers only | generated | 18 µs (43.61x) | 17 µs (29.66x) | 13 µs (29.49x) | 11 µs (36.14x) ~ |
| 1000 users, numbers only | generated + verify | 33 µs (22.97x) | 38 µs (13.37x) | 29 µs (13.49x) | 55 µs (7.17x) |
| 1000 users, numbers only | generated, decode (plain) | 87 µs (8.71x) | 91 µs (5.57x) | 110 µs (3.52x) | 106 µs (3.80x) |
| 1 user, all fields | JSON | 0.87 µs | 0.66 µs | 0.91 µs | 0.66 µs |
| 1 user, all fields | generated | 0.52 µs (1.70x) | 0.51 µs (1.31x) | 0.91 µs (1.01x) | 0.80 µs (0.84x) |
| 1 user, all fields | generated + verify | 0.69 µs (1.27x) | 0.66 µs (1.03x) | 1.36 µs (0.67x) | 1.01 µs (0.66x) |
| 500 products (long text), all fields | JSON | 426 µs | 143 µs | 310 µs | 240 µs |
| 500 products (long text), all fields | generated | 65 µs (6.65x) | 67 µs (2.13x) | 105 µs (2.95x) | 74 µs (3.26x) |
| 500 products (long text), all fields | generated + verify | 82 µs (5.23x) | 84 µs (1.70x) | 127 µs (2.44x) | 87 µs (2.74x) |
| 100k points, every value | JSON, number arrays | 19.5 ms | 13.1 ms | 22.9 ms | 13.0 ms |
| 100k points, every value | generated | 139 µs (139.69x) | 648 µs (20.38x) | 222 µs (103.20x) ~ | 664 µs (19.50x) |
| 100k points, every value | generated + verify | 139 µs (139.47x) | 640 µs (20.59x) | 222 µs (103.16x) ~ | 664 µs (19.61x) |
| encode 1000 users | JSON | 651 µs | 723 µs | 390 µs | 344 µs |
| encode 1000 users | hand-written (codec3) | 330 µs (1.95x) | 261 µs (2.75x) | 247 µs (1.57x) | 136 µs (2.53x) ~ |
| encode 1000 users | generated | 224 µs (2.91x) | 240 µs (2.98x) | 236 µs (1.64x) | 170 µs (2.03x) |
| encode 500 products | JSON | 375 µs | 460 µs | 264 µs | 345 µs |
| encode 500 products | generated | 222 µs (1.67x) ~ | 463 µs (1.00x) | 232 µs (1.13x) | 353 µs (0.99x) |
| encode 100k points | JSON, number arrays | 36.3 ms | 32.1 ms | 33.2 ms | 21.7 ms |
| encode 100k points | generated | 570 µs (64.91x) ~ | 881 µs (36.61x) | 909 µs (36.57x) | 1.0 ms (21.36x) |
