# Suite `small`

2026-11-04, AMD EPYC 9V74 80-Core Processor, linux 7.0.0-1017-azure, commit 42ee282.
Median of 5 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- node: node v22.23.4
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | firefox | chromium | node | webkit |
|---|---|---|---|---|---|
| 10 users | JSON, all fields | 4.48 µs | 3.38 µs | 6.84 µs | 4.44 µs |
| 10 users | hand-written (codec3), all fields | 3.19 µs (1.39x) ~ | 1.57 µs (2.16x) | 1.54 µs (4.45x) | 2.79 µs (1.60x) |
| 10 users | generated, all fields | 3.47 µs (1.30x) | 1.94 µs (1.74x) | 1.80 µs (3.74x) | 3.00 µs (1.48x) |
| 10 users | generated + verify, all fields | 4.08 µs (1.12x) | 2.34 µs (1.46x) | 2.29 µs (2.97x) | 3.49 µs (1.28x) |
| 10 users | verify only | 1.33 µs (3.37x) | 0.76 µs (4.50x) | 0.73 µs (9.32x) | 1.35 µs (3.36x) |
| 10 users | new Reader | 0.11 µs (39.07x) | 0.06 µs (53.06x) | 0.07 µs (102.49x) | 0.06 µs (69.54x) |
| 10 users | view, no field read | 1.18 µs (3.80x) | 0.36 µs (9.32x) | 0.46 µs (14.92x) | 0.60 µs (7.48x) |
| 10 users | verify + view, no field read | 2.50 µs (1.78x) | 1.13 µs (2.97x) | 1.26 µs (5.45x) | 2.10 µs (2.12x) |
| 10 users | verify + view, numbers only | 2.58 µs (1.74x) | 1.20 µs (2.82x) | 1.31 µs (5.24x) | 2.13 µs (2.09x) |
| 10 users | view, numbers only | 1.25 µs (3.59x) | 0.42 µs (8.03x) | 0.51 µs (13.46x) | 0.64 µs (7.00x) |
| 10 users | TextDecoder, ASCII block | 0.52 µs (8.77x) | 0.20 µs (16.60x) | 0.11 µs (60.48x) | 0.38 µs (11.62x) |
| 10 users | TextDecoder, UTF-16 block | 0.42 µs (10.75x) | 0.38 µs (8.92x) | 0.23 µs (29.06x) | 0.77 µs (5.85x) |
| 10 users | WeakMap.set on a fresh array | 0.17 µs (26.70x) ~ | 0.14 µs (24.21x) | 0.20 µs (31.89x) ~ | 0.11 µs (41.06x) |
| 100 users | JSON, all fields | 36 µs | 29 µs | 64 µs | 35 µs |
| 100 users | hand-written (codec3), all fields | 12 µs (2.93x) ~ | 10 µs (2.77x) | 9.51 µs (6.75x) | 13 µs (2.58x) |
| 100 users | generated, all fields | 13 µs (2.77x) | 11 µs (2.53x) | 10 µs (6.30x) | 13 µs (2.60x) |
| 100 users | generated + verify, all fields | 14 µs (2.49x) | 12 µs (2.31x) | 11 µs (5.56x) | 15 µs (2.38x) |
| 100 users | verify only | 2.92 µs (12.59x) | 2.92 µs (9.90x) | 2.41 µs (26.63x) | 5.54 µs (6.19x) |
| 100 users | new Reader | 0.11 µs (326.27x) ~ | 0.06 µs (492.54x) | 0.07 µs (959.06x) | 0.06 µs (534.92x) |
| 100 users | view, no field read | 2.23 µs (16.10x) ~ | 0.65 µs (44.37x) | 0.85 µs (74.98x) | 1.66 µs (21.21x) |
| 100 users | verify + view, no field read | 5.11 µs (7.00x) | 3.67 µs (7.87x) | 3.33 µs (19.03x) | 7.62 µs (4.58x) |
| 100 users | verify + view, numbers only | 5.61 µs (6.47x) | 4.84 µs (5.98x) | 4.53 µs (14.01x) | 7.94 µs (4.37x) |
| 100 users | view, numbers only | 2.60 µs (13.83x) | 1.79 µs (16.18x) | 1.92 µs (33.34x) | 2.06 µs (16.83x) |
| 100 users | TextDecoder, ASCII block | 1.45 µs (24.73x) | 0.48 µs (59.92x) | 0.41 µs (153.28x) ~ | 1.07 µs (32.42x) |
| 100 users | TextDecoder, UTF-16 block | 1.18 µs (30.60x) | 1.82 µs (15.85x) | 0.93 µs (68.33x) | 4.30 µs (7.96x) |
| 100 users | WeakMap.set on a fresh array | 0.21 µs (182.33x) | 0.15 µs (194.27x) | 0.21 µs (295.71x) | 0.12 µs (279.79x) |
| 8 typed array views | own buffers, new Uint8Array(10) | 0.03 µs | 0.14 µs | 0.14 µs | 0.06 µs |
| 8 typed array views | views over one buffer | 0.46 µs (0.06x) | 0.10 µs (1.41x) | 0.11 µs (1.34x) | 0.29 µs (0.22x) |
| 8 typed array views | DataViews over one buffer | 0.62 µs (0.05x) | 0.29 µs (0.50x) | 0.37 µs (0.39x) | 0.27 µs (0.23x) |
