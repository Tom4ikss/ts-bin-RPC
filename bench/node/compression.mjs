// Phase 0.4: compressed size of layout variants vs JSON. Node-only (zlib + zstd CLI); measures bytes, not speed.
//   node bench/node/compression.mjs
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { makeUsers, makeProducts, makePoints } from '../lib/data.mjs';

const te = new TextEncoder();
const ASCII_RE = /^[\x00-\x7f]*$/;

// ---------------------------------------------------------------- generic size-faithful encoder
// schema: [{ name, kind }] with kind in u8 | u32 | f64 | bool | str | strs (array of strings)
const SIZE = { u8: 1, bool: 1, u32: 4, f64: 8, str: 8, strs: 4 };

class W {
  constructor() { this.u8 = new Uint8Array(1 << 16); this.dv = new DataView(this.u8.buffer); this.pos = 0; }
  need(n) { if (this.pos + n > this.u8.length) { const b = new Uint8Array(Math.max(this.u8.length * 2, this.pos + n)); b.set(this.u8); this.u8 = b; this.dv = new DataView(b.buffer); } }
  u8w(v) { this.need(1); this.u8[this.pos++] = v; }
  u16w(v) { this.need(2); this.dv.setUint16(this.pos, v, true); this.pos += 2; }
  u32w(v) { this.need(4); this.dv.setUint32(this.pos, v >>> 0, true); this.pos += 4; }
  i32w(v) { this.need(4); this.dv.setInt32(this.pos, v, true); this.pos += 4; }
  f64w(v) { this.need(8); this.dv.setFloat64(this.pos, v, true); this.pos += 8; }
  bytes(b) { this.need(b.length); this.u8.set(b, this.pos); this.pos += b.length; }
  align(a) { while (this.pos % a) this.u8w(0); }
  done() { return this.u8.slice(0, this.pos); }
}

