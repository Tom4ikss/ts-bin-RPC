import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { signature, type IRType } from '../src/ir.ts';
import { arbitraries } from './arbitrary.ts';
import { generate, type Generated } from './codegen.ts';
import { VerifyError } from 'ts-bin-rpc/runtime';

const fixtures = ['codec', 'supported'];
const gen: Record<string, Generated> = {};

beforeAll(async () => {
  for (const f of fixtures) gen[f] = await generate(f);
}, 60_000);

it('generated code typechecks', () => {
  const tsc = path.join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsc');
  execFileSync(tsc, ['-p', path.join(import.meta.dirname, '.gen', 'tsconfig.json')], { stdio: 'pipe' });
}, 60_000);

describe.each(fixtures)('%s: round trip', (fixture) => {
  const roots = () => {
    const g = gen[fixture];
    const out = new Map<string, { type: IRType; codec: import('ts-bin-rpc/runtime').Codec<any> }>();
    for (const p of g.schema.procedures) {
      if (p.input) out.set(`${p.path} input (${signature(p.input)})`, { type: p.input, codec: g.mod.procedures[p.path].input! });
      if (p.output) out.set(`${p.path} output (${signature(p.output)})`, { type: p.output, codec: g.mod.procedures[p.path].output! });
    }
    for (const name of Object.keys(g.schema.objects)) out.set(`type ${name}`, { type: { kind: 'object', name }, codec: g.mod.codecs[name] });
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

function big(_k: string, v: unknown) {
  return typeof v === 'bigint' ? `${v}n` : v;
}

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
    expect(() => k.encode(user({ id: -1 }))).toThrow('expected u32, got -1');
    expect(() => k.encode(user({ id: 1.5 }))).toThrow('expected u32, got 1.5');
    expect(() => k.encode(user({ age: 256 }))).toThrow('expected u8, got 256');
    expect(() => k.encode(user({ balance: 2n ** 63n }))).toThrow('expected i64');
    expect(() => k.encode(user({ name: 'a\ud800' }))).toThrow('lone surrogates');
    expect(() => k.encode(user({ role: 'root' }))).toThrow('expected Role, got "root"');
    expect(() => k.encode(user({ meta: undefined }))).toThrow('expected User.meta, got undefined');
    expect(() => k.encode(user({ tags: 'a' }))).toThrow('expected array');
    expect(() => k.encode(user({ createdAt: 0 }))).toThrow('expected Date, got 0');
    expect(() => gen.supported.mod.procedures['shapes'].output!.encode([{ kind: 'hexagon' }])).toThrow('expected Shape variant, got "hexagon"');
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
});
