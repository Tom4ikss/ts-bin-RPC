import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildSchema } from '../src/build.ts';
import { emptyLock, stringifyLock, updateLock, type Change, type Lock } from '../src/lock.ts';
import { formatLocation, type Schema } from '../src/ir.ts';
import { printErrors, printSchema } from '../src/print.ts';
import { Ts71Source } from '../src/source.ts';

const fixture = (...p: string[]) => path.join(import.meta.dirname, 'fixtures', ...p);
const snapshot = (name: string) => path.join(import.meta.dirname, '__snapshots__', name);

const sources: Ts71Source[] = [];
function open(name: string): Ts71Source {
  const src = new Ts71Source(fixture(name, 'tsconfig.json'));
  sources.push(src);
  return src;
}
afterAll(() => sources.forEach((s) => s.close()));

function printChanges(changes: Change[]): string {
  return changes.map((c) => `${c.severity.padEnd(8)} ${c.path}: ${c.message}${c.location ? `  (${formatLocation(c.location)})` : ''}`).join('\n') + '\n';
}

describe('schema', () => {
  it('compiles every supported construct', async () => {
    const { schema, errors } = buildSchema(open('supported'), fixture('supported', 'router.ts'), 'appRouter');
    expect(printErrors(errors)).toBe('\n');
    await expect(printSchema(schema)).toMatchFileSnapshot(snapshot('supported.schema.txt'));
    await expect(stringifyLock(updateLock(emptyLock(), schema).lock)).toMatchFileSnapshot(snapshot('supported.lock.json'));
  });

  it('rejects unsupported constructs, all at once, with locations', async () => {
    const { errors } = buildSchema(open('rejected'), fixture('rejected', 'router.ts'), 'appRouter');
    await expect(printErrors(errors)).toMatchFileSnapshot(snapshot('rejected.errors.txt'));
  });
});

describe('type names', () => {
  it('come from the place in the contract and the arguments of generic aliases, not from the order of procedures', () => {
    const src = open('naming');
    const v1 = buildSchema(src, fixture('naming', 'v1.ts'), 'appRouter');
    const v2 = buildSchema(src, fixture('naming', 'v2.ts'), 'appRouter');
    expect(printErrors([...v1.errors, ...v2.errors])).toBe('\n');
    expect(Object.keys(v1.schema.objects).sort()).toEqual(['Page<Post>', 'Page<User>', 'Partial<Post>', 'Partial<User>', 'Post', 'Tick', 'Tick.at', 'User']);
    const { changes } = updateLock(updateLock(emptyLock(), v1.schema).lock, v2.schema);
    expect(changes.filter((c) => c.severity !== 'safe')).toEqual([]);
    expect(changes.map((c) => c.path).sort()).toEqual(['aPick', 'aPick:input', 'aPick:input.at']);
  });
});

