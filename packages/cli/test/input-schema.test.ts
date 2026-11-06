// The client validator (`ts-bin-rpc/validate`): `inputRules` from the generated code as a Standard
// Schema, against the server on the same inputs.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StandardSchemaV1 } from 'ts-bin-rpc';
import { formats } from 'ts-bin-rpc/formats';
import { RuleError, type InputRules } from 'ts-bin-rpc/runtime';
import { createHandler } from 'ts-bin-rpc/server';
import { inputSchema, type InputIssue, type InputResult, type InputSchemaOptions } from 'ts-bin-rpc/validate';
import type { DateRange, Event, Invite } from './fixtures/checks/router.ts';
import { generate, type Generated } from './codegen.ts';

let rules: Generated;
let checked: Generated;
beforeAll(async () => {
  rules = await generate('rules', undefined, undefined, 'rules-client');
  checked = await generate('checks', undefined, undefined, 'checks-client');
}, 60_000);

const entry = (g: Generated, path: string) => (g.mod as unknown as { inputRules: Record<string, InputRules<unknown>> }).inputRules[path];
const sync = (r: InputResult<unknown> | Promise<InputResult<unknown>>) => {
  if (r instanceof Promise) throw new Error('expected a synchronous result');
  return r;
};
/** The issues of a value, as `field: path message` lines. */
const lines = (r: InputResult<unknown>) => (r.issues ?? []).map((i) => `${i.field}: ${pathText(i.path)} ${i.message}`);
/** The path as the server writes it: `members[1].age`, `owners["a"]`. */
const pathText = (p: readonly PropertyKey[]) =>
  p.map((k, i) => (typeof k === 'number' ? `[${k}]` : typeof k === 'string' && /^[A-Za-z_$][\w$]*$/.test(k) ? `${i ? '.' : ''}${k}` : `[${JSON.stringify(k)}]`)).join('') || 'input';

const member = (o: Record<string, unknown> = {}) => ({ name: 'Ann', age: 30, balance: 5n, score: 0.5, tags: ['ab'], note: null, ...o });
const signup = (o: Record<string, unknown> = {}) => ({ email: 'a@b.c', members: [member()], matrix: [[1, 2], []], key: new Uint8Array(4), limit: 7n, ...o });

