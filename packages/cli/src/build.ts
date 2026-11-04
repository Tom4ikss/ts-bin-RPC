// Builds the Schema IR from a router, collecting every unsupported construct instead of stopping at the first.
import type { Desc, PropDesc, TypeRef, TypeSource } from './source.ts';
import { TYPED_ARRAYS, type Field, type IRType, type Location, type ObjectDef, type Procedure, type Rules, type ScalarKind, type Schema } from './ir.ts';
import type { RawChecks, RawRules } from './source.ts';

export interface SchemaError {
  path: string; // where in the contract: 'user.get → output → User.meta'
  message: string;
  location?: Location;
}

const NUMBER_BRANDS: Record<string, ScalarKind> = { u8: 'u8', i8: 'i8', u16: 'u16', i16: 'i16', u32: 'u32', i32: 'i32', f32: 'f32', f64: 'f64' };
const BIGINT_BRANDS: Record<string, ScalarKind> = { u64: 'u64', i64: 'i64' };

const UNSUPPORTED: Partial<Record<Desc['k'], string>> = {
  any: "type 'any' is not serializable",
  unknown: "type 'unknown' is not serializable",
  never: "type 'never' is not serializable",
  symbol: 'symbols are not serializable',
  nonPrimitive: "type 'object' is not serializable; declare the fields",
  void: "'void' is only allowed as a procedure result",
  undefined: "'undefined' alone is not serializable",
  null: "'null' alone is not serializable",
  function: 'functions and methods are not serializable',
  tuple: 'tuples are not supported yet; use an object or an array',
};

interface Ctx {
  path: string; // human path for errors
  anon: string; // name to give an anonymous object/enum/union found here
  location?: Location;
}

class Builder {
  schema: Schema = { procedures: [], objects: {}, enums: {}, unions: {} };
  errors: SchemaError[] = [];
  private memo = new Map<number, IRType>();
  private owners = new Map<string, { id: number; location?: Location }>();

  private src: TypeSource;
  constructor(src: TypeSource) { this.src = src; }

  fail(ctx: Ctx, message: string, location = ctx.location) {
    this.errors.push({ path: ctx.path, message, location });
  }

  procedure(entry: ReturnType<TypeSource['router']>[number]) {
    const ctx: Ctx = { path: entry.path, anon: entry.path, location: entry.location };
    if ('problem' in entry) return this.fail(ctx, entry.problem);
    if (entry.overloads > 1) return this.fail(ctx, 'overloaded procedures are not supported');
    if (entry.params.length > 2) return this.fail(ctx, 'a procedure takes at most (input, ctx)');

    let input: IRType | null = null;
    let inputOptional = false;
    const p0 = entry.params[0];
    const k0 = p0 && this.src.describe(p0.type).k;
    // `(_: void, ctx)`: a procedure that needs ctx but takes no input. Inside use(), an unannotated
    // `(_, ctx)` gets `never` for its input from the chain's type, which also means none.
    if (p0 && k0 !== 'void' && k0 !== 'undefined' && k0 !== 'never') {
      const r = this.slot(p0.type, { path: `${entry.path} → input`, anon: `${entry.path}:input`, location: entry.location });
      if (r?.nullable) this.fail(ctx, 'a procedure input cannot be null');
      input = r?.type ?? null;
      inputOptional = p0.optional || !!r?.optional;
    }

    let output: IRType | null = null;
    const ret = this.src.describe(entry.returns);
    if (entry.stream && (ret.k === 'void' || ret.k === 'undefined')) this.fail(ctx, 'a stream needs a row type: Stream<T>');
    if (entry.stream && entry.query) this.fail(ctx, 'a stream cannot be a query: streams are not cached; remove query()');
    else if (ret.k !== 'void' && ret.k !== 'undefined') {
      const what = entry.stream ? 'row' : 'output';
      const r = this.slot(entry.returns, { path: `${entry.path} → ${what}`, anon: `${entry.path}:${what}`, location: entry.location });
      if (r && (r.optional || r.nullable)) this.fail(ctx, entry.stream ? 'stream rows cannot be null or undefined' : 'a procedure result cannot be null or undefined; wrap it in an object with an optional field');
      output = r?.type ?? null;
    }
    const proc: Procedure = { path: entry.path, input, inputOptional, output, ...(entry.stream && { stream: true }), ...(entry.params.length > 1 && { ctx: true }), ...(entry.query && { get: true }), location: entry.location };
    this.schema.procedures.push(proc);
  }

