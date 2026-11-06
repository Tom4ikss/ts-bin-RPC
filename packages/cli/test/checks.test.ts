// Checks (`Check<'name'>`, formats) and refinements, run by the server on decoded inputs.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RpcError, type StandardSchemaV1 } from 'ts-bin-rpc';
import { createClient } from 'ts-bin-rpc/client';
import { formats } from 'ts-bin-rpc/formats';
import { createHandler, type HandlerOptions } from 'ts-bin-rpc/server';
import { appRouter, type DateRange, type Event, type Invite } from './fixtures/checks/router.ts';
import { generate, type Generated } from './codegen.ts';

let g: Generated;
beforeAll(async () => {
  g = await generate('checks');
}, 60_000);

type Options = Omit<HandlerOptions<typeof appRouter>, 'procedures'>;
const checks = {
  ...formats,
  slug: (v: string) => /^[a-z-]+$/.test(v),
  polite: (v: string) => !/idiot/i.test(v) || 'must be polite',
  short: async (v: string) => v.length <= 20,
  even: (v: number) => v % 2 === 0,
};
const refine = {
  DateRange: (r: DateRange) => r.start <= r.end || 'starts after it ends',
  Event: (e: Event) => e.kind !== 'call' || !e.at.startsWith('1999'),
  Invite: (i: Invite) => !i.guests.some((x) => x.email === i.host.email) || 'the host is not a guest',
};
const handler = (o: Options = { checks, refine }) => createHandler(appRouter, { procedures: g.mod.procedures as never, prefix: '/rpc', ...o });
const client = (o?: Options) => {
  const h = handler(o);
  return createClient<typeof appRouter>({ url: 'http://test/rpc', procedures: g.mod.procedures as never, fetch: (async (u: RequestInfo | URL, init?: RequestInit) => h(new Request(u, init))) as typeof fetch });
};
const failure = (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: unknown) => {
      if (e instanceof RpcError) return { code: e.code, message: e.message, data: e.data };
      throw e;
    },
  );

