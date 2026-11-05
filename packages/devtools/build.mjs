// Builds the extension into dist/, ready for "Load unpacked": the scripts with esbuild, the rest copied.
// `--zip` also packs dist/ into ts-bin-rpc-devtools-<version>.zip for the stores.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = import.meta.dirname;
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });

await esbuild.build({
  entryPoints: { hook: 'src/content.ts', devtools: 'src/devtools.ts', panel: 'src/panel.ts' },
  absWorkingDir: root,
  bundle: true,
  format: 'iife',
  target: ['chrome111', 'firefox128'],
  outdir: dist,
  legalComments: 'none',
  logLevel: 'warning',
});
for (const f of fs.readdirSync(path.join(root, 'static'))) fs.copyFileSync(path.join(root, 'static', f), path.join(dist, f));

// One version for the extension: the package's.
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify({ ...manifest, version }, null, 2) + '\n');

if (process.argv.includes('--zip')) {
  const zip = path.join(root, `ts-bin-rpc-devtools-${version}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qrX', zip, '.'], { cwd: dist });
  console.log(path.relative(process.cwd(), zip));
}
