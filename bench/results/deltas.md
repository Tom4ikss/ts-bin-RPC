# Deltas: bytes per frame (average of 300 frames)

Deflate: level 6, one context for the whole stream, flushed after each frame.

## Ticks, 16 per batch

| Encoding | raw | deflate |
|---|---|---|
| JSON | 979 | 159 |
| columns: t f64, price f32 | 320 | 144 |
| columns: price f64 | 384 | 148 |
| + t as u32 delta from the first | 272 | 110 |
| + price as i32 cents | 272 | 109 |
| + price as i16 delta of cents | 252 | 92 |
| ts-bin-rpc: t number, price f32 | 328 | 144 |
| ts-bin-rpc: t Date, price i32 & Scale<100> | 328 | 143 |
| ts-bin-rpc: + Delta on t and price | 180 | 77 |

## State of 100 entities, 5% move each frame, 1% lose hp

| Encoding | raw | deflate |
|---|---|---|
| JSON, whole state | 14285 | 289 |
| columns, whole state | 3478 | 116 |
| JSON, changed rows whole | 970 | 208 |
| columns, changed rows whole | 320 | 129 |
| JSON, changed fields | 359 | 159 |
| columns, changed fields | 159 | 76 |
| ts-bin-rpc live: snapshot every frame | 3498 | 114 |
| ts-bin-rpc live: delta, changed fields | 244 | 85 |

## State of 100 entities, 30% move each frame, 1% lose hp

| Encoding | raw | deflate |
|---|---|---|
| JSON, whole state | 14288 | 830 |
| columns, whole state | 3478 | 362 |
| JSON, changed rows whole | 4458 | 853 |
| columns, changed rows whole | 1147 | 472 |
| JSON, changed fields | 1749 | 688 |
| columns, changed fields | 460 | 306 |
| ts-bin-rpc live: snapshot every frame | 3498 | 358 |
| ts-bin-rpc live: delta, changed fields | 554 | 319 |
