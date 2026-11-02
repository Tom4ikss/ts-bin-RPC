// Memoize strings on first read. Two places to keep the cache:
//   A) on the view object itself (needs the list to hand out the same view each time),
//   B) in a per-message slot array (views stay throwaway, cache lives with the buffer).
import { encodeUsers, USER_SIZE } from '../lib/codec.mjs';
const te = new TextEncoder(), td = new TextDecoder();
const str = (u8, dv, slot) => td.decode(u8.subarray(dv.getUint32(slot, true), dv.getUint32(slot, true) + dv.getUint32(slot + 4, true)));

// --- baseline: no cache, fresh view on every get(i).
class UserView0 {
  constructor(dv, u8, o) { this._dv = dv; this._u8 = u8; this._o = o; }
  get id() { return this._dv.getUint32(this._o, true); }
  get name() { return str(this._u8, this._dv, this._o + 14); }
}
class UsersView {
  constructor(u8) { this._u8 = u8; this._dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.length = this._dv.getUint32(0, true); }
  get(i) { return new UserView0(this._dv, this._u8, 4 + i * USER_SIZE); }
}

// --- A: cache fields on the view; all fields initialized in the constructor to keep one hidden class.
class UserViewA {
  constructor(dv, u8, o) { this._dv = dv; this._u8 = u8; this._o = o; this._name = undefined; this._email = undefined; this._city = undefined; }
  get id() { return this._dv.getUint32(this._o, true); }
  get name() { return this._name ??= str(this._u8, this._dv, this._o + 14); }
  get email() { return this._email ??= str(this._u8, this._dv, this._o + 22); }
  get city() { return this._city ??= str(this._u8, this._dv, this._o + 30); }
}
class UsersViewA {
  constructor(u8) { this._u8 = u8; this._dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.length = this._dv.getUint32(0, true); this._views = new Array(this.length); }
  get(i) { return this._views[i] ??= new UserViewA(this._dv, this._u8, 4 + i * USER_SIZE); }
}

// --- B: one flat string cache per message, slot = record * 3 + field.
class UserViewB {
  constructor(m, i) { this._m = m; this._i = i; }
  get id() { return this._m._dv.getUint32(4 + this._i * USER_SIZE, true); }
  get name() { return this._m.s(this._i * 3, 4 + this._i * USER_SIZE + 14); }
  get email() { return this._m.s(this._i * 3 + 1, 4 + this._i * USER_SIZE + 22); }
  get city() { return this._m.s(this._i * 3 + 2, 4 + this._i * USER_SIZE + 30); }
}
class UsersViewB {
  constructor(u8) { this._u8 = u8; this._dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.length = this._dv.getUint32(0, true); this._s = new Array(this.length * 3); }
  s(k, slot) { return this._s[k] ??= str(this._u8, this._dv, slot); }
  get(i) { return new UserViewB(this, i); }
}

// --- workloads
let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const NAMES = ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Мария Иванова', 'Сергей Петров'];
const users = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, score: 1, age: 30, isActive: true,
  name: NAMES[Math.floor(rnd() * NAMES.length)] + ' ' + i, email: `user${i}@example.com`, city: 'Moscow' }));
const jb = te.encode(JSON.stringify(users)), bb = encodeUsers(users);

// Read name 5 times per user, like a few re-renders.
const reread = (n, get) => { let s = 0; for (let r = 0; r < 5; r++) for (let i = 0; i < n; i++) s += get(i).name.length; return s; };
// Sort by name: ~2·n·log n name reads through the comparator.
const sortByName = (n, get) => { const a = Array.from({ length: n }, (_, i) => get(i)); a.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)); return a[0].id; };

let sink = 0; const now = () => Number(process.hrtime.bigint()) / 1e3;
function bench(f) { let t = now(); while (now() - t < 300_000) sink += f(); const N = 200, r = [];
  for (let s = 0; s < 9; s++) { t = now(); for (let i = 0; i < N; i++) sink += f(); r.push((now() - t) / N); } r.sort((a, b) => a - b); return r[4].toFixed(0).padStart(5) + ' µs'; }

for (const [label, wl] of [['read name x5', reread], ['sort by name', sortByName]]) {
  console.log(label.padEnd(13),
    '| JSON', bench(() => { const a = JSON.parse(td.decode(jb)); return wl(a.length, (i) => a[i]); }),
    '| lazy no-memo', bench(() => { const v = new UsersView(bb); return wl(v.length, (i) => v.get(i)); }),
    '| memo A (view)', bench(() => { const v = new UsersViewA(bb); return wl(v.length, (i) => v.get(i)); }),
    '| memo B (msg)', bench(() => { const v = new UsersViewB(bb); return wl(v.length, (i) => v.get(i)); }));
}
