import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { signature, type IRType } from '../src/ir.ts';
import { arbitraries } from './arbitrary.ts';
import { generate, type Generated } from './codegen.ts';
import { asciiOnly, EncodeError, toPlain, VerifyError } from 'ts-bin-rpc/runtime';

const fixtures = ['codec', 'supported'];
const gen: Record<string, Generated> = {};

beforeAll(async () => {
  for (const f of fixtures) gen[f] = await generate(f);
}, 60_000);

describe.each(fixtures)('%s: round trip', (fixture) => {
  const roots = () => {
    const g = gen[fixture];
    const out = new Map<string, { type: IRType; codec: import('ts-bin-rpc/runtime').Codec<any> }>();
    for (const p of g.schema.procedures) {
      if (p.input) out.set(`${p.path} input (${signature(p.input)})`, { type: p.input, codec: g.mod.procedures[p.path].input! });
      if (p.output) out.set(`${p.path} output (${signature(p.output)})`, { type: p.output, codec: g.mod.procedures[p.path].output! });
    }
    for (const name of Object.keys(g.schema.objects).filter((n) => !g.schema.objects[n].synthetic)) out.set(`type ${name}`, { type: { kind: 'object', name }, codec: g.mod.codecs[name] });
    return out;
  };

  it('encode → verify → view / decode gives the same value', () => {
    const arb = arbitraries(gen[fixture].schema);
    for (const [label, { type, codec }] of roots()) {
      fc.assert(
        fc.property(arb(type), (value) => {
          const bytes = codec.encode(value);
          expect(codec.decode(bytes), label).toEqual(value);
          expect(codec.decode(bytes, { verify: false }), label).toEqual(value);
          // views read the same data lazily; JSON goes through toJSON on every view
          expect(JSON.parse(JSON.stringify(codec.view(bytes), big)), label).toEqual(JSON.parse(JSON.stringify(value, big)));
        }),
        { numRuns: 150 },
      );
    }
  });
});

/** Every slot of plain objects and arrays inside v, where a bad value can be planted. */
function slots(v: unknown, out: [Record<string | number, unknown>, string | number][] = []) {
  if (Array.isArray(v)) v.forEach((x, i) => (out.push([v as never, i]), slots(x, out)));
  else if (v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    for (const [k, x] of Object.entries(v)) out.push([v as never, k]), slots(x, out);
  }
  return out;
}

function big(_k: string, v: unknown) {
  return typeof v === 'bigint' ? `${v}n` : v;
}

describe.each(fixtures)('%s: encoder errors', (fixture) => {
  it('name the path of the bad value, and nothing else escapes the encoder', () => {
    const arb = arbitraries(gen[fixture].schema);
    const junk = fc.constantFrom<unknown>('junk', -1, 1.5, 256, 2 ** 40, null, undefined, {}, [], 2n ** 70n, 'a\ud800', true, new Date(0), new Uint8Array(1));
    const g = gen[fixture];
    const roots = [...g.schema.procedures.flatMap((p) => [
      p.input && ([p.input, g.mod.procedures[p.path].input!] as const),
      p.output && ([p.output, g.mod.procedures[p.path].output!] as const),
    ])].filter((x) => !!x);
    let caught = 0;
    for (const [type, codec] of roots) {
      fc.assert(
        fc.property(arb(type), fc.nat(), junk, (value, pick, bad) => {
          const all = slots(value);
          if (!all.length) return;
          const [holder, key] = all[pick % all.length];
          holder[key] = bad;
          try {
            codec.encode(value);
          } catch (e) {
            caught++;
            expect(e, signature(type)).toBeInstanceOf(EncodeError);
            expect((e as EncodeError).path, `${signature(type)}: ${(e as Error).message}`).toBeTypeOf('string');
          }
        }),
        { numRuns: 200 },
      );
    }
    expect(caught).toBeGreaterThan(100);
  });
});

