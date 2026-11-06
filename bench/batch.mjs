// Batching: n calls at once from a Chromium page, one request each against batches, over HTTP/1.1
// and HTTP/2, and calls over a WebSocket. Writes bench/results/batch.md.
//   node --experimental-strip-types --no-warnings bench/batch.mjs [--quick] [--out=dir]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import os from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { createHandler } from 'ts-bin-rpc/server';
import { acceptWebSocket, toNodeListener } from 'ts-bin-rpc/node';
import { serveWebSockets } from '../e2e/src/ws-server.ts';
import { Ts71Source } from '../packages/cli/src/source.ts';
import { buildSchema } from '../packages/cli/src/build.ts';
import { emptyLock, updateLock } from '../packages/cli/src/lock.ts';
import { emitCodecs } from '../packages/cli/src/emit.ts';
import { appRouter } from './batch/router.ts';

const dir = import.meta.dirname;
const quick = process.argv.includes('--quick');
const REPS = quick ? 3 : 9;

const gen = path.join(dir, 'gen', 'out', 'batch.gen.ts');
fs.mkdirSync(path.dirname(gen), { recursive: true });
const src = new Ts71Source(path.join(dir, 'batch', 'tsconfig.json'));
try {
  const { schema, errors } = buildSchema(src, path.join(dir, 'batch', 'router.ts'), 'appRouter');
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'));
  fs.writeFileSync(gen, emitCodecs(schema, updateLock(emptyLock(), schema).lock, {}));
} finally {
  src.close();
}
const { serverProcedures } = await import(gen);
const bundle = await esbuild.build({ entryPoints: [path.join(dir, 'batch', 'client.ts')], bundle: true, format: 'esm', minify: true, write: false, logLevel: 'warning' });
const page = '<!doctype html><meta charset="utf-8"><title>batch bench</title><script type="module" src="/client.js"></script>';

const handler = createHandler(appRouter, { procedures: serverProcedures, prefix: '/rpc' });
const rpc = toNodeListener(handler);
let requests = 0;
const listener = (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/rpc/')) return void (requests++, rpc(req, res));
  if (url.pathname === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page);
  if (url.pathname === '/client.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(bundle.outputFiles[0].contents);
  res.writeHead(404).end();
};

// HTTP/1.1, with the WebSocket at /rpc
const h1 = http.createServer(listener);
serveWebSockets(h1, { '/rpc': acceptWebSocket(handler) });
await new Promise((ok) => h1.listen(0, '127.0.0.1', ok));

// HTTP/2 over TLS, as browsers speak it, with a certificate for this run
const tls = fs.mkdtempSync(path.join(os.tmpdir(), 'tbr-batch-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tls, 'key.pem'), '-out', path.join(tls, 'cert.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
const h2 = http2.createSecureServer({ key: fs.readFileSync(path.join(tls, 'key.pem')), cert: fs.readFileSync(path.join(tls, 'cert.pem')) }, listener);
await new Promise((ok) => h2.listen(0, '127.0.0.1', ok));
fs.rmSync(tls, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const tabs = {};
for (const [name, origin] of [['h1', `http://127.0.0.1:${h1.address().port}`], ['h2', `https://127.0.0.1:${h2.address().port}`]]) {
  tabs[name] = await context.newPage();
  await tabs[name].goto(origin);
  await tabs[name].waitForFunction(() => typeof globalThis.run === 'function');
  const proto = await tabs[name].evaluate(() => performance.getEntriesByType('navigation')[0].nextHopProtocol);
  if (proto !== (name === 'h1' ? 'http/1.1' : 'h2')) throw new Error(`${name}: the page came over ${proto}`);
}

const variants = [
  { name: 'HTTP/1.1, a request per call', tab: 'h1', kind: 'plain' },
  { name: 'HTTP/1.1, `batch()`', tab: 'h1', kind: 'batch' },
  { name: 'HTTP/2, a request per call', tab: 'h2', kind: 'plain' },
  { name: 'HTTP/2, `batch()`', tab: 'h2', kind: 'batch' },
  { name: 'WebSocket, `calls: true`', tab: 'h1', kind: 'socket' },
];
const scenarios = [
  { n: 10, delay: 0 },
  { n: 50, delay: 0 },
  { n: 200, delay: 0 },
  { n: 10, delay: 20 },
  { n: 50, delay: 20 },
];

const once = async (v, s) => {
  const r0 = requests;
  const ms = await tabs[v.tab].evaluate(([kind, n, delay]) => globalThis.run(kind, n, delay), [v.kind, s.n, s.delay]);
  return { ms, requests: requests - r0 };
};
const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const fmt = (x) => (x >= 100 ? `${x.toFixed(0)} ms` : x >= 10 ? `${x.toFixed(1)} ms` : `${x.toFixed(2)} ms`);

for (const v of variants) for (let i = 0; i < 3; i++) await once(v, { n: 50, delay: 0 }); // warm up
const rows = [];
for (const s of scenarios) {
  for (const v of variants) {
    const runs = [];
    for (let i = 0; i < REPS; i++) runs.push(await once(v, s));
    const row = [`${s.n} calls${s.delay ? `, ${s.delay} ms each` : ''}`, v.name, fmt(median(runs.map((r) => r.ms))), String(median(runs.map((r) => r.requests)))];
    rows.push(row);
    console.log(row.join(' | '));
  }
}
const version = browser.version();
await browser.close();
h1.close();
h2.close();

const table = ['| Calls | Transport | Wall, until the last answer | HTTP requests |', '|---|---|---|---|', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const out = `# Batching: n calls at once

${new Date().toISOString().slice(0, 10)}, ${os.cpus()[0].model}, ${os.platform()} ${os.release()}, Node ${process.version}, Chromium ${version}. Median of ${REPS} runs.

A Chromium page calls \`quote({ symbol, delay })\` n times in one \`Promise.all\` and waits for every answer; the procedure waits \`delay\` ms, as a call to a database would, and returns \`{ symbol, bid, ask, at }\`. Node serves HTTP/1.1 and, on another port, HTTP/2 over TLS (\`node:http2\`), both through \`toNodeListener\`, on 127.0.0.1. \`batch()\` puts at most 32 calls in one request (its default). The WebSocket stays open between runs. HTTP requests: what the server got for one run; the WebSocket sends none.

${table}
`;
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outDir = outArg ? path.resolve(outArg.slice(6)) : path.join(dir, 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'batch.md'), out);
console.log(path.join(outDir, 'batch.md'));
