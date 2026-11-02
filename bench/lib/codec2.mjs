// Format v0 candidate: string blocks (ASCII one-byte + UTF-16LE two-byte) decoded once per message,
// tables either with fixed offsets or FlatBuffers-style vtables.
//
// Message:
//   0  'T' 'B' version flags
//   4  root offset u32
//   8  ascii block offset u32 | 12 ascii length (bytes = chars) u32
//   16 utf16 block offset u32 | 20 utf16 length (chars) u32
//   24 ... body
// String ref (8 bytes): u32 start | u32 (len << 1 | block), block 0 = ascii, 1 = utf16.
// Vector of tables: u32 count, then u32 absolute offsets to tables.
// Table (vtable mode): i32 back-offset to its vtable, then fields. vtable: u16 size, u16 tableSize, u16 fieldOff[n].

const HEADER = 24;
const tdAscii = new TextDecoder(); // ASCII is valid UTF-8, so the fast path applies
const td16 = new TextDecoder('utf-16le');
const ASCII_RE = /^[\x00-\x7f]*$/;

// User fields by id: 0 id u32, 1 score f64, 2 age u8, 3 isActive u8, 4 name, 5 email, 6 city
const FIELD_OFF = [4, 8, 16, 17, 18, 26, 34]; // offsets inside a table (after the 4-byte vtable slot)
const TABLE_SIZE = 42;

class Writer {
  constructor(cap = 1024) { this.u8 = new Uint8Array(cap); this.dv = new DataView(this.u8.buffer); this.pos = 0; }
  ensure(n) {
    if (this.pos + n <= this.u8.length) return;
    let cap = this.u8.length * 2;
    while (cap < this.pos + n) cap *= 2;
    const next = new Uint8Array(cap); next.set(this.u8); this.u8 = next; this.dv = new DataView(next.buffer);
  }
  align(a) { const p = (this.pos + a - 1) & ~(a - 1); this.ensure(p - this.pos); this.pos = p; }
}

export function encodeUsers2(users, { vtable }) {
  const asciiParts = []; let asciiLen = 0;
  const u16Parts = []; let u16Len = 0;
  const strRef = (s) => {
    if (ASCII_RE.test(s)) { asciiParts.push(s); const r = [asciiLen, s.length << 1]; asciiLen += s.length; return r; }
    u16Parts.push(s); const r = [u16Len, (s.length << 1) | 1]; u16Len += s.length; return r;
  };

  const w = new Writer(HEADER + users.length * 64);
  w.pos = HEADER;
  let vtPos = 0;
  if (vtable) {
    w.ensure(4 + FIELD_OFF.length * 2);
    vtPos = w.pos;
    w.dv.setUint16(w.pos, 4 + FIELD_OFF.length * 2, true);
    w.dv.setUint16(w.pos + 2, TABLE_SIZE, true);
    FIELD_OFF.forEach((f, i) => w.dv.setUint16(w.pos + 4 + i * 2, f, true));
    w.pos += 4 + FIELD_OFF.length * 2;
  }
  w.align(4);
  const root = w.pos;
  w.ensure(4 + users.length * 4);
  w.dv.setUint32(w.pos, users.length, true);
  const slots = w.pos + 4;
  w.pos += 4 + users.length * 4;

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    w.align(4); w.ensure(TABLE_SIZE);
    const t = w.pos;
    w.dv.setUint32(slots + i * 4, t, true);
    if (vtable) w.dv.setInt32(t, t - vtPos, true);
    w.dv.setUint32(t + 4, u.id, true);
    w.dv.setFloat64(t + 8, u.score, true);
    w.u8[t + 16] = u.age;
    w.u8[t + 17] = u.isActive ? 1 : 0;
    for (const [off, s] of [[18, u.name], [26, u.email], [34, u.city]]) {
      const [start, lenFlag] = strRef(s);
      w.dv.setUint32(t + off, start, true);
      w.dv.setUint32(t + off + 4, lenFlag, true);
    }
    w.pos += TABLE_SIZE;
  }

  const ascii = asciiParts.join('');
  w.ensure(ascii.length);
  const asciiOff = w.pos;
  for (let i = 0; i < ascii.length; i++) w.u8[asciiOff + i] = ascii.charCodeAt(i);
  w.pos += ascii.length;

  w.align(2);
  const u16 = u16Parts.join('');
  w.ensure(u16.length * 2);
  const u16Off = w.pos;
  for (let i = 0; i < u16.length; i++) w.dv.setUint16(u16Off + i * 2, u16.charCodeAt(i), true);
  w.pos += u16.length * 2;

  w.u8.set([0x54, 0x42, 0, vtable ? 1 : 0], 0);
  w.dv.setUint32(4, root, true);
  w.dv.setUint32(8, asciiOff, true); w.dv.setUint32(12, ascii.length, true);
  w.dv.setUint32(16, u16Off, true); w.dv.setUint32(20, u16.length, true);
  return w.u8.slice(0, w.pos);
}

