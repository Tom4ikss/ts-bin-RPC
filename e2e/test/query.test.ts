// Queries: GET with the input in the URL, Cache-Control, ETag and 304, in process.
import { createClient } from 'ts-bin-rpc/client';
import { createHandler, query, stream } from 'ts-bin-rpc/server';
import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';

const handler = createHandler(appRouter, { procedures, prefix: '/rpc', context: (r) => ({ user: r.headers.get('authorization')?.slice(7) ?? null }) });

/** A client over the handler that records every request it makes. */
function recorded() {
  const requests: Request[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    return handler(request);
  }) as typeof fetch;
  return { api: createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: fetchFn }), requests };
}

const get = (path: string, query = '', headers: HeadersInit = {}) =>
  handler(new Request(`http://test/rpc/${path}?h=${procedures[path as 'version'].hash}${query}`, { headers }));

describe('the client', () => {
  it('calls queries with GET, the contract hash and the input in the URL, and nothing else', async () => {
    const { api, requests } = recorded();
    expect((await api.catalog.user({ id: 3 })).name).toBe('Chloé');
    await api.version();
    await api.user.get({ id: 3 });
    const [user, version, post] = requests;
    const url = new URL(user.url);
    expect([user.method, url.pathname, url.searchParams.get('h')]).toEqual(['GET', '/rpc/catalog.user', procedures['catalog.user'].hash]);
    expect(url.searchParams.get('i')).toMatch(/^[\w-]+$/);
    // No content type and no schema header: a simple request, without a CORS preflight.
    expect([...user.headers.keys()]).toEqual([]);
    expect(new URL(version.url).search).toBe(`?h=${procedures.version.hash}`);
    expect(post.method).toBe('POST');
  });

  it('sends a query by POST when the input would make the URL too long', async () => {
    const { api, requests } = recorded();
    expect((await api.catalog.echo({ text: 'é'.repeat(1000) })).text).toBe('é'.repeat(1000));
    expect((await api.catalog.echo({ text: 'é'.repeat(600) })).text).toBe('é'.repeat(600));
    expect(requests.map((r) => r.method)).toEqual(['POST', 'GET']);
  });
});

describe('the server', () => {
  it('sets Cache-Control from query() and a strong ETag', async () => {
    const catalog = await get('catalog.size');
    expect([catalog.status, catalog.headers.get('cache-control')]).toEqual([200, 'private, max-age=60']);
    expect((await get('version')).headers.get('cache-control')).toBe('public, max-age=300');
    const profile = await get('account.profile', '', { authorization: 'Bearer ann' });
    expect(profile.headers.get('cache-control')).toBe('private, no-cache');
    const etag = catalog.headers.get('etag');
    expect(etag).toMatch(/^"[\w-]{11}"$/);
    expect((await get('catalog.size')).headers.get('etag')).toBe(etag);
  });

  it('answers 304 without a body when If-None-Match lists the ETag', async () => {
    const etag = (await get('version')).headers.get('etag')!;
    for (const header of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
      const res = await get('version', '', { 'if-none-match': header });
      expect([res.status, await res.text(), res.headers.get('etag'), res.headers.get('cache-control')]).toEqual([304, '', etag, 'public, max-age=300']);
    }
    expect((await get('version', '', { 'if-none-match': '"other"' })).status).toBe(200);
  });

  it('marks errors of a GET no-store', async () => {
    const missing = await get('catalog.user', `&i=${new URL((await firstRequest((api) => api.catalog.user({ id: 99 }).catch(() => {}))).url).searchParams.get('i')}`);
    expect([missing.status, missing.headers.get('cache-control')]).toEqual([404, 'no-store']);
    const refused = await get('account.profile');
    expect([refused.status, refused.headers.get('cache-control')]).toEqual([401, 'no-store']);
    const bad = await get('catalog.user', '&i=a');
    expect([bad.status, bad.headers.get('cache-control')]).toEqual([400, 'no-store']);
  });

  it('takes GET only for queries, and POST for every procedure', async () => {
    const res = await handler(new Request('http://test/rpc/whoami'));
    expect([res.status, res.headers.get('allow')]).toEqual([405, 'POST']);
    const put = await handler(new Request('http://test/rpc/version', { method: 'PUT' }));
    expect([put.status, put.headers.get('allow')]).toEqual([405, 'GET, POST']);
  });

  it('compares the contract hash in the URL', async () => {
    const strict = createHandler(appRouter, { procedures, prefix: '/rpc', schemaMismatch: 'error' });
    const res = await strict(new Request('http://test/rpc/version?h=other'));
    expect([res.status, res.headers.get('cache-control')]).toEqual([409, 'no-store']);
  });

  it('refuses a router whose queries do not match the generated code', () => {
    const plain = { ...appRouter, version: async () => ({ version: '1.0' }) };
    expect(() => createHandler(plain, { procedures, prefix: '/rpc' })).toThrow("generated code calls 'version' with GET, but the router does not mark it with query(); run tbr generate");
    const ticks = query(async (input: { n: number }) => stream<{ seq: number }>(() => {}));
    const streaming = { ...appRouter, stream: { ...appRouter.stream, ticks } };
    expect(() => createHandler(streaming as never, { procedures, prefix: '/rpc' })).toThrow("procedure 'stream.ticks' is a stream and cannot be a query");
  });
});

describe('query()', () => {
  it('checks its options and its target', () => {
    expect(() => query(async () => 1, { maxAge: 1.5 })).toThrow('maxAge must be a whole number of seconds');
    expect(() => query(5 as never)).toThrow('query() takes a procedure or a namespace, got number');
  });

  it('leaves the procedures as they are', async () => {
    const fn = vi.fn(async (input: { x: number }) => input.x);
    const ns = query({ fn, inner: { fn } });
    expect(ns.fn).toBe(fn);
    expect(await ns.inner.fn({ x: 2 })).toBe(2);
  });
});

/** The first request a client call makes. */
async function firstRequest(call: (api: ReturnType<typeof recorded>['api']) => Promise<unknown>): Promise<Request> {
  const r = recorded();
  await call(r.api);
  return r.requests[0];
}
