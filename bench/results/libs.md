# Suite `libs`

2026-11-07, Intel Xeon Processor (Icelake), linux 6.8.0-147-generic, commit d5e5210.
Median of 5 runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; `~` marks rows whose ratio ranged over 25% between runs.

- node: node v26.13.0
- chromium: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36
- firefox: Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
- webkit: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

| Group | Variant | node | chromium | firefox | webkit |
|---|---|---|---|---|---|
| 1000 users, encode from rows | JSON | 319 µs | 707 µs | 563 µs | 470 µs |
| 1000 users, encode from rows | ts-bin-rpc | 316 µs (1.01x) | 337 µs (2.08x) | 369 µs (1.53x) | 248 µs (1.87x) |
| 1000 users, encode from rows | Arrow JS | 2.5 ms (0.13x) | 4.2 ms (0.17x) | 1.9 ms (0.29x) | 1.9 ms (0.25x) |
| 1000 users, encode from rows | Flechette | 1.8 ms (0.18x) | 4.3 ms (0.16x) | 958 µs (0.59x) | 1.6 ms (0.30x) |
| 1000 users, decode and read every field | JSON | 575 µs | 473 µs | 602 µs | 613 µs |
| 1000 users, decode and read every field | ts-bin-rpc, views | 118 µs (4.90x) | 149 µs (3.17x) | 153 µs (3.93x) | 192 µs (3.29x) |
| 1000 users, decode and read every field | ts-bin-rpc, views + verify | 129 µs (4.49x) | 167 µs (2.84x) | 176 µs (3.42x) | 208 µs (3.04x) |
| 1000 users, decode and read every field | Arrow JS, columns | 1.1 ms (0.51x) | 1.3 ms (0.37x) | 1.7 ms (0.35x) | 1.3 ms (0.46x) |
| 1000 users, decode and read every field | Flechette, columns | 669 µs (0.86x) | 970 µs (0.48x) | 1.2 ms (0.52x) | 1.0 ms (0.59x) |
| 1000 users, decode and read every field | Flechette, row objects | 911 µs (0.63x) | 1.2 ms (0.40x) | 1.8 ms (0.34x) | 1.2 ms (0.52x) |
| 1000 users, decode and read the numbers | JSON | 580 µs | 436 µs | 593 µs | 609 µs |
| 1000 users, decode and read the numbers | ts-bin-rpc, columns | 14 µs (40.33x) | 11 µs (40.16x) | 20 µs (29.47x) | 18 µs (34.46x) |
| 1000 users, decode and read the numbers | Arrow JS, columns | 41 µs (14.48x) | 33 µs (13.02x) | 52 µs (11.31x) | 48 µs (12.70x) |
| 1000 users, decode and read the numbers | Flechette, columns | 26 µs (21.90x) | 19 µs (22.87x) | 29 µs (20.72x) | 23 µs (27.14x) |
| 100k points, encode | JSON, number arrays | 20.9 ms | 54.8 ms | 113.0 ms | 47.5 ms |
| 100k points, encode | ts-bin-rpc | 778 µs (26.86x) | 997 µs (54.89x) | 1.3 ms (86.81x) | 1.0 ms (45.30x) |
| 100k points, encode | Arrow JS | 903 µs (23.09x) | 1.1 ms (49.90x) | 1.4 ms (81.56x) | 1.2 ms (40.97x) |
| 100k points, encode | Flechette | 843 µs (24.42x) ~ | 1.1 ms (51.72x) | 1.0 ms (109.61x) | 1.1 ms (45.06x) |
| 100k points, decode and read every value | JSON, number arrays | 24.7 ms | 24.4 ms | 46.2 ms | 24.6 ms |
| 100k points, decode and read every value | ts-bin-rpc + verify | 361 µs (68.51x) | 444 µs (54.97x) | 213 µs (215.06x) | 671 µs (36.18x) |
| 100k points, decode and read every value | Arrow JS | 637 µs (38.45x) | 647 µs (37.78x) | 313 µs (147.60x) | 739 µs (32.99x) |
| 100k points, decode and read every value | Flechette | 608 µs (40.50x) | 622 µs (39.12x) | 276 µs (167.07x) | 692 µs (35.24x) |
| 100 entities, full state: encode and decode | JSON | 93 µs | 89 µs | 166 µs | 144 µs |
| 100 entities, full state: encode and decode | ts-bin-rpc | 27 µs (3.48x) | 27 µs (3.28x) | 35 µs (4.69x) | 24 µs (5.99x) |
| 100 entities, full state: encode and decode | Colyseus schema | 366 µs (0.25x) | 292 µs (0.30x) | 458 µs (0.36x) | 289 µs (0.50x) |
| 100 entities, 5 move: patch encode, decode and apply | JSON | 4.69 µs | 5.55 µs | 7.04 µs | 4.51 µs |
| 100 entities, 5 move: patch encode, decode and apply | ts-bin-rpc | 4.19 µs (1.13x) | 3.94 µs (1.41x) | 7.43 µs (0.95x) | 3.94 µs (1.14x) |
| 100 entities, 5 move: patch encode, decode and apply | Colyseus schema | 5.94 µs (0.80x) | 4.81 µs (1.15x) | 7.60 µs (0.92x) | 4.31 µs (1.04x) |
| 1000 entities, full state: encode and decode | JSON | 1.0 ms | 1.0 ms | 1.7 ms | 1.3 ms |
| 1000 entities, full state: encode and decode | ts-bin-rpc | 238 µs (4.22x) | 248 µs (4.05x) | 326 µs (5.21x) | 182 µs (7.03x) |
| 1000 entities, full state: encode and decode | Colyseus schema | 3.8 ms (0.26x) | 3.0 ms (0.33x) | 4.8 ms (0.35x) | 3.0 ms (0.43x) |
| 1000 entities, 50 move: patch encode, decode and apply | JSON | 30 µs | 31 µs | 49 µs | 30 µs |
| 1000 entities, 50 move: patch encode, decode and apply | ts-bin-rpc | 12 µs (2.53x) | 11 µs (2.80x) | 16 µs (3.04x) | 8.78 µs (3.38x) |
| 1000 entities, 50 move: patch encode, decode and apply | Colyseus schema | 53 µs (0.57x) | 43 µs (0.70x) | 73 µs (0.67x) | 39 µs (0.77x) |

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
| 100 entities, 5 move: patch | ts-bin-rpc | 232 B | 180 B |
| 100 entities, 5 move: patch | Colyseus schema | 75 B | 98 B |
| 1000 entities, full state | JSON | 138 KB | 49 KB |
| 1000 entities, full state | ts-bin-rpc | 34 KB | 22 KB |
| 1000 entities, full state | Colyseus schema | 52 KB | 35 KB |
| 1000 entities, 50 move: patch | JSON | 3.1 KB | 1.3 KB |
| 1000 entities, 50 move: patch | ts-bin-rpc | 896 B | 722 B |
| 1000 entities, 50 move: patch | Colyseus schema | 750 B | 694 B |

## Notes

- Arrow JS and Flechette read columns, their fastest way; ts-bin-rpc reads views of rows, the way
  an app does, and its numbers through `columnsOf`. Flechette's row objects are its `toArray()`.
- The ts-bin-rpc patches are the frames of live state (`LiveDelta`), encoded and decoded by the
  generated code; the bookkeeping of `live()` that finds the changed fields is not in them. Colyseus
  finds changes in its setters, so its rows include that.
- Small patches are where ts-bin-rpc loses on bytes: a message carries a header, a column catalog
  and string blocks, and today the writer lists every column of a patch, absent ones too. The format
  lets a writer leave out a column no row has (FORMAT §6), so this is a writer change, not a format
  one.