describe.each(fixtures)('%s: verifier fuzzing', (fixture) => {
  // Mutated messages either fail verification with VerifyError, or verify and then read completely:
  // a verified message must never make a view throw, loop or read out of bounds.
  it('rejects or safely reads mutated messages', () => {
    const g = gen[fixture];
    const arb = arbitraries(g.schema);
    const targets = g.schema.procedures.flatMap((p) => [
      ...(p.input ? [{ type: p.input, codec: g.mod.procedures[p.path].input! }] : []),
      ...(p.output ? [{ type: p.output, codec: g.mod.procedures[p.path].output! }] : []),
    ]);
    const mutation = fc.oneof(
      fc.record({ kind: fc.constant('flip' as const), at: fc.nat(), bit: fc.nat(7) }),
      fc.record({ kind: fc.constant('byte' as const), at: fc.nat(), value: fc.nat(255) }),
      fc.record({ kind: fc.constant('u32' as const), at: fc.nat(), value: fc.oneof(fc.nat(), fc.constantFrom(0, 1, 0xffffffff, 0x7fffffff, 0x80000000)) }),
      fc.record({ kind: fc.constant('truncate' as const), at: fc.nat() }),
    );
    let verified = 0, rejected = 0;
    for (const { type, codec } of targets) {
      fc.assert(
        fc.property(arb(type), fc.array(mutation, { minLength: 1, maxLength: 4 }), (value, muts) => {
          let bytes = codec.encode(value).slice();
          for (const m of muts) {
            const at = m.at % bytes.length;
            if (m.kind === 'flip') bytes[at] ^= 1 << m.bit;
            else if (m.kind === 'byte') bytes[at] = m.value;
            else if (m.kind === 'u32' && at + 4 <= bytes.length) new DataView(bytes.buffer).setUint32(at, m.value, true);
            else if (m.kind === 'truncate') bytes = bytes.slice(0, at);
          }
          let view: unknown;
          try {
            view = codec.view(bytes, { limits: { maxNodes: 100_000 } });
          } catch (e) {
            if (!(e instanceof VerifyError)) throw e;
            rejected++;
            return;
          }
          verified++;
          JSON.stringify(view, big); // touches every field of every view
        }),
        { numRuns: 300 },
      );
    }
    expect(rejected).toBeGreaterThan(0);
    expect(verified).toBeGreaterThan(0);
  });
});