// opts.strings: 'heap-utf8' (one UTF-8 heap, ref = start+len) | 'blocks' (ASCII + UTF-16 blocks, ref = start+len)
//               | 'blocks-len' (blocks, ref = len only; starts are prefix sums computed by the reader)
// opts.dedup: identical strings share one ref
// opts.tables: 'ref' (vector of u32 offsets, each table starts with a vtable back-offset) | 'inline' (stride, shared vtable)
// opts.soa: all fields of the vector stored column by column
function encode(rows, schema, opts) {
  const strs = { ascii: [], u16: [], heap: [], asciiLen: 0, u16Len: 0, heapLen: 0, seen: new Map() };
  const ref = (s) => {
    if (opts.dedup && strs.seen.has(s)) return strs.seen.get(s);
    let r;
    if (opts.strings === 'heap-utf8') {
      const b = te.encode(s); r = { start: strs.heapLen, len: b.length, block: 0 }; strs.heap.push(b); strs.heapLen += b.length;
    } else if (ASCII_RE.test(s)) {
      r = { start: strs.asciiLen, len: s.length, block: 0 }; strs.ascii.push(s); strs.asciiLen += s.length;
    } else {
      r = { start: strs.u16Len, len: s.length, block: 1 }; strs.u16.push(s); strs.u16Len += s.length;
    }
    if (opts.dedup) strs.seen.set(s, r);
    return r;
  };
  const w = new W();
  w.bytes([0x54, 0x42, 0, 0]); w.u32w(0); w.u32w(0); w.u32w(0); w.u32w(0); w.u32w(0); // header (24 bytes)
  const lenOnly = opts.strings === 'blocks-len';
  const idxMode = opts.strings === 'blocks-idx';
  const table = [];
  const writeStr = (s) => {
    if (idxMode) {
      let r = opts.dedup ? strs.seen.get(s) : undefined;
      if (!r) { r = ref(s); r.idx = table.length; table.push(r); }
      w.u32w(r.idx);
      return;
    }
    const r = ref(s); if (!lenOnly) w.u32w(r.start); w.u32w((r.len << 1) | r.block);
  };
  const strSize = lenOnly || idxMode ? 4 : 8;
  const vectors = []; // deferred string arrays: written after the tables
  const writeField = (f, v) => {
    switch (f.kind) {
      case 'u8': w.u8w(v); break;
      case 'bool': w.u8w(v ? 1 : 0); break;
      case 'u32': w.u32w(v); break;
      case 'f64': w.f64w(v); break;
      case 'str': writeStr(v); break;
      case 'strs': vectors.push({ at: w.pos, items: v }); w.u32w(0); break;
    }
  };
  const fieldSize = (f) => (f.kind === 'str' ? strSize : SIZE[f.kind]);

  // vtable
  const vt = w.pos;
  w.u16w(4 + schema.length * 2);
  let tsize = opts.tables === 'ref' ? 4 : 0;
  w.u16w(schema.reduce((a, f) => a + fieldSize(f), tsize));
  for (const f of schema) { w.u16w(tsize); tsize += fieldSize(f); }
  w.align(4);
  w.u32w(rows.length);

  if (opts.soa && opts.colStr) {
    // Decodable per-column string encoding: (len << 2 | block << 1) for a new value,
    // (firstRow << 1 | 1) for a value seen earlier in the same column.
    for (const f of schema) {
      w.align(8);
      if (f.kind !== 'str') { for (const r of rows) writeField(f, r[f.name]); continue; }
      const first = new Map();
      rows.forEach((r, i) => {
        const v = r[f.name];
        if (first.has(v)) { w.u32w((first.get(v) << 1) | 1); return; }
        first.set(v, i);
        const x = ref(v);
        w.u32w((x.len << 2) | (x.block << 1));
      });
    }
  } else if (opts.soa) {
    for (const f of schema) { w.align(8); for (const r of rows) writeField(f, r[f.name]); }
  } else if (opts.tables === 'inline') {
    w.u32w(tsize);
    for (const r of rows) for (const f of schema) writeField(f, r[f.name]);
  } else {
    const slots = w.pos; w.pos += rows.length * 4; w.need(0);
    rows.forEach((r, i) => {
      w.align(4);
      w.dv.setUint32(slots + i * 4, w.pos, true);
      w.i32w(w.pos - vt);
      for (const f of schema) writeField(f, r[f.name]);
    });
  }
  for (const v of vectors) {
    w.align(4);
    w.dv.setUint32(v.at, w.pos, true);
    w.u32w(v.items.length);
    for (const s of v.items) writeStr(s);
  }
  if (idxMode) { w.align(4); for (const r of table) w.u32w((r.len << 1) | r.block); }
  if (opts.strings === 'heap-utf8') {
    for (const b of strs.heap) w.bytes(b);
  } else {
    for (const s of strs.ascii) for (let i = 0; i < s.length; i++) w.u8w(s.charCodeAt(i));
    w.align(2);
    for (const s of strs.u16) for (let i = 0; i < s.length; i++) w.u16w(s.charCodeAt(i));
  }
  return w.done();
}

// ---------------------------------------------------------------- compressors
const zstd = (buf, level) => {
  const r = spawnSync('zstd', [`-${level}`, '-c', '-q'], { input: buf, maxBuffer: 1 << 28 });
  return r.status === 0 ? r.stdout.length : NaN;
};
const br = (buf, q) => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: q, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;
const COMPRESSORS = [
  ['raw', (b) => b.length],
  ['gzip-6', (b) => gzipSync(b, { level: 6 }).length],
  ['br-4', (b) => br(b, 4)],
  ['br-6', (b) => br(b, 6)],
  ['br-11', (b) => br(b, 11)],
  ['zstd-3', (b) => zstd(b, 3)],
];

const VARIANTS = [
  ['A old: heap utf-8, table refs', { strings: 'heap-utf8', tables: 'ref' }],
  ['B blocks, table refs', { strings: 'blocks', tables: 'ref' }],
  ['C blocks, inline tables', { strings: 'blocks', tables: 'inline' }],
  ['D C + len-only string refs', { strings: 'blocks-len', tables: 'inline' }],
  ['E D + dedup', { strings: 'blocks-len', tables: 'inline', dedup: true }],
  ['F E + SoA columns', { strings: 'blocks-len', tables: 'inline', dedup: true, soa: true }],
  ['G C + dedup', { strings: 'blocks', tables: 'inline', dedup: true }],
  ['H G + SoA columns', { strings: 'blocks', tables: 'inline', dedup: true, soa: true }],
  ['L SoA columns, per-column len|backref (decodable)', { strings: 'blocks-len', tables: 'inline', soa: true, colStr: true }],
  ['I inline tables, string index + length table, dedup', { strings: 'blocks-idx', tables: 'inline', dedup: true }],
  ['J SoA columns, string index + length table, dedup', { strings: 'blocks-idx', tables: 'inline', dedup: true, soa: true }],
  ['K SoA columns, string index + length table, no dedup', { strings: 'blocks-idx', tables: 'inline', soa: true }],
];

