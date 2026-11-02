// Format v0 candidate "L": a vector of same-shaped tables is stored column by column.
// Numeric columns are TypedArrays over the buffer; string columns hold per-row u32 refs:
//   (len << 2 | block << 1) for a new value, (firstRow << 1 | 1) for a repeat within the column.
// A string column's values live contiguously in the ASCII / UTF-16 blocks starting at its two base offsets;
// the reader turns lengths into starts with one prefix pass, on first access to that column.
//
// Message: 24-byte header as in codec2. Root vector: u32 count | u32 colOffset[7].
// String column: u32 asciiBase | u32 u16Base | u32 refs[count].

const HEADER = 24;
const tdAscii = new TextDecoder();
const td16 = new TextDecoder('utf-16le');
const ASCII_RE = /^[\x00-\x7f]*$/;
const NCOL = 7; // id u32, score f64, age u8, isActive u8, name, email, city

export function encodeUsers3(users) {
  const n = users.length;
  let asciiLen = 0, u16Len = 0;
  const ascii = [], u16 = [];
  const strCols = ['name', 'email', 'city'].map((key) => {
    const refs = new Uint32Array(n);
    const first = new Map();
    const base = [asciiLen, u16Len];
    for (let i = 0; i < n; i++) {
      const s = users[i][key];
      const seen = first.get(s);
      if (seen !== undefined) { refs[i] = (seen << 1) | 1; continue; }
      first.set(s, i);
      if (ASCII_RE.test(s)) { ascii.push(s); asciiLen += s.length; refs[i] = s.length << 2; }
      else { u16.push(s); u16Len += s.length; refs[i] = (s.length << 2) | 2; }
    }
    return { base, refs };
  });

  const align8 = (x) => (x + 7) & ~7;
  let pos = align8(HEADER + 4 + NCOL * 4);
  const colOff = [];
  const sizes = [4 * n, 8 * n, n, n, 8 + 4 * n, 8 + 4 * n, 8 + 4 * n];
  for (const sz of sizes) { colOff.push(pos); pos = align8(pos + sz); }
  const asciiOff = pos; pos += asciiLen;
  pos = (pos + 1) & ~1;
  const u16Off = pos; pos += u16Len * 2;

  const u8 = new Uint8Array(pos);
  const dv = new DataView(u8.buffer);
  u8.set([0x54, 0x42, 0, 2]);
  dv.setUint32(4, HEADER, true);
  dv.setUint32(8, asciiOff, true); dv.setUint32(12, asciiLen, true);
  dv.setUint32(16, u16Off, true); dv.setUint32(20, u16Len, true);
  dv.setUint32(HEADER, n, true);
  colOff.forEach((o, c) => dv.setUint32(HEADER + 4 + c * 4, o, true));

  const id = new Uint32Array(u8.buffer, colOff[0], n);
  const score = new Float64Array(u8.buffer, colOff[1], n);
  for (let i = 0; i < n; i++) {
    const u = users[i];
    id[i] = u.id; score[i] = u.score; u8[colOff[2] + i] = u.age; u8[colOff[3] + i] = u.isActive ? 1 : 0;
  }
  strCols.forEach(({ base, refs }, k) => {
    const o = colOff[4 + k];
    dv.setUint32(o, base[0], true); dv.setUint32(o + 4, base[1], true);
    new Uint32Array(u8.buffer, o + 8, n).set(refs);
  });
  let a = asciiOff;
  for (const s of ascii) for (let i = 0; i < s.length; i++) u8[a++] = s.charCodeAt(i);
  const w16 = new Uint16Array(u8.buffer, u16Off, u16Len);
  let b = 0;
  for (const s of u16) for (let i = 0; i < s.length; i++) w16[b++] = s.charCodeAt(i);
  return u8;
}

class Msg {
  constructor(u8) { this.u8 = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this._a = undefined; this._u = undefined; }
  get ascii() { if (this._a === undefined) { const o = this.dv.getUint32(8, true); this._a = tdAscii.decode(this.u8.subarray(o, o + this.dv.getUint32(12, true))); } return this._a; }
  get u16() { if (this._u === undefined) { const o = this.dv.getUint32(16, true); this._u = td16.decode(this.u8.subarray(o, o + this.dv.getUint32(20, true) * 2)); } return this._u; }
}

class StrCol {
  constructor(m, off, n) {
    this.m = m; this.n = n;
    this.aBase = m.dv.getUint32(off, true); this.uBase = m.dv.getUint32(off + 4, true);
    this.refs = new Uint32Array(m.u8.buffer, m.u8.byteOffset + off + 8, n);
    this.starts = undefined; this.vals = undefined;
  }
  build() {
    const { refs, n } = this;
    const starts = new Uint32Array(n);
    let a = this.aBase, u = this.uBase;
    for (let i = 0; i < n; i++) {
      const r = refs[i];
      if (r & 1) continue;
      if (r & 2) { starts[i] = u; u += r >>> 2; } else { starts[i] = a; a += r >>> 2; }
    }
    this.starts = starts; this.vals = new Array(n);
  }
  get(i) {
    if (this.starts === undefined) this.build();
    let v = this.vals[i];
    if (v !== undefined) return v;
    const r = this.refs[i];
    if (r & 1) v = this.get(r >>> 1);
    else { const s = this.starts[i]; v = (r & 2 ? this.m.u16 : this.m.ascii).substring(s, s + (r >>> 2)); }
    this.vals[i] = v;
    return v;
  }
}

class UsersCols {
  constructor(u8) {
    const m = new Msg(u8);
    const root = m.dv.getUint32(4, true);
    const n = (this.n = m.dv.getUint32(root, true));
    const col = (c) => u8.byteOffset + m.dv.getUint32(root + 4 + c * 4, true);
    this.id = new Uint32Array(u8.buffer, col(0), n);
    this.score = new Float64Array(u8.buffer, col(1), n);
    this.age = new Uint8Array(u8.buffer, col(2), n);
    this.active = new Uint8Array(u8.buffer, col(3), n);
    this.name = new StrCol(m, col(4) - u8.byteOffset, n);
    this.email = new StrCol(m, col(5) - u8.byteOffset, n);
    this.city = new StrCol(m, col(6) - u8.byteOffset, n);
  }
}

class UserRow {
  constructor(c, i) { this.c = c; this.i = i; }
  get id() { return this.c.id[this.i]; }
  get score() { return this.c.score[this.i]; }
  get age() { return this.c.age[this.i]; }
  get isActive() { return this.c.active[this.i] !== 0; }
  get name() { return this.c.name.get(this.i); }
  get email() { return this.c.email.get(this.i); }
  get city() { return this.c.city.get(this.i); }
}

export function readUsers3(u8) {
  const c = new UsersCols(u8);
  const out = new Array(c.n);
  for (let i = 0; i < c.n; i++) out[i] = new UserRow(c, i);
  return out;
}
