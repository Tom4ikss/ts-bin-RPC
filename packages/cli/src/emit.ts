// Emits one TypeScript module with a specialized encoder, view, verifier and plain-copy function per
// type of the schema. Layout: docs/FORMAT.md; wire IDs, enum indices and union tags come from the lockfile.
import { createHash } from 'node:crypto';
import { signature, type Field, type IRType, type Procedure, type ScalarKind, type Schema } from './ir.ts';
import type { Lock } from './lock.ts';

interface Scalar {
  size: number;
  ctor: string;
  ts: string;
  write: string; // checked Writer method
  name: string; // in error messages
  cond: (x: string) => string; // true when x is not a valid value
  conv: (x: string) => string; // value -> typed array element
  elem: (x: string) => string; // typed array element -> value
  slot: (p: string) => string; // read from a table slot
}

const num = (x: string) => x;
const S: Record<ScalarKind, Scalar> = {
  bool: { size: 1, ctor: 'Uint8Array', ts: 'boolean', write: 'bool', name: 'boolean', cond: (x) => `${x} !== true && ${x} !== false`, conv: (x) => `${x} ? 1 : 0`, elem: (x) => `${x} !== 0`, slot: (p) => `r.bytes[${p}] !== 0` },
  u8: { size: 1, ctor: 'Uint8Array', ts: 'u8', write: 'u8', name: 'u8', cond: (x) => `typeof ${x} !== 'number' || (${x} & 0xff) !== ${x}`, conv: num, elem: num, slot: (p) => `r.bytes[${p}]` },
  i8: { size: 1, ctor: 'Int8Array', ts: 'i8', write: 'i8', name: 'i8', cond: (x) => `typeof ${x} !== 'number' || (${x} << 24) >> 24 !== ${x}`, conv: num, elem: num, slot: (p) => `r.dv.getInt8(${p})` },
  u16: { size: 2, ctor: 'Uint16Array', ts: 'u16', write: 'u16', name: 'u16', cond: (x) => `typeof ${x} !== 'number' || (${x} & 0xffff) !== ${x}`, conv: num, elem: num, slot: (p) => `r.dv.getUint16(${p}, true)` },
  i16: { size: 2, ctor: 'Int16Array', ts: 'i16', write: 'i16', name: 'i16', cond: (x) => `typeof ${x} !== 'number' || (${x} << 16) >> 16 !== ${x}`, conv: num, elem: num, slot: (p) => `r.dv.getInt16(${p}, true)` },
  u32: { size: 4, ctor: 'Uint32Array', ts: 'u32', write: 'u32', name: 'u32', cond: (x) => `typeof ${x} !== 'number' || ${x} >>> 0 !== ${x}`, conv: num, elem: num, slot: (p) => `r.dv.getUint32(${p}, true)` },
  i32: { size: 4, ctor: 'Int32Array', ts: 'i32', write: 'i32', name: 'i32', cond: (x) => `typeof ${x} !== 'number' || (${x} | 0) !== ${x}`, conv: num, elem: num, slot: (p) => `r.dv.getInt32(${p}, true)` },
  f32: { size: 4, ctor: 'Float32Array', ts: 'f32', write: 'f32', name: 'number', cond: (x) => `typeof ${x} !== 'number'`, conv: num, elem: num, slot: (p) => `r.dv.getFloat32(${p}, true)` },
  f64: { size: 8, ctor: 'Float64Array', ts: 'number', write: 'f64', name: 'number', cond: (x) => `typeof ${x} !== 'number'`, conv: num, elem: num, slot: (p) => `r.dv.getFloat64(${p}, true)` },
  u64: { size: 8, ctor: 'BigUint64Array', ts: 'u64', write: 'u64', name: 'u64', cond: (x) => `typeof ${x} !== 'bigint' || BigInt.asUintN(64, ${x}) !== ${x}`, conv: num, elem: num, slot: (p) => `r.dv.getBigUint64(${p}, true)` },
  i64: { size: 8, ctor: 'BigInt64Array', ts: 'i64', write: 'i64', name: 'i64', cond: (x) => `typeof ${x} !== 'bigint' || BigInt.asIntN(64, ${x}) !== ${x}`, conv: num, elem: num, slot: (p) => `r.dv.getBigInt64(${p}, true)` },
  timestamp: { size: 8, ctor: 'Float64Array', ts: 'Date', write: 'ts', name: 'Date', cond: (x) => `!(${x} instanceof Date)`, conv: (x) => `${x}.getTime()`, elem: (x) => `new Date(${x})`, slot: (p) => `new Date(r.dv.getFloat64(${p}, true))` },
};

const TYPED_SIZE: Record<string, number> = {
  Uint8Array: 1, Int8Array: 1, Uint16Array: 2, Int16Array: 2, Uint32Array: 4, Int32Array: 4,
  Float32Array: 4, Float64Array: 8, BigInt64Array: 8, BigUint64Array: 8,
};

const MAX_MASK_BITS = 30;
const VT_KEY_STRIDE = 4096;

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const prop = (name: string) => (IDENT.test(name) ? name : JSON.stringify(name));
const acc = (obj: string, name: string) => (IDENT.test(name) ? `${obj}.${name}` : `${obj}[${JSON.stringify(name)}]`);
const lit = (v: string | number | boolean) => JSON.stringify(v);

interface WireField {
  f: Field;
  k: number; // index among wire fields: names column members
  id: number;
  size: number; // slot size without the presence tag
  off: number; // slot offset in the row table
  bit: number; // vtable mask bit, -1 when always present
}

export interface EmitOptions {
  /** Module the generated code imports the runtime from. */
  runtime?: string;
  /** The router, imported as a type to check that generated types still match it (DESIGN §9). */
  router?: { from: string; name: string };
}

export function emitCodecs(schema: Schema, lock: Lock, options: EmitOptions = {}): string {
  return new Emitter(schema, lock).emit(options.runtime ?? 'ts-bin-rpc/runtime', options.router);
}

