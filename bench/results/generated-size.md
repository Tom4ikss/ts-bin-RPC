# Generated codecs: size against JSON

2026-11-07. Bytes of ts-bin-rpc, % against JSON compressed the same way. JSON values are
those of bench/lib/data.mjs: numbers rounded to 1–3 decimals. The binary series stores float32/float64.

| Payload | raw | gzip-6 | brotli-4 | brotli-6 | brotli-11 | zstd-3 |
|---|---|---|---|---|---|---|
| 1000 users | 65240 (-52%) | 21850 (-8%) | 19731 (-18%) | 17553 (-19%) | 16033 (-11%) | 23010 (-6%) |
| 500 products, long text | 130374 (-18%) | 34740 (0%) | 36879 (-9%) | 32787 (-9%) | 29227 (-4%) | 37164 (-3%) |
| 20 users | 1698 (-37%) | 1011 (+10%) | 1012 (+13%) | 938 (+10%) | 893 (+21%) | 1032 (+10%) |
| 100k points, JSON as number arrays | 2000068 (-51%) | 1334477 (-1%) | 1213570 (+9%) | 1247731 (+12%) | 1037362 (+3%) | 1314874 (+2%) |
| 100k points, JSON as an array of objects | 2000068 (-66%) | 1334477 (-21%) | 1213570 (-24%) | 1247731 (-24%) | 1037362 (-20%) | 1314874 (-27%) |
