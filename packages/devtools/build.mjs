// Builds the extension into dist/chromium, ready for "Load unpacked", and dist/firefox, for
// "Load Temporary Add-on": the scripts with esbuild, the rest copied. The two differ only in the manifest.
// `--zip` also packs them into ts-bin-rpc-devtools-<version>.zip and ts-bin-rpc-devtools-firefox-<version>.zip.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = import.meta.dirname;
const dist = path.join(root, 'dist', 'chromium');
const firefox = path.join(root, 'dist', 'firefox');
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });

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
const write = (dir, m) => fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
write(dist, { ...manifest, version });

// Firefox wants an ID for MV3, and its add-ons site the data the extension collects: none, it sends
// nothing anywhere. 128 is the first Firefox with content scripts in the page's world.
fs.cpSync(dist, firefox, { recursive: true });
write(firefox, {
  ...manifest,
  version,
  browser_specific_settings: {
    gecko: { id: 'ts-bin-rpc-devtools@tom4ikss.github.io', strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } },
  },
});

if (process.argv.includes('--zip')) {
  for (const [dir, name] of [[dist, `ts-bin-rpc-devtools-${version}.zip`], [firefox, `ts-bin-rpc-devtools-firefox-${version}.zip`]]) {
    const zip = path.join(root, name);
    fs.rmSync(zip, { force: true });
    execFileSync('zip', ['-qrX', zip, '.'], { cwd: dir });
    console.log(path.relative(process.cwd(), zip));
  }
}