const DATASETS = [
  ['1000 users (CRUD)', makeUsers(1000), [
    { name: 'id', kind: 'u32' }, { name: 'score', kind: 'f64' }, { name: 'age', kind: 'u8' }, { name: 'isActive', kind: 'bool' },
    { name: 'name', kind: 'str' }, { name: 'email', kind: 'str' }, { name: 'city', kind: 'str' }]],
  ['500 products (long text)', makeProducts(500), [
    { name: 'id', kind: 'u32' }, { name: 'title', kind: 'str' }, { name: 'description', kind: 'str' },
    { name: 'price', kind: 'f64' }, { name: 'stock', kind: 'u32' }, { name: 'tags', kind: 'strs' }]],
  ['20 users (small response)', makeUsers(20, { seed: 99 }), null],
];
DATASETS[2][2] = DATASETS[0][2];

const pct = (v, base) => `${v > base ? '+' : ''}${(((v - base) / base) * 100).toFixed(0)}%`;

const out = [];
for (const [name, rows, schema] of DATASETS) {
  const json = te.encode(JSON.stringify(rows));
  const base = COMPRESSORS.map(([, c]) => c(json));
  out.push(`\n### ${name}\n`);
  out.push(`| Variant | ${COMPRESSORS.map(([n]) => n).join(' | ')} |`);
  out.push(`|---|${COMPRESSORS.map(() => '---').join('|')}|`);
  out.push(`| JSON | ${base.join(' | ')} |`);
  for (const [vname, opts] of VARIANTS) {
    const bin = encode(rows, schema, opts);
    out.push(`| ${vname} | ${COMPRESSORS.map(([, c], i) => { const v = c(bin); return `${v} (${pct(v, base[i])})`; }).join(' | ')} |`);
  }
}

// Numeric series: JSON vs AoS vs SoA columns (f64 t, f32 x/y/v).
{
  const pts = makePoints(100_000);
  const json = te.encode(JSON.stringify(pts));
  const n = pts.length;
  const soa = new Uint8Array(8 + n * 20);
  const t = new Float64Array(soa.buffer, 8, n), x = new Float32Array(soa.buffer, 8 + n * 8, n), y = new Float32Array(soa.buffer, 8 + n * 12, n), v = new Float32Array(soa.buffer, 8 + n * 16, n);
  pts.forEach((p, i) => { t[i] = p.t; x[i] = p.x; y[i] = p.y; v[i] = p.v; });
  const aos = new Uint8Array(4 + n * 20); const dv = new DataView(aos.buffer);
  pts.forEach((p, i) => { const o = 4 + i * 20; dv.setFloat64(o, p.t, true); dv.setFloat32(o + 8, p.x, true); dv.setFloat32(o + 12, p.y, true); dv.setFloat32(o + 16, p.v, true); });
  const base = COMPRESSORS.map(([, c]) => c(json));
  out.push('\n### 100k points (numeric)\n');
  out.push(`| Variant | ${COMPRESSORS.map(([nm]) => nm).join(' | ')} |`);
  out.push(`|---|${COMPRESSORS.map(() => '---').join('|')}|`);
  out.push(`| JSON | ${base.join(' | ')} |`);
  for (const [nm, buf] of [['AoS', aos], ['SoA columns', soa]]) {
    out.push(`| ${nm} | ${COMPRESSORS.map(([, c], i) => { const val = c(buf); return `${val} (${pct(val, base[i])})`; }).join(' | ')} |`);
  }
}

console.log(`# Compression (bytes; % vs JSON with the same compressor)\n${out.join('\n')}`);
