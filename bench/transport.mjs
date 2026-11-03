// Streams over a real transport: ts-bin-rpc frames against NDJSON over fetch and SSE, from a Node
// HTTP server to Chromium on the same machine. Writes bench/results/stream-transport.md.
//   node --experimental-strip-types --no-warnings bench/transport.mjs [--quick]
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { createHandler } from 'ts-bin-rpc/server';
import { toNodeListener } from 'ts-bin-rpc/node';
import { Ts71Source } from '../packages/cli/src/source.ts';
import { buildSchema } from '../packages/cli/src/build.ts';
import { emptyLock, updateLock } from '../packages/cli/src/lock.ts';
import { emitCodecs } from '../packages/cli/src/emit.ts';
import { appRouter, produce } from './transport/router.ts';

const dir = import.meta.dirname;
const quick = process.argv.includes('--quick');
const REPS = quick ? 1 : 5;

// Codecs of the bench router, then the page bundle over them.
const gen = path.join(dir, 'gen', 'out', 'transport.gen.ts');
fs.mkdirSync(path.dirname(gen), { recursive: true });
const src = new Ts71Source(path.join(dir, 'transport', 'tsconfig.json'));
try {
  const { schema, errors } = buildSchema(src, path.join(dir, 'transport', 'router.ts'), 'appRouter');
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'));
  fs.writeFileSync(gen, emitCodecs(schema, updateLock(emptyLock(), schema).lock, {}));
} finally {
  src.close();
}
const { serverProcedures } = await import(gen);
const bundle = await esbuild.build({ entryPoints: [path.join(dir, 'transport', 'client.ts')], bundle: true, format: 'esm', minify: true, write: false, logLevel: 'warning' });
const page = '<!doctype html><meta charset="utf-8"><title>transport bench</title><script type="module" src="/client.js"></script>';

// The server: ts-bin-rpc under /rpc, NDJSON and SSE over the same ticks.
const rpc = toNodeListener(createHandler(appRouter, { procedures: serverProcedures, prefix: '/rpc' }));
let sent = 0; // bytes of the last response
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const socket = req.socket;
  const before = socket.bytesWritten;
  res.on('close', () => (sent = socket.bytesWritten - before));
  const headers = { 'cache-control': 'no-store', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
  if (url.pathname.startsWith('/rpc/')) return void rpc(req, res);
  if (url.pathname === '/') return void res.writeHead(200, { ...headers, 'content-type': 'text/html' }).end(page);
  if (url.pathname === '/client.js') return void res.writeHead(200, { ...headers, 'content-type': 'text/javascript' }).end(bundle.outputFiles[0].contents);
  const sse = url.pathname === '/sse';
  if (!sse && url.pathname !== '/ndjson') return void res.writeHead(404).end();
  res.writeHead(200, { ...headers, 'content-type': sse ? 'text/event-stream' : 'application/x-ndjson' });
  res.flushHeaders();
  let buf = '';
  const feed = { n: Number(url.searchParams.get('n')), rate: Number(url.searchParams.get('rate')), window: 0 };
  const stop = produce(
    feed,
    (t) => (buf += sse ? `data: ${JSON.stringify(t)}\n\n` : `${JSON.stringify(t)}\n`),
    () => {
      if (buf) res.write(buf);
      buf = '';
    },
    () => res.end(sse ? 'event: end\ndata:\n\n' : undefined),
  );
  res.on('close', stop);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const tab = await browser.newPage();
await tab.goto(origin);
await tab.waitForFunction(() => typeof globalThis.run === 'function');
const cdp = await tab.context().newCDPSession(tab);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

const variants = [
  { name: 'ts-bin-rpc, window 16 ms (default)', kind: 'tbr', window: 16 },
  { name: 'ts-bin-rpc, window 0', kind: 'tbr', window: 0 },
  { name: 'NDJSON over fetch', kind: 'ndjson', window: 0 },
  { name: 'SSE, EventSource', kind: 'sse', window: 0 },
];
const scenarios = [
  { name: '1 000 ticks/s for 5 s', n: quick ? 1000 : 5000, rate: 1000 },
  { name: '20 000 ticks/s for 3 s', n: quick ? 10_000 : 60_000, rate: 20_000 },
  { name: '200 000 ticks, as fast as possible', n: quick ? 20_000 : 200_000, rate: 0 },
];

async function once(v, s) {
  const m0 = await metrics();
  const c0 = process.cpuUsage();
  const r = await tab.evaluate(
    ([kind, feed]) =>
      globalThis.run(kind, feed).then((r) => ({ rows: r.rows, ms: r.ms, p50: r.delays[r.delays.length >> 1], p99: r.delays[Math.floor(r.delays.length * 0.99)] })),
    [v.kind, { n: s.n, rate: s.rate, window: v.window }],
  );
  const c = process.cpuUsage(c0);
  const m1 = await metrics();
  await new Promise((ok) => setTimeout(ok, 20)); // the response's close event
  if (r.rows !== s.n) throw new Error(`${v.name}: ${r.rows} of ${s.n} rows`);
  return { ...r, client: (m1.TaskDuration - m0.TaskDuration) * 1000, server: (c.user + c.system) / 1000, bytes: sent };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const ms = (x) => (x >= 100 ? `${x.toFixed(0)} ms` : x >= 10 ? `${x.toFixed(1)} ms` : `${x.toFixed(2)} ms`);
const mb = (x) => (x >= 1 << 20 ? `${(x / (1 << 20)).toFixed(1)} MB` : `${(x / 1024).toFixed(0)} KB`);

for (const v of variants) await once(v, { n: 2000, rate: 0 }); // warm up
const rows = [];
for (const s of scenarios) {
  for (const v of variants) {
    const runs = [];
    for (let i = 0; i < REPS; i++) runs.push(await once(v, s));
    const m = (k) => median(runs.map((r) => r[k]));
    const row = [s.name, v.name, ms(m('ms')), ms(m('p50')), ms(m('p99')), ms(m('client')), ms(m('server')), mb(m('bytes'))];
    rows.push(row);
    console.log(row.join(' | '));
  }
}
const version = browser.version();
await browser.close();
server.close();
const table = ['| Load | Transport | Wall | Delay p50 | Delay p99 | Page main thread | Server CPU | Bytes |', '|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const out = `# Streams over HTTP: ts-bin-rpc, NDJSON, SSE

${new Date().toISOString().slice(0, 10)}, ${os.cpus()[0].model}, ${os.platform()} ${os.release()}, Node ${process.version}, Chromium ${version}. Median of ${REPS} runs.

A Node HTTP server on 127.0.0.1 sends ticks \`{ t: f64, price: f32, size: u32, side: 'buy' | 'sell' }\`; a Chromium page reads every field of every tick. All three transports get the same producer: on a 1 ms timer it makes every tick that is due (at full speed, bursts of 1000 per macrotask), and NDJSON and SSE write once per timer tick, not once per tick. ts-bin-rpc batches by its window: 16 ms by default, or at the end of each task with \`window: 0\`.

- Delay: the page's clock minus the send time in the tick; both clocks are of the same machine.
- Page main thread: \`TaskDuration\` of the page's renderer from the Chrome DevTools Protocol, including the decoding and the reading of the ticks.
- Server CPU: user and system time of the server process, which also runs the Playwright driver.
- Bytes: what the server wrote to the socket, headers included, without compression.

${table}
`;
fs.writeFileSync(path.join(dir, 'results', 'stream-transport.md'), out);
console.log('bench/results/stream-transport.md');
