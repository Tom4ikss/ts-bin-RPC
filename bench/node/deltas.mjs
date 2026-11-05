// What deltas would save, before building them: bytes per frame of two realtime streams, raw and
// after deflate with a shared context (HTTP compression of a stream, permessage-deflate).
//   1. Ticks, 16 per batch: plain columns against delta-coded timestamps and quantized prices.
//   2. State of 100 entities where a few move each tick: the whole state every tick against keyed
//      deltas (changed rows whole) and field deltas (changed fields of changed rows).
// Columns are packed by hand like the generated layout (aligned typed arrays plus a small header),
// which is enough for sizes. The ts-bin-rpc rows are the frames of live state (DESIGN §18), encoded
// by the generated code of bench/gen/router.ts.
//   pnpm -C bench gen && node bench/node/deltas.mjs
import { constants, createDeflateRaw } from 'node:zlib';
import { procedures as P } from '../gen/out/codec.mjs';

const FRAMES = 300;
const te = new TextEncoder();

/** Columns `[TypedArrayCtor, values]` into one buffer, each aligned to its width, after a header. */
function pack(header, cols) {
  let size = header;
  const at = cols.map(([C, v]) => {
    size = (size + C.BYTES_PER_ELEMENT - 1) & ~(C.BYTES_PER_ELEMENT - 1);
    const o = size;
    size += C.BYTES_PER_ELEMENT * v.length;
    return o;
  });
  const u8 = new Uint8Array(size);
  cols.forEach(([C, v], i) => new C(u8.buffer, at[i], v.length).set(v));
  return u8;
}
/** Header of a column message: magic, count, and a directory entry per column, as generated code has. */
const head = (cols) => 8 + 8 + 8 * cols;

async function deflated(msgs) {
  const d = createDeflateRaw({ level: 6 });
  let total = 0;
  for (const m of msgs) {
    total += await new Promise((ok) => {
      let n = 0;
      const onData = (c) => (n += c.length);
      d.on('data', onData);
      d.write(m);
      d.flush(constants.Z_SYNC_FLUSH, () => (d.off('data', onData), ok(n)));
    });
  }
  d.end();
  return total / msgs.length;
}
const raw = (msgs) => msgs.reduce((a, m) => a + m.length, 0) / msgs.length;

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ------------------------------------------------------------------------------------------- ticks

function tickBatches() {
  let t = 1_793_900_000_000, price = 64_250.25;
  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const rows = [];
    for (let i = 0; i < 16; i++) {
      t += 1 + Math.floor(rand() * 2);
      price = Math.round((price + (rand() - 0.5) * 2) * 100) / 100;
      rows.push({ t, price, size: 1 + Math.floor(rand() * 500), side: rand() < 0.5 ? 0 : 1 });
    }
    out.push(rows);
  }
  return out;
}

const ticks = {
  'JSON': (r) => te.encode(JSON.stringify(r.map((x) => ({ t: x.t, price: x.price, size: x.size, side: x.side ? 'sell' : 'buy' })))),
  'columns: t f64, price f32': (r) => pack(head(4), [[Float64Array, r.map((x) => x.t)], [Float32Array, r.map((x) => x.price)], [Uint32Array, r.map((x) => x.size)], [Uint8Array, r.map((x) => x.side)]]),
  'columns: price f64': (r) => pack(head(4), [[Float64Array, r.map((x) => x.t)], [Float64Array, r.map((x) => x.price)], [Uint32Array, r.map((x) => x.size)], [Uint8Array, r.map((x) => x.side)]]),
  '+ t as u32 delta from the first': (r) => pack(head(5), [[Float64Array, [r[0].t]], [Uint32Array, r.map((x) => x.t - r[0].t)], [Float32Array, r.map((x) => x.price)], [Uint32Array, r.map((x) => x.size)], [Uint8Array, r.map((x) => x.side)]]),
  '+ price as i32 cents': (r) => pack(head(5), [[Float64Array, [r[0].t]], [Uint32Array, r.map((x) => x.t - r[0].t)], [Int32Array, r.map((x) => Math.round(x.price * 100))], [Uint32Array, r.map((x) => x.size)], [Uint8Array, r.map((x) => x.side)]]),
  '+ price as i16 delta of cents': (r) => pack(head(6), [[Float64Array, [r[0].t]], [Uint32Array, r.map((x) => x.t - r[0].t)], [Int32Array, [Math.round(r[0].price * 100)]], [Int16Array, r.map((x, i) => (i ? Math.round(x.price * 100) - Math.round(r[i - 1].price * 100) : 0))], [Uint32Array, r.map((x) => x.size)], [Uint8Array, r.map((x) => x.side)]]),
};

// ------------------------------------------------------------------------------------------- state

