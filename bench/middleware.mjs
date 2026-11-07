// What middleware costs per call: a chain composed by use() against a plain procedure, alone and
// inside createHandler. Writes bench/results/middleware.md.
//   node --experimental-strip-types --no-warnings bench/middleware.mjs [--quick] [--out=dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { around, createHandler, middleware, use } from 'ts-bin-rpc/server';

const quick = process.argv.includes('--quick');
const ROUNDS = quick ? 3 : 9;
const CALLS = quick ? 20_000 : 200_000;

const authed = middleware(({ ctx }) => {
  if (!ctx.user) throw new Error('unreachable');
  return { ...ctx, user: ctx.user };
});
const authedAsync = middleware(async ({ ctx }) => ({ ...ctx, user: ctx.user }));
const tenant = middleware(({ ctx }) => ({ ...ctx, tenant: 1 }));
const timed = around(async (_call, next) => {
  const t0 = performance.now();
  try {
    return await next();
  } finally {
    if (performance.now() - t0 < 0) throw new Error('unreachable');
  }
});

const proc = async (_input, ctx) => ctx;
const variants = [
  { name: 'no middleware', router: { p: proc } },
  { name: '1 context step', router: use([authed], { p: proc }) },
  { name: '1 async context step', router: use([authedAsync], { p: proc }) },
  { name: '1 around', router: use([timed], { p: proc }) },
  { name: 'around + 2 context steps', router: use([timed, authed, tenant], { p: proc }) },
];

/** Median ns per call of `fn` over sequential awaited calls. */
async function measure(fn) {
  for (let i = 0; i < CALLS / 4; i++) await fn(); // warm up
  const runs = [];
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < CALLS; i++) await fn();
    runs.push(((performance.now() - t0) * 1e6) / CALLS);
  }
  return runs.sort((a, b) => a - b)[runs.length >> 1];
}

const ctx = { user: 'ann' };
// as generated code marks a procedure that takes ctx: without it the handler does not call context
const procedures = { p: { input: null, inputOptional: false, output: null, ctx: true, hash: 'h' } };
const ns = (x) => (x >= 1000 ? `${(x / 1000).toFixed(2)} µs` : `${x.toFixed(0)} ns`);

const rows = [];
let base;
for (const v of variants) {
  const direct = await measure(() => v.router.p(undefined, ctx));
  const handler = createHandler(v.router, { procedures, context: () => ctx });
  const request = () => new Request('http://x/p', { method: 'POST', headers: { 'content-type': 'application/vnd.tbr' } });
  const viaHandler = await measure(() => handler(request()));
  base ??= { direct, viaHandler };
  const plus = (x, b) => (x === b ? ns(x) : `${ns(x)} (${x >= b ? '+' : '−'}${ns(Math.abs(x - b))})`);
  const row = [v.name, plus(direct, base.direct), plus(viaHandler, base.viaHandler)];
  rows.push(row);
  console.log(row.join(' | '));
}

const out = `# Middleware overhead

${new Date().toISOString().slice(0, 10)}, ${os.cpus()[0].model}, ${os.platform()} ${os.release()}, Node ${process.version}. Median of ${ROUNDS} rounds of ${CALLS.toLocaleString('en')} sequential awaited calls.

The procedure takes no input and returns nothing, so the handler column is routing, \`Request\` and \`Response\` without a codec. Context steps return a new object, as \`{ ...ctx, user }\` does; the around step reads the clock twice.

| Chain | Calling the procedure | Through createHandler |
|---|---|---|
${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}
`;
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outDir = outArg ? path.resolve(outArg.slice(6)) : path.join(import.meta.dirname, 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'middleware.md'), out);
console.log(path.join(outDir, 'middleware.md'));
