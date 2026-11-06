// Lockfile v0: owns wire IDs of fields, enum values and union variants, and records the last generated
// contract so `check` can classify what changed. Names are not on the wire; IDs are.
import { fieldSignature, signature, type IRType, type Location, type Schema } from './ir.ts';

export interface LockField {
  id: number;
  type: string; // fieldSignature
  retired?: true;
}

export interface LockObject {
  fields: Record<string, LockField>;
  retired?: true; // no longer reachable from the router; IDs are kept in case it comes back
}

export interface LockEnum {
  values: string[]; // index = wire value
  retired?: string[];
  /** Indexes take 2 bytes: past 256 values. Fixed here, so that both sides of a call agree on it. */
  wide?: true;
}

export interface LockUnion {
  discriminant: string;
  variants: { tag: string; object: string; retired?: true }[]; // index = wire tag
}

export interface Lock {
  format: 0;
  procedures: Record<string, { input: string; output: string }>;
  objects: Record<string, LockObject>;
  enums: Record<string, LockEnum>;
  unions: Record<string, LockUnion>;
}

export type Severity = 'safe' | 'breaking' | 'error';

export interface Change {
  severity: Severity; // error: cannot be applied even with --allow-breaking
  path: string;
  message: string;
  location?: Location;
}

export function emptyLock(): Lock {
  return { format: 0, procedures: {}, objects: {}, enums: {}, unions: {} };
}

export function parseLock(text: string): Lock {
  const lock = JSON.parse(text) as Lock;
  if (lock.format !== 0) throw new Error(`unsupported lockfile format ${String(lock.format)}`);
  return { ...emptyLock(), ...lock };
}

// One leaf per line (a field, an enum, a variant) so lockfile diffs read like the contract diff.
export function stringifyLock(lock: Lock): string {
  return compact(lock, '') + '\n';
}

function compact(v: unknown, indent: string): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const entries: [string | null, unknown][] = Array.isArray(v) ? v.map((x) => [null, x]) : Object.entries(v);
  const open = Array.isArray(v) ? '[' : '{', close = Array.isArray(v) ? ']' : '}';
  if (!entries.length) return open + close;
  const leaf = entries.every(([, x]) => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((y) => typeof y !== 'object')));
  const item = ([k, x]: [string | null, unknown], ind: string) => (k === null ? '' : JSON.stringify(k) + ': ') + compact(x, ind);
  if (leaf) return open + (Array.isArray(v) ? '' : ' ') + entries.map((e) => item(e, '')).join(', ') + (Array.isArray(v) ? '' : ' ') + close;
  const inner = indent + '  ';
  return open + '\n' + entries.map((e) => inner + item(e, inner)).join(',\n') + '\n' + indent + close;
}

// Which named types are reachable from procedure inputs and outputs. Direction decides whether a change
// breaks old peers: a new required field breaks old clients sending it, a removed one breaks old clients reading it.
function usage(schema: Schema) {
  const input = new Set<string>(), output = new Set<string>();
  const walk = (t: IRType | null, seen: Set<string>) => {
    if (!t) return;
    if (t.kind === 'array') return walk(t.element, seen);
    if (t.kind === 'map' || t.kind === 'tuple') return walk({ kind: 'object', name: t.object }, seen);
    if (t.kind !== 'object' && t.kind !== 'enum' && t.kind !== 'union') return;
    if (seen.has(t.name)) return;
    seen.add(t.name);
    if (t.kind === 'object') for (const f of schema.objects[t.name]?.fields ?? []) walk(f.type, seen);
    if (t.kind === 'union') for (const v of schema.unions[t.name]?.variants ?? []) walk({ kind: 'object', name: v.object }, seen);
  };
  for (const p of schema.procedures) {
    walk(p.input, input);
    walk(p.output, output);
    if (p.live) walk({ kind: 'object', name: p.live.delta }, output);
  }
  return { input, output };
}

