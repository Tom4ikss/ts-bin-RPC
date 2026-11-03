# Bundle size

esbuild 0.28.2, minified ESM, gzip -9. Generated code: the bundle minus the runtime-only bundle of the same side.

| Schema | Side | Bundle, min | Bundle, min + gz | Generated code, min + gz |
|---|---|---|---|---|
| runtime only | client | 9.2 KB | 3.9 KB | — |
| runtime only | server | 7.7 KB | 3.2 KB | — |
| playground | client | 28.9 KB | 9.2 KB | 5.3 KB |
| playground | server | 28.1 KB | 8.8 KB | 5.5 KB |
| e2e | client | 34.5 KB | 10.0 KB | 6.1 KB |
| e2e | server | 33.6 KB | 9.5 KB | 6.2 KB |
| example dashboard | client | 30.7 KB | 9.1 KB | 5.2 KB |
| example dashboard | server | 31.4 KB | 9.0 KB | 5.8 KB |
| cli fixture "supported" | client | 39.4 KB | 11.1 KB | 7.2 KB |
| cli fixture "supported" | server | 42.3 KB | 11.5 KB | 8.3 KB |
