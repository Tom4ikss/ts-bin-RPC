// Packs ts-bin-rpc as it would be published, installs the tarball into an empty project with npm
// and runs it: tbr generate and check, tsc, a server and a client over HTTP,
// tbr decode, a Vite build with ts-bin-rpc/vite. Catches what workspace tests cannot: missing files, unbuilt dist, wrong exports.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbr-smoke-'));
const run = (cmd, args, cwd = dir) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const tarball = run('pnpm', ['pack', '--pack-destination', dir], path.join(root, 'packages/ts-bin-rpc')).trim().split('\n').at(-1);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/ts-bin-rpc/package.json'), 'utf8'));
const ts = pkg.peerDependencies.typescript;

const files = {
  'package.json': JSON.stringify({ name: 'tbr-smoke', private: true, type: 'module' }),
  'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'es2024', module: 'nodenext', strict: true, noEmit: true, allowImportingTsExtensions: true, types: ['node'] },
    include: ['src'],
  }),
  'src/router.ts': `import { RpcError, type u32, type f32 } from 'ts-bin-rpc';
import { around, stream, use } from 'ts-bin-rpc/server';
export const seen: string[] = [];
const logged = around(async ({ path }, next) => (seen.push(path), next()));
export interface User { id: u32; name: string; role: 'admin' | 'user'; createdAt: Date; tags: string[] }
export const appRouter = {
  user: use([logged], {
    get: async (input: { id: u32 }): Promise<User> => {
      if (input.id !== 1) throw new RpcError('NOT_FOUND', \`no user \${input.id}\`);
      return { id: 1 as u32, name: 'Ада', role: 'admin', createdAt: new Date(0), tags: ['founder'] };
    },
  }),
  series: async (): Promise<{ t: Float64Array; v: Float32Array; peak: f32 }> => ({ t: new Float64Array([1, 2]), v: new Float32Array([0.5, 1.5]), peak: 1.5 as f32 }),
  count: async (input: { n: u32 }) =>
    stream<{ i: u32 }>((emit, { end }) => {
      for (let i = 0; i < input.n; i++) emit({ i: i as u32 });
      end();
    }),
};
`,
  'src/main.ts': `import fs from 'node:fs';
import http from 'node:http';
import { createHandler } from 'ts-bin-rpc/server';
import { toNodeListener } from 'ts-bin-rpc/node';
import { batch, createClient } from 'ts-bin-rpc/client';
import { toPlain } from 'ts-bin-rpc';
import { inputSchema } from 'ts-bin-rpc/validate';
import { appRouter, seen } from './router.ts';
import { clientProcedures, inputRules, procedures, serverProcedures } from './tbr.gen.ts';

const server = http.createServer(toNodeListener(createHandler(appRouter, { procedures: serverProcedures, prefix: '/rpc' })));
await new Promise<void>((r) => server.listen(0, r));
const { port } = server.address() as { port: number };
const api = createClient<typeof appRouter>({ url: \`http://localhost:\${port}/rpc\`, procedures: clientProcedures });
const user = await api.user.get({ id: 1 });
const { t, v } = await api.series();
const error = await api.user.get({ id: 2 }).catch((e: { code: string }) => e.code);
const batched = createClient<typeof appRouter>({ url: \`http://localhost:\${port}/rpc\`, procedures: clientProcedures, batch: batch() });
const pair = await Promise.all([batched.user.get({ id: 1 }), batched.user.get({ id: 2 }).catch((e: { code: string }) => e.code)]);
const counted: number[] = [];
let column = false;
await new Promise<void>((end, error) =>
  api.count.subscribe({ n: 5 }, {
    batch: (b) => {
      column ||= b.columns.i instanceof Uint32Array;
      for (const r of b) counted.push(r.i);
    },
    end,
    error,
  }),
);
server.close();
fs.writeFileSync('user.bin', procedures['user.get'].output!.encode(toPlain(user)));
const issues = (inputSchema(inputRules['user.get'])['~standard'].validate({ id: -1 }) as { issues: readonly { message: string }[] }).issues.map((i) => i.message);
console.log(JSON.stringify({ user: toPlain(user), t: t instanceof Float64Array, v: Array.from(v), error, counted, column, seen, issues, pair: [pair[0] && typeof pair[0] === 'object' ? pair[0].name : pair[0], pair[1]] }));
`,
  'src/web.ts': `import { createClient } from 'ts-bin-rpc/client';
import type { appRouter } from './router.ts';
import { clientProcedures } from './tbr.gen.ts';
export const api = createClient<typeof appRouter>({ url: '/rpc', procedures: clientProcedures });
`,
  'index.html': '<script type="module" src="/src/web.ts"></script>\n',
  'vite.config.ts': `import { tbr } from 'ts-bin-rpc/vite';
export default { plugins: [tbr()] };
`,
};
for (const [name, text] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
}

run('npm', ['install', '--no-audit', '--no-fund', tarball]);
run('npm', ['install', '-D', '--no-audit', '--no-fund', `typescript@${ts}`, '@types/node@22', `vite@${pkg.devDependencies.vite}`]);
run('npx', ['tbr', 'generate']);
run('npx', ['tbr', 'check']);
run('npx', ['tsc', '-p', '.']);
const result = JSON.parse(run('node', ['--experimental-strip-types', '--no-warnings', 'src/main.ts']));
const expected = { user: { id: 1, name: 'Ада', role: 'admin', createdAt: '1970-01-01T00:00:00.000Z', tags: ['founder'] }, t: true, v: [0.5, 1.5], error: 'NOT_FOUND', counted: [0, 1, 2, 3, 4], column: true, seen: ['user.get', 'user.get', 'user.get', 'user.get'], issues: ['expected u32, got -1'], pair: ['Ада', 'NOT_FOUND'] };
if (JSON.stringify(result) !== JSON.stringify(expected)) throw new Error(`unexpected result: ${JSON.stringify(result)}`);
const decoded = JSON.parse(run('npx', ['tbr', 'decode', 'user.bin', '--proc', 'user.get']));
if (decoded.name !== 'Ада') throw new Error(`tbr decode printed ${JSON.stringify(decoded)}`);
// the plugin generates the codecs again before the build
fs.rmSync(path.join(dir, 'src/tbr.gen.ts'));
run('npx', ['vite', 'build', '--logLevel', 'warn']);
const assets = fs.readdirSync(path.join(dir, 'dist/assets'));
if (!fs.existsSync(path.join(dir, 'src/tbr.gen.ts')) || !assets.some((f) => f.endsWith('.js'))) throw new Error(`vite build: ${assets.join(', ')}`);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`pack smoke: ok (${path.basename(tarball)})`);
