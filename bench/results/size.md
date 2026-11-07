# Bundle size

esbuild 0.28.2, minified ESM, gzip -9. Generated code: the bundle minus the runtime-only bundle of the same side; for the `inputSchema` row, what the validator, `inputRules` and the formats add to the e2e client.

| Schema | Side | Bundle, min | Bundle, min + gz | Generated code, min + gz |
|---|---|---|---|---|
| runtime only | client | 12.7 KB | 5.3 KB | — |
| runtime only | server | 25.5 KB | 10.0 KB | — |
| playground | client | 33.4 KB | 11.2 KB | 5.8 KB |
| playground | server | 48.1 KB | 16.4 KB | 6.4 KB |
| e2e | client | 85.3 KB | 19.7 KB | 14.3 KB |
| e2e | server | 102.5 KB | 24.7 KB | 14.7 KB |
| example dashboard | client | 43.3 KB | 13.3 KB | 7.9 KB |
| example dashboard | server | 55.5 KB | 17.2 KB | 7.2 KB |
| cli fixture "supported" | client | 44.6 KB | 13.3 KB | 8.0 KB |
| cli fixture "supported" | server | 64.2 KB | 20.1 KB | 10.1 KB |
| e2e, every input through `inputSchema` | client | 92.5 KB | 21.7 KB | 2.1 KB |