export function updateLock(prev: Lock, schema: Schema): { lock: Lock; changes: Change[] } {
  const changes: Change[] = [];
  const { input, output } = usage(schema);
  const add = (severity: Severity, path: string, message: string, location?: Location) =>
    changes.push({ severity, path, message, location });
  const dir = (name: string) => [input.has(name) && 'input', output.has(name) && 'output'].filter(Boolean).join(' and ');

  const next = emptyLock();

  // Procedures
  for (const p of schema.procedures) {
    const out = p.output ? signature(p.output) : 'void';
    const sig = { input: p.input ? signature(p.input) + (p.inputOptional ? '?' : '') : 'void', output: p.live ? `live ${out} by ${p.live.key}` : p.stream ? `stream ${out}` : out };
    next.procedures[p.path] = sig;
    const old = prev.procedures[p.path];
    if (!old) add('safe', p.path, 'procedure added', p.location);
    else {
      if (old.input !== sig.input) add(compatibleInput(old.input, sig.input) ? 'safe' : 'breaking', p.path, `input changed: ${old.input} -> ${sig.input}`, p.location);
      if (old.output !== sig.output) add('breaking', p.path, `output changed: ${old.output} -> ${sig.output}`, p.location);
    }
  }
  for (const path of Object.keys(prev.procedures)) {
    if (!next.procedures[path]) add('breaking', path, 'procedure removed');
  }

  // Objects
  for (const name of Object.keys(schema.objects).sort()) {
    const def = schema.objects[name];
    // a patch is its row with fields made optional: it has the row's IDs and no entry of its own
    if (def.synthetic === 'patch') continue;
    const old = prev.objects[name];
    const fields: Record<string, LockField> = {};
    if (!old) {
      def.fields.forEach((f, id) => (fields[f.name] = { id, type: fieldSignature(f) }));
      next.objects[name] = { fields };
      // a map, a tuple or a delta is reported where it is used: its object is named after its type
      if (!def.synthetic) add('safe', name, 'type added', def.location);
      continue;
    }
    const dup = duplicateIds(old);
    if (dup !== undefined) {
      add('error', name, `lockfile is corrupted: id ${dup} is used by more than one field; restore it from git`);
      next.objects[name] = old;
      continue;
    }
    let nextId = Math.max(-1, ...Object.values(old.fields).map((f) => f.id)) + 1;
    const oldFields = { ...old.fields };
    const claimed = new Set<string>();
    const added: { name: string; sig: string; optional: boolean; location?: Location }[] = [];
    const declared = new Set(def.fields.map((f) => f.name));
    const renames = new Map<string, string>();

    for (const f of def.fields) {
      const sig = fieldSignature(f);
      const path = `${name}.${f.name}`;
      let entry = oldFields[f.name];
      if (!entry && f.renamedFrom) {
        const from = oldFields[f.renamedFrom];
        // two live fields on one ID would read each other's bytes
        if (declared.has(f.renamedFrom)) add('error', path, `@renamedFrom ${f.renamedFrom}: '${f.renamedFrom}' is still declared; remove it, or drop the tag to add a new field`, f.location);
        else if (renames.has(f.renamedFrom)) add('error', path, `@renamedFrom ${f.renamedFrom}: '${renames.get(f.renamedFrom)}' is renamed from it too`, f.location);
        else if (!from) add('error', path, `@renamedFrom ${f.renamedFrom}: ${name} has no field '${f.renamedFrom}' in the lockfile`, f.location);
        else if (!from.retired) {
          entry = from;
          claimed.add(f.renamedFrom);
          add('safe', path, `renamed from '${f.renamedFrom}', keeps id ${from.id}`, f.location);
        }
        renames.set(f.renamedFrom, f.name);
      }
      if (!entry) {
        fields[f.name] = { id: nextId++, type: sig };
        added.push({ name: f.name, sig, optional: f.optional, location: f.location });
        continue;
      }
      claimed.add(f.name);
      if (entry.retired) {
        if (entry.type !== sig) {
          add('error', path, `'${f.name}' was removed earlier with type ${entry.type} (id ${entry.id}); old peers may still send it. Use another name`, f.location);
          fields[f.name] = entry;
          continue;
        }
        add('safe', path, `restored with its old id ${entry.id}`, f.location);
      } else if (entry.type !== sig) {
        const required = (t: string) => t.replace(/ \| undefined$/, '');
        if (required(entry.type) === required(sig)) {
          // same bytes when present; only who may omit it changed
          const nowOptional = sig.endsWith('| undefined');
          const breaks = nowOptional ? output.has(name) : input.has(name);
          const why = nowOptional ? `; old clients expect it in ${dir(name)}` : `; old clients may omit it in ${dir(name)}`;
          add(breaks ? 'breaking' : 'safe', path, `became ${nowOptional ? 'optional' : 'required'}${breaks ? why : ''}`, f.location);
        } else {
          // A new ID: an old peer then sees the field missing instead of reading its bytes as the old
          // type. The old ID stays reserved under `name@id`.
          const id = nextId++;
          add('breaking', path, `type changed: ${entry.type} -> ${sig}; new id ${id}, old peers see the field missing`, f.location);
          fields[`${f.name}@${entry.id}`] = { ...entry, retired: true };
          fields[f.name] = { id, type: sig };
          continue;
        }
      }
      fields[f.name] = { id: entry.id, type: sig };
    }

    const removed: { name: string; entry: LockField }[] = [];
    for (const [fname, entry] of Object.entries(oldFields)) {
      if (claimed.has(fname)) continue;
      fields[fname] = { ...entry, retired: true };
      if (!entry.retired) removed.push({ name: fname, entry });
    }

    const addBreaks = (a: (typeof added)[number]) => !a.optional && input.has(name);
    const removeBreaks = (r: (typeof removed)[number]) => !r.entry.type.endsWith('| undefined') && output.has(name);
    for (const a of added) {
      const path = `${name}.${a.name}`;
      const twin = removed.find((r) => r.entry.type === a.sig);
      if (twin) {
        removed.splice(removed.indexOf(twin), 1);
        const severity = addBreaks(a) || removeBreaks(twin) ? 'breaking' : 'safe';
        add(severity, path, `'${twin.name}' removed and '${a.name}' added with the same type; if this is a rename, add /** @renamedFrom ${twin.name} */ to keep id ${twin.entry.id}`, a.location);
      } else if (addBreaks(a)) {
        add('breaking', path, `required field added to a type used in ${dir(name)}; old clients do not send it`, a.location);
      } else {
        add('safe', path, 'field added', a.location);
      }
    }
    for (const r of removed) {
      const path = `${name}.${r.name}`;
      if (removeBreaks(r)) add('breaking', path, `required field removed from a type used in ${dir(name)}; old clients expect it`);
      else add('safe', path, 'field removed');
    }

    next.objects[name] = { fields: sortById(fields) };
  }
  for (const [name, old] of Object.entries(prev.objects)) {
    if (!next.objects[name]) next.objects[name] = { ...old, retired: true };
  }

  // Enums: values append, removed ones keep their index
  for (const name of Object.keys(schema.enums).sort()) {
    const now = schema.enums[name].values;
    const old = prev.enums[name];
    if (!old) {
      if (now.length > 0x10000) add('error', name, 'more than 65536 values');
      next.enums[name] = now.length > 256 ? { values: [...now], wide: true } : { values: [...now] };
      continue;
    }
    const values = [...old.values];
    const retired = new Set(old.retired ?? []);
    for (const v of now) {
      if (!values.includes(v)) {
        values.push(v);
        add(output.has(name) ? 'breaking' : 'safe', name, `value '${v}' added${output.has(name) ? `; old clients cannot read it in ${dir(name)}` : ''}`);
      } else if (retired.delete(v)) {
        add('safe', name, `value '${v}' restored`);
      }
    }
    for (const v of values) {
      if (!now.includes(v) && !retired.has(v)) {
        retired.add(v);
        add(input.has(name) ? 'breaking' : 'safe', name, `value '${v}' removed${input.has(name) ? `; old clients may still send it in ${dir(name)}` : ''}`);
      }
    }
    // lockfiles before 0.6 kept no width: it was 2 bytes past 256 values then too
    const wasWide = old.wide || old.values.length > 256;
    if (!wasWide && values.length > 256) add('breaking', name, 'past 256 values: indexes go from 1 byte to 2, old clients misread them');
    if (values.length > 0x10000) add('error', name, 'more than 65536 values, removed ones included');
    next.enums[name] = { values, ...(retired.size ? { retired: values.filter((v) => retired.has(v)) } : {}), ...(wasWide || values.length > 256 ? { wide: true as const } : {}) };
  }
  for (const [name, old] of Object.entries(prev.enums)) if (!next.enums[name]) next.enums[name] = old;

  // Unions: same rules as enums, tags are the values
  for (const name of Object.keys(schema.unions).sort()) {
    const u = schema.unions[name];
    const old = prev.unions[name];
    if (!old) {
      if (u.variants.length > 256) add('error', name, 'more than 256 variants');
      next.unions[name] = { discriminant: u.discriminant, variants: u.variants.map((v) => ({ ...v })) };
      continue;
    }
    if (old.discriminant !== u.discriminant) add('breaking', name, `discriminant changed: ${old.discriminant} -> ${u.discriminant}`);
    const variants = old.variants.map((v) => ({ ...v }));
    for (const v of u.variants) {
      const prevV = variants.find((x) => x.tag === v.tag);
      if (!prevV) {
        variants.push({ ...v });
        add(output.has(name) ? 'breaking' : 'safe', name, `variant '${v.tag}' added${output.has(name) ? `; old clients cannot read it in ${dir(name)}` : ''}`);
        continue;
      }
      if (prevV.retired) {
        delete prevV.retired;
        add('safe', name, `variant '${v.tag}' restored`);
      }
      if (prevV.object !== v.object) {
        add('breaking', name, `variant '${v.tag}' changed: object ${prevV.object} -> object ${v.object}`);
        prevV.object = v.object;
      }
    }
    for (const v of variants) {
      if (!v.retired && !u.variants.some((x) => x.tag === v.tag)) {
        v.retired = true;
        add(input.has(name) ? 'breaking' : 'safe', name, `variant '${v.tag}' removed${input.has(name) ? `; old clients may still send it in ${dir(name)}` : ''}`);
      }
    }
    if (variants.length > 256) add('error', name, 'more than 256 variants, removed ones included');
    next.unions[name] = { discriminant: u.discriminant, variants };
  }
  for (const [name, old] of Object.entries(prev.unions)) if (!next.unions[name]) next.unions[name] = old;

  const fresh = !Object.keys(prev.procedures).length && !Object.keys(prev.objects).length;
  return { lock: next, changes: fresh ? changes.filter((c) => c.severity === 'error') : changes };
}

// `void` -> `T?` and `T` -> `T?` accept every old call.
function compatibleInput(old: string, now: string): boolean {
  return now.endsWith('?') && (old === 'void' || old === now.slice(0, -1));
}

function duplicateIds(o: LockObject): number | undefined {
  const seen = new Set<number>();
  for (const f of Object.values(o.fields)) {
    if (seen.has(f.id)) return f.id;
    seen.add(f.id);
  }
  return undefined;
}

function sortById(fields: Record<string, LockField>): Record<string, LockField> {
  return Object.fromEntries(Object.entries(fields).sort((a, b) => a[1].id - b[1].id));
}
