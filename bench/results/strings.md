# Suite `strings`

2026-11-02, Apple M3 Pro, darwin 25.6.0.
Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.

- node: node v22.13.1
- chromium: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| ascii 4B x1000 | JSON.parse(bytes) | 264 µs ~ | 73 µs | 64 µs | 40 µs |
| ascii 4B x1000 | TextDecoder | 223 µs (1.18x) | 374 µs (0.19x) | 828 µs (0.08x) ~ | 123 µs (0.32x) ~ |
| ascii 4B x1000 | char loop | 64 µs (4.12x) | 57 µs (1.26x) | 94 µs (0.68x) ~ | 12 µs (3.34x) |
| ascii 4B x1000 | fromCharCode.apply | 292 µs (0.91x) ~ | 159 µs (0.46x) | 399 µs (0.16x) | 80 µs (0.50x) ~ |
| ascii 4B x1000 | bulk decode+substring | 38 µs (6.90x) ~ | 24 µs (3.06x) | 24 µs (2.71x) ~ | 5.00 µs (7.95x) |
| ascii 8B x1000 | JSON.parse(bytes) | 358 µs ~ | 69 µs | 68 µs | 44 µs |
| ascii 8B x1000 | TextDecoder | 182 µs (1.97x) | 355 µs (0.19x) ~ | 584 µs (0.12x) ~ | 116 µs (0.37x) ~ |
| ascii 8B x1000 | char loop | 414 µs (0.86x) ~ | 122 µs (0.56x) | 125 µs (0.55x) ~ | 25 µs (1.74x) |
| ascii 8B x1000 | fromCharCode.apply | 329 µs (1.09x) ~ | 187 µs (0.37x) | 953 µs (0.07x) ~ | 81 µs (0.54x) |
| ascii 8B x1000 | bulk decode+substring | 31 µs (11.64x) ~ | 25 µs (2.72x) | 101 µs (0.68x) ~ | 6.24 µs (7.00x) |
| ascii 16B x1000 | JSON.parse(bytes) | 74 µs ~ | 37 µs | 457 µs ~ | 48 µs |
| ascii 16B x1000 | TextDecoder | 345 µs (0.22x) ~ | 307 µs (0.12x) | 2.1 ms (0.22x) ~ | 114 µs (0.42x) ~ |
| ascii 16B x1000 | char loop | 261 µs (0.28x) ~ | 156 µs (0.24x) | 96 µs (4.76x) ~ | 50 µs (0.96x) |
| ascii 16B x1000 | fromCharCode.apply | 650 µs (0.11x) ~ | 221 µs (0.17x) ~ | 151 µs (3.03x) ~ | 90 µs (0.54x) ~ |
| ascii 16B x1000 | bulk decode+substring | 58 µs (1.28x) ~ | 13 µs (2.73x) | 9.79 µs (46.71x) ~ | 8.41 µs (5.73x) |
| ascii 24B x1000 | JSON.parse(bytes) | 281 µs ~ | 38 µs | 47 µs ~ | 34 µs |
| ascii 24B x1000 | TextDecoder | 576 µs (0.49x) ~ | 384 µs (0.10x) | 221 µs (0.21x) ~ | 125 µs (0.27x) ~ |
| ascii 24B x1000 | char loop | 348 µs (0.81x) | 319 µs (0.12x) | 108 µs (0.44x) | 78 µs (0.44x) |
| ascii 24B x1000 | fromCharCode.apply | 381 µs (0.74x) ~ | 303 µs (0.12x) | 151 µs (0.31x) | 100 µs (0.34x) ~ |
| ascii 24B x1000 | bulk decode+substring | 25 µs (11.16x) | 19 µs (2.02x) | 11 µs (4.22x) | 11 µs (3.25x) |
| ascii 32B x1000 | JSON.parse(bytes) | 422 µs ~ | 53 µs | 44 µs | 40 µs |
| ascii 32B x1000 | TextDecoder | 387 µs (1.09x) ~ | 275 µs (0.19x) | 138 µs (0.32x) | 120 µs (0.33x) ~ |
| ascii 32B x1000 | char loop | 752 µs (0.56x) ~ | 271 µs (0.19x) | 152 µs (0.29x) ~ | 103 µs (0.38x) |
| ascii 32B x1000 | fromCharCode.apply | 480 µs (0.88x) ~ | 268 µs (0.20x) | 169 µs (0.26x) ~ | 109 µs (0.36x) ~ |
| ascii 32B x1000 | bulk decode+substring | 26 µs (16.19x) ~ | 17 µs (3.16x) | 14 µs (3.17x) | 12 µs (3.17x) |
| ascii 64B x1000 | JSON.parse(bytes) | 148 µs | 63 µs ~ | 75 µs ~ | 50 µs |
| ascii 64B x1000 | TextDecoder | 201 µs (0.74x) ~ | 422 µs (0.15x) ~ | 167 µs (0.45x) ~ | 129 µs (0.39x) ~ |
| ascii 64B x1000 | char loop | 819 µs (0.18x) | 811 µs (0.08x) | 285 µs (0.26x) ~ | 216 µs (0.23x) |
| ascii 64B x1000 | fromCharCode.apply | 696 µs (0.21x) | 679 µs (0.09x) | 319 µs (0.24x) ~ | 152 µs (0.33x) ~ |
| ascii 64B x1000 | bulk decode+substring | 33 µs (4.56x) ~ | 34 µs (1.88x) | 23 µs (3.30x) | 22 µs (2.33x) |
| ascii 256B x1000 | JSON.parse(bytes) | 657 µs ~ | 199 µs | 248 µs | 137 µs |
| ascii 256B x1000 | TextDecoder | 353 µs (1.86x) ~ | 459 µs (0.43x) ~ | 226 µs (1.10x) ~ | 182 µs (0.75x) ~ |
| ascii 256B x1000 | char loop | 4.6 ms (0.14x) ~ | 2.7 ms (0.07x) | 690 µs (0.36x) | 913 µs (0.15x) |
| ascii 256B x1000 | fromCharCode.apply | 2.4 ms (0.28x) | 2.0 ms (0.10x) | 418 µs (0.59x) | 397 µs (0.34x) |
| ascii 256B x1000 | bulk decode+substring | 163 µs (4.03x) | 97 µs (2.05x) ~ | 79 µs (3.12x) | 74 µs (1.86x) |
| cyrillic 8ch x1000 | JSON.parse(bytes) | 183 µs ~ | 107 µs | 28 µs | 72 µs |
| cyrillic 8ch x1000 | TextDecoder utf-8 | 287 µs (0.64x) | 408 µs (0.26x) | 127 µs (0.22x) | 156 µs (0.46x) ~ |
| cyrillic 8ch x1000 | TextDecoder utf-16le | 249 µs (0.74x) | 363 µs (0.29x) | 120 µs (0.23x) | 128 µs (0.56x) ~ |
| cyrillic 8ch x1000 | fromCharCode.apply u16 | 192 µs (0.95x) | 184 µs (0.58x) | 128 µs (0.22x) | 94 µs (0.77x) |
| cyrillic 8ch x1000 | bulk utf-8+substring | 131 µs (1.40x) | 75 µs (1.43x) | 13 µs (2.22x) | 34 µs (2.10x) |
| cyrillic 8ch x1000 | bulk utf-16le+substring | 51 µs (3.57x) ~ | 56 µs (1.90x) | 8.70 µs (3.19x) | 25 µs (2.84x) |
| cyrillic 32ch x1000 | JSON.parse(bytes) | 821 µs ~ | 292 µs | 57 µs | 180 µs |
| cyrillic 32ch x1000 | TextDecoder utf-8 | 916 µs (0.90x) ~ | 573 µs (0.51x) | 187 µs (0.31x) ~ | 271 µs (0.67x) |
| cyrillic 32ch x1000 | TextDecoder utf-16le | 350 µs (2.35x) ~ | 352 µs (0.83x) | 139 µs (0.41x) | 207 µs (0.87x) |
| cyrillic 32ch x1000 | fromCharCode.apply u16 | 401 µs (2.05x) | 277 µs (1.05x) | 162 µs (0.35x) ~ | 118 µs (1.53x) ~ |
| cyrillic 32ch x1000 | bulk utf-8+substring | 448 µs (1.83x) | 150 µs (1.94x) ~ | 38 µs (1.53x) ~ | 106 µs (1.70x) |
| cyrillic 32ch x1000 | bulk utf-16le+substring | 61 µs (13.54x) | 114 µs (2.56x) | 19 µs (2.97x) | 88 µs (2.05x) |
| cyrillic 128ch x1000 | JSON.parse(bytes) | 2.3 ms | 991 µs ~ | 184 µs | 492 µs |
| cyrillic 128ch x1000 | TextDecoder utf-8 | 1.9 ms (1.24x) | 1.2 ms (0.81x) ~ | 297 µs (0.62x) ~ | 683 µs (0.72x) |
| cyrillic 128ch x1000 | TextDecoder utf-16le | 449 µs (5.14x) | 633 µs (1.57x) ~ | 213 µs (0.86x) ~ | 509 µs (0.97x) |
| cyrillic 128ch x1000 | fromCharCode.apply u16 | 1.3 ms (1.84x) | 1.4 ms (0.73x) ~ | 269 µs (0.68x) | 283 µs (1.74x) ~ |
| cyrillic 128ch x1000 | bulk utf-8+substring | 2.5 ms (0.93x) ~ | 762 µs (1.30x) ~ | 124 µs (1.49x) | 387 µs (1.27x) |
| cyrillic 128ch x1000 | bulk utf-16le+substring | 408 µs (5.65x) | 575 µs (1.72x) ~ | 63 µs (2.92x) ~ | 336 µs (1.46x) |
