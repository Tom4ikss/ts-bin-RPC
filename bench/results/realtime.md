# Suite `realtime`

2026-11-02, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 1 entities, encode+decode | JSON | 1.12 µs | 1.02 µs ~ | 1.39 µs ~ | 0.52 µs ~ |
| 1 entities, encode+decode | columns, directory | 0.65 µs (1.74x) | 0.66 µs (1.54x) | 1.24 µs (1.12x) | 0.63 µs (0.83x) ~ |
| 1 entities, encode+decode | columns, implied offsets | 0.70 µs (1.60x) | 0.72 µs (1.42x) | 1.28 µs (1.09x) ~ | 0.65 µs (0.80x) |
| 1 entities, decode only | JSON | 0.54 µs ~ | 0.34 µs | 0.58 µs | 0.25 µs |
| 1 entities, decode only | columns, implied offsets | 0.26 µs (2.05x) | 0.24 µs (1.37x) | 0.37 µs (1.57x) | 0.21 µs (1.19x) |
| 10 entities, encode+decode | JSON | 8.13 µs | 3.95 µs ~ | 8.58 µs | 2.99 µs |
| 10 entities, encode+decode | columns, directory | 0.73 µs (11.12x) | 0.73 µs (5.44x) | 1.27 µs (6.77x) | 0.57 µs (5.22x) ~ |
| 10 entities, encode+decode | columns, implied offsets | 0.76 µs (10.67x) | 0.79 µs (5.03x) | 1.33 µs (6.47x) | 0.64 µs (4.69x) ~ |
| 10 entities, decode only | JSON | 4.04 µs | 1.85 µs | 4.16 µs | 1.60 µs |
| 10 entities, decode only | columns, implied offsets | 0.29 µs (14.13x) | 0.26 µs (7.20x) | 0.37 µs (11.11x) | 0.22 µs (7.31x) ~ |
| 100 entities, encode+decode | JSON | 83 µs | 33 µs | 80 µs | 35 µs |
| 100 entities, encode+decode | columns, directory | 1.15 µs (72.19x) | 1.19 µs (27.76x) | 1.65 µs (48.40x) | 1.14 µs (31.06x) |
| 100 entities, encode+decode | columns, implied offsets | 1.37 µs (60.79x) ~ | 1.24 µs (26.58x) | 1.68 µs (47.42x) | 1.15 µs (30.88x) |
| 100 entities, decode only | JSON | 41 µs | 17 µs | 42 µs | 14 µs |
| 100 entities, decode only | columns, implied offsets | 0.43 µs (94.37x) | 0.42 µs (41.05x) | 0.49 µs (84.82x) | 0.31 µs (45.43x) ~ |
