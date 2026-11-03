// Streaming design: a feed of small messages, server encode + framing + client read of every field,
// per 1024 ticks. NDJSON is one JSON line per tick, as SSE or a JSON stream would send it; the
// binary variants send each batch of N ticks as one length-prefixed frame of Tick[], which the
// generated codec stores column by column. Build first: pnpm --filter @tbr/bench gen
import { procedures } from '../gen/out/codec.mjs';

const te = new TextEncoder();
const td = new TextDecoder();
const K1 = procedures.tick.output;
const KN = procedures.ticks.output;
const M = 1024;

function makeTicks(n) {
  let price = 100;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, (_, i) => {
    price = Math.round((price + (rnd() - 0.5) * 0.2) * 100) / 100;
    return { t: 1_793_000_000_000 + i * 13, price: Math.fround(price), size: 1 + Math.floor(rnd() * 1000), side: rnd() < 0.5 ? 'buy' : 'sell' };
  });
}
// Rounded like a feed would print them; the binary side carries the same values as f32.
const ticks = makeTicks(M).map((x) => ({ ...x, price: Math.round(x.price * 100) / 100 }));

const read = (x) => x.t + x.price + x.size + (x.side === 'buy' ? 1 : 0);

/** Concatenates frames with u32 little-endian length prefixes, as a byte stream delivers them. */
function frame(chunks) {
  let n = 0;
  for (const c of chunks) n += 4 + c.length;
  const out = new Uint8Array(n);
  const dv = new DataView(out.buffer);
  let at = 0;
  for (const c of chunks) {
    dv.setUint32(at, c.length, true);
    out.set(c, at + 4);
    at += 4 + c.length;
  }
  return out;
}

function ndjson(src) {
  const lines = [];
  for (const x of src) lines.push(te.encode(JSON.stringify(x) + '\n'));
  let n = 0;
  for (const l of lines) n += l.length;
  const wire = new Uint8Array(n);
  let at = 0;
  for (const l of lines) (wire.set(l, at), (at += l.length));
  // Client: decode what arrived, split lines, parse each.
  let s = 0;
  const text = td.decode(wire);
  let start = 0;
  for (let i = text.indexOf('\n'); i !== -1; start = i + 1, i = text.indexOf('\n', start)) s += read(JSON.parse(text.slice(start, i)));
  return s;
}

function jsonBatches(src, size) {
  const frames = [];
  for (let i = 0; i < src.length; i += size) frames.push(te.encode(JSON.stringify(src.slice(i, i + size))));
  const wire = frame(frames);
  const dv = new DataView(wire.buffer);
  let s = 0;
  for (let at = 0; at < wire.length; ) {
    const len = dv.getUint32(at, true);
    const arr = JSON.parse(td.decode(wire.subarray(at + 4, at + 4 + len)));
    for (let i = 0; i < arr.length; i++) s += read(arr[i]);
    at += 4 + len;
  }
  return s;
}

function binary(src, size, verify) {
  const frames = [];
  if (size === 1) for (const x of src) frames.push(K1.encode(x));
  else for (let i = 0; i < src.length; i += size) frames.push(KN.encode(src.slice(i, i + size)));
  const wire = frame(frames);
  const dv = new DataView(wire.buffer);
  let s = 0;
  for (let at = 0; at < wire.length; ) {
    const len = dv.getUint32(at, true);
    // Views need an aligned message: a frame is copied out, as a reader of a byte stream would.
    const bytes = wire.slice(at + 4, at + 4 + len);
    if (size === 1) s += read(K1.view(bytes, { verify }));
    else {
      const arr = KN.view(bytes, { verify });
      for (let i = 0; i < arr.length; i++) s += read(arr[i]);
    }
    at += 4 + len;
  }
  return s;
}

export function groups() {
  const cases = [
    { label: 'NDJSON, a line per tick', fn: (src) => ndjson(src), input: ticks },
    { label: 'JSON, batches of 32', fn: (src) => jsonBatches(src, 32), input: ticks },
  ];
  for (const n of [1, 8, 32, 128, 512]) cases.push({ label: `binary, batches of ${n}`, fn: (src) => binary(src, n, false), input: ticks });
  cases.push({ label: 'binary, batches of 32, verified', fn: (src) => binary(src, 32, true), input: ticks });
  const out = [{ group: `${M} ticks: encode, frame, read every field`, cases }];

  // The two halves apart: the server's encode (which a channel pays once for every subscriber of a
  // topic) and the client's read of what arrived.
  const lines = ticks.map((x) => JSON.stringify(x) + '\n').join('');
  const enc = [
    { label: 'NDJSON', fn: (src) => { let n = 0; for (const x of src) n += te.encode(JSON.stringify(x) + '\n').length; return n; }, input: ticks },
  ];
  const rd = [
    { label: 'NDJSON', fn: (b) => { let s = 0; const text = td.decode(b); let start = 0; for (let i = text.indexOf('\n'); i !== -1; start = i + 1, i = text.indexOf('\n', start)) s += read(JSON.parse(text.slice(start, i))); return s; }, input: te.encode(lines) },
  ];
  for (const n of [1, 32, 512]) {
    const batches = [];
    for (let i = 0; i < M; i += n) batches.push(n === 1 ? ticks[i] : ticks.slice(i, i + n));
    const K = n === 1 ? K1 : KN;
    enc.push({ label: `binary, batches of ${n}`, fn: (bs) => { let len = 0; for (const b of bs) len += K.encode(b).length; return len; }, input: batches });
    const frames = batches.map((b) => K.encode(b));
    rd.push({
      label: `binary, batches of ${n}`,
      fn: n === 1
        ? (fs) => { let s = 0; for (const f of fs) s += read(K.view(f, { verify: false })); return s; }
        : (fs) => { let s = 0; for (const f of fs) { const a = K.view(f, { verify: false }); for (let i = 0; i < a.length; i++) s += read(a[i]); } return s; },
      input: frames,
    });
  }
  out.push({ group: `${M} ticks: server encode only`, cases: enc });
  out.push({ group: `${M} ticks: client read only, every field`, cases: rd });
  return out;
}
