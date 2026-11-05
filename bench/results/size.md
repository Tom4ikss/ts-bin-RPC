# Bundle size

esbuild 0.28.2, minified ESM, gzip -9. Generated code: the bundle minus the runtime-only bundle of the same side.

| Schema | Side | Bundle, min | Bundle, min + gz | Generated code, min + gz |
|---|---|---|---|---|
| runtime only | client | 11.0 KB | 4.7 KB | — |
| runtime only | server | 18.4 KB | 7.5 KB | — |
| playground | client | 31.3 KB | 10.2 KB | 5.5 KB |
| playground | server | 39.7 KB | 13.3 KB | 5.9 KB |
| e2e | client | 64.6 KB | 15.7 KB | 11.0 KB |
| e2e | server | 71.3 KB | 17.5 KB | 10.1 KB |
| example dashboard | client | 40.4 KB | 12.1 KB | 7.4 KB |
| example dashboard | server | 47.1 KB | 14.1 KB | 6.6 KB |
| cli fixture "supported" | client | 42.0 KB | 12.2 KB | 7.5 KB |
| cli fixture "supported" | server | 54.6 KB | 16.4 KB | 8.9 KB |
