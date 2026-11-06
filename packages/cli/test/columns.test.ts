// Column encodings (FORMAT §6): packed columns of fixed-width fields.
import { beforeAll, describe, expect, it } from 'vitest';
import { catalog, columnsOf, EncodeError, RuleError, toPlain, VerifyError } from 'ts-bin-rpc/runtime';
import { generate, type Generated } from './codegen.ts';

let g: Generated;
beforeAll(async () => {
  g = await generate('columns');
}, 60_000);

const codec = () => g.mod.procedures.rows.output!;
const input = () => g.mod.procedures.rows.input!;
const full = (id: number) => ({ id, x: id / 4, hp: id % 7 ? id : null, at: new Date(1e12 + id), ok: id % 4 ? true : null, big: BigInt(-id), side: id % 2 ? 'buy' : 'sell', level: 10 + id, name: `n${id}`, tag: id % 5 ? `t${id % 3}` : null });
const rows = (n: number, every: number) => Array.from({ length: n }, (_, i) => (i % every === 0 ? full(i) : { id: i }));
/** Column flags of the root vector, all ORed together. */
const colFlags = (bytes: Uint8Array) => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), vec = dv.getUint32(dv.getUint32(4, true), true);
  let fl = 0;
  for (let j = 0; j < dv.getUint16(vec + 4, true); j++) fl |= dv.getUint16(vec + 10 + 8 * j, true);
  return fl;
};
const PACKED = 4, DELTA = 8;

describe('packed columns', () => {
  it('hold only the rows with a value when that halves them', () => {
    const sparse = rows(40, 8), dense = rows(40, 1), mostly = dense.map((r, i) => (i % 4 ? r : { id: i }));
    for (const value of [sparse, dense, mostly, rows(40, 2), rows(40, 3), []]) {
      const bytes = codec().encode(value);
      expect(codec().decode(bytes)).toEqual(value);
      expect(codec().decode(bytes, { verify: false })).toEqual(value);
      expect(toPlain(codec().view(bytes))).toEqual(value);
    }
    expect(colFlags(codec().encode(sparse)) & PACKED).toBe(PACKED);
    expect(colFlags(codec().encode(rows(40, 2))) & PACKED).toBe(PACKED);
    expect(colFlags(codec().encode(dense)) & PACKED).toBe(0);
    expect(colFlags(codec().encode(mostly)) & PACKED).toBe(0);
    // a row with values costs its x, at, big (8 B), level (4 B), hp, ok, side (1 B), the refs of name and tag (4 B) and the text
    const len = (v: unknown[]) => codec().encode(v).length;
    expect(len(rows(40, 8)) - len(rows(40, 40))).toBeGreaterThanOrEqual(4 * 39);
  });

  it('keep nulls apart from absent rows', () => {
    const value = [{ id: 1, hp: null, ok: null }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5, hp: 7, ok: true }];
    const bytes = codec().encode(value);
    expect(colFlags(bytes) & PACKED).toBe(PACKED);
    expect(codec().decode(bytes)).toEqual(value);
    const view = codec().view(bytes);
    expect([view[0].hp, view[1].hp, view[4].hp, view[4].ok, view[2].ok]).toEqual([null, undefined, 7, true, undefined]);
  });

  it('report the row of a broken rule, not the place of the value', () => {
    const value = [...rows(7, 8), { id: 7, level: 3 }];
    try {
      input().verify(input().encode(value));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RuleError);
      expect(e).toMatchObject({ field: 'Row.level', rule: 'min', index: 7 });
    }
    try {
      input().verify(input().encode([...rows(9, 8), { id: 9, tag: 'x' }]));
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ field: 'Row.tag', rule: 'minLength', index: 9 });
    }
  });

  it('are refused by codecs that do not know them', () => {
    const bytes = codec().encode(rows(8, 8));
    // the spec of codecs generated before packed columns: no flag 4
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const vec = dv.getUint32(dv.getUint32(4, true), true);
    expect(() => catalog(dv, vec, [0, 4, 0, 1, 8, 1])).toThrow(VerifyError);
    expect(() => catalog(dv, vec, [0, 4, 0, 1, 8, 5])).not.toThrow();
  });
});

