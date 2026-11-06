// The fixture app end to end: in process, over HTTP under each server runtime, and from a browser.
// Bun and Deno run when they are installed; E2E_RUNTIMES=node,bun,deno makes them required (CI).
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handler } from '../src/app.ts';
import { scenarios, socketScenarios, type Report } from '../src/scenarios.ts';

const root = path.join(import.meta.dirname, '..');

const all = [
  { name: 'node', cmd: process.execPath, args: ['--experimental-strip-types', '--no-warnings', 'src/serve.ts'] },
  { name: 'bun', cmd: 'bun', args: ['src/serve.ts'] },
  { name: 'deno', cmd: 'deno', args: ['run', '--allow-net', '--allow-env', '--allow-read', '--allow-sys', 'src/serve.ts'] },
];
const required = (process.env.E2E_RUNTIMES ?? 'node').split(',');
const installed = (cmd: string) => {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const runtimes = all.filter((r) => required.includes(r.name) || installed(r.cmd));

function expectClean(report: Report, min = 30) {
  expect(report.failures).toEqual([]);
  expect(report.passed).toBeGreaterThanOrEqual(min);
}

/** Starts the fixture server; resolves with its origin once it prints `listening <port>`. */
function start(cmd: string, args: string[]): Promise<{ origin: string; child: ChildProcess; output: () => string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => fail(new Error('the server did not start in 30 s')), 30_000);
    const fail = (e: Error) => {
      clearTimeout(timer);
      child.kill();
      reject(new Error(`${cmd} ${args.join(' ')}: ${e.message}\n${out}`));
    };
    child.on('error', fail);
    child.on('exit', (code) => fail(new Error(`exited with ${code}`)));
    child.stderr!.on('data', (d) => (out += d));
    child.stdout!.on('data', (d) => {
      out += d;
      const m = /listening (\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        child.removeAllListeners('exit');
        resolve({ origin: `http://127.0.0.1:${m[1]}`, child, output: () => out });
      }
    });
  });
}

it('works in process, without a network', async () => {
  const fetchInProcess = (async (input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    return handler(new Request(input, init));
  }) as typeof fetch;
  expectClean(await scenarios('http://in-process', fetchInProcess));
});

describe.each(runtimes)('server on $name', ({ cmd, args }) => {
  let server: Awaited<ReturnType<typeof start>>;
  beforeAll(async () => {
    server = await start(cmd, args);
  }, 40_000);
  afterAll(() => server?.child.kill());

  it('passes the client scenarios over HTTP', async () => {
    expectClean(await scenarios(server.origin));
  });

  it('passes the client scenarios over a WebSocket', async () => {
    const progress = { last: '' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hung = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`hung after '${progress.last}'; the server printed:\n${server.output()}`)), 8000)));
    expectClean(await Promise.race([socketScenarios(server.origin, progress), hung]).finally(() => clearTimeout(timer)), 20);
  }, 10_000);
});

describe('client in Chromium', () => {
  let server: Awaited<ReturnType<typeof start>>;
  beforeAll(async () => {
    server = await start(all[0].cmd, all[0].args);
  }, 40_000);
  afterAll(() => server?.child.kill());

  it('passes the client scenarios', async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(server.origin);
      const report = await page.evaluate(() => (window as unknown as { result: Promise<Report> }).result);
      expect(errors).toEqual([]);
      expectClean(report);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