const BRANDS = new Set(['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'u64', 'i64']);

class Emitter {
  private out: string[] = [];
  private brands = new Set<string>();
  private done = new Set<string>();
  private ids = new Map<string, string>();
  private taken = new Set<string>();
  private objectIndex = new Map<string, number>();
  private schema: Schema;
  private lock: Lock;

  constructor(schema: Schema, lock: Lock) {
    this.schema = schema;
    this.lock = lock;
    Object.keys(schema.objects).sort().forEach((n, i) => this.objectIndex.set(n, i));
    if (this.objectIndex.size > VT_KEY_STRIDE) throw new Error(`more than ${VT_KEY_STRIDE} object types`);
  }

  emit(runtime: string, router?: { from: string; name: string }): string {
    for (const name of Object.keys(this.schema.enums).sort()) this.enumDecl(name);
    for (const name of Object.keys(this.schema.unions).sort()) this.unionDecl(name);
    for (const name of Object.keys(this.schema.objects).sort()) this.objectDecl(name);

    this.schemaDesc();
    const roots = new Map<string, string>();
    const root = (t: IRType) => {
      const sig = signature(t);
      let k = roots.get(sig);
      if (!k) {
        k = `K_${this.id(`root:${sig}`, sig)}`;
        roots.set(sig, k);
        this.rootCodec(k, t);
      }
      return k;
    };
    const procs = this.schema.procedures.map(
      (p) =>
        `  ${lit(p.path)}: { input: ${p.input ? root(p.input) : 'null'}, inputOptional: ${p.inputOptional}, output: ${p.output ? root(p.output) : 'null'}, hash: ${lit(this.contractHash(p))} },`,
    );
    const named = Object.keys(this.schema.objects).sort().map((n) => `  ${lit(n)}: ${root({ kind: 'object', name: n })},`);
    this.out.push(
      `export const procedures = {\n${procs.join('\n')}\n} as const;\n`,
      `export const codecs: Record<string, Codec<any>> = {\n${named.join('\n')}\n};\n`,
    );
    if (router) this.contract();

    const types = ['Codec', 'Col', 'SchemaDesc', ...[...this.brands].sort()];
    if (router) types.push('Expect', 'Same', 'InputOf', 'InputOptional', 'OutputOf', 'ProcedurePath');
    const head = [
      '// Generated by tbr. Do not edit.',
      '/* eslint-disable */',
      `import { align, bad, bit, ranks, codec, Writer, Reader, Check, StrCol, NumCol, BoolCol, DateCol, EnumCol, ConstCol, ListCol, TypedListCol, UNSET, INSPECT, PLAIN, VerifyError } from ${lit(runtime)};`,
      `import type { ${types.join(', ')} } from ${lit(runtime)};`,
      ...(router ? [`import type { ${router.name} as tbr_router } from ${lit(router.from)};`] : []),
      '',
    ];
    return head.join('\n') + '\n' + this.out.join('\n');
  }

  /** The schema as data: read only when an encode fails, to report the path of the bad value. */
  private schemaDesc() {
    const s = this.schema;
    const objects = Object.fromEntries(
      Object.keys(s.objects).sort().map((n) => [n, s.objects[n].fields.map((f) => ({ name: f.name, type: f.type, optional: f.optional, nullable: f.nullable }))]),
    );
    const enums = Object.fromEntries(Object.keys(s.enums).sort().map((n) => [n, s.enums[n].values]));
    const unions = Object.fromEntries(
      Object.keys(s.unions).sort().map((n) => [n, { discriminant: s.unions[n].discriminant, variants: Object.fromEntries(s.unions[n].variants.map((v) => [v.tag, v.object])) }]),
    );
    this.out.push(`const SCHEMA: SchemaDesc = ${JSON.stringify({ objects, enums, unions })};\n`);
  }

  /** Type-level check that generated types still accept the same values as the router's (DESIGN §9). */
  private contract() {
    const L = [
      'type TbrRouter = typeof tbr_router;',
      '',
      '/** Fails to compile when the router changed after `tbr generate`. */',
      'export type Contract = [',
      '  Expect<Same<keyof typeof procedures, ProcedurePath<TbrRouter>, "procedure list">>,',
    ];
    for (const p of this.schema.procedures) {
      const P = lit(p.path);
      if (p.input) {
        L.push(`  Expect<Same<${this.ts(p.input)}, InputOf<TbrRouter, ${P}>, ${lit(`${p.path} input`)}>>,`);
        L.push(`  Expect<Same<${p.inputOptional}, InputOptional<TbrRouter, ${P}>, ${lit(`${p.path} input optionality`)}>>,`);
      } else L.push(`  Expect<Same<never, InputOf<TbrRouter, ${P}>, ${lit(`${p.path} input`)}>>,`);
      if (p.output) L.push(`  Expect<Same<${this.ts(p.output)}, OutputOf<TbrRouter, ${P}>, ${lit(`${p.path} output`)}>>,`);
      else L.push(`  Expect<Same<true, [OutputOf<TbrRouter, ${P}>] extends [void | undefined] ? true : false, ${lit(`${p.path} output`)}>>,`);
    }
    L.push('];', '');
    this.out.push(L.join('\n'));
  }

  /** Hash of the lockfile entries a procedure reaches: changes whenever its wire contract may have. */
  private contractHash(p: Procedure): string {
    const objects = new Set<string>(), enums = new Set<string>(), unions = new Set<string>();
    const visit = (t: IRType | null): void => {
      if (!t) return;
      switch (t.kind) {
        case 'array': return visit(t.element);
        case 'enum': enums.add(t.name); return;
        case 'union':
          if (unions.has(t.name)) return;
          unions.add(t.name);
          for (const v of this.schema.unions[t.name].variants) visit({ kind: 'object', name: v.object });
          return;
        case 'object':
          if (objects.has(t.name)) return;
          objects.add(t.name);
          for (const f of this.schema.objects[t.name].fields) visit(f.type);
          return;
      }
    };
    visit(p.input);
    visit(p.output);
    const pick = <T>(names: Set<string>, all: Record<string, T>) => Object.fromEntries([...names].sort().map((n) => [n, all[n]]));
    const text = JSON.stringify({
      procedure: this.lock.procedures[p.path],
      inputOptional: p.inputOptional,
      objects: pick(objects, this.lock.objects),
      enums: pick(enums, this.lock.enums),
      unions: pick(unions, this.lock.unions),
    });
    return createHash('sha256').update(text).digest('base64url').slice(0, 16);
  }

  // ------------------------------------------------------------------------------------------ naming

  private id(key: string, readable: string): string {
    const known = this.ids.get(key);
    if (known) return known;
    let base = readable.replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^_+|_+$/g, '') || 't';
    if (/^[0-9]/.test(base)) base = '_' + base;
    let v = base;
    for (let i = 2; this.taken.has(v); i++) v = `${base}_${i}`;
    this.taken.add(v);
    this.ids.set(key, v);
    return v;
  }
  private obj(name: string) { return this.id(`object:${name}`, name); }
  private enm(name: string) { return this.id(`enum:${name}`, name); }
  private uni(name: string) { return this.id(`union:${name}`, name); }
  private elem(t: IRType) { return this.id(`type:${signature(t)}`, `t_${signature(t)}`); }

  private once(key: string, emit: () => string | string[]) {
    if (this.done.has(key)) return;
    this.done.add(key);
    const code = emit();
    this.out.push(Array.isArray(code) ? code.join('\n') : code);
  }

  // ------------------------------------------------------------------------------------------- types

  private ts(t: IRType): string {
    switch (t.kind) {
      case 'scalar': {
        const ts = S[t.scalar].ts;
        if (BRANDS.has(ts)) this.brands.add(ts);
        return ts;
      }
      case 'string': return 'string';
      case 'bytes': return 'Uint8Array';
      case 'typedArray': return t.array;
      case 'const': return lit(t.value);
      case 'enum': return `E_${this.enm(t.name)}`;
      case 'array': return `${this.ts(t.element)}[]`;
      case 'object': return `T_${this.obj(t.name)}`;
      case 'union': return `T_${this.uni(t.name)}`;
    }
  }

  private fieldTs(f: Field): string {
    return `${this.ts(f.type)}${f.nullable ? ' | null' : ''}${f.optional ? ' | undefined' : ''}`;
  }

  private enumWidth(name: string): number {
    return this.lock.enums[name].values.length > 256 ? 2 : 1;
  }

  /** Fixed-width column element: scalars and enums. */
  private fixed(t: IRType): Scalar | undefined {
    if (t.kind === 'scalar') return S[t.scalar];
    if (t.kind !== 'enum') return undefined;
    const e = this.enm(t.name), w = this.enumWidth(t.name);
    return {
      size: w, ctor: w === 1 ? 'Uint8Array' : 'Uint16Array', ts: `E_${e}`, write: '', name: t.name,
      cond: () => 'false', conv: (x) => `ei_${e}(${x})`, elem: (x) => `EV_${e}[${x}] as E_${e}`,
      slot: (p) => `EV_${e}[${w === 1 ? `r.bytes[${p}]` : `r.dv.getUint16(${p}, true)`}] as E_${e}`,
    };
  }

  private slot(t: IRType): { size: number; align: number } {
    const fx = this.fixed(t);
    if (fx) return { size: fx.size, align: fx.size };
    switch (t.kind) {
      case 'string': return { size: 8, align: 4 };
      case 'const': return { size: 0, align: 1 };
      case 'union': return { size: 5, align: 4 };
      default: return { size: 4, align: 4 };
    }
  }

  /** Alignment of a vector body / column of elements of type t. */
  private bodyAlign(t: IRType): number {
    const fx = this.fixed(t);
    if (fx) return fx.size;
    return t.kind === 'const' ? 1 : 4;
  }

  private hasStrings(t: IRType, seen = new Set<string>()): boolean {
    switch (t.kind) {
      case 'string': return true;
      case 'array': return this.hasStrings(t.element, seen);
      case 'object':
        if (seen.has(t.name)) return false;
        seen.add(t.name);
        return this.schema.objects[t.name].fields.some((f) => this.hasStrings(f.type, seen));
      case 'union':
        return this.schema.unions[t.name].variants.some((v) => this.hasStrings({ kind: 'object', name: v.object }, seen));
      default: return false;
    }
  }

  private wireFields(name: string): { fields: WireField[]; size: number; slots: number } {
    const lockFields = this.lock.objects[name]?.fields;
    if (!lockFields) throw new Error(`type '${name}' is missing from the lockfile; run tbr generate`);
    const wire = this.schema.objects[name].fields.filter((f) => f.type.kind !== 'const');
    let bit = 0;
    const fields: WireField[] = wire.map((f, k) => {
      const lf = lockFields[f.name];
      if (!lf || lf.retired) throw new Error(`field '${name}.${f.name}' is missing from the lockfile; run tbr generate`);
      return { f, k, id: lf.id, size: this.slot(f.type).size, off: 0, bit: f.optional || f.nullable ? bit++ : -1 };
    });
    if (bit > MAX_MASK_BITS) throw new Error(`'${name}' has more than ${MAX_MASK_BITS} optional or nullable fields`);
    // Larger alignments first. The table starts at 4 mod 8, so slot r is naturally aligned when (4 + r) % align == 0.
    const order = [...fields].sort((a, b) => this.slot(b.f.type).align - this.slot(a.f.type).align || a.id - b.id);
    let cur = 4;
    for (const wf of order) {
      const al = this.slot(wf.f.type).align;
      while ((4 + cur) % al) cur++;
      wf.off = cur;
      cur += wf.size + (wf.f.optional && wf.f.nullable ? 1 : 0);
    }
    const slots = fields.length ? Math.max(...fields.map((x) => x.id)) + 1 : 0;
    return { fields, size: cur, slots };
  }

  // ------------------------------------------------------------------------------------- slot code

  private writeSlot(t: IRType, at: string, v: string): string {
    const fx = this.fixed(t);
    if (t.kind === 'scalar') return `w.${S[t.scalar].write}(${at}, ${v});`;
    if (fx) return `w.ru${fx.size * 8}(${at}, ${fx.conv(v)});`;
    switch (t.kind) {
      case 'string': return `w.str(${at}, ${v});`;
      case 'const': return `if (${v} !== ${lit(t.value)}) bad(${lit(lit(t.value))}, ${v});`;
      case 'bytes': return `w.ru32(${at}, w.typed(${v}, Uint8Array));`;
      case 'typedArray': return `w.ru32(${at}, w.typed(${v}, ${t.array}));`;
      case 'array': return `w.ru32(${at}, ${this.vecEnc(t.element)}(w, ${v}));`;
      case 'object': return `w.ru32(${at}, eT_${this.obj(t.name)}(w, ${v}));`;
      case 'union': return `sU_${this.uni(t.name)}(w, ${at}, ${v});`;
    }
    throw new Error('unreachable');
  }

  private readSlot(t: IRType, p: string): string {
    const fx = this.fixed(t);
    if (fx) return fx.slot(p);
    const ptr = `r.dv.getUint32(${p}, true)`;
    switch (t.kind) {
      case 'string': return `r.str(${p})`;
      case 'const': return lit(t.value);
      case 'bytes': return `r.typedAt(${ptr}, Uint8Array)`;
      case 'typedArray': return `r.typedAt(${ptr}, ${t.array})`;
      case 'array': return `${this.vecRead(t.element)}(r, ${ptr})`;
      case 'object': return `new V_${this.obj(t.name)}(r, ${ptr})`;
      case 'union': return `rU_${this.uni(t.name)}(r, ${p})`;
    }
    throw new Error('unreachable');
  }

  private checkSlot(t: IRType, p: string, d: string): string {
    switch (t.kind) {
      case 'scalar': return t.scalar === 'bool' ? `c.bool(${p});` : '';
      case 'enum': return `c.enumIndex(${p}, ${this.enumWidth(t.name)}, EK_${this.enm(t.name)});`;
      case 'string': return `c.str(${p});`;
      case 'bytes': return `c.typed(c.u32(${p}), 1, ${d});`;
      case 'typedArray': return `c.typed(c.u32(${p}), ${TYPED_SIZE[t.array]}, ${d});`;
      case 'array': return `${this.vecCheck(t.element)}(c, c.u32(${p}), ${d});`;
      case 'object': return `vT_${this.obj(t.name)}(c, c.u32(${p}), ${d});`;
      case 'union': return `vU_${this.uni(t.name)}(c, ${p}, ${d});`;
      case 'const': return '';
    }
  }

  /** Deep copy into plain objects; null when the value can be returned as is. */
  private plain(t: IRType, x: string): string | null {
    switch (t.kind) {
      case 'scalar': return t.scalar === 'timestamp' ? `new Date(${x}.getTime())` : null;
      case 'bytes':
      case 'typedArray': return `${x}.slice()`;
      case 'array': {
        const e = this.plain(t.element, 'e');
        return e === null ? `${x}.slice()` : `${x}.map((e) => ${e})`;
      }
      case 'object': return `p_${this.obj(t.name)}(${x})`;
      case 'union': return `p_${this.uni(t.name)}(${x})`;
      default: return null;
    }
  }

  private plainField(f: Field, x: string): string {
    const p = this.plain(f.type, x);
    if (p === null) return x;
    return f.nullable ? `${x} === null ? null : ${p}` : p;
  }

  // ----------------------------------------------------------------------------------------- enums

  private enumDecl(name: string) {
    const e = this.enm(name);
    const values = this.lock.enums[name].values;
    const current = this.schema.enums[name].values;
    const valid = values.map((v) => (current.includes(v) ? 1 : 0));
    this.out.push([
      `export type E_${e} = ${current.map(lit).join(' | ')};`,
      `const EV_${e}: readonly string[] = ${JSON.stringify(values)};`,
      `const EK_${e} = new Uint8Array(${JSON.stringify(valid)});`,
      `function ei_${e}(v: E_${e}): number {`,
      '  switch (v) {',
      ...current.map((v) => `    case ${lit(v)}: return ${values.indexOf(v)};`),
      `    default: return bad(${lit(name)}, v);`,
      '  }',
      '}',
      '',
    ].join('\n'));
  }

  // ---------------------------------------------------------------------------------------- unions

  private unionDecl(name: string) {
    const u = this.uni(name);
    const def = this.schema.unions[name];
    const disc = def.discriminant;
    const lockVariants = this.lock.unions[name].variants;
    const nv = lockVariants.length;
    const nv4 = 4 * nv;
    const current = lockVariants
      .map((lv, tag) => ({ tag, value: lv.tag, object: def.variants.find((v) => v.tag === lv.tag)?.object }))
      .filter((v): v is { tag: number; value: string; object: string } => v.object !== undefined);
    const T = `T_${u}`;
    const o = (v: { object: string }) => this.obj(v.object);
    const tagsAt = 'b + ' + nv4;
    const idxAt = `${tagsAt} + ((n + 3) & ~3)`;
    this.out.push([
      `export type ${T} = ${current.map((v) => `T_${o(v)}`).join(' | ')};`,
      '',
      `function sU_${u}(w: Writer, at: number, v: ${T}): void {`,
      `  if (typeof v !== 'object' || v === null) bad(${lit(name)}, v);`,
      `  switch (${acc('v', disc)}) {`,
      ...current.map((v) => `    case ${lit(v.value)}: w.ru8(at + 4, ${v.tag}); w.ru32(at, eT_${o(v)}(w, v)); return;`),
      `    default: bad(${lit(`${name} variant`)}, ${acc(`(v as { ${prop(disc)}: unknown })`, disc)});`,
      '  }',
      '}',
      '',
      `function rU_${u}(r: Reader, at: number): ${T} {`,
      '  const p = r.dv.getUint32(at, true);',
      '  switch (r.bytes[at + 4]) {',
      ...current.map((v) => `    case ${v.tag}: return new V_${o(v)}(r, p);`),
      `    default: throw new VerifyError(${lit(`unknown ${name} variant`)});`,
      '  }',
      '}',
      '',
      `function vU_${u}(c: Check, at: number, d: number): void {`,
      '  switch (c.bytes[at + 4]) {',
      ...current.map((v) => `    case ${v.tag}: vT_${o(v)}(c, c.u32(at), d); return;`),
      `    default: c.fail(${lit(`unknown ${name} variant`)});`,
      '  }',
      '}',
      '',
      `function p_${u}(v: ${T}): ${T} {`,
      `  switch (${acc('v', disc)}) {`,
      ...current.map((v) => `    case ${lit(v.value)}: return p_${o(v)}(v);`),
      '  }',
      '}',
      '',
      `// Union body: u32 variant vector[${nv}], u8 tag[n], u32 index[n] into the variant's vector.`,
      `function eB_${u}(w: Writer, a: ArrayLike<${T} | null | undefined>, n: number, loose: boolean): number {`,
      `  const b = w.alloc(${nv4} + ((n + 3) & ~3) + 4 * n, 4);`,
      ...current.map((v) => `  const g${v.tag}: T_${o(v)}[] = [];`),
      '  for (let i = 0; i < n; i++) {',
      '    const v = a[i];',
      `    if (v == null) { if (loose) continue; bad(${lit(name)}, v); }`,
      `    switch (${acc('v', disc)}) {`,
      ...current.map((v) => `      case ${lit(v.value)}: w.buf[${tagsAt} + i] = ${v.tag}; w.ru32(${idxAt} + 4 * i, g${v.tag}.length); g${v.tag}.push(v); break;`),
      `      default: bad(${lit(`${name} variant`)}, ${acc(`(v as { ${prop(disc)}: unknown })`, disc)});`,
      '    }',
      '  }',
      ...current.map((v) => `  if (g${v.tag}.length) w.ru32(b + ${4 * v.tag}, eV_${o(v)}(w, g${v.tag}));`), // empty: null pointer, stops recursion
      '  return b;',
      '}',
      '',
      `class U_${u} implements Col<${T}> {`,
      '  readonly #r: Reader;',
      '  readonly #b: number;',
      '  readonly #tags: Uint8Array;',
      '  readonly #idx: Uint32Array;',
      ...current.map((v) => `  #v${v.tag}: C_${o(v)} | undefined = undefined;`),
      '  constructor(r: Reader, b: number, n: number) {',
      '    this.#r = r;',
      '    this.#b = b;',
      `    this.#tags = r.typed(Uint8Array, ${tagsAt}, n);`,
      `    this.#idx = r.typed(Uint32Array, ${idxAt}, n);`,
      '  }',
      `  get(i: number): ${T} {`,
      '    const k = this.#idx[i];',
      '    switch (this.#tags[i]) {',
      ...current.map((v) => `      case ${v.tag}: return (this.#v${v.tag} ??= new C_${o(v)}(this.#r, this.#r.dv.getUint32(this.#b + ${4 * v.tag}, true))).row(k);`),
      `      default: throw new VerifyError(${lit(`unknown ${name} variant`)});`,
      '    }',
      '  }',
      '}',
      '',
      `function vB_${u}(c: Check, b: number, n: number, d: number, pres: number, nul: number): void {`,
      `  c.need(b, ${nv4} + ((n + 3) & ~3) + 4 * n);`,
      `  const counts = [${lockVariants.map((_, tag) => {
        const v = current.find((x) => x.tag === tag);
        return v ? `c.u32(b + ${4 * tag}) === 0 ? 0 : vV_${o(v)}(c, c.u32(b + ${4 * tag}), d + 1)` : '-1';
      }).join(', ')}];`,
      '  for (let i = 0; i < n; i++) {',
      '    if (!c.has(pres, nul, i)) continue;',
      `    const t = c.bytes[${tagsAt} + i];`,
      `    if (t >= ${nv} || counts[t] < 0 || c.dv.getUint32(${idxAt} + 4 * i, true) >= counts[t]) c.fail(${lit(`invalid ${name} entry`)});`,
      '  }',
      '}',
      '',
    ].join('\n'));
  }

  // --------------------------------------------------------------------------------------- objects

  private objectDecl(name: string) {
    const x = this.obj(name);
    const T = `T_${x}`;
    const def = this.schema.objects[name];
    const { fields, size, slots } = this.wireFields(name);
    const vtSize = 4 + 2 * slots;
    const masked = fields.filter((w) => w.bit >= 0);
    const L: string[] = [];

    // Interface
    L.push(`export interface ${T} {`);
    for (const f of def.fields) L.push(`  ${prop(f.name)}${f.optional ? '?' : ''}: ${this.ts(f.type)}${f.nullable ? ' | null' : ''};`);
    L.push('}', '');

    // vtable
    const key = `${this.objectIndex.get(name)}${masked.length ? ` + m * ${VT_KEY_STRIDE}` : ''}`;
    L.push(
      `function vt_${x}(w: Writer, m: number): number {`,
      `  const key = ${key};`,
      '  let p = w.vtable(key);',
      '  if (p >= 0) return p;',
      `  p = w.alloc(${vtSize}, 2);`,
      `  w.ru16(p, ${vtSize});`,
      `  w.ru16(p + 2, ${size});`,
      ...fields.map((wf) => `  ${wf.bit >= 0 ? `if (m & ${1 << wf.bit}) ` : ''}w.ru16(p + ${4 + 2 * wf.id}, ${wf.off});`),
      '  w.setVtable(key, p);',
      '  return p;',
      '}',
      '',
    );

    // Table encoder
    L.push(
      `function eT_${x}(w: Writer, v: ${T}): number {`,
      `  if (typeof v !== 'object' || v === null) bad(${lit(name)}, v);`,
      ...def.fields.filter((f) => f.type.kind === 'const').map((f) => `  ${this.writeSlot(f.type, '0', acc('v', f.name))}`),
      '  let m = 0;',
      ...masked.map((wf) => `  const f${wf.k} = ${acc('v', wf.f.name)};\n  if (f${wf.k} ${wf.f.optional && wf.f.nullable ? '!== undefined' : '!= null'}) m |= ${1 << wf.bit};`),
      `  const vt = vt_${x}(w, m);`, // before the table, so vtBack is positive
      `  const t = w.alloc(${size}, 8, 4);`,
      '  w.ri32(t, t - vt);',
    );
    for (const wf of fields) {
      const at = `t + ${wf.off}`;
      if (wf.bit < 0) L.push(`  ${this.writeSlot(wf.f.type, at, acc('v', wf.f.name))}`);
      else if (wf.f.optional && wf.f.nullable) L.push(`  if (f${wf.k} !== undefined && f${wf.k} !== null) { w.ru8(t + ${wf.off + wf.size}, 1); ${this.writeSlot(wf.f.type, at, `f${wf.k}`)} }`);
      else L.push(`  if (f${wf.k} != null) { ${this.writeSlot(wf.f.type, at, `f${wf.k}`)} }`);
    }
    L.push('  return t;', '}', '');

    // Table view
    const memo = (t: IRType) => !this.fixed(t) || (t.kind === 'scalar' && t.scalar === 'timestamp');
    L.push(`class V_${x} implements ${T} {`, '  readonly #r: Reader;', '  readonly #o: number;', '  readonly #vt: number;');
    for (const wf of fields) if (memo(wf.f.type) && wf.f.type.kind !== 'const') L.push(`  #m${wf.k}: ${this.fieldTs(wf.f)} | typeof UNSET = UNSET;`);
    L.push('  constructor(r: Reader, o: number) {', '    this.#r = r;', '    this.#o = o;', '    this.#vt = r.vt(o);', '  }');
    for (const f of def.fields) {
      if (f.type.kind === 'const') {
        L.push(`  get ${prop(f.name)}(): ${this.fieldTs(f)} { return ${lit(f.type.value)}; }`);
        continue;
      }
      const wf = fields.find((w) => w.f === f)!;
      const val = this.readSlot(f.type, 'p');
      let expr = val;
      if (f.optional && f.nullable) expr = `p === 0 ? undefined : r.bytes[p + ${wf.size}] === 0 ? null : ${val}`;
      else if (f.optional) expr = `p === 0 ? undefined : ${val}`;
      else if (f.nullable) expr = `p === 0 ? null : ${val}`;
      const body = [`    const r = this.#r, p = r.at(this.#o, this.#vt, ${wf.id});`];
      if (memo(f.type)) body.unshift(`    const c = this.#m${wf.k};`, '    if (c !== UNSET) return c;'), body.push(`    return (this.#m${wf.k} = ${expr});`);
      else body.push(`    return ${expr};`);
      L.push(`  get ${prop(f.name)}(): ${this.fieldTs(f)} {`, ...body, '  }');
    }
    L.push(`  toJSON(): ${T} { return p_${x}(this); }`, `  [PLAIN](): ${T} { return p_${x}(this); }`, `  [INSPECT](): ${T} { return p_${x}(this); }`, '}', '');

    // Table verifier
    L.push(`function vT_${x}(c: Check, o: number, d: number): void {`, '  const vt = c.table(o, d);', '  let p = 0;');
    for (const wf of fields) {
      const f = wf.f;
      const chk = this.checkSlot(f.type, 'p', 'd + 1');
      if (f.optional && f.nullable) {
        L.push(`  p = c.field(o, vt, ${wf.id}, ${wf.size + 1});`, `  if (p !== 0) { c.tag(p + ${wf.size}); if (c.bytes[p + ${wf.size}] === 1) { ${chk} } }`);
      } else {
        L.push(`  p = c.field(o, vt, ${wf.id}, ${wf.size});`);
        if (f.optional || f.nullable) { if (chk) L.push(`  if (p !== 0) { ${chk} }`); }
        else L.push(`  if (p === 0) c.fail(${lit(`${name}.${f.name} is missing`)});`, ...(chk ? [`  ${chk}`] : []));
      }
    }
    L.push('}', '');

    // Plain copy
    const required = def.fields.filter((f) => !f.optional);
    L.push(`function p_${x}(v: ${T}): ${T} {`, `  const o: ${T} = {`);
    for (const f of required) L.push(`    ${prop(f.name)}: ${this.plainField(f, acc('v', f.name))},`);
    L.push('  };');
    def.fields.filter((f) => f.optional).forEach((f, i) => {
      L.push(`  const x${i} = ${acc('v', f.name)};`, `  if (x${i} !== undefined) ${acc('o', f.name)} = ${this.plainField(f, `x${i}`)};`);
    });
    L.push('  return o;', '}', '');

    this.out.push(L.join('\n'));
    this.columns(name, x, fields);
  }

  // Columnar vector of objects: u32 count, u16 ncols, u16 0, catalog { u16 fieldId, u16 flags, u32 offset }.
  private columns(name: string, x: string, fields: WireField[]) {
    const T = `T_${x}`;
    const nc = fields.length;
    const flagsOf = (f: Field) => (f.optional ? 1 : 0) | (f.nullable ? 2 : 0);
    const L: string[] = [];

    // Encoder
    L.push(
      `function eV_${x}(w: Writer, a: readonly ${T}[]): number {`,
      `  if (!Array.isArray(a)) bad('array', a);`,
      '  const n = a.length, nb = (n + 7) >>> 3;',
      `  for (let i = 0; i < n; i++) { const v = a[i]; if (typeof v !== 'object' || v === null) bad(${lit(name)}, v); }`,
      `  const p = w.alloc(${8 + 8 * nc}, 4);`,
      '  w.ru32(p, n);',
      `  w.ru16(p + 4, ${nc});`,
    );
    fields.forEach((wf, k) => {
      const f = wf.f, t = f.type, fl = flagsOf(f);
      const e = `p + ${8 + 8 * k}`;
      const nbm = (f.optional ? 1 : 0) + (f.nullable ? 1 : 0);
      const presBase = 'bm', nullBase = f.optional ? 'bm + nb' : 'bm';
      const setBit = (base: string) => `buf[${base} + (i >>> 3)] |= 1 << (i & 7);`;
      // Row value handling; `skip` runs for rows without a value.
      const rows = (skip: string, value: string) => {
        const s: string[] = [`      const x = ${acc('a[i]', f.name)};`];
        if (f.optional && f.nullable) s.push(`      if (x === undefined) { ${skip} continue; }`, `      ${setBit(presBase)}`, `      if (x === null) { ${setBit(nullBase)} ${skip} continue; }`);
        else if (f.optional) s.push(`      if (x == null) { ${skip} continue; }`, `      ${setBit(presBase)}`);
        else if (f.nullable) s.push(`      if (x == null) { ${setBit(nullBase)} ${skip} continue; }`);
        s.push(`      ${value}`);
        return ['    for (let i = 0; i < n; i++) {', ...s, '    }'];
      };
      L.push('  {', `    w.ru16(${e}, ${wf.id});`, `    w.ru16(${e} + 2, ${fl});`);
      if (fl) L.push(`    const bm = w.alloc(nb * ${nbm}, 1);`);
      const fx = this.fixed(t);
      if (fx) {
        L.push(
          `    const d = w.alloc(n * ${fx.size}, ${fx.size});`,
          `    const t = new ${fx.ctor}(w.buf.buffer, d, n);`,
          '    const buf = w.buf;',
          ...rows('', t.kind === 'enum' ? `t[i] = ${fx.conv('x')};` : `if (${fx.cond('x')}) bad(${lit(fx.name)}, x); t[i] = ${fx.conv('x')};`),
        );
      } else if (t.kind === 'object') {
        L.push('    const d = w.alloc(4, 4);', `    const dense: ${this.ts(t)}[] = [];`, '    const buf = w.buf;', ...rows('', 'dense.push(x);'), `    if (dense.length) w.ru32(d, eV_${this.obj(t.name)}(w, dense));`);
      } else {
        const ph = this.placeholder(t);
        const colTs = t.kind === 'union' ? `${this.ts(t)} | null` : this.ts(t);
        L.push(`    const col = new Array<${colTs}>(n);`, '    const buf = w.buf;', ...rows(`col[i] = ${ph};`, 'col[i] = x;'), `    const d = ${this.bodyEnc(t, 'col', 'n', true)};`);
      }
      L.push(`    w.ru32(${e} + 4, ${fl ? 'bm' : 'd'});`, '  }');
    });
    L.push('  return p;', '}', '');

    // Column accessor
    L.push(`class C_${x} implements Col<${T}> {`, '  readonly r: Reader;', '  readonly n: number;');
    // Column accessors are created in the constructor: lazy `??=` accessors made full reads ~40% slower.
    // Nested object columns stay lazy: an empty one is a null pointer, and recursive types would unfold.
    for (const wf of fields) {
      L.push(`  d${wf.k} = -1;`, `  p${wf.k} = -1;`, `  n${wf.k} = -1;`);
      if (wf.f.type.kind === 'object') L.push(`  #a${wf.k}: ${this.colType(wf.f.type)} | undefined = undefined;`, `  #k${wf.k}: Int32Array | undefined = undefined;`);
      else L.push(`  readonly a${wf.k}!: ${this.colType(wf.f.type)};`);
    }
    L.push(
      `  #rows: (R_${x} | undefined)[] | undefined = undefined; // memo for nested access only`,
      '  constructor(r: Reader, vec: number) {',
      '    this.r = r;',
      '    const dv = r.dv;',
      '    const n = (this.n = dv.getUint32(vec, true));',
      '    const nc = dv.getUint16(vec + 4, true), nb = (n + 7) >>> 3;',
      '    for (let k = 0; k < nc; k++) {',
      '      const e = vec + 8 + 8 * k, fl = dv.getUint16(e + 2, true);',
      '      let o = dv.getUint32(e + 4, true);',
      '      const pres = fl & 1 ? o : -1;',
      '      if (fl & 1) o += nb;',
      '      const nul = fl & 2 ? o : -1;',
      '      if (fl & 2) o += nb;',
      '      switch (dv.getUint16(e, true)) {',
      ...fields.map((wf) => `        case ${wf.id}: this.d${wf.k} = align(o, ${this.bodyAlign(wf.f.type)}); this.p${wf.k} = pres; this.n${wf.k} = nul; break;`),
      '      }',
      '    }',
      ...fields.filter((wf) => wf.f.type.kind !== 'object').map((wf) => `    if (this.d${wf.k} >= 0) this.a${wf.k} = ${this.colInit(wf.f.type, `this.d${wf.k}`)};`),
      '  }',
      `  get(i: number): ${T} { return this.row(i); }`,
      `  row(i: number): R_${x} { return ((this.#rows ??= new Array(this.n))[i] ??= new R_${x}(this, i)); }`,
    );
    for (const wf of fields) {
      if (wf.f.type.kind !== 'object') continue;
      L.push(
        `  o${wf.k}(): ${this.colType(wf.f.type)} { return (this.#a${wf.k} ??= ${this.colInit(wf.f.type, `this.d${wf.k}`)}); }`,
        `  k${wf.k}(i: number): number { return this.p${wf.k} < 0 && this.n${wf.k} < 0 ? i : (this.#k${wf.k} ??= ranks(this.r.bytes, this.p${wf.k}, this.n${wf.k}, this.n))[i]; }`,
      );
    }
    L.push('}', '');

    // Row view
    const def = this.schema.objects[name];
    // Row state: undeclared string keys assigned in the constructor. Declared `#private` fields are defined
    // and then assigned (two stores per row), symbol keys are slow in V8: both cost 10–30% on numeric reads.
    L.push(`class R_${x} implements ${T} {`, `  declare readonly $tbrCols: C_${x};`, '  declare readonly $tbrRow: number;', `  constructor(c: C_${x}, i: number) {`, '    this.$tbrCols = c;', '    this.$tbrRow = i;', '  }');
    for (const f of def.fields) {
      if (f.type.kind === 'const') {
        L.push(`  get ${prop(f.name)}(): ${this.fieldTs(f)} { return ${lit(f.type.value)}; }`);
        continue;
      }
      const wf = fields.find((w) => w.f === f)!;
      const k = wf.k;
      const fx = this.fixed(f.type);
      let expr: string;
      if (fx) expr = fx.elem(`c.a${k}[i]`);
      else if (f.type.kind === 'object') expr = `c.o${k}().row(c.k${k}(i))`;
      else expr = `c.a${k}.get(i)`;
      L.push(`  get ${prop(f.name)}(): ${this.fieldTs(f)} {`, '    const c = this.$tbrCols, i = this.$tbrRow;');
      if (f.optional) L.push(`    if (c.d${k} < 0 || (c.p${k} >= 0 && !bit(c.r.bytes, c.p${k}, i))) return undefined;`);
      if (f.nullable) L.push(`    if (c.n${k} >= 0 && bit(c.r.bytes, c.n${k}, i)) return null;`);
      L.push(`    return ${expr};`, '  }');
    }
    L.push(`  toJSON(): ${T} { return p_${x}(this); }`, `  [PLAIN](): ${T} { return p_${x}(this); }`, `  [INSPECT](): ${T} { return p_${x}(this); }`, '}', '');

    // Verifier
    L.push(
      `function vV_${x}(c: Check, off: number, d: number): number {`,
      '  const n = c.vec(off, d);',
      '  c.need(off + 4, 4);',
      '  const dv = c.dv, nc = dv.getUint16(off + 4, true), nb = (n + 7) >>> 3;',
      '  c.need(off + 8, 8 * nc);',
      `  const seen = new Uint8Array(${nc});`,
      '  for (let k = 0; k < nc; k++) {',
      '    const e = off + 8 + 8 * k, fl = dv.getUint16(e + 2, true), o0 = dv.getUint32(e + 4, true);',
      `    if (fl & ~3) c.fail(${lit(`${name}: unknown column flags`)});`,
      '    let o = o0;',
      '    const pres = fl & 1 ? o : -1;',
      '    if (fl & 1) o += nb;',
      '    const nul = fl & 2 ? o : -1;',
      '    if (fl & 2) o += nb;',
      '    c.need(o0, o - o0);',
      '    switch (dv.getUint16(e, true)) {',
    );
    for (const wf of fields) {
      const f = wf.f, t = f.type, path = `${name}.${f.name}`;
      L.push(`      case ${wf.id}: {`, `        if (seen[${wf.k}]++) c.fail(${lit(`${path}: duplicate column`)});`);
      if (!f.optional) L.push(`        if (fl & 1) c.fail(${lit(`${path}: required column has absent rows`)});`);
      if (!f.nullable) L.push(`        if (fl & 2) c.fail(${lit(`${path}: column has nulls`)});`);
      L.push(`        const b = align(o, ${this.bodyAlign(t)});`);
      if (t.kind === 'object') {
        L.push(
          '        const k = c.count(pres, nul, n), ptr = c.u32(b);',
          `        if ((k !== 0 || ptr !== 0) && vV_${this.obj(t.name)}(c, ptr, d + 1) !== k) c.fail(${lit(`${path}: nested column has a wrong length`)});`,
        );
      } else {
        L.push(`        ${this.bodyCheck(t, 'b', 'n', 'd + 1', 'pres', 'nul')}`);
      }
      L.push('        break;', '      }');
    }
    L.push('    }', '  }');
    for (const wf of fields) if (!wf.f.optional) L.push(`  if (!seen[${wf.k}]) c.fail(${lit(`${name}.${wf.f.name}: column is missing`)});`);
    L.push('  return n;', '}', '');
    L.push(`function aV_${x}(r: Reader, vec: number): Col<${T}> { return new C_${x}(r, vec); }`, '');

    this.out.push(L.join('\n'));
  }

  private placeholder(t: IRType): string {
    switch (t.kind) {
      case 'string': return "''";
      case 'union': return 'null';
      case 'array': return '[]';
      case 'bytes': return 'new Uint8Array(0)';
      case 'typedArray': return `new ${t.array}(0)`;
      case 'const': return lit(t.value);
      default: throw new Error(`no placeholder for ${t.kind}`);
    }
  }

  /** Accessor type for a column of field type t inside an object column set. */
  private colType(t: IRType): string {
    const fx = this.fixed(t);
    if (fx) return fx.ctor;
    switch (t.kind) {
      case 'string': return 'StrCol';
      case 'object': return `C_${this.obj(t.name)}`;
      case 'union': return `U_${this.uni(t.name)}`;
      case 'array': return `ListCol<${this.ts(t.element)}>`;
      case 'bytes': return 'TypedListCol<Uint8ArrayConstructor>';
      case 'typedArray': return `TypedListCol<${t.array}Constructor>`;
      default: return `Col<${this.ts(t)}>`;
    }
  }

  private colInit(t: IRType, d: string): string {
    const fx = this.fixed(t);
    if (fx) return `this.r.typed(${fx.ctor}, ${d}, this.n)`;
    if (t.kind === 'object') return `new C_${this.obj(t.name)}(this.r, this.r.dv.getUint32(${d}, true))`;
    return this.bodyAcc(t, 'this.r', d, 'this.n');
  }

  // ------------------------------------------------------------------------- vectors of any element

  /** Expression writing a body of n elements from `a` at the next position; evaluates to its offset. */
  private bodyEnc(t: IRType, a: string, n: string, loose: boolean): string {
    const fx = this.fixed(t);
    if (fx) {
      const name = `eB_${this.elem(t)}`;
      this.once(name, () => [
        `function ${name}(w: Writer, a: ArrayLike<${this.ts(t)}>, n: number): number {`,
        `  const o = w.alloc(n * ${fx.size}, ${fx.size});`,
        `  const t = new ${fx.ctor}(w.buf.buffer, o, n);`,
        t.kind === 'enum'
          ? `  for (let i = 0; i < n; i++) t[i] = ${fx.conv('a[i]')};`
          : `  for (let i = 0; i < n; i++) { const x = a[i]; if (${fx.cond('x')}) bad(${lit(fx.name)}, x); t[i] = ${fx.conv('x')}; }`,
        '  return o;',
        '}',
        '',
      ]);
      return `${name}(w, ${a}, ${n})`;
    }
    switch (t.kind) {
      case 'string': return `w.strCol(${a}, ${n})`;
      case 'bytes': return `w.typedList(${a}, ${n}, Uint8Array)`;
      case 'typedArray': return `w.typedList(${a}, ${n}, ${t.array})`;
      case 'union': return `eB_${this.uni(t.name)}(w, ${a}, ${n}, ${loose})`;
      case 'const': {
        const name = `eB_${this.elem(t)}`;
        this.once(name, () => [
          `function ${name}(w: Writer, a: ArrayLike<${this.ts(t)}>, n: number): number {`,
          `  for (let i = 0; i < n; i++) if (a[i] !== ${lit(t.value)}) bad(${lit(lit(t.value))}, a[i]);`,
          '  return w.pos;',
          '}',
          '',
        ]);
        return `${name}(w, ${a}, ${n})`;
      }
      case 'array': {
        const name = `eL_${this.elem(t)}`;
        const E = this.ts(t.element);
        this.once(name, () => [
          `// List body: u32 child vector, u32 offsets[n + 1].`,
          `function ${name}(w: Writer, a: ArrayLike<readonly ${E}[]>, n: number): number {`,
          '  const p = w.alloc(4 + 4 * (n + 1), 4);',
          '  let total = 0;',
          "  for (let i = 0; i < n; i++) { const x = a[i]; if (!Array.isArray(x)) bad('array', x); w.ru32(p + 4 + 4 * i, total); total += x.length; }",
          '  w.ru32(p + 4 + 4 * n, total);',
          `  const flat = new Array<${E}>(total);`,
          '  for (let i = 0, k = 0; i < n; i++) { const x = a[i]; for (let j = 0; j < x.length; j++) flat[k++] = x[j]; }',
          `  if (total) w.ru32(p, ${this.vecEnc(t.element)}(w, flat)); // empty: null pointer, stops recursion`,
          '  return p;',
          '}',
          '',
        ]);
        return `${name}(w, ${a}, ${n})`;
      }
      default: throw new Error(`no body encoder for ${t.kind}`);
    }
  }

  /** Vector encoder: u32 count, then the body. */
  private vecEnc(t: IRType): string {
    if (t.kind === 'object') return `eV_${this.obj(t.name)}`;
    const name = `eV_${this.elem(t)}`;
    this.once(name, () => [
      `function ${name}(w: Writer, a: readonly ${this.ts(t)}[]): number {`,
      "  if (!Array.isArray(a)) bad('array', a);",
      '  const p = w.alloc(4, 4);',
      '  w.ru32(p, a.length);',
      `  ${this.bodyEnc(t, 'a', 'a.length', false)};`,
      '  return p;',
      '}',
      '',
    ]);
    return name;
  }

  /** Accessor over a body of n elements at b. */
  private bodyAcc(t: IRType, r: string, b: string, n: string): string {
    switch (t.kind) {
      case 'scalar': {
        const s = S[t.scalar];
        const typed = `${r}.typed(${s.ctor}, ${b}, ${n})`;
        if (t.scalar === 'bool') return `new BoolCol(${typed})`;
        if (t.scalar === 'timestamp') return `new DateCol(${typed})`;
        return `new NumCol<${this.ts(t)}>(${typed})`;
      }
      case 'enum': {
        const fx = this.fixed(t)!;
        return `new EnumCol<${fx.ts}>(${r}.typed(${fx.ctor}, ${b}, ${n}), EV_${this.enm(t.name)})`;
      }
      case 'string': return `new StrCol(${r}, ${b}, ${n})`;
      case 'const': return `new ConstCol<${this.ts(t)}>(${lit(t.value)})`;
      case 'union': return `new U_${this.uni(t.name)}(${r}, ${b}, ${n})`;
      case 'array': return `new ListCol<${this.ts(t.element)}>(${r}, ${b}, ${this.vecAcc(t.element)})`;
      case 'bytes': return `new TypedListCol(${r}, ${b}, Uint8Array)`;
      case 'typedArray': return `new TypedListCol(${r}, ${b}, ${t.array})`;
      case 'object': throw new Error('object bodies are column sets');
    }
  }

  /** (r, vec) => accessor over the vector's elements. */
  private vecAcc(t: IRType): string {
    if (t.kind === 'object') return `aV_${this.obj(t.name)}`;
    const name = `aV_${this.elem(t)}`;
    this.once(name, () => [
      `function ${name}(r: Reader, vec: number): Col<${this.ts(t)}> {`,
      `  return ${this.bodyAcc(t, 'r', `align(vec + 4, ${this.bodyAlign(t)})`, 'r.dv.getUint32(vec, true)')};`,
      '}',
      '',
    ]);
    return name;
  }

  /** (r, vec) => Array of the vector's elements. */
  private vecRead(t: IRType): string {
    const name = `rV_${this.elem(t)}`;
    const E = this.ts(t);
    this.once(name, () => {
      const fx = this.fixed(t);
      const typed = fx && `r.typed(${fx.ctor}, align(vec + 4, ${fx.size}), n)`;
      let body: string[];
      if (fx && fx.elem('x') === 'x') body = [`  return Array.from(${typed});`];
      else if (fx) body = [`  const t = ${typed};`, `  const out = new Array<${E}>(n);`, `  for (let i = 0; i < n; i++) out[i] = ${fx.elem('t[i]')};`, '  return out;'];
      else if (t.kind === 'object') {
        // Fresh rows, not the memoized ones: the caller owns this array and may reorder it.
        const x = this.obj(t.name);
        body = [`  const c = new C_${x}(r, vec);`, `  const out = new Array<${E}>(n);`, `  for (let i = 0; i < n; i++) out[i] = new R_${x}(c, i);`, '  return out;'];
      } else body = [`  const c = ${this.vecAcc(t)}(r, vec);`, `  const out = new Array<${E}>(n);`, '  for (let i = 0; i < n; i++) out[i] = c.get(i);', '  return out;'];
      return [`function ${name}(r: Reader, vec: number): ${E}[] {`, '  const n = r.dv.getUint32(vec, true);', ...body, '}', ''];
    });
    return name;
  }

  /** Statement verifying a body of n elements at b; rows without a value are skipped where it matters. */
  private bodyCheck(t: IRType, b: string, n: string, d: string, pres: string, nul: string): string {
    switch (t.kind) {
      case 'scalar': return t.scalar === 'bool' ? `c.bools(${b}, ${n});` : `c.need(${b}, ${n} * ${S[t.scalar].size});`;
      case 'enum': return `c.enums(${b}, ${n}, ${this.enumWidth(t.name)}, EK_${this.enm(t.name)}, ${pres}, ${nul});`;
      case 'string': return `c.strCol(${b}, ${n});`;
      case 'const': return '';
      case 'union': return `vB_${this.uni(t.name)}(c, ${b}, ${n}, ${d}, ${pres}, ${nul});`;
      case 'bytes': return `c.typedList(${b}, ${n}, 1, ${d});`;
      case 'typedArray': return `c.typedList(${b}, ${n}, ${TYPED_SIZE[t.array]}, ${d});`;
      case 'array': {
        const name = `vL_${this.elem(t)}`;
        this.once(name, () => [
          `function ${name}(c: Check, b: number, n: number, d: number): void {`,
          '  c.need(b, 4);',
          '  const ch = c.dv.getUint32(b, true);',
          `  const cn = ch === 0 ? 0 : ${this.vecCheck(t.element)}(c, ch, d); // same level as the list`,
          '  c.offsets(b + 4, n, cn);',
          '}',
          '',
        ]);
        return `${name}(c, ${b}, ${n}, ${d});`;
      }
      case 'object': throw new Error('object bodies are column sets');
    }
  }

  /** (c, vec, d) => element count, after verifying the vector. */
  private vecCheck(t: IRType): string {
    if (t.kind === 'object') return `vV_${this.obj(t.name)}`;
    const name = `vV_${this.elem(t)}`;
    this.once(name, () => [
      `function ${name}(c: Check, vec: number, d: number): number {`,
      '  const n = c.vec(vec, d);',
      `  ${this.bodyCheck(t, `align(vec + 4, ${this.bodyAlign(t)})`, 'n', 'd', '-1', '-1')}`,
      '  return n;',
      '}',
      '',
    ]);
    return name;
  }

  // ------------------------------------------------------------------------------------------ roots

  private rootCodec(k: string, t: IRType) {
    const { size, align } = this.slot(t);
    const plain = this.plain(t, 'v') ?? 'v';
    this.out.push([
      `const ${k}: Codec<${this.ts(t)}> = codec<${this.ts(t)}>({`,
      `  desc: { schema: SCHEMA, type: ${JSON.stringify(t)} },`,
      `  strings: ${this.hasStrings(t)},`,
      `  size: ${size},`,
      `  align: ${align},`,
      `  write: (w, at, v) => { ${this.writeSlot(t, 'at', 'v')} },`,
      `  read: (r, at) => ${this.readSlot(t, 'at')},`,
      `  check: (c, at) => { ${this.checkSlot(t, 'at', '0')} },`,
      `  plain: (v) => ${plain},`,
      '});',
      '',
    ].join('\n'));
  }
}
