# Suite `core`

2026-11-02, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 10 users, all fields | JSON | 4.56 µs | 2.15 µs | 3.47 µs | 2.56 µs |
| 10 users, all fields | lazy+memo | 2.87 µs (1.59x) | 2.62 µs (0.82x) | 2.83 µs (1.22x) | 2.85 µs (0.90x) |
| 10 users, all fields | eager | 2.90 µs (1.57x) | 2.77 µs (0.77x) | 2.77 µs (1.25x) | 2.70 µs (0.95x) |
| 1000 users, 2 fields | JSON | 474 µs | 219 µs | 313 µs | 280 µs |
| 1000 users, 2 fields | lazy+memo | 103 µs (4.59x) | 103 µs (2.13x) | 110 µs (2.85x) ~ | 95 µs (2.94x) |
| 1000 users, 2 fields | eager | 295 µs (1.61x) | 286 µs (0.77x) | 315 µs (0.99x) ~ | 264 µs (1.06x) |
| 1000 users, all fields | JSON | 487 µs | 219 µs | 341 µs | 282 µs |
| 1000 users, all fields | lazy+memo | 300 µs (1.62x) | 274 µs (0.80x) | 324 µs (1.05x) | 292 µs (0.96x) |
| 1000 users, all fields | eager | 301 µs (1.62x) | 282 µs (0.78x) | 441 µs (0.77x) ~ | 275 µs (1.02x) |
| 1000 users, name x5 | JSON | 488 µs | 227 µs | 416 µs ~ | 284 µs |
| 1000 users, name x5 | lazy+memo | 127 µs (3.85x) | 129 µs (1.76x) | 125 µs (3.32x) | 115 µs (2.47x) |
| 1000 users, name x5 | eager | 320 µs (1.53x) | 321 µs (0.71x) | 337 µs (1.23x) ~ | 281 µs (1.01x) |
| 1000 users, sort by name | JSON | 675 µs | 383 µs | 576 µs ~ | 388 µs |
| 1000 users, sort by name | lazy+memo | 428 µs (1.58x) | 368 µs (1.04x) | 382 µs (1.51x) | 346 µs (1.12x) |
| 1000 users, sort by name | eager | 559 µs (1.21x) | 509 µs (0.75x) | 556 µs (1.04x) | 539 µs (0.72x) |
| 100k points, sum+max | JSON | 21.3 ms | 12.7 ms | 21.8 ms | 10.9 ms |
| 100k points, sum+max | AoS getters | 203 µs (104.95x) | 122 µs (103.90x) | 497 µs (43.83x) | 122 µs (89.04x) |
| 100k points, sum+max | SoA TypedArray | 72 µs (297.56x) | 73 µs (172.64x) | 109 µs (200.28x) | 75 µs (144.51x) |
| encode 1000 users | JSON | 383 µs | 334 µs | 282 µs | 230 µs |
| encode 1000 users | binary | 201 µs (1.91x) | 549 µs (0.61x) ~ | 460 µs (0.61x) | 367 µs (0.63x) |
| encode 100k points | JSON | 31.6 ms | 15.1 ms | 29.1 ms ~ | 10.2 ms |
| encode 100k points | SoA | 338 µs (93.35x) ~ | 336 µs (45.00x) | 302 µs (96.36x) | 219 µs (46.50x) |
