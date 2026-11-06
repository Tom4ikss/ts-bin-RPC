// The input of a procedure as a Standard Schema (DESIGN §20), for forms: the shape, the rules, and
// the checks and refinements you give it, from `inputRules` in the generated code. Unlike the
// server, which stops at the first broken rule, it reports every issue, with the same texts.
//   inputSchema(inputRules['user.create'], { checks: formats })
// A module of its own: a client that does not import it carries neither it nor `inputRules`.
import { isRecord, locate, RULE_TEXT, show, type InputRules, type SchemaDesc, type TypeDesc, type TypeRules } from './runtime.ts';
import type { InputIssue as Base, StandardSchemaV1, Validator } from './validate.ts';

/** An issue: what is wrong and where, as the server's `BAD_INPUT` data. Here `path` and `field` are always there. */
export type InputIssue = Base & { readonly path: readonly PropertyKey[]; readonly field: string };

export type InputResult<T> = { readonly value: T; readonly issues?: undefined } | { readonly issues: readonly InputIssue[] };

/** A Standard Schema v1 of an input: Zod's and Valibot's place in TanStack Form, react-hook-form… */
export interface InputSchema<T> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'ts-bin-rpc';
    /** Synchronous unless a check or a refinement returns a promise. */
    validate(value: unknown): InputResult<T> | Promise<InputResult<T>>;
    readonly types?: { readonly input: T; readonly output: T };
  };
}

export interface InputSchemaOptions {
  /**
   * Implementations of `Check<'name'>`, as in `createHandler`. A check without one is left to the
   * server: checks that need the server's data do not belong on the client.
   */
  checks?: Record<string, Validator>;
  /** Refinements by type name, as in `createHandler`; types without one are left to the server. */
  refine?: Record<string, Validator>;
  /** Your text for an issue, say in the user's language; `undefined` keeps the default. */
  message?: (issue: InputIssue) => string | undefined;
}

type Path = PropertyKey[];
type Verdict = boolean | string | void;
/** Issues, or a promise of them while an async check runs. */
type Found = InputIssue[] | Promise<InputIssue[]>;

const then = (f: Found, next: (issues: InputIssue[]) => Found): Found => (f instanceof Promise ? f.then(next) : next(f));
/** The issues of every part, in order. */
const all = (parts: Found[]): Found => (parts.some((p) => p instanceof Promise) ? Promise.all(parts).then((xs) => xs.flat()) : (parts as InputIssue[][]).flat());

const patterns = new Map<string, RegExp>();

/** The input of a procedure as a Standard Schema: `inputSchema(inputRules['user.create'], { checks: formats })`. */
export function inputSchema<T>(rules: InputRules<T>, options: InputSchemaOptions = {}): InputSchema<T> {
  const { schema, type, optional } = rules;
  const ctx: Walk = { schema, checks: options.checks ?? {}, refine: options.refine ?? {} };
  const say = options.message;
  const validate = (value: unknown) => {
    const found = optional && value === undefined ? [] : walk(ctx, type, value, 'input', []);
    const done = (issues: InputIssue[]): InputResult<T> => {
      if (!issues.length) return { value: value as T };
      return { issues: say ? issues.map((i) => ({ ...i, message: say(i) ?? i.message })) : issues };
    };
    return found instanceof Promise ? found.then(done) : done(found);
  };
  return { '~standard': { version: 1, vendor: 'ts-bin-rpc', validate } };
}

interface Walk {
  schema: SchemaDesc;
  checks: Record<string, Validator>;
  refine: Record<string, Validator>;
}

/**
 * The issues of `v` as a `t`: its shape, its parts, its own rules, then its checks and refinements.
 * Checks run on a value whose parts are clean, and refinements after its checks pass, as on the
 * server: a refinement of a date range may count on valid dates.
 */
