# Suite `generated`

2026-11-02, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 9.90 µs ~ | 2.24 µs | 7.01 µs ~ | 2.69 µs |
| 10 users, all fields | hand-written (codec3) | 3.09 µs (3.21x) ~ | 1.27 µs (1.77x) | 5.00 µs (1.40x) ~ | 1.67 µs (1.61x) |
| 10 users, all fields | generated | 3.23 µs (3.06x) ~ | 1.27 µs (1.76x) | 6.32 µs (1.11x) ~ | 1.68 µs (1.60x) |
| 10 users, all fields | generated + verify | 3.99 µs (2.48x) ~ | 1.64 µs (1.37x) ~ | 6.94 µs (1.01x) ~ | 2.02 µs (1.33x) |
| 10 users, all fields | generated, decode (plain) | 3.45 µs (2.87x) ~ | 1.35 µs (1.66x) | 4.68 µs (1.50x) ~ | 1.81 µs (1.48x) |
| 1000 users, all fields | JSON | 817 µs ~ | 224 µs | 648 µs ~ | 299 µs |
| 1000 users, all fields | hand-written (codec3) | 190 µs (4.30x) ~ | 69 µs (3.23x) | 158 µs (4.10x) ~ | 78 µs (3.85x) |
| 1000 users, all fields | generated | 109 µs (7.48x) ~ | 74 µs (3.02x) | 147 µs (4.42x) ~ | 73 µs (4.11x) |
| 1000 users, all fields | generated + verify | 183 µs (4.47x) ~ | 93 µs (2.40x) | 229 µs (2.84x) ~ | 88 µs (3.40x) |
| 1000 users, all fields | generated, decode (plain) | 259 µs (3.15x) ~ | 78 µs (2.88x) | 207 µs (3.12x) ~ | 76 µs (3.96x) |
| 1000 users, 2 fields | JSON | 1.2 ms ~ | 224 µs | 675 µs ~ | 297 µs |
| 1000 users, 2 fields | hand-written (codec3) | 72 µs (16.32x) ~ | 38 µs (5.84x) | 66 µs (10.30x) ~ | 50 µs (5.99x) |
| 1000 users, 2 fields | generated | 60 µs (19.54x) ~ | 35 µs (6.47x) | 61 µs (11.08x) ~ | 48 µs (6.18x) |
| 1000 users, 2 fields | generated + verify | 95 µs (12.41x) ~ | 54 µs (4.13x) | 98 µs (6.89x) ~ | 64 µs (4.67x) |
| 1000 users, 2 fields | generated, decode (plain) | 174 µs (6.77x) ~ | 69 µs (3.22x) | 201 µs (3.36x) ~ | 72 µs (4.14x) |
| 1000 users, numbers only | JSON | 1.0 ms ~ | 224 µs | 660 µs ~ | 296 µs |
| 1000 users, numbers only | hand-written (codec3) | 28 µs (35.72x) ~ | 10 µs (22.13x) | 15 µs (44.97x) ~ | 9.01 µs (32.87x) |
| 1000 users, numbers only | generated | 32 µs (31.64x) ~ | 11 µs (21.19x) | 18 µs (36.95x) ~ | 9.20 µs (32.20x) |
| 1000 users, numbers only | generated + verify | 98 µs (10.30x) ~ | 41 µs (5.53x) | 53 µs (12.49x) ~ | 49 µs (6.02x) |
| 1000 users, numbers only | generated, decode (plain) | 178 µs (5.64x) ~ | 70 µs (3.19x) | 123 µs (5.36x) ~ | 74 µs (4.02x) |
| encode 1000 users | JSON | 657 µs ~ | 272 µs | 526 µs ~ | 218 µs |
| encode 1000 users | hand-written (codec3) | 438 µs (1.50x) ~ | 163 µs (1.67x) | 375 µs (1.40x) ~ | 106 µs (2.06x) |
| encode 1000 users | generated | 390 µs (1.68x) ~ | 143 µs (1.90x) | 361 µs (1.46x) ~ | 118 µs (1.84x) |
