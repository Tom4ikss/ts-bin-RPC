// What GET costs over POST: the same procedure as a query and as a plain call, client and handler in
// process, so that the network does not hide it. A query pays for base64url, the URL and a hash of the
// response for its ETag. Writes bench/results/query.md.
//   node --experimental-strip-types --no-warnings bench/query.mjs [--quick] [--out=dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from 'ts-bin-rpc/client';
import { createHandler } from 'ts-bin-rpc/server';
import { appRouter } from '../e2e/src/router.ts';
import { procedures } from '../e2e/src/tbr.gen.ts';

const quick = process.argv.includes('--quick');
const ROUNDS = quick ? 3 : 9;
const CALLS = quick ? 5_000 : 50_000;

const handler = createHandler(appRouter, { procedures, prefix: '/rpc' });
const fetchFn = async (input, init) => handler(new Request(input, init));
const api = createClient({ url: 'http://bench/rpc', procedures, fetch: fetchFn, verify: false });
const url = `http://bench/rpc/catalog.user?h=${procedures['catalog.user'].hash}&i=${Buffer.from(procedures['catalog.user'].input.encode({ id: 2 })).toString('base64url')}`;
const etag = (await handler(new Request(url))).headers.get('etag');

/** Median µs per call of `fn` over sequential awaited calls. */
async function measure(fn) {
  for (let i = 0; i < CALLS / 4; i++) await fn();
  const runs = [];
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < CALLS; i++) await fn();
    runs.push(((performance.now() - t0) * 1000) / CALLS);
  }
  return runs.sort((a, b) => a - b)[runs.length >> 1];
}

// user.get and catalog.user take { id: u32 } and return the same User.
const variants = [
  ['POST, user.get', () => api.user.get({ id: 2 })],
  ['GET, catalog.user', () => api.catalog.user({ id: 2 })],
  ['GET, catalog.user, 304', () => handler(new Request(url, { headers: { 'if-none-match': etag } }))],
];
const rows = [];
let base;
for (const [name, fn] of variants) {
  const us = await measure(fn);
  base ??= us;
  rows.push(`| ${name} | ${us.toFixed(2)} µs | ${us === base ? '' : `${us >= base ? '+' : '−'}${Math.abs(us - base).toFixed(2)} µs`} |`);
  console.log(rows.at(-1));
}

const out = `# Queries: GET against POST

${new Date().toISOString().slice(0, 10)}, ${os.cpus()[0].model}, ${os.platform()} ${os.release()}, Node ${process.version}. Median of ${ROUNDS} rounds of ${CALLS.toLocaleString('en')} sequential awaited calls.

Client and handler in one process, no network: what a call costs on both sides together. The two procedures take \`{ id: u32 }\` and return the same 7-field user. The GET call also encodes the input as base64url, builds and parses the URL, and hashes the response for its ETag. The 304 row is the handler alone answering a request whose If-None-Match matches: the procedure still runs, the body is not sent.

| Call | Time | Over POST |
|---|---|---|
${rows.join('\n')}
`;
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outDir = outArg ? path.resolve(outArg.slice(6)) : path.join(import.meta.dirname, 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'query.md'), out);
console.log(path.join(outDir, 'query.md'));
