# Bundle size

esbuild 0.28.2, minified ESM, gzip -9. Generated code: the bundle minus the runtime-only bundle of the same side.

| Schema | Side | Bundle, min | Bundle, min + gz | Generated code, min + gz |
|---|---|---|---|---|
| runtime only | client | 9.5 KB | 4.0 KB | — |
| runtime only | server | 7.7 KB | 3.2 KB | — |
| playground | client | 29.1 KB | 9.3 KB | 5.3 KB |
| playground | server | 28.3 KB | 8.9 KB | 5.7 KB |
| e2e | client | 34.7 KB | 10.2 KB | 6.2 KB |
| e2e | server | 33.7 KB | 9.6 KB | 6.4 KB |
| example dashboard | client | 30.9 KB | 9.3 KB | 5.3 KB |
| example dashboard | server | 31.6 KB | 9.2 KB | 5.9 KB |
| cli fixture "supported" | client | 39.7 KB | 11.3 KB | 7.3 KB |
| cli fixture "supported" | server | 42.5 KB | 11.7 KB | 8.5 KB |