  // A position that may carry `| undefined` and `| null`: fields and procedure input/output.
  slot(ref: TypeRef, ctx: Ctx): { type: IRType; optional: boolean; nullable: boolean } | undefined {
    const d = this.src.describe(ref);
    if (d.k !== 'union') {
      const type = this.type(ref, ctx);
      return type && { type, optional: false, nullable: false };
    }
    let optional = false, nullable = false;
    const rest: TypeRef[] = [];
    const visit = (members: TypeRef[]) => {
      for (const m of members) {
        const md = this.src.describe(m);
        if (md.k === 'undefined' || md.k === 'void') optional = true;
        else if (md.k === 'null') nullable = true;
        else if (md.k === 'union' && md.members.some((x) => isNullish(this.src.describe(x)))) visit(md.members); // `type MaybeRole = Role | null`
        else rest.push(m);
      }
    };
    visit(d.members);
    if (!rest.length) { this.fail(ctx, `'${this.src.text(ref)}' has no serializable part`); return undefined; }
    const type = rest.length === 1 ? this.type(rest[0], ctx) : this.multi(ref, rest, d.alias, ctx);
    return type && { type, optional, nullable };
  }

  type(ref: TypeRef, ctx: Ctx): IRType | undefined {
    const d = this.src.describe(ref);
    const t = this.kind(d.of ?? ref, d, ctx);
    return t && (d.rules || d.checks) ? this.withRules(t, d.rules ?? {}, d.checks ?? [], ctx) : t;
  }

  private kind(ref: TypeRef, d: Desc, ctx: Ctx): IRType | undefined {
    switch (d.k) {
      case 'string': return { kind: 'string' };
      case 'number': return { kind: 'scalar', scalar: 'f64' };
      case 'boolean': return { kind: 'scalar', scalar: 'bool' };
      case 'bigint': return { kind: 'scalar', scalar: 'i64' };
      case 'literal': return { kind: 'const', value: d.value };
      case 'brand': {
        const scalar = (d.base === 'number' ? NUMBER_BRANDS : BIGINT_BRANDS)[d.tag];
        if (!scalar) { this.fail(ctx, `unknown numeric brand '${d.tag}' on ${d.base}`); return undefined; }
        return { kind: 'scalar', scalar };
      }
      case 'union': {
        if (d.members.some((m) => isNullish(this.src.describe(m)))) { this.fail(ctx, `'${this.src.text(ref)}': null/undefined are only allowed on fields and procedure inputs, not inside arrays`); return undefined; }
        return this.multi(ref, d.members, d.alias, ctx);
      }
      case 'array': {
        const element = this.type(d.element, { ...ctx, path: `${ctx.path}[]`, anon: `${ctx.anon}[]` });
        return element && { kind: 'array', element };
      }
      case 'builtin': {
        if (d.name === 'Date') return { kind: 'scalar', scalar: 'timestamp' };
        if (d.name === 'Uint8Array') return { kind: 'bytes' };
        if ((TYPED_ARRAYS as readonly string[]).includes(d.name)) return { kind: 'typedArray', array: d.name as (typeof TYPED_ARRAYS)[number] };
        const hint = d.name.includes('Map') || d.name.includes('Set') ? ' (planned after alpha)' : '';
        this.fail(ctx, `'${d.name}' is not supported${hint}`);
        return undefined;
      }
      case 'object': return this.object(ref, d, ctx);
      case 'other': this.fail(ctx, `type '${d.text}' is not serializable`); return undefined;
      default: this.fail(ctx, UNSUPPORTED[d.k] ?? `type '${this.src.text(ref)}' is not serializable`); return undefined;
    }
  }

