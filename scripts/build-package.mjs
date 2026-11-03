// Builds a package into dist/: tsc emits JS with rewritten import extensions, then the
// declarations get the same rewrite, which tsc leaves to the reader (`./runtime.ts` → `./runtime.js`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
fs.rmSync(dist, { recursive: true, force: true });
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
for (const file of fs.readdirSync(dist)) {
  if (!file.endsWith('.d.ts')) continue;
  const p = path.join(dist, file);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2'));
}
