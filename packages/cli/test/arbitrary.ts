// fast-check arbitraries for any IR type: values a user could legally pass to an encoder.
import fc from 'fast-check';
import type { Field, IRType, ScalarKind, Schema } from '../src/ir.ts';

const scalars: Record<ScalarKind, fc.Arbitrary<unknown>> = {
  bool: fc.boolean(),
  u8: fc.integer({ min: 0, max: 0xff }),
  i8: fc.integer({ min: -0x80, max: 0x7f }),
  u16: fc.integer({ min: 0, max: 0xffff }),
  i16: fc.integer({ min: -0x8000, max: 0x7fff }),
  u32: fc.integer({ min: 0, max: 0xffffffff }),
  i32: fc.integer({ min: -0x80000000, max: 0x7fffffff }),
  f32: fc.float(),
  f64: fc.double(),
  u64: fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
  i64: fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }),
  timestamp: fc.date({ noInvalidDate: true }),
};

const typed: Record<string, fc.Arbitrary<unknown>> = {
  Int8Array: fc.int8Array({ maxLength: 6 }),
  Uint16Array: fc.uint16Array({ maxLength: 6 }),
  Int16Array: fc.int16Array({ maxLength: 6 }),
  Uint32Array: fc.uint32Array({ maxLength: 6 }),
  Int32Array: fc.int32Array({ maxLength: 6 }),
  Float32Array: fc.float32Array({ maxLength: 6 }),
  Float64Array: fc.float64Array({ maxLength: 6 }),
  BigInt64Array: fc.bigInt64Array({ maxLength: 6 }),
  BigUint64Array: fc.bigUint64Array({ maxLength: 6 }),
};

const strings = fc.oneof(
  fc.string({ maxLength: 8 }),
  fc.string({ unit: 'binary', maxLength: 8 }),
  fc.constantFrom('', 'Привет', 'a😀b', 'same', 'same', '__proto__', 'constructor', '1'),
);

/** Values close to each other, so that delta columns take their narrow forms. */
const near = (k: ScalarKind) => fc.integer({ min: 0, max: k.endsWith('8') ? 120 : 300 }).map((x) => (k === 'timestamp' ? new Date(1.7e12 + x) : k.startsWith('i') ? x - 60 : x));

// Explicit depth budget: at the last level arrays are empty, nullable fields null and optional ones absent,
// so recursive types (`children: Node[]`, `manager: User | null`) stay finite.
export function arbitraries(schema: Schema, maxDepth = 3) {
  const memo = new Map<string, fc.Arbitrary<unknown>>();
  const arb = (t: IRType, d: number): fc.Arbitrary<unknown> => {
    switch (t.kind) {
      // on the grid of the scale, so that values come back equal
      case 'scalar': return t.scale ? scalars[t.scalar].map((v) => (v as number) / t.scale!) : t.delta ? fc.oneof(scalars[t.scalar], near(t.scalar)) : scalars[t.scalar];
      case 'string': return strings;
      case 'bytes': return fc.uint8Array({ maxLength: 6 });
      case 'typedArray': return typed[t.array];
      case 'const': return fc.constant(t.value);
      case 'enum': return fc.constantFrom(...schema.enums[t.name].values);
      case 'array': return d <= 0 ? fc.constant([]) : fc.array(arb(t.element, d - 1), { maxLength: 4 });
      case 'object': return object(t.name, d);
      case 'union': return fc.oneof(...schema.unions[t.name].variants.map((v) => object(v.object, d)));
      case 'map': {
        if (d <= 0) return fc.constant(t.record ? {} : new Map());
        const entries = fc.uniqueArray(fc.tuple(arb(t.key, d - 1), arb(t.value, d - 1)), { maxLength: 4, selector: (e) => e[0] });
        // `__proto__` among the keys: an own property of a Record, not its prototype
        return entries.map((es) => (t.record ? Object.defineProperties({}, Object.fromEntries(es.map(([k, v]) => [k, { value: v, enumerable: true, writable: true, configurable: true }]))) : new Map(es)));
      }
      case 'tuple': {
        const elements = t.elements.map((e) => (e.optional && d > 0 ? fc.option(field({ name: '', ...e }, d - 1), { nil: undefined }) : field({ name: '', ...e }, d - 1)));
        return fc.tuple(...elements);
      }
    }
  };
  const field = (f: Field, d: number) => {
    if (!f.nullable) return arb(f.type, d);
    return d <= 0 ? fc.constant(null) : fc.option(arb(f.type, d - 1), { nil: null });
  };
  const object = (name: string, d: number): fc.Arbitrary<unknown> => {
    const key = `${name}@${d}`;
    let a = memo.get(key);
    if (!a) {
      const fields = schema.objects[name].fields.filter((f) => !f.optional || d > 0);
      const model = Object.fromEntries(fields.map((f) => [f.name, field(f, d - 1)]));
      a = fc.record(model, { requiredKeys: fields.filter((f) => !f.optional).map((f) => f.name) });
      memo.set(key, a);
    }
    return a;
  };
  return (t: IRType) => arb(t, maxDepth);
}