  // Rules go on numbers, strings and arrays; anything else, or an argument that is not a literal, is
  // an error here rather than a rule that silently does nothing.
  private withRules(t: IRType, raw: RawRules, checks: RawChecks, ctx: Ctx): IRType | undefined {
    const rules: Rules = {};
    const numeric = t.kind === 'scalar' && t.scalar !== 'bool' && t.scalar !== 'timestamp';
    const wide = t.kind === 'scalar' && (t.scalar === 'u64' || t.scalar === 'i64');
    const sized = t.kind === 'string' || t.kind === 'bytes' || t.kind === 'typedArray' || t.kind === 'array';
    let ok = true;
    const bad = (message: string) => { this.fail(ctx, message); ok = false; };
    for (const [name, v] of Object.entries(raw)) {
      if (v === null) { bad(`${ruleName(name)} needs a literal argument`); continue; }
      switch (name) {
        case 'min': case 'max':
          if (!numeric) bad(`${ruleName(name)} applies to numbers and bigints`);
          else if (wide ? typeof v !== 'bigint' && typeof v !== 'number' : typeof v !== 'number') bad(`${ruleName(name)} on a number takes a number literal`);
          else if (typeof v === 'number' && !Number.isFinite(v)) bad(`${ruleName(name)} takes a finite number`);
          else if (wide && typeof v === 'number' && !Number.isInteger(v)) bad(`${ruleName(name)} on a 64-bit integer takes an integer`);
          else rules[name] = wide ? BigInt(v).toString() : (v as number);
          break;
        case 'minLength': case 'maxLength':
          if (!sized) bad(`${ruleName(name)} applies to strings, arrays and typed arrays`);
          else if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) bad(`${ruleName(name)} takes a non-negative integer`);
          else rules[name] = v;
          break;
        case 'pattern':
          if (t.kind !== 'string') bad('Pattern applies to strings');
          else if (typeof v !== 'string') bad('Pattern takes a string literal');
          else {
            try { new RegExp(v); rules.pattern = v; } catch (e) { bad(`Pattern is not a valid regular expression: ${(e as Error).message}`); }
          }
          break;
        default: bad(`unknown rule '${name}'`);
      }
    }
    const num = (x: number | string) => (wide ? BigInt(x) : Number(x));
    if (rules.min !== undefined && rules.max !== undefined && num(rules.min) > num(rules.max)) bad('Min is greater than Max');
    if (rules.minLength !== undefined && rules.maxLength !== undefined && rules.minLength > rules.maxLength) bad('MinLength is greater than MaxLength');
    // Checks run on the decoded value, so they go on any type, objects included.
    for (const name of checks) {
      if (name === null) bad('Check needs a string literal argument');
      else if (!CHECK_NAME.test(name)) bad(`Check name '${name}' must be an identifier`);
      else (rules.checks ??= []).includes(name) || rules.checks.push(name);
    }
    if (!ok) return undefined;
    const prev = (t as { rules?: Rules }).rules;
    const merged: Rules = { ...prev, ...rules };
    if (prev?.checks && rules.checks) merged.checks = [...new Set([...prev.checks, ...rules.checks])];
    return { ...t, rules: merged } as IRType;
  }

  // Unions without null/undefined: booleans, string literal enums, discriminated unions of objects.
  private multi(whole: TypeRef, members: TypeRef[], alias: string | undefined, ctx: Ctx): IRType | undefined {
    const known = this.memo.get(whole.id);
    if (known) return known;
    const ds = members.map((m) => this.src.describe(m));
    // `boolean & Max<1>` reaches here as `(false & Max<1>) | (true & Max<1>)`
    if (ds.some((d) => d.rules || d.checks)) { this.fail(ctx, `rules and checks do not apply to '${this.src.text(whole)}'; TypeScript splits it into a union`); return undefined; }
    if (ds.every((d) => d.k === 'literal' && typeof d.value === 'boolean')) return { kind: 'scalar', scalar: 'bool' };

    if (ds.every((d) => d.k === 'literal' && typeof d.value === 'string')) {
      const name = this.claim(alias ?? ctx.anon, whole.id, ctx);
      const values = ds.map((d) => (d as { value: string }).value).sort();
      this.schema.enums[name] = { name, values };
      const t: IRType = { kind: 'enum', name };
      this.memo.set(whole.id, t);
      return t;
    }

    if (ds.every((d) => d.k === 'object')) {
      const objs = ds as Extract<Desc, { k: 'object' }>[];
      const disc = findDiscriminant(this.src, objs);
      if (!disc) {
        this.fail(ctx, `union of objects needs a discriminant: a field present in every variant with distinct string literal values ('${this.src.text(whole)}')`);
        return undefined;
      }
      const name = this.claim(alias ?? ctx.anon, whole.id, ctx);
      const t: IRType = { kind: 'union', name };
      this.memo.set(whole.id, t);
      const variants = members.map((m, i) => {
        const tag = disc.tags[i];
        const obj = this.type(m, { path: `${ctx.path} (${tag})`, anon: `${name}#${tag}`, location: ctx.location });
        return { tag, object: obj?.kind === 'object' ? obj.name : '' };
      }).sort((a, b) => (a.tag < b.tag ? -1 : 1));
      this.schema.unions[name] = { name, discriminant: disc.field, variants };
      return t;
    }

    if (ds.every((d) => d.k === 'literal' && typeof d.value === 'number')) {
      this.fail(ctx, `numeric literal unions are not supported yet ('${this.src.text(whole)}'); use string literals or a numeric brand`);
    } else {
      this.fail(ctx, `union '${this.src.text(whole)}' is not serializable; supported: string literal unions, discriminated unions of objects, T | null, T | undefined`);
    }
    return undefined;
  }

  private object(ref: TypeRef, d: Extract<Desc, { k: 'object' }>, ctx: Ctx): IRType | undefined {
    const known = this.memo.get(ref.id);
    if (known) return known;
    if (d.indexSignature) {
      this.fail(ctx, `index signatures and Record<string, T> are not supported yet ('${this.src.text(ref)}')`);
      return undefined;
    }
    const name = this.claim(d.name ?? ctx.anon, ref.id, ctx, d.location);
    const t: IRType = { kind: 'object', name };
    this.memo.set(ref.id, t); // before the fields: recursive types refer back by name
    const def: ObjectDef = { name, fields: [], location: d.location };
    this.schema.objects[name] = def;
    for (const p of d.props) {
      const f = this.field(p, name);
      if (f) def.fields.push(f);
    }
    return t;
  }

  private field(p: PropDesc, owner: string): Field | undefined {
    const ctx: Ctx = { path: `${owner}.${p.name}`, anon: `${owner}.${p.name}`, location: p.location };
    if (p.name.startsWith('__@')) { this.fail(ctx, 'symbol-keyed properties are not serializable'); return undefined; }
    const r = this.slot(p.type, ctx);
    if (!r) return undefined;
    return { name: p.name, type: r.type, optional: r.optional || p.optional, nullable: r.nullable, renamedFrom: p.renamedFrom, location: p.location };
  }

  // Names are the identity of types in the lockfile: two different types may not share one.
  private claim(name: string, id: number, ctx: Ctx, location = ctx.location): string {
    const prev = this.owners.get(name);
    if (prev && prev.id !== id) {
      const where = prev.location ? ` (other one at ${prev.location.file}:${prev.location.line})` : '';
      this.fail(ctx, `two different types are named '${name}'${where}; rename one of them`, location);
    } else if (!prev) {
      this.owners.set(name, { id, location });
    }
    return name;
  }
}