describe('limits and encoder checks', () => {
  const nodeCodec = () => gen.codec.mod.codecs['Node'];
  const chain = (depth: number): unknown => {
    let node: unknown = { name: 'leaf', children: [] };
    for (let i = 0; i < depth; i++) node = { name: `n${i}`, children: [node] };
    return node;
  };

  it('rejects messages nested deeper than maxDepth', () => {
    const bytes = nodeCodec().encode(chain(60));
    expect(() => nodeCodec().view(bytes)).not.toThrow();
    expect(() => nodeCodec().view(bytes, { limits: { maxDepth: 40 } })).toThrow(VerifyError);
  });

  it('rejects messages with more elements than maxNodes', () => {
    const wide = { name: 'root', children: Array.from({ length: 500 }, (_, i) => ({ name: `c${i}`, children: [] })) };
    const bytes = nodeCodec().encode(wide);
    expect(() => nodeCodec().view(bytes, { limits: { maxNodes: 100 } })).toThrow(/too many elements/);
  });

  it('rejects a non-ASCII byte in the ASCII block', () => {
    const text = gen.codec.mod.procedures['text'].input!;
    const bytes = text.encode('abcdefghijklmnopqrstuvwxyz0123456789!');
    const off = new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true);
    for (let i = off; i < off + 37; i++) {
      const bad = bytes.slice();
      bad[i] |= 0x80;
      expect(() => text.view(bad)).toThrow('ASCII block holds a non-ASCII byte');
    }
  });

  it('asciiOnly finds a high bit at any offset and alignment', () => {
    const buf = new Uint8Array(64).fill(0x61);
    for (let off = 0; off < 8; off++) {
      for (let n = 0; n <= 40; n++) {
        expect(asciiOnly(buf, off, n)).toBe(true);
        for (let i = off; i < off + n; i++) {
          buf[i] = 0xe9;
          expect(asciiOnly(buf, off, n)).toBe(false);
          buf[i] = 0x61;
        }
        // Bytes just outside the range don't count.
        if (off > 0) buf[off - 1] = 0xff;
        buf[off + n] = 0xff;
        expect(asciiOnly(buf, off, n)).toBe(true);
        buf.fill(0x61);
      }
    }
  });

  it('reads only format 2 and refuses header flags it must understand', () => {
    const bytes = nodeCodec().encode(chain(1));
    const at = (i: number, v: number) => {
      const b = bytes.slice();
      b[i] = v;
      return b;
    };
    for (const verify of [true, false]) {
      expect(() => nodeCodec().decode(at(2, 1), { verify })).toThrow(/format 1, from ts-bin-rpc 0\.5 or earlier/);
      expect(() => nodeCodec().decode(at(2, 3), { verify })).toThrow(/format 3: this side reads format 2/);
      for (const bit of [2, 3, 4]) expect(() => nodeCodec().decode(at(3, bytes[3] | (1 << bit)), { verify })).toThrow(/unknown header flags/);
      for (const bit of [5, 6, 7]) expect(nodeCodec().decode(at(3, bytes[3] | (1 << bit)), { verify })).toEqual(chain(1));
    }
  });

  it('rejects a UTF-16 string that starts or ends inside a surrogate pair', () => {
    const value = { name: 'a\u{1f600}', children: [{ name: '\u{1f600}b', children: [] }] };
    const bytes = nodeCodec().encode(value);
    expect(nodeCodec().decode(bytes)).toEqual(value);
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    const find = (a: number, b: number) => {
      for (let i = 24; i + 8 <= bytes.length; i += 4) if (dv.getUint32(i, true) === a && dv.getUint32(i + 4, true) === b) return i;
      throw new Error(`no ${a} ${b}`);
    };
    // the root name in a slot (u32 start, u32 length << 1 | 1), the child's in a string column (u32 ASCII
    // start, u32 UTF-16 start, then u32 length << 2 | 2 per row)
    const slot = find(0, 7), col = find(3, 14);
    for (const [at, v] of [[slot + 4, 2 << 1 | 1], [col, 2], [col + 4, 1 << 2 | 2]]) {
      const bad = bytes.slice();
      new DataView(bad.buffer).setUint32(at, v, true);
      expect(() => nodeCodec().view(bad)).toThrow('string splits a surrogate pair');
    }
  });

  it('charges a typed array one node, whatever its length', () => {
    const series = gen.supported.mod.procedures['series'].output!;
    const value = { ts: new Float64Array(10_000), values: new Float32Array(10_000) };
    expect(() => series.view(series.encode(value), { limits: { maxNodes: 100 } })).not.toThrow();
  });

  it('rejects offsets into the header', () => {
    const bytes = nodeCodec().encode(chain(1));
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    const slot = dv.getUint32(4, true); // root slot of an object: u32 offset of its table
    for (const [off, message] of [[0, /null offset/], [4, /into the header/]] as const) {
      dv.setUint32(slot, off, true);
      expect(() => nodeCodec().view(bytes)).toThrow(message);
    }
  });

  it('rejects values that do not fit the declared type', () => {
    const user = (patch: object) => ({
      id: 1, name: 'a', email: 'b', age: 1, score: 1, balance: 1n, isActive: true, role: 'user', createdAt: new Date(0),
      avatar: null, tags: [], manager: null, meta: { source: 'web', version: 1 }, ...patch,
    });
    const k = gen.supported.mod.codecs['User'];
    expect(() => k.encode(user({}))).not.toThrow();
    const fails = (patch: object) => {
      try {
        k.encode(user(patch));
      } catch (e) {
        return `${(e as EncodeError).message} | ${(e as EncodeError).path}`;
      }
      return 'encoded';
    };
    expect(fails({ id: -1 })).toBe('at id: expected u32, got -1 | id');
    expect(fails({ id: 1.5 })).toBe('at id: expected u32, got 1.5 | id');
    expect(fails({ age: 256 })).toBe('at age: expected u8, got 256 | age');
    expect(fails({ balance: 2n ** 63n })).toBe('at balance: expected i64, got 9223372036854775808n | balance');
    expect(fails({ name: 'a\ud800' })).toBe('at name: expected a string without lone surrogates, got "a\\ud800" | name');
    expect(fails({ role: 'root' })).toMatch(/^at role: expected Role \("[a-z]+"( \| "[a-z]+")*\), got "root" \| role$/);
    expect(fails({ meta: undefined })).toBe('at meta: expected User.meta, got undefined | meta');
    expect(fails({ tags: 'a' })).toBe('at tags: expected array, got "a" | tags');
    expect(fails({ tags: ['a', 5] })).toBe('at tags[1]: expected string, got 5 | tags[1]');
    expect(fails({ createdAt: 0 })).toBe('at createdAt: expected Date, got 0 | createdAt');
    expect(fails({ manager: user({ manager: user({ age: 300 }) }) })).toBe('at manager.manager.age: expected u8, got 300 | manager.manager.age');
    expect(() => gen.supported.mod.procedures['shapes'].output!.encode([{ kind: 'circle', r: 1 }, { kind: 'hexagon' }])).toThrow(/^at \[1\]\.kind: expected Shape variant \(.*\), got "hexagon"$/);
  });
});

