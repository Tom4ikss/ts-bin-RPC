// Validation rules (Min, Max, MinLength, MaxLength, Pattern) in generated verifiers.
import { beforeAll, describe, expect, it } from 'vitest';
import { RuleError } from 'ts-bin-rpc/runtime';
import { generate, type Generated } from './codegen.ts';

let g: Generated;
beforeAll(async () => {
  g = await generate('rules');
}, 60_000);

const member = (o: Record<string, unknown> = {}) => ({ name: 'Ann', age: 30, balance: 5n, score: 0.5, tags: ['ab'], note: null, ...o });
const signup = (o: Record<string, unknown> = {}) => ({
  email: 'a@b.c',
  members: [member()],
  matrix: [[1, 2], []],
  key: new Uint8Array(4),
  limit: 7n,
  ...o,
});
const broken = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof RuleError) return { field: e.field, rule: e.rule, limit: e.limit, index: e.index, message: e.message };
    throw e;
  }
  return undefined;
};

describe('rules', () => {
  const input = () => g.mod.procedures.signup.input!;
  const check = (v: unknown) => broken(() => input().verify(input().encode(v)));

  it('pass valid values', () => {
    expect(check(signup())).toBeUndefined();
    expect(check(signup({ members: [member({ age: undefined, note: 'abcd', tags: [] }), member({ balance: -1000n, score: 1 })] }))).toBeUndefined();
  });

  it('name the field, the rule and the row', () => {
    expect(check(signup({ email: 'nope' }))).toEqual({ field: 'Signup.email', rule: 'pattern', limit: '^[^@]+@[^@]+$', index: undefined, message: 'Signup.email does not match /^[^@]+@[^@]+$/' });
    expect(check(signup({ members: [] }))).toMatchObject({ field: 'Signup.members', rule: 'minLength', limit: 1 });
    expect(check(signup({ members: [member(), member({ age: 17 })] }))).toMatchObject({ field: 'Member.age', rule: 'min', limit: 18, index: 1 });
    expect(check(signup({ members: [member({ age: 121 })] }))).toMatchObject({ field: 'Member.age', rule: 'max', limit: 120, index: 0 });
    expect(check(signup({ members: [member({ balance: -1001n })] }))).toMatchObject({ field: 'Member.balance', rule: 'min', limit: '-1000' });
    expect(check(signup({ members: [member({ score: Number.NaN })] }))).toMatchObject({ field: 'Member.score', rule: 'min' });
    expect(check(signup({ members: [member({ name: '' })] }))).toMatchObject({ field: 'Member.name', rule: 'minLength', limit: 1 });
    expect(check(signup({ members: [member({ note: 'abcde' })] }))).toMatchObject({ field: 'Member.note', rule: 'maxLength', limit: 4 });
    expect(check(signup({ members: [member({ tags: ['ab', 'cd', 'ef', 'gh'] })] }))).toMatchObject({ field: 'Member.tags', rule: 'maxLength', limit: 3 });
    expect(check(signup({ members: [member({ tags: ['ab', 'Ab'] })] }))).toMatchObject({ field: 'Member.tags[]', rule: 'pattern', index: 1 });
    expect(check(signup({ members: [member({ tags: ['abcdefghi'] })] }))).toMatchObject({ field: 'Member.tags[]', rule: 'maxLength', limit: 8 });
    expect(check(signup({ matrix: [[1], [2], [3]] }))).toMatchObject({ field: 'Signup.matrix', rule: 'maxLength', limit: 2 });
    // lists in lists are one column, so the index counts across all inner lists
    expect(check(signup({ matrix: [[1], [2, 10]] }))).toMatchObject({ field: 'Signup.matrix[][]', rule: 'max', limit: 9, index: 2 });
    expect(check(signup({ key: new Uint8Array(3) }))).toMatchObject({ field: 'Signup.key', rule: 'minLength', limit: 4 });
    expect(check(signup({ limit: 10_000_000_000_000_000_001n }))).toMatchObject({ field: 'Signup.limit', rule: 'max', limit: '10000000000000000000' });
  });

  it('compare 64-bit integers by both words', () => {
    // i64 limits -1000..1000 are words (-1, 4294966296) and (0, 1000)
    for (const balance of [-1000n, -1n, 0n, 1000n]) expect(check(signup({ members: [member({ balance })] })), String(balance)).toBeUndefined();
    for (const balance of [1001n, 1n << 32n, -(1n << 32n), -(2n ** 63n), 2n ** 63n - 1n]) expect(check(signup({ members: [member({ balance })] })), String(balance)).toBeDefined();
    for (const limit of [0n, 10_000_000_000_000_000_000n, 9_999_999_999_999_999_999n]) expect(check(signup({ limit })), String(limit)).toBeUndefined();
    expect(check(signup({ limit: 2n ** 64n - 1n }))).toMatchObject({ rule: 'max' });
  });

  it('check a single table the same way as a column', () => {
    const out = g.mod.procedures.signup.output!;
    expect(broken(() => out.verify(out.encode(member({ age: 5 }))))).toMatchObject({ field: 'Member.age', rule: 'min', index: undefined });
  });

  it('check roots and lists of roots', () => {
    const count = g.mod.procedures.count.input!;
    expect(broken(() => count.verify(count.encode(0)))).toMatchObject({ field: 'input', rule: 'min', limit: 1 });
    expect(broken(() => count.verify(count.encode(5)))).toBeUndefined();
    const slugs = g.mod.procedures.slugs.input!;
    expect(broken(() => slugs.verify(slugs.encode(['ok', 'x'])))).toMatchObject({ field: 'input[]', rule: 'minLength', index: 1 });
  });

  it('a back-reference is checked as the row it points to', () => {
    // equal strings in a column share bytes; the second one must still be checked
    expect(check(signup({ members: [member({ tags: ['Ab'] }), member({ tags: ['Ab'] })] }))).toMatchObject({ field: 'Member.tags[]', rule: 'pattern' });
    expect(check(signup({ members: [member({ name: 'Bo' }), member({ name: 'Bo' })] }))).toBeUndefined();
  });

  it('are skipped with rules: false, and the value reads as sent', () => {
    const bytes = input().encode(signup({ email: 'nope', members: [member({ age: 7 })] }));
    expect(() => input().view(bytes)).toThrow(RuleError);
    const v = input().decode(bytes, { rules: false });
    expect(v.email).toBe('nope');
    expect(v.members[0].age).toBe(7);
  });

  it('are not part of the wire format or the lockfile', () => {
    expect(JSON.stringify(g.lock)).not.toMatch(/minLength|pattern|"min"|"max"/);
  });
});