class Msg {
  constructor(u8) {
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.ascii = undefined;
    this.u16 = undefined;
  }
  str(slot) {
    const start = this.dv.getUint32(slot, true);
    const lf = this.dv.getUint32(slot + 4, true);
    const len = lf >>> 1;
    if (lf & 1) {
      if (this.u16 === undefined) {
        const off = this.dv.getUint32(16, true);
        this.u16 = td16.decode(this.u8.subarray(off, off + this.dv.getUint32(20, true) * 2));
      }
      return this.u16.substring(start, start + len);
    }
    if (this.ascii === undefined) {
      const off = this.dv.getUint32(8, true);
      this.ascii = tdAscii.decode(this.u8.subarray(off, off + this.dv.getUint32(12, true)));
    }
    return this.ascii.substring(start, start + len);
  }
}

class UserFixed {
  constructor(m, t) { this.m = m; this.t = t; this._name = undefined; this._email = undefined; this._city = undefined; }
  get id() { return this.m.dv.getUint32(this.t + 4, true); }
  get score() { return this.m.dv.getFloat64(this.t + 8, true); }
  get age() { return this.m.u8[this.t + 16]; }
  get isActive() { return this.m.u8[this.t + 17] !== 0; }
  get name() { return this._name ??= this.m.str(this.t + 18); }
  get email() { return this._email ??= this.m.str(this.t + 26); }
  get city() { return this._city ??= this.m.str(this.t + 34); }
}

// Each read goes through the vtable: field offset 0 means "absent".
class UserVt {
  constructor(m, t) {
    this.m = m; this.t = t; this.vt = t - m.dv.getInt32(t, true);
    this._name = undefined; this._email = undefined; this._city = undefined;
  }
  f(id) { return this.m.dv.getUint16(this.vt + 4 + id * 2, true); }
  get id() { const o = this.f(0); return o ? this.m.dv.getUint32(this.t + o, true) : 0; }
  get score() { const o = this.f(1); return o ? this.m.dv.getFloat64(this.t + o, true) : 0; }
  get age() { const o = this.f(2); return o ? this.m.u8[this.t + o] : 0; }
  get isActive() { const o = this.f(3); return o ? this.m.u8[this.t + o] !== 0 : false; }
  get name() { if (this._name === undefined) { const o = this.f(4); this._name = o ? this.m.str(this.t + o) : ''; } return this._name; }
  get email() { if (this._email === undefined) { const o = this.f(5); this._email = o ? this.m.str(this.t + o) : ''; } return this._email; }
  get city() { if (this._city === undefined) { const o = this.f(6); this._city = o ? this.m.str(this.t + o) : ''; } return this._city; }
}

// Vectors of tables decode into a real Array of views (DESIGN §7).
export function readUsers2(u8) {
  const m = new Msg(u8);
  const vt = (u8[3] & 1) === 1;
  const root = m.dv.getUint32(4, true);
  const n = m.dv.getUint32(root, true);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = m.dv.getUint32(root + 4 + i * 4, true);
    out[i] = vt ? new UserVt(m, t) : new UserFixed(m, t);
  }
  return out;
}
