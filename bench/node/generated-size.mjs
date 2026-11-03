// Phase 4.4: compressed size of what `tbr` generates (not the phase-0 layouts) against JSON.
// Node-only (zlib + zstd CLI); measures bytes, not speed. Build the codecs first: pnpm --filter @tbr/bench gen
//   node bench/node/generated-size.mjs > bench/results/generated-size.md
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { procedures as P } from '../gen/out/codec.mjs';
import { makePoints, makeProducts, makeUsers } from '../lib/data.mjs';

const te = new TextEncoder();
const zstd = spawnSync('zstd', ['-V']).status === 0;
const SIZES = [
  ['raw', (b) => b.length],
  ['gzip-6', (b) => gzipSync(b, { level: 6 }).length],
  ['brotli-4', (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }).length],
  ['brotli-6', (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }).length],
  ['brotli-11', (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length],
  ...(zstd ? [['zstd-3', (b) => spawnSync('zstd', ['-3', '-c', '-q'], { input: b, maxBuffer: 1 << 28 }).stdout.length]] : []),
];

const points = makePoints(100_000);
const series = {
  t: Float64Array.from(points, (p) => p.t),
  x: Float32Array.from(points, (p) => p.x),
  y: Float32Array.from(points, (p) => p.y),
  v: Float32Array.from(points, (p) => p.v),
};
const columns = { t: [...series.t], x: points.map((p) => p.x), y: points.map((p) => p.y), v: points.map((p) => p.v) };
const CASES = [
  ['1000 users', P.users.output.encode(makeUsers(1000)), makeUsers(1000)],
  ['500 products, long text', P.products.output.encode(makeProducts(500)), makeProducts(500)],
  ['20 users', P.users.output.encode(makeUsers(20)), makeUsers(20)],
  ['100k points, JSON as number arrays', P.series.output.encode(series), columns],
  ['100k points, JSON as an array of objects', P.series.output.encode(series), points],
];

const out = [
  '# Generated codecs: size against JSON',
  '',
  `${new Date().toISOString().slice(0, 10)}. Bytes of ts-bin-rpc, % against JSON compressed the same way. JSON values are`,
  'those of bench/lib/data.mjs: numbers rounded to 1–3 decimals. The binary series stores float32/float64.',
  '',
  `| Payload | ${SIZES.map(([n]) => n).join(' | ')} |`,
  `|---|${SIZES.map(() => '---').join('|')}|`,
];
for (const [name, bin, value] of CASES) {
  const json = te.encode(JSON.stringify(value));
  const cells = SIZES.map(([, size]) => {
    const a = size(bin), b = size(json);
    const pct = Math.round((a / b - 1) * 100);
    return `${a} (${pct > 0 ? '+' : ''}${pct}%)`;
  });
  out.push(`| ${name} | ${cells.join(' | ')} |`);
}
console.log(out.join('\n'));