describe('lockfile evolution', () => {
  const steps = ['v1', 'v2', 'v3', 'v4'];
  const locks: Lock[] = [emptyLock()];
  const results: { lock: Lock; changes: Change[] }[] = [];

  it.each(steps)('%s', async (step) => {
    const src = sources.find((s) => (s as unknown as { evolution?: boolean }).evolution) ?? Object.assign(open('evolution'), { evolution: true });
    const { schema, errors } = buildSchema(src, fixture('evolution', `${step}.ts`), 'appRouter');
    expect(printErrors(errors)).toBe('\n');
    const r = updateLock(locks[locks.length - 1], schema);
    results.push(r);
    // an error leaves the previous lock in place, like `tbr generate` does
    locks.push(r.changes.some((c) => c.severity === 'error') ? locks[locks.length - 1] : r.lock);
    await expect(printChanges(r.changes) + '\n' + stringifyLock(r.lock)).toMatchFileSnapshot(snapshot(`evolution.${step}.txt`));
  });

  it('classifies each step', () => {
    const worst = results.map((r) => (r.changes.some((c) => c.severity === 'error') ? 'error' : r.changes.some((c) => c.severity === 'breaking') ? 'breaking' : 'safe'));
    expect(worst).toEqual(['safe', 'safe', 'breaking', 'error']);
  });

  it('is idempotent', () => {
    const { schema } = buildSchema(sources.find((s) => (s as unknown as { evolution?: boolean }).evolution)!, fixture('evolution', 'v3.ts'), 'appRouter');
    const again = updateLock(locks[3], schema);
    expect(again.changes).toEqual([]);
    expect(stringifyLock(again.lock)).toBe(stringifyLock(locks[3]));
  });

  it('pins the width of enum indexes and limits enums and unions', () => {
    const { schema } = buildSchema(sources.find((s) => (s as unknown as { evolution?: boolean }).evolution)!, fixture('evolution', 'v1.ts'), 'appRouter');
    const many = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
    const withRole = (values: string[]) => ({ ...schema, enums: { ...schema.enums, Role: { name: 'Role', values } } });
    const messages = (r: { changes: Change[] }, severity: string) => r.changes.filter((c) => c.severity === severity && c.path === 'Role').map((c) => c.message);

    const fresh = updateLock(emptyLock(), withRole(many(300)));
    expect(fresh.lock.enums.Role.wide).toBe(true);
    expect(fresh.changes).toEqual([]);
    expect(updateLock(emptyLock(), withRole(many(256))).lock.enums.Role.wide).toBeUndefined();

    const grown = updateLock(locks[1], withRole([...schema.enums.Role.values, ...many(300)]));
    expect(messages(grown, 'breaking')).toContain('past 256 values: indexes go from 1 byte to 2, old clients misread them');
    expect(grown.lock.enums.Role.wide).toBe(true);
    // already wide, or wide by length in a lockfile before 0.6: no change of width
    expect(messages(updateLock(grown.lock, withRole([...schema.enums.Role.values, ...many(301)])), 'breaking').filter((m) => m.startsWith('past'))).toEqual([]);
    const old = structuredClone(grown.lock);
    delete old.enums.Role.wide;
    expect(messages(updateLock(old, withRole([...schema.enums.Role.values, ...many(301)])), 'breaking').filter((m) => m.startsWith('past'))).toEqual([]);

    expect(messages(updateLock(emptyLock(), withRole(many(0x10001))), 'error')).toEqual(['more than 65536 values']);
    const shape = schema.unions.Shape;
    const variants = Array.from({ length: 257 }, (_, i) => ({ tag: `t${i}`, object: shape.variants[0].object }));
    const wideUnion = updateLock(emptyLock(), { ...schema, unions: { ...schema.unions, Shape: { ...shape, variants } } });
    expect(wideUnion.changes.filter((c) => c.severity === 'error').map((c) => c.message)).toEqual(['more than 256 variants']);
  });

  it('refuses a @renamedFrom that would put two fields on one ID', () => {
    const { schema } = buildSchema(sources.find((s) => (s as unknown as { evolution?: boolean }).evolution)!, fixture('evolution', 'v1.ts'), 'appRouter');
    const withUser = (patch: (fields: Schema['objects'][string]['fields']) => Schema['objects'][string]['fields']) => ({
      ...schema,
      objects: { ...schema.objects, User: { ...schema.objects.User, fields: patch(schema.objects.User.fields) } },
    });
    const name = schema.objects.User.fields.find((f) => f.name === 'name')!;
    const errors = (s: Schema) => updateLock(locks[1], s).changes.filter((c) => c.severity === 'error').map((c) => `${c.path}: ${c.message}`);
    expect(errors(withUser((fs) => [...fs, { ...name, name: 'fullName', renamedFrom: 'name' }]))).toEqual([
      "User.fullName: @renamedFrom name: 'name' is still declared; remove it, or drop the tag to add a new field",
    ]);
    expect(errors(withUser((fs) => [...fs.filter((f) => f !== name), { ...name, name: 'a', renamedFrom: 'name' }, { ...name, name: 'b', renamedFrom: 'name' }]))).toEqual([
      "User.b: @renamedFrom name: 'a' is renamed from it too",
    ]);
    expect(errors(withUser((fs) => [...fs.filter((f) => f !== name), { ...name, name: 'fullName', renamedFrom: 'nmae' }]))).toEqual([
      "User.fullName: @renamedFrom nmae: User has no field 'nmae' in the lockfile",
    ]);
  });

  it('gives a field whose type changed a new ID', () => {
    const user = results[2].lock.objects.User.fields;
    expect(user.age).toEqual({ id: 9, type: 'u16' });
    expect(user['age@3']).toEqual({ id: 3, type: 'u8', retired: true });
  });

  it('refuses a corrupted lockfile with duplicate IDs', () => {
    const lock = structuredClone(locks[1]);
    lock.objects.User.fields.name.id = lock.objects.User.fields.id.id;
    const { schema } = buildSchema(sources.find((s) => (s as unknown as { evolution?: boolean }).evolution)!, fixture('evolution', 'v1.ts'), 'appRouter');
    const { changes } = updateLock(lock, schema);
    expect(changes.filter((c) => c.severity === 'error').map((c) => c.message)).toEqual([
      'lockfile is corrupted: id 0 is used by more than one field; restore it from git',
    ]);
  });
});
