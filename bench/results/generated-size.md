# Generated codecs: size against JSON

2026-11-03. Bytes of ts-bin-rpc, % against JSON compressed the same way. JSON values are
those of bench/lib/data.mjs: numbers rounded to 1–3 decimals. The binary series stores float32/float64.

| Payload | raw | gzip-6 | brotli-4 | brotli-6 | brotli-11 | zstd-3 |
|---|---|---|---|---|---|---|
| 1000 users | 65240 (-52%) | 21850 (-8%) | 19731 (-18%) | 17553 (-19%) | 16418 (-9%) | 23009 (-6%) |
| 500 products, long text | 130374 (-18%) | 34740 (0%) | 36878 (-9%) | 32787 (-9%) | 29245 (-4%) | 37164 (-3%) |
| 20 users | 1698 (-37%) | 1010 (+10%) | 1011 (+13%) | 938 (+10%) | 890 (+20%) | 1031 (+9%) |
| 100k points, JSON as number arrays | 2000068 (-51%) | 1334476 (-1%) | 1213569 (+9%) | 1247728 (+12%) | 1037358 (+3%) | 1314873 (+2%) |
| 100k points, JSON as an array of objects | 2000068 (-66%) | 1334476 (-21%) | 1213569 (-24%) | 1247728 (-24%) | 1037358 (-20%) | 1314873 (-27%) |