describe('inputSchema: rules', () => {
  const schema = () => inputSchema(entry(rules, 'signup'));
  const validate = (v: unknown) => sync(schema()['~standard'].validate(v));

  it('passes a valid input and returns it as is', () => {
    const v = signup();
    expect(validate(v)).toEqual({ value: v });
    expect(validate(v).issues).toBeUndefined();
    expect(validate(signup({ members: [member({ age: undefined, note: 'abcd', tags: [] })] })).issues).toBeUndefined();
  });

  it('reports every broken rule, with its path', () => {
    const r = validate(signup({ email: 'nope', members: [member(), member({ age: 17, name: '', tags: ['ab', 'Ab', 'cd', 'ef'] })], matrix: [[1], [2, 10], []], key: new Uint8Array(3), limit: 10_000_000_000_000_000_001n }));
    expect(lines(r)).toEqual([
      'Signup.email: email does not match /^[^@]+@[^@]+$/',
      'Member.name: members[1].name is shorter than 1',
      'Member.age: members[1].age is less than 18',
      'Member.tags[]: members[1].tags[1] does not match /^[a-z-]+$/',
      'Member.tags: members[1].tags is longer than 3',
      'Signup.matrix[][]: matrix[1][1] is greater than 9',
      'Signup.matrix: matrix is longer than 2',
      'Signup.key: key is shorter than 4',
      'Signup.limit: limit is greater than 10000000000000000000',
    ]);
    expect(r.issues![2]).toEqual({ message: 'is less than 18', path: ['members', 1, 'age'], field: 'Member.age', rule: 'min', limit: 18 });
  });

  it('says what the server says', () => {
    const input = rules.mod.procedures.signup.input!;
    const cases = [
      signup({ email: 'nope' }),
      signup({ members: [] }),
      signup({ members: [member({ age: 121 })] }),
      signup({ members: [member({ balance: -1001n })] }),
      signup({ members: [member({ score: Number.NaN })] }),
      signup({ members: [member({ note: 'abcde' })] }),
      signup({ members: [member({ tags: ['abcdefghi'] })] }),
      signup({ key: new Uint8Array(5) }),
    ];
    for (const v of cases) {
      let server: RuleError | undefined;
      try {
        input.verify(input.encode(v));
      } catch (e) {
        server = e as RuleError;
      }
      const [first] = validate(v).issues ?? [];
      expect(server, JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}` : x))).toBeInstanceOf(RuleError);
      expect({ field: first.field, rule: first.rule, limit: first.limit }).toEqual({ field: server!.field, rule: server!.rule, limit: server!.limit });
      expect(server!.message.endsWith(` ${first.message}`)).toBe(true);
    }
  });

  it('reports values of the wrong type, as the encoder would reject them, and skips their rules', () => {
    const r = validate(signup({ email: 5, members: [member({ age: 300, balance: 1, tags: 'ab' })], limit: -1n }));
    expect(lines(r)).toEqual([
      'Signup.email: email expected string, got 5',
      'Member.age: members[0].age expected u8, got 300',
      'Member.balance: members[0].balance expected i64, got 1',
      'Member.tags: members[0].tags expected array, got "ab"',
      'Signup.limit: limit expected u64, got -1n',
    ]);
    expect(lines(validate(undefined))).toEqual(['input: input expected Signup, got undefined']);
    expect(lines(validate(signup({ key: undefined })))).toEqual(['Signup.key: key expected Uint8Array, got undefined']);
  });

  it('checks roots and lists of roots', () => {
    const count = inputSchema(entry(rules, 'count'));
    expect(sync(count['~standard'].validate(0)).issues).toEqual([{ message: 'is less than 1', path: [], field: 'input', rule: 'min', limit: 1 }]);
    expect(sync(count['~standard'].validate(5))).toEqual({ value: 5 });
    const slugs = inputSchema(entry(rules, 'slugs'));
    expect(lines(sync(slugs['~standard'].validate(['ok', 'x'])))).toEqual(['input[]: [1] is shorter than 2']);
  });

  it('takes your messages', () => {
    const say = vi.fn((i: InputIssue) => (i.rule === 'minLength' ? `at least ${i.limit}` : undefined));
    const s = inputSchema(entry(rules, 'signup'), { message: say });
    expect(sync(s['~standard'].validate(signup({ key: new Uint8Array(1), email: 'x' }))).issues!.map((i) => i.message)).toEqual(['does not match /^[^@]+@[^@]+$/', 'at least 4']);
    expect(say).toHaveBeenCalledTimes(2);
  });
});

describe('inputSchema: checks and refine', () => {
  const checks = {
    ...formats,
    slug: (v: string) => /^[a-z-]+$/.test(v),
    polite: (v: string) => !/idiot/i.test(v) || 'must be polite',
    short: (v: string) => v.length <= 20,
    even: (v: number) => v % 2 === 0,
  };
  const refine = {
    DateRange: (r: DateRange) => r.start <= r.end || 'starts after it ends',
    Event: (e: Event) => e.kind !== 'call' || !e.at.startsWith('1999'),
    Invite: (i: Invite) => !i.guests.some((x) => x.email === i.host.email) || 'the host is not a guest',
  };
  const guest = (o: Record<string, unknown> = {}) => ({ email: 'ann@example.com', id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', site: 'https://ann.dev', tags: ['ann'], ...o });
  const invite = (o: Record<string, unknown> = {}) => ({
    host: guest({ email: 'host@example.com' }),
    guests: [guest(), guest({ email: 'bo@example.com', site: null })],
    events: [{ kind: 'meet', range: { start: '2026-11-04', end: '2026-11-05' } }, { kind: 'call', at: '2026-11-04T18:00:00+03:00' }],
    note: 'see you',
    seats: 4,
    ...o,
  });
  const schema = (o: InputSchemaOptions = { checks, refine }) => inputSchema(entry(checked, 'invite'), o);
  const validate = (v: unknown, o?: InputSchemaOptions) => sync(schema(o)['~standard'].validate(v));

  it('runs checks and refinements, parts before the whole', () => {
    expect(validate(invite())).toEqual({ value: invite() });
    const r = validate(
      invite({
        guests: [guest({ email: 'nope', tags: ['ok', 'Not ok'] }), guest({ email: 'host@example.com' })],
        events: [{ kind: 'meet', range: { start: '2026-11-05', end: '2026-11-04' } }, { kind: 'call', at: '1999-01-01T00:00:00Z' }],
        note: 'you idiot',
        seats: 3,
      }),
    );
    expect(lines(r)).toEqual([
      'Guest.email: guests[0].email is not a valid email',
      'Guest.tags[]: guests[0].tags[1] is not a valid slug',
      'DateRange: events[0].range starts after it ends',
      'Event: events[1] is not a valid Event',
      'Invite.note: note must be polite',
      'Invite.seats: seats is not a valid even',
    ]);
    // Invite's refinement waits for clean parts
    expect(lines(validate(invite({ guests: [guest({ email: 'host@example.com' })] })))).toEqual(['Invite: input the host is not a guest']);
    expect(r.issues![0]).toEqual({ message: 'is not a valid email', path: ['guests', 0, 'email'], field: 'Guest.email', rule: 'check', name: 'email' });
  });

  it('does not refine a value whose parts failed, as the server would not', () => {
    const r = validate(invite({ events: [{ kind: 'meet', range: { start: '2026-02-30', end: '2026-01-01' } }] }));
    expect(lines(r)).toEqual(['DateRange.start: events[0].range.start is not a valid isoDate']);
    expect(lines(validate(invite({ events: [{ kind: 'nap' }] })))).toEqual(['Invite.events[]: events[0].kind expected Event variant ("call" | "meet"), got "nap"']);
  });

  it('leaves checks and refinements it has no implementation of to the server', () => {
    expect(validate(invite({ note: 'you idiot', seats: 3 }), { checks: formats }).issues).toBeUndefined();
    expect(lines(validate(invite({ host: guest({ email: 'x' }) }), { checks: formats }))).toEqual(['Guest.email: host.email is not a valid email']);
  });

  it('turns async checks into a promise, and takes Standard Schemas', async () => {
    const slow = inputSchema(entry(checked, 'slug'), { checks: { slug: async (v: string) => v === 'ok' || 'not ok' } });
    const p = slow['~standard'].validate('no');
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toEqual({ issues: [{ message: 'not ok', path: [], field: 'input', rule: 'check', name: 'slug' }] });
    expect(await slow['~standard'].validate('ok')).toEqual({ value: 'ok' });

    const range: StandardSchemaV1 = { '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [{ message: 'Too early', path: [{ key: 'start' }] }] }) } };
    expect(lines(validate(invite(), { checks, refine: { DateRange: range } }))).toEqual(['DateRange: events[0].range.start Too early']);
  });

  it('checks map keys and values and tuple elements', () => {
    const dir = (o: object = {}) => ({ owners: new Map([['ann@example.com', ['a-b']]]), labels: { x: 'ok' }, pair: ['bo@example.com', 2], ...o });
    const s = inputSchema(entry(checked, 'directory'), { checks });
    const v = (x: unknown) => sync(s['~standard'].validate(x));
    expect(v(dir()).issues).toBeUndefined();
    expect(lines(v(dir({ owners: new Map([['nope', ['A']]]), labels: { 'a key': 'No', y: 'a'.repeat(9) }, pair: ['bo@example.com', 3] })))).toEqual([
      'Directory.owners[key]: owners.nope is not a valid email',
      'Directory.owners[value][]: owners.nope[0] is not a valid slug',
      'Directory.labels[value]: labels["a key"] is not a valid slug',
      'Directory.labels[value]: labels.y is longer than 8',
      'Directory.pair[1]: pair[1] is not a valid even',
    ]);
    expect(lines(v(dir({ owners: { a: [] }, pair: [1] })))).toEqual(['Directory.owners: owners expected Map, got Object', 'Directory.pair: pair expected tuple of 2, got array']);
  });

  it('matches the server on the first failure', async () => {
    const h = createHandler(
      { invite: async () => ({ ok: true }) } as never,
      { procedures: { invite: checked.mod.procedures.invite } as never, checks, refine },
    );
    const bad = [invite({ guests: [guest({ email: 'nope' })] }), invite({ note: 'you idiot' }), invite({ seats: 3 }), invite({ guests: [guest({ email: 'host@example.com' })] })];
    for (const v of bad) {
      const body = checked.mod.procedures.invite.input!.encode(v);
      const res = await h(new Request('http://x/invite', { method: 'POST', headers: { 'content-type': 'application/vnd.tbr' }, body }));
      expect(res.status).toBe(400);
      const [first] = validate(v).issues!;
      const text = new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()));
      expect(text).toContain(first.message);
    }
  });
});
