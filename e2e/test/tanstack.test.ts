// TanStack Query options from the client, against a QueryClient of @tanstack/query-core, in process.
import { experimental_streamedQuery, InfiniteQueryObserver, MutationObserver, QueryClient, QueryObserver, hashKey as tanstackHash } from '@tanstack/query-core';
import { RpcError } from 'ts-bin-rpc';
import { createClient } from 'ts-bin-rpc/client';
import { createHandler } from 'ts-bin-rpc/server';
import { createQueryOptions, hashKey } from 'ts-bin-rpc/tanstack';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { appRouter, resetUnits, type Tick, type Unit, type User } from '../src/router.ts';
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
  return { api, rq: createQueryOptions(api, { streamedQuery: experimental_streamedQuery }), queryClient, requests };
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

  it('asks for streamedQuery before a stream', () => {
    const rq = createQueryOptions(createClient<typeof appRouter>({ url: 'http://test/rpc', procedures }));
    expect(() => rq.stream.ticks.queryOptions({ n: 1 })).toThrow(/streamedQuery/);
  });
});

describe('infiniteQueryOptions', () => {
  it('fetches pages, the page param going into the cursor', async () => {
    const { rq, queryClient } = setup();
    const options = rq.user.page.infiniteQueryOptions({ limit: 2 }, { getNextPageParam: (last) => last.next });
    expect(options.queryKey).toEqual([['user', 'page'], { limit: 2 }, 'infinite']);
    const observer = new InfiniteQueryObserver(queryClient, options);
    await observer.refetch();
    const first = observer.getCurrentResult();
    expect(first.data?.pages.map((p) => p.users.map((u) => u.id))).toEqual([[1, 2]]);
    expect(first.hasNextPage).toBe(true);
    const all = await observer.fetchNextPage();
    expect(all.data?.pages.map((p) => p.users.map((u) => u.id))).toEqual([[1, 2], [3]]);
    expect(all.data?.pageParams).toEqual([undefined, 2]);
    expect(all.hasNextPage).toBe(false);
    const cached = queryClient.getQueryData(rq.user.page.infiniteQueryKey({ limit: 2 }));
    expectTypeOf(cached?.pages[0].users).toEqualTypeOf<User[] | undefined>();
    expect(cached?.pages.length).toBe(2);
  });

  it('does not share a key with the plain query, and is under its path', async () => {
    const { rq, queryClient } = setup();
    await queryClient.fetchQuery(rq.user.page.queryOptions({ limit: 2 }));
    await queryClient.fetchInfiniteQuery(rq.user.page.infiniteQueryOptions(undefined, { getNextPageParam: (last) => last.next, initialPageParam: 1 }));
    expect(queryClient.getQueryCache().findAll({ queryKey: rq.user.page.pathKey() }).map((q) => q.queryKey)).toEqual([
      [['user', 'page'], { limit: 2 }],
      [['user', 'page'], undefined, 'infinite'],
    ]);
    // starting after id 1
    expect(queryClient.getQueryData(rq.user.page.infiniteQueryKey())?.pages[0].users.map((u) => u.id)).toEqual([2, 3]);
  });
});

describe('streams', () => {
  const settled = (observer: QueryObserver<any, any, any, any, any>) =>
    new Promise<void>((done) => {
      const off = observer.subscribe((r) => r.fetchStatus === 'idle' && (r.status === 'success' || r.status === 'error') && (off(), done()));
    });

  it('gather the rows of a stream as batches arrive', async () => {
    const { rq, queryClient } = setup();
    const options = rq.stream.ticks.queryOptions({ n: 50, burst: 1 });
    const observer = new QueryObserver(queryClient, options);
    const sizes: number[] = [];
    const off = observer.subscribe((r) => r.data && sizes.push(r.data.length));
    await settled(observer);
    off();
    const rows = queryClient.getQueryData(rq.stream.ticks.queryKey({ n: 50, burst: 1 }));
    expectTypeOf(rows).toEqualTypeOf<Tick[] | undefined>();
    expect(rows?.map((t) => t.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    // more than one update before the end: the data grow with the stream
    expect(sizes.filter((n) => n < 50).length).toBeGreaterThan(0);
    expect(plain(rows![0])).toBe(true);
  });

  it('fold batches with a reducer', async () => {
    const { rq, queryClient } = setup();
    const options = rq.stream.ticks.queryOptions({ n: 30 }, { reducer: (last: Tick[], batch) => [...last, ...batch].slice(-5), initialValue: [] });
    expect(await queryClient.fetchQuery(options).then((rows) => rows.map((t) => t.seq))).toEqual([25, 26, 27, 28, 29]);
  });

  it('fail the query with the error of the stream', async () => {
    const { rq, queryClient } = setup();
    const observer = new QueryObserver(queryClient, rq.stream.failing.queryOptions());
    await settled(observer);
    expect(observer.getCurrentResult().error).toMatchObject({ code: 'UPSTREAM' });
  });

  it('stop the stream when the last observer leaves', async () => {
    const { api, rq, queryClient } = setup();
    const before = { ...(await api.stream.stats({ decode: 'eager' })) };
    const observer = new QueryObserver(queryClient, rq.stream.forever.queryOptions());
    const off = observer.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 30));
    expect(observer.getCurrentResult().data?.length).toBeGreaterThan(0);
    off(); // an unmounted component
    await new Promise((r) => setTimeout(r, 30));
    expect(await api.stream.stats({ decode: 'eager' })).toEqual({ running: before.running, cleaned: before.cleaned + 1 });
  });

  it('keep live state as rows, in order', async () => {
    resetUnits();
    const { api, rq, queryClient } = setup();
    const observer = new QueryObserver(queryClient, rq.stream.units.queryOptions({ order: 'desc' }));
    const seen: Unit[][] = [];
    const off = observer.subscribe((r) => r.data && seen.push(r.data));
    await vi.waitFor(() => expect(seen.at(-1)?.map((u) => u.id)).toEqual([3, 2, 1]));
    await api.stream.move({ id: 2, x: 5, y: 6 });
    await vi.waitFor(() => expect(seen.at(-1)?.find((u) => u.id === 2)).toMatchObject({ x: 5, y: 6 }));
    const [before, after] = seen.slice(-2);
    // an unchanged row stays the same object
    expect(after.find((u) => u.id === 3)).toBe(before.find((u) => u.id === 3));
    expectTypeOf(observer.getCurrentResult().data).toEqualTypeOf<Unit[] | undefined>();
    off();
    await queryClient.cancelQueries({ queryKey: rq.stream.units.pathKey() });
  });
});

describe('hashKey', () => {
  it('hashes as TanStack Query does, and takes bigints', () => {
    for (const key of [[['user', 'get'], { id: 3, b: [1, { z: 1, a: 2 }] }], [['x']], [['d'], new Date(0)]]) expect(hashKey(key)).toBe(tanstackHash(key));
    expect(() => tanstackHash([['x'], { n: 1n }])).toThrow();
    expect(hashKey([['x'], { n: 1n }])).toBe('[["x"],{"n":{"$bigint":"1"}}]');
  });
});
