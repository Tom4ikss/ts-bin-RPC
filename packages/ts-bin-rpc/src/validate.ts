// Checks (`Check<'email'>`) and refinements by type name: run by the server on a decoded input,
// after the verifier has checked its shape and rules. A walk over the value along the schema
// description in the generated code, only into the parts that reach something to run.
import type { SchemaDesc, TypeDesc } from './runtime.ts';

/** Standard Schema v1 (Zod, Valibot, ArkType…), the parts used here. */
export interface StandardSchemaV1 {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    validate(value: unknown): StandardResult | Promise<StandardResult>;
  };
}

type StandardResult =
  | { readonly value?: unknown; readonly issues?: undefined }
  | { readonly issues: readonly { readonly message: string; readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] }[] };

type Verdict = boolean | string | void;

/** `true` or nothing passes; `false` fails; a string fails with that message. */
export type CheckFn<T = any> = (value: T) => Verdict | Promise<Verdict>;

/** A function or a Standard Schema. A schema's output value is not used: refinements do not transform. */
export type Validator<T = any> = CheckFn<T> | StandardSchemaV1;

/** A failed check or refinement; the server sends it as the data of `400 BAD_INPUT`. */
export interface Failure {
  /** Where the check is declared: `Signup.email`, `Signup.tags[]`, `input`; for a refinement, the type. */
  field: string;
  rule: 'check' | 'refine';
  /** Name of the check, or of the refined type. */
  name: string;
  /** Path of the value in the input, `members[3].email`; `''` for the input itself. */
  path: string;
  message: string;
}

/** Runs the checks and refinements of one procedure's input; resolves with the first failure. */
export type InputValidation = (input: unknown) => Promise<Failure | null>;

interface Task {
  run: Validator;
  value: unknown;
  rule: Failure['rule'];
  name: string;
  field: string;
  path: string;
}

export class Validation {
  readonly #checks: Record<string, Validator>;
  readonly #refine: Record<string, Validator>;
  /** Refined types that some input reaches; refine keys outside it are mistakes. */
  readonly #refined = new Set<string>();

  constructor(checks: Record<string, Validator> = {}, refine: Record<string, Validator> = {}) {
    this.#checks = checks;
    this.#refine = refine;
  }

  get empty(): boolean {
    return Object.keys(this.#checks).length === 0 && Object.keys(this.#refine).length === 0;
  }

  /** Validation of the input `type`, or null when nothing in it has a check or a refinement. */
  plan(schema: SchemaDesc, type: TypeDesc): InputValidation | null {
    const reaches = new Map<string, boolean>();
    const named = (name: string): boolean => {
      const known = reaches.get(name);
      if (known !== undefined) return known;
      reaches.set(name, false); // a cycle reaches nothing new through itself
      let r = name in this.#refine;
      if (r) this.#refined.add(name);
      const u = schema.unions[name];
      if (u) for (const v of Object.values(u.variants)) r = named(v) || r;
      else for (const f of schema.objects[name] ?? []) r = needs(f.type, `${name}.${f.name}`) || r;
      reaches.set(name, r);
      return r;
    };
    const needs = (t: TypeDesc, field: string): boolean => {
      let r = false;
      for (const c of t.checks ?? []) {
        if (!(c in this.#checks)) throw new Error(`check '${c}' on ${field} has no implementation; pass it in createHandler({ checks }), the formats come from 'ts-bin-rpc/formats'`);
        r = true;
      }
      if (t.kind === 'array') r = needs(t.element, `${field}[]`) || r;
      if (t.kind === 'object' || t.kind === 'union') r = named(t.name) || r;
      return r;
    };
    if (!needs(type, 'input')) return null;

    return async (input) => {
      const tasks: Task[] = [];
      const walk = (t: TypeDesc, v: unknown, field: string, path: string) => {
        if (t.kind === 'array' && Array.isArray(v) && needs(t.element, `${field}[]`)) {
          for (let i = 0; i < v.length; i++) walk(t.element, v[i], `${field}[]`, `${path}[${i}]`);
        }
        let object = t.kind === 'object' ? t.name : undefined;
        if (t.kind === 'union') {
          const u = schema.unions[t.name];
          object = u.variants[(v as Record<string, string>)[u.discriminant]];
        }
        if (object !== undefined && named(object)) {
          for (const f of schema.objects[object]) {
            const fv = (v as Record<string, unknown>)[f.name];
            if (fv != null) walk(f.type, fv, `${object}.${f.name}`, path ? `${path}.${f.name}` : f.name);
          }
        }
        // a value's own checks and refinements run after those of its parts
        for (const c of t.checks ?? []) tasks.push({ run: this.#checks[c], value: v, rule: 'check', name: c, field, path });
        for (const name of t.kind === 'union' ? [object!, t.name] : object !== undefined ? [object] : []) {
          if (name in this.#refine) tasks.push({ run: this.#refine[name], value: v, rule: 'refine', name, field: name, path });
        }
      };
      walk(type, input, 'input', '');
      for (const task of tasks) {
        const failure = await run(task);
        if (failure) return failure;
      }
      return null;
    };
  }

  /** Refinement keys that name no type of any input planned so far. */
  unused(): string[] {
    return Object.keys(this.#refine).filter((name) => !this.#refined.has(name));
  }
}

async function run(task: Task): Promise<Failure | null> {
  const { run, rule, name, field, path } = task;
  const fail = (message: string, at = path): Failure => ({ field, rule, name, path: at, message });
  if (typeof run !== 'function') {
    const result = await run['~standard'].validate(task.value);
    if (!result.issues) return null;
    const issue = result.issues[0];
    let at = path;
    for (const p of issue?.path ?? []) {
      const key = typeof p === 'object' ? p.key : p;
      at = typeof key === 'number' ? `${at}[${key}]` : at ? `${at}.${String(key)}` : String(key);
    }
    return fail(issue?.message ?? 'is invalid', at);
  }
  const verdict = await run(task.value);
  if (verdict === true || verdict === undefined) return null;
  if (verdict === false) return fail(`is not a valid ${name}`);
  return fail(verdict);
}
