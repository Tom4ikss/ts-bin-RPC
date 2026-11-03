# Bundle size

esbuild 0.28.2, minified ESM, gzip -9. Generated code: the bundle minus the runtime-only bundle of the same side.

| Schema | Side | Bundle, min | Bundle, min + gz | Generated code, min + gz |
|---|---|---|---|---|
| runtime only | client | 9.2 KB | 3.9 KB | — |
| runtime only | server | 7.7 KB | 3.2 KB | — |
| playground | client | 28.8 KB | 9.2 KB | 5.3 KB |
| playground | server | 28.0 KB | 8.8 KB | 5.6 KB |
| e2e | client | 34.4 KB | 10.0 KB | 6.1 KB |
| e2e | server | 33.4 KB | 9.5 KB | 6.3 KB |
| example dashboard | client | 30.5 KB | 9.1 KB | 5.3 KB |
| example dashboard | server | 31.3 KB | 9.0 KB | 5.8 KB |
| cli fixture "supported" | client | 39.3 KB | 11.1 KB | 7.3 KB |
| cli fixture "supported" | server | 42.2 KB | 11.6 KB | 8.4 KB |
