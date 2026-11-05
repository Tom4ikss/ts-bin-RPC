// TanStack Query options from the client, against a QueryClient of @tanstack/query-core, in process.
import { MutationObserver, QueryClient, hashKey as tanstackHash } from '@tanstack/query-core';
import { RpcError } from 'ts-bin-rpc';
import { createClient } from 'ts-bin-rpc/client';
import { createHandler } from 'ts-bin-rpc/server';
import { createQueryOptions, hashKey } from 'ts-bin-rpc/tanstack';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { appRouter, type User } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';

const handler = createHandler(appRouter, { procedures, prefix: '/rpc', context: (r) => ({ user: r.headers.get('authorization')?.slice(7) ?? null }) });

function setup() {
  const requests: Request[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    return handler(request);
  }) as typeof fetch;
  const api = createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: fetchFn });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { api, rq: createQueryOptions(api), queryClient, requests };
}

const plain = (v: unknown) => Object.getPrototypeOf(v) === Object.prototype;

describe('createQueryOptions', () => {
  it('fetches into the cache as plain objects, under a key that getQueryData finds', async () => {
    const { rq, queryClient } = setup();
    const user = await queryClient.fetchQuery(rq.user.get.queryOptions({ id: 3 }));
    expect(user).toMatchObject({ id: 3, name: 'Chloé', balance: 42n });
    expect(plain(user)).toBe(true);
    expect(rq.user.get.queryKey({ id: 3 })).toEqual([['user', 'get'], { id: 3 }]);
    const cached = queryClient.getQueryData(rq.user.get.queryKey({ id: 3 }));
    expectTypeOf(cached).toEqualTypeOf<User | undefined>();
    expect(cached).toBe(user);
  });

  it('takes TanStack options after the input, or first when there is no input', async () => {
    const { rq, queryClient } = setup();
    const version = rq.version.queryOptions({ staleTime: 1000 });
    expect([version.queryKey, version.staleTime]).toEqual([[['version']], 1000]);
    expect(await queryClient.fetchQuery(version)).toEqual({ version: '1.0' });
    // optional input: none, or the input and then the options
    expect(rq.user.list.queryOptions().queryKey).toEqual([['user', 'list']]);
    const admins = rq.user.list.queryOptions({ role: 'admin' }, { select: (users) => users.map((u) => u.name) });
    expectTypeOf(admins.select).toEqualTypeOf<((data: User[]) => string[]) | undefined>();
    expect(admins.queryKey).toEqual([['user', 'list'], { role: 'admin' }]);
    expect((await queryClient.fetchQuery(rq.user.list.queryOptions({ role: 'admin' }))).map((u) => u.name)).toEqual(['Ада']);
  });

  it('invalidates a procedure or a namespace by its path', async () => {
    const { rq, queryClient } = setup();
    await queryClient.fetchQuery(rq.user.get.queryOptions({ id: 3 }));
    await queryClient.fetchQuery(rq.user.list.queryOptions());
    await queryClient.fetchQuery(rq.version.queryOptions());
    await queryClient.invalidateQueries({ queryKey: rq.user.pathKey() });
    const stale = queryClient.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => q.queryKey);
    expect(stale).toEqual([[['user', 'get'], { id: 3 }], [['user', 'list']]]);
    expect(rq.pathKey()).toEqual([[]]);
    // keys of the app itself are not under ours
    expect(queryClient.getQueryCache().findAll({ queryKey: [['user']] }).length).toBe(2);
  });

  it('fails the query with the RpcError', async () => {
    const { rq, queryClient } = setup();
    const error = await queryClient.fetchQuery(rq.user.get.queryOptions({ id: 99 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcError);
    expect(error).toMatchObject({ code: 'NOT_FOUND', data: { id: 99 } });
    expect(queryClient.getQueryState(rq.user.get.queryKey({ id: 99 }))?.error).toBe(error);
  });

  it('passes the abort signal and headers to the call', async () => {
    const { rq, queryClient, requests } = setup();
    expect(await queryClient.fetchQuery(rq.account.me.queryOptions({ tbr: { headers: { authorization: 'Bearer ann' } } }))).toEqual({ name: 'ann' });
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    const pending = queryClient.fetchQuery(rq.series.queryOptions({ n: 5 }));
    await queryClient.cancelQueries({ queryKey: rq.series.pathKey() });
    await expect(pending).rejects.toThrow();
    expect(requests[1].signal.aborted).toBe(true);
  });

  it('keeps views with decode: lazy, and turns structural sharing off', async () => {
    const { rq, queryClient } = setup();
    const options = rq.user.get.queryOptions({ id: 3 }, { tbr: { decode: 'lazy' } });
    expect(options.structuralSharing).toBe(false);
    expect('tbr' in options).toBe(false);
    const user = await queryClient.fetchQuery(options);
    expect(plain(user)).toBe(false);
    expect(user.name).toBe('Chloé');
  });

  it('runs mutations with the input as variables', async () => {
    const { rq, queryClient } = setup();
    const deposit = new MutationObserver(queryClient, rq.account.deposit.mutationOptions({ tbr: { headers: { authorization: 'Bearer bo' } } }));
    expect(await deposit.mutate({ amount: 7 })).toEqual({ user: 'bo', amount: 7 });
    expect(rq.account.deposit.mutationOptions().mutationKey).toEqual([['account', 'deposit']]);
    const failing = new MutationObserver(queryClient, rq.account.deposit.mutationOptions({ tbr: { headers: { authorization: 'Bearer bo' } } }));
    await expect(failing.mutate({ amount: 0 })).rejects.toMatchObject({ code: 'BAD_INPUT' });
    const audit = new MutationObserver(queryClient, rq.audit.mutationOptions());
    // a procedure without input takes no variables: `mutate()`
    const noInput: [Parameters<typeof audit.mutate>[0]] extends [void] ? true : false = true;
    expect(noInput).toBe(true);
    expect(await audit.mutate()).toHaveProperty('calls');
  });

  it('leaves streams out', async () => {
    const { rq } = setup();
    // @ts-expect-error a stream is not a query: `never` in the proxy
    const run = rq.stream.ticks.queryOptions({ n: 1 }).queryFn({ signal: new AbortController().signal });
    await expect(run).rejects.toThrow(TypeError);
  });
});

describe('hashKey', () => {
  it('hashes as TanStack Query does, and takes bigints', () => {
    for (const key of [[['user', 'get'], { id: 3, b: [1, { z: 1, a: 2 }] }], [['x']], [['d'], new Date(0)]]) expect(hashKey(key)).toBe(tanstackHash(key));
    expect(() => tanstackHash([['x'], { n: 1n }])).toThrow();
    expect(hashKey([['x'], { n: 1n }])).toBe('[["x"],{"n":{"$bigint":"1"}}]');
  });
});
