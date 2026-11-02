import { gzipSync, brotliCompressSync } from 'node:zlib';
import {
  encodeUsers, UsersView, decodeUsersEager,
  encodePointsAoS, PointsAoSView, encodePointsSoA, pointsSoAView,
} from './codec.mjs';

const te = new TextEncoder();
const td = new TextDecoder();

// ---------------------------------------------------------------- data
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const NAMES_EN = ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Evan Wright', 'Fiona Gallagher'];
const NAMES_RU = ['Артём Шаов', 'Мария Иванова', 'Сергей Петров', 'Ольга Смирнова'];
const CITIES = ['Moscow', 'Saint Petersburg', 'Berlin', 'London', 'Новосибирск', 'Екатеринбург', 'Amsterdam'];

function makeUsers(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = rnd() < 0.3 ? pick(NAMES_RU) : pick(NAMES_EN);
    out.push({
      id: i + 1,
      score: Math.round(rnd() * 100000) / 100,
      age: 18 + Math.floor(rnd() * 60),
      isActive: rnd() < 0.7,
      name,
      email: `user${i + 1}.${Math.floor(rnd() * 1e6)}@example.com`,
      city: pick(CITIES),
    });
  }
  return out;
}

function makePoints(n) {
  const out = [];
  let t = 1_730_000_000_000;
  for (let i = 0; i < n; i++) {
    t += 16.6;
    out.push({
      t: Math.round(t * 10) / 10,
      x: Math.round((rnd() * 2000 - 1000) * 1000) / 1000,
      y: Math.round((rnd() * 2000 - 1000) * 1000) / 1000,
      v: Math.round(rnd() * 100 * 1000) / 1000,
    });
  }
  return out;
}

// ---------------------------------------------------------------- harness
let sink = 0;
const now = () => Number(process.hrtime.bigint()) / 1e6; // ms

function bench(fn, input) {
  const tw = now();
  while (now() - tw < 300) sink += fn(input);
  let iters = 1;
  for (;;) {
    const t0 = now();
    for (let i = 0; i < iters; i++) sink += fn(input);
    if (now() - t0 > 25) break;
    iters *= 2;
  }
  const samples = [];
  for (let s = 0; s < 15; s++) {
    const t0 = now();
    for (let i = 0; i < iters; i++) sink += fn(input);
    samples.push(((now() - t0) * 1000) / iters); // µs/op
  }
  samples.sort((a, b) => a - b);
  return samples[7];
}

const rows = [];
function run(scenario, cases) {
  let base;
  for (const [label, fn, input] of cases) {
    const us = bench(fn, input);
    base ??= us;
    rows.push({ scenario, variant: label, 'µs/op': us.toFixed(us < 10 ? 2 : 1), 'vs JSON': (base / us).toFixed(2) + 'x' });
  }
}

const sizeRow = (label, bytes) => ({
  payload: label,
  raw: bytes.length,
  gzip: gzipSync(bytes).length,
  brotli: brotliCompressSync(bytes).length,
});

// ---------------------------------------------------------------- user workloads
const sumAllJson = (arr) => {
  let s = 0;
  for (const u of arr) s += u.id + u.score + u.age + (u.isActive ? 1 : 0) + u.name.length + u.email.length + u.city.length;
  return s;
};
const sumAllView = (v) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const u = v.get(i);
    s += u.id + u.score + u.age + (u.isActive ? 1 : 0) + u.name.length + u.email.length + u.city.length;
  }
  return s;
};
const sumTwoJson = (arr) => {
  let s = 0;
  for (const u of arr) s += u.id + u.name.length;
  return s;
};
const sumTwoView = (v) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const u = v.get(i);
    s += u.id + u.name.length;
  }
  return s;
};

const sizes = [];
for (const [scenario, n, readAll] of [
  ['S1: 10 users, all fields', 10, true],
  ['S2: 1000 users, 2 fields', 1000, false],
  ['S3: 1000 users, all fields', 1000, true],
]) {
  const users = makeUsers(n);
  const jsonBytes = te.encode(JSON.stringify(users));
  const binBytes = encodeUsers(users);
  if (readAll) sizes.push(sizeRow(`${n} users JSON`, jsonBytes), sizeRow(`${n} users binary`, binBytes));
  const readJ = readAll ? sumAllJson : sumTwoJson;
  const readV = readAll ? sumAllView : sumTwoView;
  run(scenario, [
    ['JSON.parse(decode(bytes))', (b) => readJ(JSON.parse(td.decode(b))), jsonBytes],
    ['binary lazy getters', (b) => readV(new UsersView(b)), binBytes],
    ['binary eager decode', (b) => readJ(decodeUsersEager(b)), binBytes],
  ]);
}

// ---------------------------------------------------------------- telemetry
{
  const pts = makePoints(100_000);
  const jsonBytes = te.encode(JSON.stringify(pts));
  const aos = encodePointsAoS(pts);
  const soa = encodePointsSoA(pts);
  sizes.push(sizeRow('100k points JSON', jsonBytes), sizeRow('100k points binary', soa));

  run('S4: 100k points, sum v + max x', [
    ['JSON.parse(decode(bytes))', (b) => {
      const a = JSON.parse(td.decode(b));
      let s = 0, m = -Infinity;
      for (const p of a) { s += p.v; if (p.x > m) m = p.x; }
      return s + m;
    }, jsonBytes],
    ['binary AoS lazy getters', (b) => {
      const v = new PointsAoSView(b);
      let s = 0, m = -Infinity;
      for (let i = 0; i < v.length; i++) { const p = v.get(i); s += p.v; const x = p.x; if (x > m) m = x; }
      return s + m;
    }, aos],
    ['binary SoA TypedArray', (b) => {
      const c = pointsSoAView(b);
      let s = 0, m = -Infinity;
      for (let i = 0; i < c.length; i++) { s += c.v[i]; const x = c.x[i]; if (x > m) m = x; }
      return s + m;
    }, soa],
  ]);

  run('E2: encode 100k points', [
    ['JSON.stringify + encode', (p) => te.encode(JSON.stringify(p)).length, pts],
    ['binary SoA encode', (p) => encodePointsSoA(p).length, pts],
  ]);
}

{
  const users = makeUsers(1000);
  run('E1: encode 1000 users', [
    ['JSON.stringify + encode', (u) => te.encode(JSON.stringify(u)).length, users],
    ['binary encode', (u) => encodeUsers(u).length, users],
  ]);
}

console.log(`node ${process.version}`);
console.table(rows);
console.table(sizes);
if (sink === 42) console.log('');