describe('schema evolution on the wire', () => {
  it('old and new readers understand each other after safe changes', async () => {
    const v1 = await generate('evolution', 'v1.ts', undefined, 'evolution-v1');
    const v2 = await generate('evolution', 'v2.ts', v1.lock, 'evolution-v2');
    const base = { id: 7, name: 'Ann', age: 30, role: 'admin' };

    // v2 writes (mail renamed to email with @renamedFrom, nick removed, bio added); v1 reads
    const fromNew = v2.mod.codecs['User'].encode({ ...base, email: 'a@x.io', bio: 'hi' });
    expect(v1.mod.codecs['User'].decode(fromNew)).toEqual({ ...base, mail: 'a@x.io' });

    // v1 writes; v2 reads: nick is gone, bio is absent
    const fromOld = v1.mod.codecs['User'].encode({ ...base, mail: 'a@x.io', nick: 'annie' });
    expect(v2.mod.codecs['User'].decode(fromOld)).toEqual({ ...base, email: 'a@x.io' });

    // Classification assumes servers deploy first: making an input field optional is safe for old clients,
    // but a new client that omits it must not talk to an old server.
    const input = v2.mod.codecs['NewUser'].encode({ name: 'Bob', email: 'b@x.io' });
    expect(() => v1.mod.codecs['NewUser'].decode(input)).toThrow('NewUser.invite is missing');
  });

  it('enum indexes take the width the lockfile pins', async () => {
    const v1 = await generate('evolution', 'v1.ts', undefined, 'evolution-e1');
    const lock = structuredClone(v1.lock);
    lock.enums.Role.wide = true;
    const wide = await generate('evolution', 'v1.ts', lock, 'evolution-e2');
    expect(wide.lock.enums.Role.wide).toBe(true);
    const user = { id: 7, name: 'Ann', age: 30, role: 'user', mail: 'a@x.io', nick: 'annie' };
    expect(wide.mod.codecs['User'].decode(wide.mod.codecs['User'].encode(user))).toEqual(user);
    expect(fs.readFileSync(wide.file, 'utf8')).not.toBe(fs.readFileSync(v1.file, 'utf8'));
  });

  it('unions read across versions with a different number of variants', async () => {
    const v2 = await generate('evolution', 'v2.ts', undefined, 'evolution-u2');
    const v3 = await generate('evolution', 'v3.ts', v2.lock, 'evolution-u3');
    const [older, newer] = [v2.mod.procedures['shapes'].output!, v3.mod.procedures['shapes'].output!];
    const shapes = [{ kind: 'square', side: 2 }, { kind: 'circle', r: 1 }, { kind: 'square', side: 3 }];
    expect(newer.decode(older.encode(shapes))).toEqual(shapes);
    expect(older.decode(newer.encode(shapes))).toEqual(shapes);
    expect(toPlain(older.view(newer.encode(shapes)))).toEqual(shapes);
    // a variant the old reader does not know is refused, not misread
    expect(() => older.decode(newer.encode([...shapes, { kind: 'dot' }]))).toThrow(VerifyError);
  });
});

// Last: the evolution tests above regenerate their files, and this checks every file in .gen.
it('generated code typechecks', () => {
  const tsc = path.join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsc');
  execFileSync(tsc, ['-p', path.join(import.meta.dirname, '.gen', 'tsconfig.json')], { stdio: 'pipe' });
}, 60_000);
