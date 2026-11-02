import { encodeUsers, UsersView, USER_SIZE } from '../lib/codec.mjs';
const te = new TextEncoder(), td = new TextDecoder();
let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const users = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, score: Math.round(rnd() * 1e5) / 100, age: 30, isActive: true,
  name: rnd() < 0.3 ? 'Мария Иванова' : 'Alice Johnson', email: `user${i}.${Math.floor(rnd() * 1e6)}@example.com`, city: 'Moscow' }));
const jb = te.encode(JSON.stringify(users)), js = JSON.stringify(users), bb = encodeUsers(users);

// FlatBuffers-style verifier: every string ref in bounds + valid UTF-8 (fatal decoder).
const fatal = new TextDecoder('utf-8', { fatal: true });
function verify(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = dv.getUint32(0, true);
  if (4 + n * USER_SIZE > u8.length) throw new Error('oob');
  for (let i = 0; i < n; i++) {
    const o = 4 + i * USER_SIZE;
    for (const s of [14, 22, 30]) {
      const off = dv.getUint32(o + s, true), len = dv.getUint32(o + s + 4, true);
      if (off + len > u8.length) throw new Error('oob');
    }
  }
  fatal.decode(u8.subarray(4 + n * USER_SIZE)); // whole heap UTF-8 check in one pass
  return n;
}
let sink = 0; const now = () => Number(process.hrtime.bigint()) / 1e6;
function bench(f) { let t = now(); while (now() - t < 300) sink += f(); const N = 2000; const r = [];
  for (let s = 0; s < 11; s++) { t = now(); for (let i = 0; i < N; i++) sink += f(); r.push((now() - t) * 1000 / N); } r.sort((a, b) => a - b); return r[5].toFixed(1); }
const two = (v) => { let s = 0; for (let i = 0; i < v.length; i++) { const u = v.get(i); s += u.id + u.name.length; } return s; };
console.log('td.decode only          ', bench(() => td.decode(jb).length), 'µs');
console.log('JSON.parse(string) only ', bench(() => JSON.parse(js).length), 'µs');
console.log('verify only             ', bench(() => verify(bb)), 'µs');
console.log('S2 lazy, no verify      ', bench(() => two(new UsersView(bb))), 'µs');
console.log('S2 lazy + verify        ', bench(() => (verify(bb), two(new UsersView(bb)))), 'µs');
