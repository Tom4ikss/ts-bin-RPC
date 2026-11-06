// Bundle size: what a client and a server ship, minified and gzipped (esbuild, ESM, tree-shaken).
//   node bench/size.mjs [--budget]     --budget fails when a client bundle exceeds its entry in BUDGETS
// Generated code comes from the fixtures; run `pnpm test` (packages/cli, e2e) or `pnpm gen` first.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as esbuild from 'esbuild';

// Client bundles, min + gz. The fixture catches generated code growing per type, not only the runtime.
const BUDGETS = { 'runtime only': 5 * 1024, 'cli fixture "supported"': 12.5 * 1024 };
const root = path.join(import.meta.dirname, '..');
const schemas = {
  playground: 'playground/src/tbr.gen.ts',
  e2e: 'e2e/src/tbr.gen.ts',
  'example dashboard': 'examples/dashboard/src/server/tbr.gen.ts',
  'cli fixture "supported"': 'packages/cli/test/.gen/supported.ts',
};

async function size(code) {
  const out = await esbuild.build({
    stdin: { contents: code, resolveDir: import.meta.dirname, loader: 'ts' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    write: false,
    logLevel: 'silent',
  });
  const bytes = out.outputFiles[0].contents;
  return { min: bytes.length, gz: zlib.gzipSync(bytes, { level: 9 }).length };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const client = (gen) => `import { createClient } from 'ts-bin-rpc/client'; ${gen ? `import { clientProcedures as p } from '../${gen}';` : 'const p = {};'} export const api = createClient({ url: '/rpc', procedures: p });`;
const server = (gen) => `import { createHandler } from 'ts-bin-rpc/server'; ${gen ? `import { serverProcedures as p } from '../${gen}';` : 'const p = {};'} export const h = (r) => createHandler(r, { procedures: p });`;

// every input as a Standard Schema, with the formats: what `ts-bin-rpc/validate` costs a client
const validator = (gen) => `${client(gen)} import { inputSchema } from 'ts-bin-rpc/validate'; import { formats } from 'ts-bin-rpc/formats'; import { inputRules } from '../${gen}'; export const forms = Object.values(inputRules).map((r) => inputSchema(r, { checks: formats }));`;

const rows = [];
const base = { client: await size(client()), server: await size(server()) };
rows.push(['runtime only', 'client', base.client], ['runtime only', 'server', base.server]);
for (const [name, file] of Object.entries(schemas)) {
  if (!fs.existsSync(path.join(root, file))) continue;
  for (const side of ['client', 'server']) {
    const s = await size((side === 'client' ? client : server)(file));
    rows.push([name, side, s, { min: s.min - base[side].min, gz: s.gz - base[side].gz }]);
  }
}

if (fs.existsSync(path.join(root, schemas.e2e))) {
  const s = await size(validator(schemas.e2e));
  const e2e = rows.find(([n, side]) => n === 'e2e' && side === 'client')[2];
  rows.push(['e2e, every input through `inputSchema`', 'client', s, { min: s.min - e2e.min, gz: s.gz - e2e.gz }]);
}

const table = [
  '| Schema | Side | Bundle, min | Bundle, min + gz | Generated code, min + gz |',
  '|---|---|---|---|---|',
  ...rows.map(([n, side, s, g]) => `| ${n} | ${side} | ${kb(s.min)} | ${kb(s.gz)} | ${g ? kb(g.gz) : '—'} |`),
].join('\n');
console.log(table);
fs.writeFileSync(path.join(import.meta.dirname, 'results', 'size.md'), `# Bundle size\n\nesbuild ${esbuild.version}, minified ESM, gzip -9. Generated code: the bundle minus the runtime-only bundle of the same side; for the \`inputSchema\` row, what the validator, \`inputRules\` and the formats add to the e2e client.\n\n${table}\n`);

if (process.argv.includes('--budget')) {
  let over = false;
  for (const [name, limit] of Object.entries(BUDGETS)) {
    const row = rows.find(([n, side]) => n === name && side === 'client');
    if (!row) {
      console.error(`${name}: no bundle to check; generate it first`);
      over = true;
    } else if (row[2].gz > limit) {
      console.error(`${name}: client bundle is ${kb(row[2].gz)} gz, over the ${kb(limit)} budget`);
      over = true;
    }
  }
  if (over) process.exit(1);
}
