// Bundles the libraries of the `libs` suite into one module that Node and browsers load, as
// build.mjs does for the runtime.
//   node bench/gen/libs.mjs
import path from 'node:path';
import * as esbuild from 'esbuild';

const out = path.join(import.meta.dirname, 'out', 'libs.mjs');
await esbuild.build({
  stdin: {
    contents: [
      "export * as arrow from 'apache-arrow';",
      "export * as flechette from '@uwdata/flechette';",
      "export { schema, t, Encoder, Decoder } from '@colyseus/schema';",
    ].join('\n'),
    resolveDir: import.meta.dirname,
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  outfile: out,
  logLevel: 'warning',
});
console.log('bench/gen/out: libs.mjs');
