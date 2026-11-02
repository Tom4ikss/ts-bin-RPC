import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildSchema } from '../src/build.ts';
import { emptyLock, stringifyLock, updateLock, type Change, type Lock } from '../src/lock.ts';
import { formatLocation } from '../src/ir.ts';
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
