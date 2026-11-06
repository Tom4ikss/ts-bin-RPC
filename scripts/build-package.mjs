// Builds a package into dist/: tsc emits JS with rewritten import extensions for each config given
// (default tsconfig.build.json), then the declarations get the same rewrite, which tsc leaves to the
// reader (`./runtime.ts` → `./runtime.js`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const configs = process.argv.slice(2);
const dist = path.resolve('dist');
fs.rmSync(dist, { recursive: true, force: true });
for (const config of configs.length ? configs : ['tsconfig.build.json']) {
  execFileSync('tsc', ['-p', config], { stdio: 'inherit' });
}
for (const file of fs.readdirSync(dist, { recursive: true, encoding: 'utf8' })) {
  const p = path.join(dist, file);
  // the sources run with type stripping, the built JS with plain node: `env -S` is not everywhere
  if (file.endsWith('.js')) {
    const text = fs.readFileSync(p, 'utf8');
    if (text.startsWith('#!')) fs.writeFileSync(p, text.replace(/^#!.*/, '#!/usr/bin/env node'));
  }
  if (!file.endsWith('.d.ts')) continue;
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2'));
}