const CHECK_NAME = /^[A-Za-z_$][\w$]*$/;

function ruleName(k: string): string {
  return k[0].toUpperCase() + k.slice(1);
}

function isNullish(d: Desc): boolean {
  return d.k === 'undefined' || d.k === 'null' || d.k === 'void';
}

function findDiscriminant(src: TypeSource, objs: Extract<Desc, { k: 'object' }>[]): { field: string; tags: string[] } | undefined {
  const candidates = objs[0].props.map((p) => p.name);
  for (const field of candidates) {
    const tags: string[] = [];
    for (const o of objs) {
      const p = o.props.find((x) => x.name === field);
      const d = p && !p.optional ? src.describe(p.type) : undefined;
      if (d?.k !== 'literal' || typeof d.value !== 'string') break;
      tags.push(d.value);
    }
    if (tags.length === objs.length && new Set(tags).size === tags.length) return { field, tags };
  }
  return undefined;
}

export function buildSchema(src: TypeSource, routerFile: string, exportName: string): { schema: Schema; errors: SchemaError[] } {
  const b = new Builder(src);
  for (const entry of src.router(routerFile, exportName)) b.procedure(entry);
  b.schema.procedures.sort((x, y) => (x.path < y.path ? -1 : 1));
  return { schema: b.schema, errors: b.errors };
}
