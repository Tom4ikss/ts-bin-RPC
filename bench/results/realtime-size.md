# Realtime frame size (bytes per frame, average over 200 frames)

| Entities | Encoding | raw | deflate per message | deflate with context |
|---|---|---|---|---|
| 1 | JSON (3 decimals) | 66 | 64 | 19 |
| 1 | columns, directory | 54 | 53 | 17 |
| 1 | columns, implied offsets | 30 | 30 | 16 |
| 10 | JSON (3 decimals) | 645 | 275 | 117 |
| 10 | columns, directory | 252 | 257 | 94 |
| 10 | columns, implied offsets | 228 | 233 | 94 |
| 100 | JSON (3 decimals) | 6514 | 2149 | 1001 |
| 100 | columns, directory | 2232 | 2009 | 813 |
| 100 | columns, implied offsets | 2208 | 1990 | 813 |
