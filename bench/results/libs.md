# Suite `libs`

2026-11-07, Intel Xeon Processor (Icelake), linux 6.8.0-147-generic, commit 491f807.
Median of 5 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v26.13.0
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 1000 users, encode from rows | JSON | 324 µs | 714 µs | 569 µs | 468 µs |
| 1000 users, encode from rows | ts-bin-rpc | 309 µs (1.04x) | 405 µs (1.74x) | 383 µs (1.51x) | 256 µs (1.89x) |
| 1000 users, encode from rows | Arrow JS | 2.7 ms (0.12x) | 4.0 ms (0.18x) | 2.0 ms (0.29x) | 1.9 ms (0.25x) |
| 1000 users, encode from rows | Flechette | 1.8 ms (0.18x) | 3.9 ms (0.18x) | 981 µs (0.58x) | 1.7 ms (0.30x) |
| 1000 users, decode and read every field | JSON | 578 µs | 474 µs | 607 µs | 638 µs |
| 1000 users, decode and read every field | ts-bin-rpc, views | 118 µs (4.89x) | 150 µs (3.16x) | 157 µs (3.86x) | 189 µs (3.38x) |
| 1000 users, decode and read every field | ts-bin-rpc, views + verify | 129 µs (4.50x) | 165 µs (2.86x) | 179 µs (3.43x) | 205 µs (3.14x) |
| 1000 users, decode and read every field | Arrow JS, columns | 1.1 ms (0.52x) | 1.3 ms (0.36x) | 1.8 ms (0.34x) | 1.4 ms (0.45x) |
| 1000 users, decode and read every field | Flechette, columns | 674 µs (0.86x) | 979 µs (0.48x) | 1.2 ms (0.53x) | 1.0 ms (0.58x) |
| 1000 users, decode and read every field | Flechette, row objects | 913 µs (0.63x) | 1.2 ms (0.39x) | 1.8 ms (0.34x) | 1.2 ms (0.52x) |
| 1000 users, decode and read the numbers | JSON | 586 µs | 455 µs | 599 µs | 592 µs |
| 1000 users, decode and read the numbers | ts-bin-rpc, columns | 15 µs (39.97x) | 11 µs (40.76x) | 21 µs (29.64x) | 18 µs (33.27x) |
| 1000 users, decode and read the numbers | Arrow JS, columns | 41 µs (14.48x) | 34 µs (13.05x) | 52 µs (11.37x) | 48 µs (12.30x) |
| 1000 users, decode and read the numbers | Flechette, columns | 26 µs (22.33x) | 19 µs (23.14x) | 29 µs (20.43x) | 23 µs (25.83x) |
| 100k points, encode | JSON, number arrays | 21.0 ms | 55.4 ms | 114.4 ms | 47.3 ms |
| 100k points, encode | ts-bin-rpc | 858 µs (24.73x) ~ | 1.0 ms (55.03x) | 1.3 ms (86.82x) | 1.1 ms (43.78x) |
| 100k points, encode | Arrow JS | 887 µs (24.58x) ~ | 1.1 ms (49.13x) | 1.5 ms (78.69x) | 1.2 ms (40.24x) |
| 100k points, encode | Flechette | 829 µs (25.62x) | 1.1 ms (51.51x) | 1.1 ms (107.80x) | 1.1 ms (44.04x) |
| 100k points, decode and read every value | JSON, number arrays | 24.8 ms | 24.9 ms | 45.9 ms | 24.7 ms |
| 100k points, decode and read every value | ts-bin-rpc + verify | 362 µs (68.59x) | 372 µs (67.01x) | 261 µs (176.20x) | 739 µs (33.94x) |
| 100k points, decode and read every value | Arrow JS | 644 µs (38.44x) | 646 µs (38.41x) | 321 µs (143.58x) | 804 µs (31.22x) |
| 100k points, decode and read every value | Flechette | 614 µs (40.26x) | 625 µs (39.82x) | 278 µs (166.95x) | 752 µs (32.82x) |
| 100 entities, full state: encode and decode | JSON | 95 µs | 91 µs | 169 µs | 137 µs |
| 100 entities, full state: encode and decode | ts-bin-rpc | 27 µs (3.49x) | 28 µs (3.30x) | 37 µs (4.57x) | 24 µs (5.66x) |
| 100 entities, full state: encode and decode | Colyseus schema | 367 µs (0.26x) | 295 µs (0.31x) | 457 µs (0.37x) | 285 µs (0.48x) |
| 100 entities, 5 move: patch encode, decode and apply | JSON | 4.90 µs | 6.06 µs | 7.06 µs | 4.49 µs |
| 100 entities, 5 move: patch encode, decode and apply | ts-bin-rpc | 3.13 µs (1.56x) | 2.95 µs (2.05x) | 5.67 µs (1.24x) | 2.76 µs (1.62x) |
| 100 entities, 5 move: patch encode, decode and apply | Colyseus schema | 5.99 µs (0.81x) | 4.85 µs (1.22x) | 7.72 µs (0.91x) | 4.26 µs (1.06x) |
| 1000 entities, full state: encode and decode | JSON | 1.0 ms | 1.0 ms | 1.7 ms | 1.2 ms |
| 1000 entities, full state: encode and decode | ts-bin-rpc | 241 µs (4.21x) | 250 µs (4.06x) | 328 µs (5.24x) | 189 µs (6.63x) |
| 1000 entities, full state: encode and decode | Colyseus schema | 3.8 ms (0.26x) | 3.0 ms (0.34x) | 4.7 ms (0.36x) | 2.9 ms (0.43x) |
| 1000 entities, 50 move: patch encode, decode and apply | JSON | 30 µs | 31 µs | 49 µs | 29 µs |
| 1000 entities, 50 move: patch encode, decode and apply | ts-bin-rpc | 7.48 µs (3.97x) | 7.31 µs (4.27x) | 12 µs (4.20x) | 6.51 µs (4.45x) |
| 1000 entities, 50 move: patch encode, decode and apply | Colyseus schema | 52 µs (0.56x) | 43 µs (0.71x) | 73 µs (0.67x) | 39 µs (0.75x) |

