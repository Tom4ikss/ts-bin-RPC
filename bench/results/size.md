# Bundle size

esbuild 0.28.2, minified ESM, gzip -9. Generated code: the bundle minus the runtime-only bundle of the same side.

| Schema | Side | Bundle, min | Bundle, min + gz | Generated code, min + gz |
|---|---|---|---|---|
| runtime only | client | 10.0 KB | 4.2 KB | — |
| runtime only | server | 12.6 KB | 5.1 KB | — |
| playground | client | 29.1 KB | 9.3 KB | 5.3 KB |
| playground | server | 28.3 KB | 8.9 KB | 5.7 KB |
| e2e | client | 54.2 KB | 13.8 KB | 9.5 KB |
| e2e | server | 54.0 KB | 13.4 KB | 8.3 KB |
| example dashboard | client | 38.7 KB | 11.4 KB | 7.2 KB |
| example dashboard | server | 40.2 KB | 11.4 KB | 6.3 KB |
| cli fixture "supported" | client | 40.4 KB | 11.6 KB | 7.3 KB |
| cli fixture "supported" | server | 47.7 KB | 13.6 KB | 8.5 KB |