const guest = (o: Record<string, unknown> = {}) => ({ email: 'ann@example.com', id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', site: 'https://ann.dev', tags: ['ann'], ...o });
const invite = (o: Record<string, unknown> = {}): Invite =>
  ({
    host: guest({ email: 'host@example.com' }),
    guests: [guest(), guest({ email: 'bo@example.com', site: null })],
    events: [{ kind: 'meet', range: { start: '2026-11-04', end: '2026-11-05' } }, { kind: 'call', at: '2026-11-04T18:00:00+03:00' }],
    note: 'see you',
    seats: 4,
    ...o,
  }) as Invite;

describe('checks and refine', () => {
  it('pass a valid input', async () => {
    expect((await client().invite(invite())).ok).toBe(true);
    expect(await client().slug('a-b')).toBe('a-b');
  });

  it('name the check, the field and the path', async () => {
    const api = client();
    expect(await failure(api.invite(invite({ guests: [guest(), guest({ email: 'nope' })] })))).toEqual({
      code: 'BAD_INPUT',
      message: 'guests[1].email is not a valid email',
      data: { field: 'Guest.email', rule: 'check', name: 'email', path: ['guests', 1, 'email'], message: 'is not a valid email' },
    });
    expect(await failure(api.invite(invite({ host: guest({ tags: ['ok', 'Not ok'] }) })))).toMatchObject({ data: { field: 'Guest.tags[]', name: 'slug', path: ['host', 'tags', 1] } });
    expect(await failure(api.invite(invite({ host: guest({ site: 'not a url' }) })))).toMatchObject({ data: { name: 'url', path: ['host', 'site'] } });
    expect(await failure(api.invite(invite({ host: guest({ id: 'x' }) })))).toMatchObject({ data: { name: 'uuid', path: ['host', 'id'] } });
    expect(await failure(api.invite(invite({ seats: 3 })))).toMatchObject({ message: 'seats is not a valid even', data: { field: 'Invite.seats', name: 'even' } });
    expect(await failure(api.slug('No'))).toMatchObject({ message: 'input is not a valid slug', data: { field: 'input', path: [] } });
  });

  it('run on map keys and values and on tuple elements', async () => {
    const api = client();
    const dir = (o: object = {}) => ({ owners: new Map([['ann@example.com', ['a-b']]]), labels: { x: 'ok' }, pair: ['bo@example.com', 2], ...o }) as never;
    expect(await api.directory(dir())).toBe(1);
    expect(await failure(api.directory(dir({ owners: new Map([['nope', []]]) })))).toMatchObject({ data: { field: 'Directory.owners[key]', name: 'email', path: ['owners', 'nope'] } });
    expect(await failure(api.directory(dir({ owners: new Map([['ann@example.com', ['a', 'B']]]) })))).toMatchObject({ data: { field: 'Directory.owners[value][]', name: 'slug', path: ['owners', 'ann@example.com', 1] } });
    expect(await failure(api.directory(dir({ labels: { 'a key': 'No' } })))).toMatchObject({ data: { field: 'Directory.labels[value]', name: 'slug', path: ['labels', 'a key'] } });
    expect(await failure(api.directory(dir({ pair: ['bo@example.com', 3] })))).toMatchObject({ data: { field: 'Directory.pair[1]', name: 'even', path: ['pair', 1] } });
    // rules are verified on the wire, before the checks
    expect(await failure(api.directory(dir({ labels: { x: 'a'.repeat(9) } })))).toMatchObject({ data: { field: 'Map<string, (string & MaxLength<8> & Check<\'slug\'>)>.values[]', rule: 'maxLength' } });
  });

  it('take a message, run in order, and may be async', async () => {
    const api = client();
    expect(await failure(api.invite(invite({ note: 'you idiot' })))).toMatchObject({ message: 'note: must be polite', data: { name: 'polite', message: 'must be polite' } });
    expect(await failure(api.invite(invite({ note: 'x'.repeat(21) })))).toMatchObject({ data: { name: 'short' } });
    // both checks fail: the first declared wins
    expect(await failure(api.invite(invite({ note: 'idiot'.repeat(5) })))).toMatchObject({ data: { name: 'polite' } });
  });

  it('refine objects and unions after their fields', async () => {
    const api = client();
    const events = (e: unknown) => invite({ events: [e] });
    expect(await failure(api.invite(events({ kind: 'meet', range: { start: '2026-11-05', end: '2026-11-04' } })))).toEqual({
      code: 'BAD_INPUT',
      message: 'events[0].range: starts after it ends',
      data: { field: 'DateRange', rule: 'refine', name: 'DateRange', path: ['events', 0, 'range'], message: 'starts after it ends' },
    });
    // the field check runs first: an invalid date never reaches the refinement
    expect(await failure(api.invite(events({ kind: 'meet', range: { start: '2026-02-30', end: '2026-01-01' } })))).toMatchObject({ data: { rule: 'check', name: 'isoDate', path: ['events', 0, 'range', 'start'] } });
    expect(await failure(api.invite(events({ kind: 'call', at: '1999-01-01T00:00:00Z' })))).toMatchObject({ message: 'events[0] is not a valid Event', data: { rule: 'refine', name: 'Event' } });
    expect(await failure(api.invite(invite({ guests: [guest({ email: 'host@example.com' })] })))).toMatchObject({ message: 'input: the host is not a guest', data: { name: 'Invite', path: [] } });
  });

  it('take Standard Schemas', async () => {
    const schema = (test: (v: string) => boolean, async = false): StandardSchemaV1 => ({
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (v) => {
          const r = test(v as string) ? { value: v } : { issues: [{ message: 'Invalid', path: [] }] };
          return async ? Promise.resolve(r) : r;
        },
      },
    });
    const range: StandardSchemaV1 = { '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [{ message: 'Too early', path: [{ key: 'start' }] }] }) } };
    const api = client({ checks: { ...checks, slug: schema((v) => v === 'ok', true) }, refine: { DateRange: range } });
    expect(await failure(api.slug('no'))).toMatchObject({ message: 'input: Invalid', data: { name: 'slug' } });
    expect(await failure(api.invite(invite({ host: guest({ tags: ['ok'] }), guests: [guest({ tags: ['ok'] })] })))).toMatchObject({ message: 'events[0].range.start: Too early', data: { rule: 'refine', path: ['events', 0, 'range', 'start'] } });
  });

  it('skip inputs that reach nothing to run', async () => {
    const spy = vi.fn(() => true);
    const api = client({ checks: { ...checks, isoDate: spy }, refine: { DateRange: spy } });
    // ping's output has DateRange; its input does not
    expect((await api.ping({ n: 5 })).range.end).toBe('2026-01-05');
    expect(spy).not.toHaveBeenCalled();
  });

  it('fail createHandler when a check has no implementation, or refine names no input type', () => {
    expect(() => handler({})).toThrow("check 'email' on Directory.owners[key] has no implementation; pass it in createHandler({ checks })");
    const { slug: _, ...noSlug } = checks;
    expect(() => handler({ checks: noSlug })).toThrow("check 'slug' on Directory.owners[value][] has no implementation");
    expect(() => handler({ checks, refine: { ...refine, Guestt: () => true } })).toThrow("refine names 'Guestt', which no procedure input contains");
  });

  it('do not change what the procedure gets', async () => {
    const seen: Invite[] = [];
    const h = createHandler({ ...appRouter, invite: async (i: Invite) => (seen.push(i), { ok: true }) }, { procedures: g.mod.procedures as never, checks, refine });
    const api = createClient<typeof appRouter>({ url: 'http://test/', procedures: g.mod.procedures as never, fetch: (async (u: RequestInfo | URL, init?: RequestInit) => h(new Request(u, init))) as typeof fetch });
    await api.invite(invite());
    expect(seen[0]).toEqual(invite());
  });
});

describe('formats', () => {
  it.each([
    ['email', ['a@b.c', 'first.last+tag@sub.example.com', 'x@localhost'], ['', 'a', '@b.c', 'a@', 'a b@c.d', 'a@-b.c', `${'a'.repeat(250)}@b.cd`]],
    ['uuid', ['6ba7b810-9dad-11d1-80b4-00c04fd430c8', '00000000-0000-0000-0000-000000000000', 'ABCDEF01-2345-6789-ABCD-EF0123456789'], ['6ba7b8109dad11d180b400c04fd430c8', '6ba7b810-9dad-11d1-80b4-00c04fd430c', 'g6a7b810-9dad-11d1-80b4-00c04fd430c8']],
    ['url', ['https://example.com', 'http://localhost:3000/a?b#c', 'mailto:a@b.c'], ['', 'example.com', '/relative', 'http//x']],
    ['isoDate', ['2026-11-04', '2024-02-29', '0001-01-01'], ['2026-02-29', '2026-13-01', '2026-00-10', '2026-1-4', '2026-11-04T00:00:00Z']],
    ['isoDateTime', ['2026-11-04T18:00:00Z', '2026-11-04t18:00:00.123+03:00', '2016-12-31T23:59:60Z'], ['2026-11-04 18:00:00Z', '2026-11-04T24:00:00Z', '2026-11-04T18:00:00', '2026-02-30T00:00:00Z', '2026-11-04T18:00:00+24:00']],
  ] as const)('%s', (name, good, bad) => {
    const f = formats[name];
    for (const v of good) expect(f(v), v).toBe(true);
    for (const v of bad) expect(f(v), v).toBe(false);
  });
});
