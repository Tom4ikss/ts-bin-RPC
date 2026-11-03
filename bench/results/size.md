# Bundle size

esbuild 0.28.2, minified ESM, gzip -9. Generated code: the bundle minus the runtime-only bundle of the same side.

| Schema | Side | Bundle, min | Bundle, min + gz | Generated code, min + gz |
|---|---|---|---|---|
| runtime only | client | 9.1 KB | 3.8 KB | — |
| runtime only | server | 7.7 KB | 3.2 KB | — |
| playground | client | 29.0 KB | 9.1 KB | 5.3 KB |
| playground | server | 28.3 KB | 8.7 KB | 5.5 KB |
| e2e | client | 34.7 KB | 9.9 KB | 6.1 KB |
| e2e | server | 33.9 KB | 9.4 KB | 6.2 KB |
| cli fixture "supported" | client | 39.7 KB | 11.0 KB | 7.2 KB |
| cli fixture "supported" | server | 42.8 KB | 11.5 KB | 8.3 KB |