function walk(w: Walk, t: TypeDesc, v: unknown, field: string, path: Path): Found {
  const wrong = (expected: string, at = path, got = v): Found => [{ message: `expected ${expected}, got ${show(got)}`, path: at, field, rule: 'type' }];
  const parts: Found[] = [];
  const fields = (name: string) => {
    for (const f of w.schema.objects[name]) {
      const fv = (v as Record<string, unknown>)[f.name];
      if (!(fv == null && (f.optional || f.nullable))) parts.push(walk(w, f.type, fv, `${name}.${f.name}`, [...path, f.name]));
    }
  };

  let object: string | undefined;
  switch (t.kind) {
    case 'array':
      if (!Array.isArray(v)) return wrong('array');
      v.forEach((x, i) => parts.push(walk(w, t.element, x, `${field}[]`, [...path, i])));
      break;
    case 'object':
      if (typeof v !== 'object' || v === null) return wrong(t.name);
      fields((object = t.name));
      break;
    case 'union': {
      if (typeof v !== 'object' || v === null) return wrong(t.name);
      const u = w.schema.unions[t.name];
      const tag = (v as Record<string, unknown>)[u.discriminant];
      object = typeof tag === 'string' ? u.variants[tag] : undefined;
      if (object === undefined) return wrong(`${t.name} variant (${Object.keys(u.variants).map((x) => JSON.stringify(x)).join(' | ')})`, [...path, u.discriminant], tag);
      fields(object);
      break;
    }
    case 'map': {
      if (t.record ? !isRecord(v) : !(v instanceof Map)) return wrong(t.record ? 'Record' : 'Map');
      const entries: Iterable<[unknown, unknown]> = t.record ? Object.entries(v as object) : (v as Map<unknown, unknown>);
      for (const [k, x] of entries) {
        const at = [...path, k as PropertyKey];
        parts.push(walk(w, t.key, k, `${field}[key]`, at), walk(w, t.value, x, `${field}[value]`, at));
      }
      break;
    }
    case 'tuple':
      if (!Array.isArray(v) || v.length !== t.elements.length) return wrong(`tuple of ${t.elements.length}`);
      t.elements.forEach((e, i) => {
        if (!(v[i] == null && (e.optional || e.nullable))) parts.push(walk(w, e.type, v[i], `${field}[${i}]`, [...path, i]));
      });
      break;
    default: {
      const m = locate(w.schema, t, v);
      if (m) return wrong(m.expected);
    }
  }
  if (t.rules) parts.push(broken(t.rules, v, field, path));

  const checks = (t.checks ?? []).filter((c) => c in w.checks);
  const refined = (t.kind === 'union' ? [object!, t.name] : object !== undefined ? [object] : []).filter((n) => n in w.refine);
  if (!checks.length && !refined.length) return all(parts);
  return then(all(parts), (found) => {
    if (found.length) return found;
    const own = all(checks.map((c) => task(w.checks[c], v, { path, field, rule: 'check', name: c })));
    // refinements one after another, as each may count on the one before (a variant, then its union)
    return then(own, (failed) => refined.reduce<Found>((f, n) => then(f, (x) => (x.length ? x : task(w.refine[n], v, { path, field: n, rule: 'refine', name: n }))), failed));
  });
}

function broken(r: TypeRules, v: unknown, field: string, path: Path): InputIssue[] {
  const out: InputIssue[] = [];
  const broke = (rule: InputIssue['rule'], limit: number | string) => out.push({ message: RULE_TEXT[rule](limit), path, field, rule, limit });
  if (r.min !== undefined || r.max !== undefined) {
    // `!(v >= min)`: NaN breaks both, as on the server
    const big = typeof v === 'bigint', n = v as number;
    if (r.min !== undefined && !(n >= (big ? BigInt(r.min) : Number(r.min)))) broke('min', r.min);
    if (r.max !== undefined && !(n <= (big ? BigInt(r.max) : Number(r.max)))) broke('max', r.max);
  }
  const len = (v as { length: number }).length;
  if (r.minLength !== undefined && len < r.minLength) broke('minLength', r.minLength);
  if (r.maxLength !== undefined && len > r.maxLength) broke('maxLength', r.maxLength);
  if (r.pattern !== undefined) {
    let re = patterns.get(r.pattern);
    if (!re) patterns.set(r.pattern, (re = new RegExp(r.pattern)));
    if (!re.test(v as string)) broke('pattern', r.pattern);
  }
  return out;
}

/** Runs a check or a refinement: synchronously, unless it returns a promise. */
function task(run: Validator, v: unknown, base: Omit<InputIssue, 'message'>): Found {
  if (typeof run === 'function') {
    const verdict = run(v);
    const judge = (x: Verdict): InputIssue[] => (x === true || x === undefined ? [] : [{ ...base, message: x === false ? `is not a valid ${base.name}` : x }]);
    return verdict instanceof Promise ? verdict.then(judge) : judge(verdict);
  }
  const result = (run as StandardSchemaV1)['~standard'].validate(v);
  const judge = (x: Awaited<typeof result>): InputIssue[] => {
    if (!x.issues) return [];
    const first = x.issues[0];
    const at = (first?.path ?? []).map((p) => (typeof p === 'object' ? p.key : p));
    return [{ ...base, path: [...base.path, ...at], message: first?.message ?? 'is invalid' }];
  };
  return result instanceof Promise ? result.then(judge) : judge(result);
}
