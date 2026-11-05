// The DevTools extension's side of the page: the client reports to the hook, and the hook gives the
// panel decoded calls and streams. In process with the hook installed by hand, then in Chromium with
// the built extension, whose content script installs it.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from 'ts-bin-rpc/client';
import { createHook, type Hook } from '@tbr/devtools/src/hook.ts';
import type { Summary } from '@tbr/devtools/src/protocol.ts';
import { handler } from '../src/app.ts';
import type { appRouter } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';

const root = path.join(import.meta.dirname, '..');
const extension = path.join(root, '..', 'packages', 'devtools');

const fetchInProcess = (async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;
const g = globalThis as { __TBR_DEVTOOLS__?: Hook };

describe('hook in process', () => {
  let hook: Hook;
  beforeAll(() => {
    hook = g.__TBR_DEVTOOLS__ = createHook({ batches: 3 });
  });
  afterAll(() => delete g.__TBR_DEVTOOLS__);
  const api = createClient<typeof appRouter>({ url: 'http://in-process/rpc', procedures, fetch: fetchInProcess });
  const last = (path: string): Summary => hook.list(0).entries.findLast((s) => s.path === path)!;

  it('decodes a call: input as passed, output with its types', async () => {
    await api.user.get({ id: 3 });
    const s = last('user.get');
    expect(s).toMatchObject({ kind: 'call', method: 'POST', status: 200, hasInput: true, received: expect.any(Number), serverHash: s.hash });
    expect(s.sent).toBeGreaterThan(0);
    expect(hook.detail(s.id, 'input')).toEqual({ id: 3 });
    expect(hook.detail(s.id, 'output')).toEqual({
      id: 3,
      name: 'Chloé',
      role: 'user',
      balance: { $tbr: 'bigint', v: '42' },
      createdAt: { $tbr: 'date', v: '2022-03-03T00:00:00.000Z' },
      tags: ['ops', 'oncall'],
    });
  });

  it('keeps errors with their data', async () => {
    await expect(api.user.get({ id: 99 })).rejects.toThrow('no user 99');
    const s = last('user.get');
    expect(s.status).toBe(404);
    expect(s.error).toEqual({ code: 'NOT_FOUND', message: 'no user 99', data: { id: 99 } });
    expect(hook.detail(s.id, 'output')).toEqual({ error: s.error });
  });

  it('marks queries and typed arrays', async () => {
    await api.version();
    expect(last('version')).toMatchObject({ method: 'GET', hasInput: false });
    expect(hook.detail(last('version').id, 'input')).toEqual({ $tbr: 'undefined' });
    await api.series({ n: 3 });
    const out = hook.detail(last('series').id, 'output') as Record<string, { $tbr: string; type: string; length: number }>;
    expect(out.t).toMatchObject({ $tbr: 'typed', type: 'Float64Array', length: 3 });
    expect(out.v).toMatchObject({ $tbr: 'typed', type: 'Float32Array', length: 3 });
  });

  it('follows a stream to its end and keeps its last batches', async () => {
    await new Promise<void>((end, error) => api.stream.ticks.subscribe({ n: 300, burst: 5 }, { end, error }));
    const s = last('stream.ticks');
    expect(s).toMatchObject({ kind: 'stream', state: 'ended', rows: 300 });
    expect(s.batches).toBeGreaterThanOrEqual(4);
    const batches = hook.detail(s.id, 'batches') as { index: number; rows: number }[];
    expect(batches).toHaveLength(3); // the limit
    expect(batches.at(-1)!.index).toBe(s.batches! - 1);
    const rows = hook.detail(s.id, 'batch', batches.at(-1)!.index) as { seq: number; side: string }[];
    expect(rows.at(-1)).toMatchObject({ seq: 299, side: 'sell' });
    expect(hook.detail(s.id, 'batch', 0)).toMatchObject({ $tbr: 'error' });
  });

  it('tells a failed stream from a stopped one', async () => {
    await new Promise<void>((resolve) => api.stream.failing.subscribe({ error: () => resolve() }));
    expect(last('stream.failing')).toMatchObject({ state: 'failed', error: { code: 'UPSTREAM', data: { retryIn: 5 } } });

    const sub = api.stream.forever.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 30));
    expect(last('stream.forever').state).toBe('open');
    sub.stop();
    expect(last('stream.forever').state).toBe('stopped');
  });

  it('lists only what changed since a revision', async () => {
    const { rev } = hook.list(0);
    expect(hook.list(rev).entries).toEqual([]);
    await api.version();
    expect(hook.list(rev).entries.map((s) => s.path)).toEqual(['version']);
  });

  it('drops the oldest entries past its limit', async () => {
    const small = (g.__TBR_DEVTOOLS__ = createHook({ entries: 2 }));
    for (const id of [1, 2, 3]) await api.user.get({ id });
    const kept = small.list(0).entries;
    expect(kept.map((s) => small.detail(s.id, 'input'))).toEqual([{ id: 2 }, { id: 3 }]);
    expect(small.detail(kept[0].id - 1, 'output')).toMatchObject({ $tbr: 'error' });
    g.__TBR_DEVTOOLS__ = hook;
  });
});

/** Starts the fixture server; resolves with its origin once it prints `listening <port>`. */
function start(): Promise<{ origin: string; child: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', 'src/serve.ts'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.on('exit', (code) => reject(new Error(`the server exited with ${code}`)));
    child.stdout!.on('data', (d) => {
      out += d;
      const m = /listening (\d+)/.exec(out);
      if (m) resolve({ origin: `http://127.0.0.1:${m[1]}`, child });
    });
  });
}

describe('extension in Chromium', () => {
  let server: Awaited<ReturnType<typeof start>>;
  beforeAll(async () => {
    execFileSync(process.execPath, ['build.mjs'], { cwd: extension, stdio: 'inherit' });
    server = await start();
  }, 60_000);
  afterAll(() => {
    server?.child.removeAllListeners('exit');
    server?.child.kill();
  });

  it('hooks into the page before its scripts and sees what the client does', async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tbr-devtools-'));
    const dist = path.join(extension, 'dist');
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(server.origin);
      const report = await page.evaluate(() => (window as unknown as { result: Promise<{ failures: string[] }> }).result);
      expect(errors).toEqual([]);
      expect(report.failures).toEqual([]);
      const seen = await page.evaluate(() => {
        const hook = (globalThis as unknown as { __TBR_DEVTOOLS__: Hook }).__TBR_DEVTOOLS__;
        const entries = hook.list(0).entries;
        const get = entries.find((s) => s.path === 'user.get' && !s.error)!;
        return { paths: new Set(entries.map((s) => s.path)).size, streams: entries.filter((s) => s.kind === 'stream').length, output: hook.detail(get.id, 'output') };
      });
      expect(seen.paths).toBeGreaterThan(10);
      expect(seen.streams).toBeGreaterThan(0);
      expect(seen.output).toMatchObject({ id: expect.any(Number), name: expect.any(String), createdAt: { $tbr: 'date' } });
    } finally {
      await context.close();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }, 60_000);
});
