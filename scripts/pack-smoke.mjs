// Packs ts-bin-rpc and ts-bin-rpc-cli as they would be published, installs the tarballs into an
// empty project with npm and runs it: tbr generate and check, tsc, a server and a client over HTTP,
// tbr decode. Catches what workspace tests cannot: missing files, unbuilt dist, wrong exports.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbr-smoke-'));
const run = (cmd, args, cwd = dir) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const tarballs = ['ts-bin-rpc', 'cli'].map((p) => {
  const out = run('pnpm', ['pack', '--pack-destination', dir], path.join(root, 'packages', p));
  return out.trim().split('\n').at(-1);
});
const ts = JSON.parse(fs.readFileSync(path.join(root, 'packages/cli/package.json'), 'utf8')).dependencies.typescript;

const files = {
  'package.json': JSON.stringify({ name: 'tbr-smoke', private: true, type: 'module' }),
  'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'es2024', module: 'nodenext', strict: true, noEmit: true, allowImportingTsExtensions: true, types: ['node'] },
    include: ['src'],
  }),
  'src/router.ts': `import { RpcError, type u32, type f32 } from 'ts-bin-rpc';
export interface User { id: u32; name: string; role: 'admin' | 'user'; createdAt: Date; tags: string[] }
export const appRouter = {
  user: {
    get: async (input: { id: u32 }): Promise<User> => {
      if (input.id !== 1) throw new RpcError('NOT_FOUND', \`no user \${input.id}\`);
      return { id: 1 as u32, name: 'Ада', role: 'admin', createdAt: new Date(0), tags: ['founder'] };
    },
  },
  series: async (): Promise<{ t: Float64Array; v: Float32Array; peak: f32 }> => ({ t: new Float64Array([1, 2]), v: new Float32Array([0.5, 1.5]), peak: 1.5 as f32 }),
};
`,
  'src/main.ts': `import fs from 'node:fs';
import http from 'node:http';
import { createHandler } from 'ts-bin-rpc/server';
import { toNodeListener } from 'ts-bin-rpc/node';
import { createClient } from 'ts-bin-rpc/client';
import { toPlain } from 'ts-bin-rpc';
import { appRouter } from './router.ts';
import { clientProcedures, procedures, serverProcedures } from './tbr.gen.ts';

const server = http.createServer(toNodeListener(createHandler(appRouter, { procedures: serverProcedures, prefix: '/rpc' })));
await new Promise<void>((r) => server.listen(0, r));
const { port } = server.address() as { port: number };
const api = createClient<typeof appRouter>({ url: \`http://localhost:\${port}/rpc\`, procedures: clientProcedures });
const user = await api.user.get({ id: 1 });
const { t, v } = await api.series();
const error = await api.user.get({ id: 2 }).catch((e: { code: string }) => e.code);
server.close();
fs.writeFileSync('user.bin', procedures['user.get'].output!.encode(toPlain(user)));
console.log(JSON.stringify({ user: toPlain(user), t: t instanceof Float64Array, v: Array.from(v), error }));
`,
};
for (const [name, text] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
}

run('npm', ['install', '--no-audit', '--no-fund', ...tarballs, `typescript@${ts}`, '@types/node@22']);
run('npx', ['tbr', 'generate']);
run('npx', ['tbr', 'check']);
run('npx', ['tsc', '-p', '.']);
const result = JSON.parse(run('node', ['--experimental-strip-types', '--no-warnings', 'src/main.ts']));
const expected = { user: { id: 1, name: 'Ада', role: 'admin', createdAt: '1970-01-01T00:00:00.000Z', tags: ['founder'] }, t: true, v: [0.5, 1.5], error: 'NOT_FOUND' };
if (JSON.stringify(result) !== JSON.stringify(expected)) throw new Error(`unexpected result: ${JSON.stringify(result)}`);
const decoded = JSON.parse(run('npx', ['tbr', 'decode', 'user.bin', '--proc', 'user.get']));
if (decoded.name !== 'Ада') throw new Error(`tbr decode printed ${JSON.stringify(decoded)}`);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`pack smoke: ok (${tarballs.map((t) => path.basename(t)).join(', ')})`);