## Bytes per message

From `node bench/node/libs-size.mjs`; gzip level 6. Arrow and Flechette send strings as plain `Utf8`, Colyseus a map of entities by id.

| Message | Format | Bytes | gzip |
|---|---|---|---|
| 1000 users | JSON | 132 KB | 23 KB |
| 1000 users | ts-bin-rpc | 64 KB | 21 KB |
| 1000 users | Arrow JS | 75 KB | 28 KB |
| 1000 users | Flechette | 75 KB | 28 KB |
| 100k points | JSON | 7010 KB | 1722 KB |
| 100k points | ts-bin-rpc | 1953 KB | 1303 KB |
| 100k points | Arrow JS | 1954 KB | 1303 KB |
| 100k points | Flechette | 1954 KB | 1303 KB |
| 100 entities, full state | JSON | 14 KB | 4.9 KB |
| 100 entities, full state | ts-bin-rpc | 3.4 KB | 2.3 KB |
| 100 entities, full state | Colyseus schema | 4.6 KB | 3.3 KB |
| 100 entities, 5 move: patch | JSON | 323 B | 196 B |
| 100 entities, 5 move: patch | ts-bin-rpc | 180 B | 151 B |
| 100 entities, 5 move: patch | Colyseus schema | 75 B | 98 B |
| 1000 entities, full state | JSON | 138 KB | 49 KB |
| 1000 entities, full state | ts-bin-rpc | 34 KB | 22 KB |
| 1000 entities, full state | Colyseus schema | 52 KB | 35 KB |
| 1000 entities, 50 move: patch | JSON | 3.1 KB | 1.3 KB |
| 1000 entities, 50 move: patch | ts-bin-rpc | 824 B | 694 B |
| 1000 entities, 50 move: patch | Colyseus schema | 750 B | 694 B |

## Notes

- Arrow JS and Flechette read columns, their fastest way; ts-bin-rpc reads views of rows, the way
  an app does, and its numbers through `columnsOf`. Flechette's row objects are its `toArray()`.
- The ts-bin-rpc patches are the frames of live state (`LiveDelta`), encoded and decoded by the
  generated code; the bookkeeping of `live()` that finds the changed fields is not in them. Colyseus
  finds changes in its setters, so its rows include that.
- Small patches are where ts-bin-rpc loses on bytes: a message carries a header with the string
  blocks, a row table, a column catalog and bitmaps, about 110 of the 180 bytes of 5 moves. Since
  491f807 the writer leaves out the columns no row has (FORMAT §6); before, the same patch took
  232 bytes and 30–45% longer.
