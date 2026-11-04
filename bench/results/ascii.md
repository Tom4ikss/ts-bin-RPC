# Suite `ascii`

2026-11-04, Apple M3 Pro, darwin 25.6.0, commit 682d2f1.
Median of 3 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 1000 names, ASCII | per string | 22 µs | 21 µs | 19 µs | 7.16 µs |
| 1000 names, ASCII | joined, skip | 25 µs (0.88x) | 19 µs (1.14x) | 15 µs (1.25x) | 12 µs (0.59x) |
| 1000 names, ASCII | joined, test | 18 µs (1.25x) | 8.85 µs (2.45x) | 7.83 µs (2.38x) | 8.36 µs (0.86x) |
| 1000 names, ASCII | per string + join | 39 µs (0.56x) | 26 µs (0.81x) | 25 µs (0.75x) | 14 µs (0.53x) |
| 1000 names, ASCII | joined, test + join | 18 µs (1.24x) | 8.84 µs (2.45x) | 7.81 µs (2.39x) | 8.30 µs (0.86x) |
| 1000 names, 30% Cyrillic | per string | 22 µs | 17 µs | 16 µs | 7.91 µs |
| 1000 names, 30% Cyrillic | joined, skip | 42 µs (0.52x) | 26 µs (0.66x) | 22 µs (0.75x) | 20 µs (0.41x) |
| 1000 names, 30% Cyrillic | joined, test | 44 µs (0.49x) | 25 µs (0.70x) | 22 µs (0.74x) | 14 µs (0.56x) |
| 1000 names, 30% Cyrillic | per string + join | 33 µs (0.65x) | 22 µs (0.78x) | 21 µs (0.77x) | 13 µs (0.62x) |
| 1000 names, 30% Cyrillic | joined, test + join | 56 µs (0.39x) | 30 µs (0.58x) | 27 µs (0.61x) | 19 µs (0.41x) |
| 1000 cities, 15% Cyrillic | per string | 17 µs | 15 µs | 15 µs | 6.34 µs |
| 1000 cities, 15% Cyrillic | joined, skip | 28 µs (0.60x) | 18 µs (0.83x) | 16 µs (0.95x) | 15 µs (0.43x) |
| 1000 cities, 15% Cyrillic | joined, test | 32 µs (0.52x) | 20 µs (0.75x) | 21 µs (0.73x) | 13 µs (0.50x) |
| 1000 cities, 15% Cyrillic | per string + join | 29 µs (0.58x) | 19 µs (0.75x) | 20 µs (0.73x) | 11 µs (0.57x) |
| 1000 cities, 15% Cyrillic | joined, test + join | 45 µs (0.37x) | 25 µs (0.59x) | 26 µs (0.58x) | 18 µs (0.36x) |
| 1000 emails, ASCII | per string | 24 µs | 20 µs | 20 µs | 12 µs |
| 1000 emails, ASCII | joined, skip | 47 µs (0.50x) | 34 µs (0.59x) | 37 µs (0.55x) | 27 µs (0.45x) |
| 1000 emails, ASCII | joined, test | 47 µs (0.50x) | 28 µs (0.72x) | 33 µs (0.61x) | 20 µs (0.61x) |
| 1000 emails, ASCII | per string + join | 34 µs (0.71x) | 24 µs (0.81x) | 26 µs (0.78x) | 17 µs (0.70x) |
| 1000 emails, ASCII | joined, test + join | 57 µs (0.42x) | 32 µs (0.61x) | 38 µs (0.53x) | 26 µs (0.47x) |
| 1000 names, 3% Cyrillic | per string | 22 µs | 18 µs | 18 µs | 7.26 µs |
| 1000 names, 3% Cyrillic | joined, skip | 33 µs (0.65x) | 21 µs (0.86x) | 17 µs (1.06x) | 15 µs (0.47x) |
| 1000 names, 3% Cyrillic | joined, test | 42 µs (0.51x) | 24 µs (0.74x) | 24 µs (0.76x) | 14 µs (0.51x) |
| 1000 names, 3% Cyrillic | per string + join | 37 µs (0.57x) | 24 µs (0.74x) | 25 µs (0.74x) | 14 µs (0.52x) |
| 1000 names, 3% Cyrillic | joined, test + join | 59 µs (0.37x) | 30 µs (0.58x) | 30 µs (0.61x) | 20 µs (0.35x) |
| 500 descriptions, ASCII | per string | 43 µs | 41 µs | 43 µs | 41 µs |
| 500 descriptions, ASCII | joined, skip | 67 µs (0.64x) | 90 µs (0.45x) | 89 µs (0.48x) | 61 µs (0.68x) |
| 500 descriptions, ASCII | joined, test | 37 µs (1.16x) | 33 µs (1.24x) | 33 µs (1.29x) | 38 µs (1.09x) |
| 500 descriptions, ASCII | per string + join | 52 µs (0.83x) | 47 µs (0.87x) | 50 µs (0.85x) | 48 µs (0.87x) |
| 500 descriptions, ASCII | joined, test + join | 36 µs (1.16x) | 33 µs (1.24x) | 33 µs (1.29x) | 38 µs (1.10x) |
| 10 names, 30% Cyrillic | per string | 0.17 µs | 0.15 µs | 0.13 µs | 0.07 µs |
| 10 names, 30% Cyrillic | joined, skip | 0.38 µs (0.46x) | 0.27 µs (0.55x) | 0.31 µs (0.42x) | 0.22 µs (0.34x) |
| 10 names, 30% Cyrillic | joined, test | 0.34 µs (0.49x) | 0.21 µs (0.69x) | 0.29 µs (0.45x) | 0.16 µs (0.48x) |
| 10 names, 30% Cyrillic | per string + join | 0.28 µs (0.61x) | 0.19 µs (0.78x) | 0.18 µs (0.70x) | 0.15 µs (0.50x) |
| 10 names, 30% Cyrillic | joined, test + join | 0.44 µs (0.40x) | 0.26 µs (0.57x) | 0.35 µs (0.37x) | 0.25 µs (0.30x) |