const N = 100;
function stateFrames(moving) {
  const ents = Array.from({ length: N }, (_, i) => ({ id: 1000 + i, x: rand() * 1000, y: rand() * 1000, vx: rand() - 0.5, vy: rand() - 0.5, hp: 100, name: `unit-${i}`, status: 0 }));
  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const changed = new Map(); // id -> set of fields
    for (const e of ents) {
      if (rand() < moving) {
        e.x += e.vx * 5;
        e.y += e.vy * 5;
        changed.set(e.id, new Set(['x', 'y']));
      }
      if (rand() < 0.01) {
        e.hp = Math.max(0, e.hp - 7);
        e.status = e.hp ? 0 : 1;
        changed.set(e.id, new Set([...(changed.get(e.id) ?? []), 'hp', 'status']));
      }
    }
    out.push({ ents: ents.map((e) => ({ ...e })), changed });
  }
  return out;
}

const F = ['x', 'y', 'vx', 'vy', 'hp', 'status', 'name'];
const allCols = (rows) => [
  [Uint32Array, rows.map((e) => e.id)],
  [Float32Array, rows.map((e) => e.x)], [Float32Array, rows.map((e) => e.y)],
  [Float32Array, rows.map((e) => e.vx)], [Float32Array, rows.map((e) => e.vy)],
  [Uint16Array, rows.map((e) => e.hp)], [Uint8Array, rows.map((e) => e.status)],
  // names: offsets into a shared ASCII block
  [Uint32Array, rows.map((e) => e.name.length)], [Uint8Array, te.encode(rows.map((e) => e.name).join(''))],
];

const state = {
  'JSON, whole state': ({ ents }) => te.encode(JSON.stringify(ents)),
  'columns, whole state': ({ ents }) => pack(head(9), allCols(ents)),
  'JSON, changed rows whole': ({ ents, changed }) => te.encode(JSON.stringify(ents.filter((e) => changed.has(e.id)))),
  'columns, changed rows whole': ({ ents, changed }) => pack(head(9), allCols(ents.filter((e) => changed.has(e.id)))),
  'JSON, changed fields': ({ ents, changed }) => te.encode(JSON.stringify(ents.filter((e) => changed.has(e.id)).map((e) => Object.fromEntries([['id', e.id], ...[...changed.get(e.id)].map((k) => [k, e[k]])])))),
  // a column per field with a presence bitmap; absent cells take no space
  'columns, changed fields': ({ ents, changed }) => {
    const rows = ents.filter((e) => changed.has(e.id));
    const cols = [[Uint32Array, rows.map((e) => e.id)]];
    for (const k of F) {
      const present = rows.filter((e) => changed.get(e.id).has(k));
      if (!present.length) continue;
      const bitmap = new Uint8Array((rows.length + 7) >> 3);
      rows.forEach((e, i) => changed.get(e.id).has(k) && (bitmap[i >> 3] |= 1 << (i & 7)));
      const C = k === 'hp' ? Uint16Array : k === 'status' ? Uint8Array : Float32Array;
      cols.push([Uint8Array, bitmap], [C, present.map((e) => e[k])]);
    }
    return pack(head(cols.length), cols);
  },
  'ts-bin-rpc live: snapshot every frame': ({ ents }) => P.entities.output.encode(ents),
  'ts-bin-rpc live: delta, changed fields': ({ ents, changed }) => {
    const patch = ents.filter((e) => changed.has(e.id)).map((e) => Object.fromEntries([['id', e.id], ...[...changed.get(e.id)].map((k) => [k, e[k]])]));
    return P.entities.delta.encode(patch.length ? { patch } : {});
  },
};

// --------------------------------------------------------------------------------------------- run

console.log(`# Deltas: bytes per frame (average of ${FRAMES} frames)\n`);
console.log('Deflate: level 6, one context for the whole stream, flushed after each frame.\n');
console.log('## Ticks, 16 per batch\n');
console.log('| Encoding | raw | deflate |');
console.log('|---|---|---|');
const tb = tickBatches();
for (const [label, enc] of Object.entries(ticks)) {
  const msgs = tb.map(enc);
  console.log(`| ${label} | ${raw(msgs).toFixed(0)} | ${(await deflated(msgs)).toFixed(0)} |`);
}
for (const moving of [0.05, 0.3]) {
  console.log(`\n## State of ${N} entities, ${moving * 100}% move each frame, 1% lose hp\n`);
  console.log('| Encoding | raw | deflate |');
  console.log('|---|---|---|');
  const frames = stateFrames(moving);
  for (const [label, enc] of Object.entries(state)) {
    const msgs = frames.map(enc);
    console.log(`| ${label} | ${raw(msgs).toFixed(0)} | ${(await deflated(msgs)).toFixed(0)} |`);
  }
}
