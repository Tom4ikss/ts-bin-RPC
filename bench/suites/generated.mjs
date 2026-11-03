// Phase 2.7: generated codecs (packages/cli) against the hand-written columnar codec and JSON.
// Phase 4.4: the shapes where JSON should catch up: one small object, text-heavy rows, and a
// numeric series against JSON's best shape for it (an object of number arrays).
// Build first: node --experimental-strip-types bench/gen/build.mjs
import { encodeUsers3, readUsers3 } from '../lib/codec3.mjs';
import { makePoints, makeProducts, makeUsers } from '../lib/data.mjs';
import { procedures } from '../gen/out/codec.mjs';

const te = new TextEncoder();
const td = new TextDecoder();
const K = procedures.users.output;

const all = (u) => u.id + u.score + u.age + (u.isActive ? 1 : 0) + u.name.length + u.email.length + u.city.length;
const two = (u) => u.id + u.name.length;
const nums = (u) => u.id + u.score + u.age;

// A fresh copy of the reading loop per case: a shared one collects type feedback from every case's
// objects, and cases measured later would read through polymorphic inline caches.
const sumOf = (read) =>
  new Function('read', 'return (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += read(arr[i]); return s; };')(
    new Function(`return ${read}`)(),
  );

export function groups({ quick = false } = {}) {
  const out = [];
  for (const [group, n, read] of [
    ['10 users, all fields', 10, all],
    ['1000 users, all fields', 1000, all],
    ['1000 users, 2 fields', 1000, two],
    ['1000 users, numbers only', 1000, nums],
  ]) {
    const users = makeUsers(n);
    const [sJson, sHand, sGen, sVerify, sDecode] = Array.from({ length: 5 }, () => sumOf(read));
    const bytes = K.encode(users);
    out.push({
      group,
      cases: [
        { label: 'JSON', fn: (b) => sJson(JSON.parse(td.decode(b))), input: te.encode(JSON.stringify(users)) },
        { label: 'hand-written (codec3)', fn: (b) => sHand(readUsers3(b)), input: encodeUsers3(users) },
        { label: 'generated', fn: (b) => sGen(K.view(b, { verify: false })), input: bytes },
        { label: 'generated + verify', fn: (b) => sVerify(K.view(b)), input: bytes },
        { label: 'generated, decode (plain)', fn: (b) => sDecode(K.decode(b, { verify: false })), input: bytes },
      ],
    });
  }
  {
    const [user] = makeUsers(1);
    const K1 = procedures.user.output;
    const [sJson, sGen, sVerify] = Array.from({ length: 3 }, () => sumOf(all));
    const one = (s) => (u) => s([u]);
    const [rJson, rGen, rVerify] = [one(sJson), one(sGen), one(sVerify)];
    out.push({
      group: '1 user, all fields',
      cases: [
        { label: 'JSON', fn: (b) => rJson(JSON.parse(td.decode(b))), input: te.encode(JSON.stringify(user)) },
        { label: 'generated', fn: (b) => rGen(K1.view(b, { verify: false })), input: K1.encode(user) },
        { label: 'generated + verify', fn: (b) => rVerify(K1.view(b)), input: K1.encode(user) },
      ],
    });
  }
  const products = makeProducts(500);
  const KP = procedures.products.output;
  {
    const prod = (p) => p.id + p.price + p.stock + p.title.length + p.description.length + p.tags.length;
    const [sJson, sGen, sVerify] = Array.from({ length: 3 }, () => sumOf(prod));
    out.push({
      group: '500 products (long text), all fields',
      cases: [
        { label: 'JSON', fn: (b) => sJson(JSON.parse(td.decode(b))), input: te.encode(JSON.stringify(products)) },
        { label: 'generated', fn: (b) => sGen(KP.view(b, { verify: false })), input: KP.encode(products) },
        { label: 'generated + verify', fn: (b) => sVerify(KP.view(b)), input: KP.encode(products) },
      ],
    });
  }
  const points = makePoints(quick ? 10_000 : 100_000);
  const series = {
    t: Float64Array.from(points, (p) => p.t),
    x: Float32Array.from(points, (p) => p.x),
    y: Float32Array.from(points, (p) => p.y),
    v: Float32Array.from(points, (p) => p.v),
  };
  const KS = procedures.series.output;
  const columns = { t: [...series.t], x: points.map((p) => p.x), y: points.map((p) => p.y), v: points.map((p) => p.v) };
  // One loop per case, as with sumOf: number arrays and typed arrays must not share type feedback.
  const sumSeries = () =>
    new Function('s', 'let a = 0; for (let i = 0; i < s.t.length; i++) a += s.t[i] + s.x[i] + s.y[i] + s.v[i]; return a;');
  const [sJsonS, sGenS, sVerifyS] = [sumSeries(), sumSeries(), sumSeries()];
  out.push({
    group: `${points.length / 1000}k points, every value`,
    cases: [
      { label: 'JSON, number arrays', fn: (b) => sJsonS(JSON.parse(td.decode(b))), input: te.encode(JSON.stringify(columns)) },
      { label: 'generated', fn: (b) => sGenS(KS.view(b, { verify: false })), input: KS.encode(series) },
      { label: 'generated + verify', fn: (b) => sVerifyS(KS.view(b)), input: KS.encode(series) },
    ],
  });
  const users = makeUsers(1000);
  out.push({
    group: 'encode 1000 users',
    cases: [
      { label: 'JSON', fn: (u) => te.encode(JSON.stringify(u)).length, input: users },
      { label: 'hand-written (codec3)', fn: (u) => encodeUsers3(u).length, input: users },
      { label: 'generated', fn: (u) => K.encode(u).length, input: users },
    ],
  });
  out.push({
    group: 'encode 500 products',
    cases: [
      { label: 'JSON', fn: (p) => te.encode(JSON.stringify(p)).length, input: products },
      { label: 'generated', fn: (p) => KP.encode(p).length, input: products },
    ],
  });
  out.push({
    group: `encode ${points.length / 1000}k points`,
    cases: [
      { label: 'JSON, number arrays', fn: (c) => te.encode(JSON.stringify(c)).length, input: columns },
      { label: 'generated', fn: (s) => KS.encode(s).length, input: series },
    ],
  });
  return out;
}