describe('delta columns', () => {
  const ticks = () => g.mod.procedures.ticks.output!;
  // values on the grid of their scale, so that they come back equal
  const tick = (i: number) => ({ seq: 1000 + i, t: new Date(1.7e12 + i * 250), price: (10125 + (i % 7)) / 100, size: 100 + (i % 3), bid: i % 3 ? (10120 + (i % 5)) / 100 : i % 2 ? null : undefined, level: ((i % 11) - 5) / 10 });
  const plain = (v: object[]) => v.map((r) => Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined)));

  it('send the first value and the differences when they are narrower', () => {
    const value = Array.from({ length: 64 }, (_, i) => tick(i));
    const bytes = ticks().encode(value);
    expect(colFlags(bytes) & DELTA).toBe(DELTA);
    expect(plain(ticks().decode(bytes))).toEqual(plain(value));
    expect(plain(ticks().decode(bytes, { verify: false }))).toEqual(plain(value));
    expect(plain(toPlain(ticks().view(bytes)))).toEqual(plain(value));
    // after the first value: seq, price, size in 1 B, t (250 ms apart) in 2 B; apart, seq 4 B, t 8 B, price 2 B, size 2 B
    const wide = value.map((r, i) => ({ ...r, seq: i * 100_000, t: new Date(1.7e12 + i * 3e9), price: i * 300, size: (i * 997) % 65536 }));
    expect(plain(ticks().decode(ticks().encode(wide)))).toEqual(plain(wide));
    expect(ticks().encode(wide).length - bytes.length).toBeGreaterThanOrEqual(63 * (16 - 5) - 16);
  });

  it('refuse column flags that do not go together', () => {
    const bytes = ticks().encode(Array.from({ length: 64 }, (_, i) => tick(i)));
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), vec = dv.getUint32(dv.getUint32(4, true), true);
    const entries = Array.from({ length: dv.getUint16(vec + 4, true) }, (_, j) => vec + 10 + 8 * j);
    const delta = entries.find((e) => dv.getUint16(e, true) & DELTA)!, plainCol = entries.find((e) => !(dv.getUint16(e, true) & 0x3c))!;
    const set = (e: number, f: (fl: number) => number) => {
      const bad = bytes.slice();
      new DataView(bad.buffer).setUint16(e, f(dv.getUint16(e, true)), true);
      return bad;
    };
    // width bits without DELTA, width 3, DELTA with PACKED
    for (const bad of [set(plainCol, (fl) => fl | 0x10), set(delta, (fl) => fl | 0x30)]) expect(() => ticks().view(bad)).toThrow(/unknown column flags/);
    expect(() => ticks().view(set(delta, (fl) => fl | PACKED))).toThrow(VerifyError);
  });

  it('fall back to plain columns when the differences are not narrower', () => {
    const value = [tick(0), { ...tick(1), seq: 4e9, t: new Date(1.5), size: 65535 }, tick(2)];
    const bytes = ticks().encode(value);
    expect(plain(ticks().decode(bytes))).toEqual(plain(value));
    expect(plain(ticks().decode(ticks().encode([tick(5)])))).toEqual(plain([tick(5)]));
    expect(ticks().decode(ticks().encode([]))).toEqual([]);
  });

  it('give the columns as typed arrays of their values', () => {
    const value = Array.from({ length: 8 }, (_, i) => tick(i));
    const cols = columnsOf(ticks().view(ticks().encode(value)))!;
    expect([...cols.seq!]).toEqual(value.map((r) => r.seq));
    expect([...cols.t!]).toEqual(value.map((r) => r.t.getTime()));
    expect(cols.price).toBeInstanceOf(Float64Array);
    expect([...cols.price!]).toEqual(value.map((r) => r.price));
  });
});

describe('scaled numbers', () => {
  it('go as integers of their brand and come back over the scale', () => {
    const quote = g.mod.procedures.quote.output!, price = g.mod.procedures.price.output!;
    const q = { bid: 101.25, ask: -3.75, steps: [0.25, 1.5, 16383.75] };
    expect(quote.decode(quote.encode(q))).toEqual(q);
    expect(toPlain(quote.view(quote.encode(q)))).toEqual(q);
    expect(quote.decode(quote.encode({ ...q, ask: null }))).toEqual({ ...q, ask: null });
    // rounded to the scale
    expect(price.decode(price.encode(0.125))).toBe(0.13);
    expect(price.decode(price.encode(-21474836.48))).toBe(-21474836.48);
  });

  it('are refused out of the range of their brand', () => {
    const quote = g.mod.procedures.quote.output!, price = g.mod.procedures.price.output!;
    expect(() => price.encode(21474836.48)).toThrow(/i32 & Scale<100>/);
    expect(() => price.encode(Number.NaN)).toThrow(EncodeError);
    expect(() => price.encode('1' as never)).toThrow(EncodeError);
    expect(() => quote.encode({ bid: 1, steps: [16384] })).toThrow(/u16 & Scale<4>/);
    expect(() => quote.encode({ bid: 1, ask: 8192, steps: [] })).toThrow(/i16 & Scale<4>/);
  });

  it('meet their rules in their units', () => {
    const input = g.mod.procedures.ticks.input!;
    const base = { seq: 1, t: new Date(0), price: 1, size: 1 };
    expect(() => input.verify(input.encode([{ ...base, level: 4.9 }]))).not.toThrow();
    try {
      input.verify(input.encode([{ ...base, level: 2 }, { ...base, level: 5.1 }]));
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ field: 'Tick.level', rule: 'max', limit: 5, index: 1 });
    }
  });
});
