// Hand-written stand-in for what the code generator would emit.
// Little-endian, FlatBuffers-like: fixed-size structs + string heap at the tail.

const te = new TextEncoder();
const td = new TextDecoder();

// Short ASCII strings are cheaper to build by hand than to round-trip through TextDecoder.
function readStr(u8, off, len) {
  if (len <= 32) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = u8[off + i];
      if (c > 127) return td.decode(u8.subarray(off, off + len));
      s += String.fromCharCode(c);
    }
    return s;
  }
  return td.decode(u8.subarray(off, off + len));
}

// ---------------------------------------------------------------------------
// User { id: u32, score: f64, age: u8, isActive: bool, name, email, city: string }
// Layout (38 bytes):
//   0 id u32 | 4 score f64 | 12 age u8 | 13 isActive u8
//   14 name.off u32 | 18 name.len u32 | 22 email.off | 26 email.len | 30 city.off | 34 city.len
// Message: [u32 count][count * 38][string heap]

export const USER_SIZE = 38;

export function encodeUsers(users) {
  let bound = 4 + users.length * USER_SIZE;
  for (const u of users) bound += 3 * (u.name.length + u.email.length + u.city.length);
  const u8 = new Uint8Array(bound);
  const dv = new DataView(u8.buffer);
  dv.setUint32(0, users.length, true);
  let heap = 4 + users.length * USER_SIZE;
  const writeStr = (slot, s) => {
    const { written } = te.encodeInto(s, u8.subarray(heap));
    dv.setUint32(slot, heap, true);
    dv.setUint32(slot + 4, written, true);
    heap += written;
  };
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const o = 4 + i * USER_SIZE;
    dv.setUint32(o, u.id, true);
    dv.setFloat64(o + 4, u.score, true);
    u8[o + 12] = u.age;
    u8[o + 13] = u.isActive ? 1 : 0;
    writeStr(o + 14, u.name);
    writeStr(o + 22, u.email);
    writeStr(o + 30, u.city);
  }
  return u8.slice(0, heap);
}

// Strings are decoded on first read and cached on the view. Cache slots are created in the
// constructor so every UserView shares one hidden class and the getters stay monomorphic.
export class UserView {
  constructor(dv, u8, o) {
    this._dv = dv;
    this._u8 = u8;
    this._o = o;
    this._name = undefined;
    this._email = undefined;
    this._city = undefined;
  }
  get id() { return this._dv.getUint32(this._o, true); }
  get score() { return this._dv.getFloat64(this._o + 4, true); }
  get age() { return this._u8[this._o + 12]; }
  get isActive() { return this._u8[this._o + 13] !== 0; }
  get name() { return this._name ??= readStr(this._u8, this._dv.getUint32(this._o + 14, true), this._dv.getUint32(this._o + 18, true)); }
  get email() { return this._email ??= readStr(this._u8, this._dv.getUint32(this._o + 22, true), this._dv.getUint32(this._o + 26, true)); }
  get city() { return this._city ??= readStr(this._u8, this._dv.getUint32(this._o + 30, true), this._dv.getUint32(this._o + 34, true)); }
}

// Views are cached too: the string cache survives repeated get(i), and get(i) === get(i)
// holds, which reference-equality consumers (React.memo, hook deps, selectors) rely on.
export class UsersView {
  constructor(u8) {
    this._u8 = u8;
    this._dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.length = this._dv.getUint32(0, true);
    this._views = new Array(this.length);
  }
  get(i) { return this._views[i] ??= new UserView(this._dv, this._u8, 4 + i * USER_SIZE); }
}

export function decodeUsersEager(u8) {
  const v = new UsersView(u8);
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) {
    const u = v.get(i);
    out[i] = { id: u.id, score: u.score, age: u.age, isActive: u.isActive, name: u.name, email: u.email, city: u.city };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Point { t: f64, x: f32, y: f32, v: f32 }

// Array-of-structs, 20 bytes each, read through DataView getters (what a generic codegen gives you).
export const POINT_SIZE = 20;

export function encodePointsAoS(points) {
  const u8 = new Uint8Array(4 + points.length * POINT_SIZE);
  const dv = new DataView(u8.buffer);
  dv.setUint32(0, points.length, true);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const o = 4 + i * POINT_SIZE;
    dv.setFloat64(o, p.t, true);
    dv.setFloat32(o + 8, p.x, true);
    dv.setFloat32(o + 12, p.y, true);
    dv.setFloat32(o + 16, p.v, true);
  }
  return u8;
}

export class PointView {
  constructor(dv, o) { this._dv = dv; this._o = o; }
  get t() { return this._dv.getFloat64(this._o, true); }
  get x() { return this._dv.getFloat32(this._o + 8, true); }
  get y() { return this._dv.getFloat32(this._o + 12, true); }
  get v() { return this._dv.getFloat32(this._o + 16, true); }
}

export class PointsAoSView {
  constructor(u8) {
    this._dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.length = this._dv.getUint32(0, true);
  }
  get(i) { return new PointView(this._dv, 4 + i * POINT_SIZE); }
}

// Struct-of-arrays: columns are TypedArrays laid directly over the buffer (true zero-copy).
// [u32 count][pad to 8][t: f64 * n][x: f32 * n][y: f32 * n][v: f32 * n]
export function encodePointsSoA(points) {
  const n = points.length;
  const u8 = new Uint8Array(8 + n * 8 + n * 4 * 3);
  new DataView(u8.buffer).setUint32(0, n, true);
  const t = new Float64Array(u8.buffer, 8, n);
  const x = new Float32Array(u8.buffer, 8 + n * 8, n);
  const y = new Float32Array(u8.buffer, 8 + n * 12, n);
  const v = new Float32Array(u8.buffer, 8 + n * 16, n);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    t[i] = p.t; x[i] = p.x; y[i] = p.y; v[i] = p.v;
  }
  return u8;
}

export function pointsSoAView(u8) {
  const n = new DataView(u8.buffer, u8.byteOffset).getUint32(0, true);
  const b = u8.buffer, base = u8.byteOffset;
  return {
    length: n,
    t: new Float64Array(b, base + 8, n),
    x: new Float32Array(b, base + 8 + n * 8, n),
    y: new Float32Array(b, base + 8 + n * 12, n),
    v: new Float32Array(b, base + 8 + n * 16, n),
  };
}
