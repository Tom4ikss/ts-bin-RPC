// The Vite plugin: generation before a build, and in the dev server when it starts and on every save.
import fs from 'node:fs';
import path from 'node:path';
import { build, createServer, type HotPayload } from 'vite';
import { describe, expect, it } from 'vitest';
import { tbr } from '../src/vite.ts';

const dir = path.join(import.meta.dirname, '.gen', 'vite');
const gen = path.join(dir, 'src', 'tbr.gen.ts');
const write = (name: string, text: string) => fs.writeFileSync(path.join(dir, name), text);
const router = (fields = '') => `import type { u32 } from 'ts-bin-rpc';
export interface User { id: u32; name: string;${fields} }
export const appRouter = { get: async (input: { id: u32 }): Promise<User> => null! };
`;

function setup() {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, module: 'nodenext', noEmit: true, allowImportingTsExtensions: true }, include: ['src'] }));
  write('index.html', '<script type="module" src="/src/main.ts"></script>\n');
  write('src/main.ts', "import { clientProcedures } from './tbr.gen.ts';\ndocument.title = Object.keys(clientProcedures).join();\n");
  write('src/router.ts', router());
}

async function until<T>(what: string, f: () => T | undefined | false): Promise<T> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const v = f();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('vite build', () => {
  it('generates the codecs and the lockfile first', async () => {
    setup();
    const out = await build({ root: dir, logLevel: 'silent', plugins: [tbr()], build: { write: false } });
    expect(fs.readFileSync(gen, 'utf8')).toContain('export const clientProcedures');
    expect(fs.existsSync(path.join(dir, 'tbr.lock.json'))).toBe(true);
    const chunks = (Array.isArray(out) ? out[0] : out) as { output: { type: string; code?: string }[] };
    expect(chunks.output.find((c) => c.type === 'chunk')?.code).toMatch(/\bget:\{input:/);
  }, 60_000);

  it('fails on a type that cannot be sent', async () => {
    setup();
    write('src/router.ts', router(' save: () => void;'));
    await expect(build({ root: dir, logLevel: 'silent', plugins: [tbr()], build: { write: false } })).rejects.toThrow(/User\.save: functions and methods are not serializable/);
  }, 60_000);
});

describe('vite dev server', () => {
  it('regenerates on save and shows errors in the overlay', async () => {
    setup();
    const server = await createServer({ root: dir, logLevel: 'silent', plugins: [tbr()], server: { middlewareMode: true } });
    try {
      await server.environments.client.pluginContainer.buildStart({});
      expect(fs.readFileSync(gen, 'utf8')).not.toContain('email');
      const sent: HotPayload[] = [];
      server.ws.send = ((p: HotPayload) => sent.push(p)) as typeof server.ws.send;

      write('src/router.ts', router(' email: string;'));
      await until('the new field', () => fs.readFileSync(gen, 'utf8').includes('email'));

      write('src/router.ts', router(' email: string; save: () => void;'));
      const error = await until('the overlay', () => sent.find((p) => p.type === 'error'));
      expect(error.type === 'error' && error.err.message).toMatch(/User\.save: functions and methods are not serializable/);
      expect(fs.readFileSync(gen, 'utf8')).toContain('email'); // the last good codecs stay

      // fixed with the codecs unchanged: nothing reloads the page, so the plugin clears the overlay
      write('src/router.ts', router(' email: string;'));
      await until('the reload', () => sent.some((p) => p.type === 'full-reload'));
    } finally {
      await server.close();
    }
  }, 60_000);
});
