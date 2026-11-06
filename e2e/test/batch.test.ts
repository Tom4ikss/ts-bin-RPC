// Batches (DESIGN §21), in process: one request for the calls of a task, answers as they end,
// context once per batch, and what goes alone.
import { batch, createClient, type BatchOptions } from 'ts-bin-rpc/client';
import { createHandler, type HandlerOptions } from 'ts-bin-rpc/server';
import { RpcError } from 'ts-bin-rpc';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toNodeListener } from 'ts-bin-rpc/node';
import { describe, expect, it } from 'vitest';
import { appRouter } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';
import { encodeBatch } from '../../packages/ts-bin-rpc/src/batch.ts';
import { encodeStart } from '../../packages/ts-bin-rpc/src/socket.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `user.get` of id 1 answers after 50 ms; every other call at once. */
const router = {
  ...appRouter,
  user: {
    ...appRouter.user,
    get: async (input: { id: number }) => {
      if (input.id === 1) await sleep(50);
      return appRouter.user.get(input as never);
    },
  },
};

function setup(o: { batch?: BatchOptions; server?: Partial<HandlerOptions<typeof router>> } = {}) {
  const requests: string[] = [];
  let contexts = 0;
  const handler = createHandler(router as typeof appRouter, {
    procedures,
    prefix: '/rpc',
    context: (r) => (contexts++, { user: r.headers.get('authorization')?.replace(/^Bearer /, '') ?? null }),
    onError: () => {},
    ...o.server,
  });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = new Request(input, init);
    requests.push(`${r.method} ${new URL(r.url).pathname}`);
    return handler(r);
  }) as typeof fetch;
  const api = createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: fetchFn, batch: batch(o.batch), headers: () => ({ authorization: 'Bearer ann' }) });
  return { api, requests, handler, contexts: () => contexts };
}

describe('batches', () => {
  it('send the calls of one task in one request, and build the context once', async () => {
    const { api, requests, contexts } = setup();
    const [a, b, me, who] = await Promise.all([api.user.get({ id: 2 }), api.user.get({ id: 3 }), api.account.me(), api.whoami()]);
    expect([a.name, b.name, me.name, who.user]).toEqual(['Bob', 'Chloé', 'ann', 'ann']);
    expect(requests).toEqual(['POST /rpc/']);
    expect(contexts()).toBe(1);
  });

  it('answer each call as it ends', async () => {
    const { api } = setup();
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((id) => api.user.get({ id }).then(() => order.push(id))));
    expect(order).toEqual([2, 3, 1]);
  });

  it('answer each call as it ends through toNodeListener too', async () => {
    const { handler } = setup();
    const server = http.createServer(toNodeListener(handler));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const api = createClient<typeof appRouter>({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`, procedures, batch: batch() });
      const at: Record<number, number> = {};
      await Promise.all([1, 2, 3].map((id) => api.user.get({ id }).then(() => (at[id] = performance.now()))));
      // the fast calls are not held until the slow one ends, 50 ms later: held, they would come in one
      // chunk with it. The margin is loose, a busy runner has shown 27 ms.
      expect(at[1] - Math.max(at[2], at[3])).toBeGreaterThan(10);
    } finally {
      server.close();
    }
  });

  it('fail calls one by one', async () => {
    const { api } = setup();
    const [ok, missing, bad] = await Promise.allSettled([api.user.get({ id: 2 }), api.user.get({ id: 99 }), api.rename({ name: '', nick: [], age: 1 })]);
    expect(ok.status).toBe('fulfilled');
    expect((missing as PromiseRejectedResult).reason).toMatchObject({ code: 'NOT_FOUND', status: 404, data: { id: 99 } });
    expect((bad as PromiseRejectedResult).reason).toMatchObject({ code: 'BAD_INPUT', status: 400 });
  });

  it('send a lone call as it is, queries by GET, and calls with headers of their own alone', async () => {
    const { api, requests } = setup();
    await api.user.get({ id: 2 });
    await Promise.all([api.version(), api.user.get({ id: 2 }, { headers: { 'x-a': '1' } }), api.user.get({ id: 3 })]);
    expect(requests.map((r) => r.replace(/\?.*/, ''))).toEqual(['POST /rpc/user.get', 'GET /rpc/version', 'POST /rpc/user.get', 'POST /rpc/user.get']);
  });

  it('split at maxCalls, and wait a window when asked', async () => {
    const split = setup({ batch: { maxCalls: 2 } });
    await Promise.all([2, 3, 2, 3, 2].map((id) => split.api.user.get({ id })));
    expect(split.requests).toEqual(['POST /rpc/', 'POST /rpc/', 'POST /rpc/user.get']);

    const late = setup({ batch: { window: 20 } });
    const first = late.api.user.get({ id: 2 });
    await sleep(5);
    await Promise.all([first, late.api.user.get({ id: 3 })]);
    expect(late.requests).toEqual(['POST /rpc/']);
  });

  it('drop an aborted call from the batch', async () => {
    const { api } = setup();
    const ctl = new AbortController();
    const gone = api.user.get({ id: 2 }, { signal: ctl.signal });
    const kept = [api.user.get({ id: 3 }), api.user.get({ id: 2 })];
    ctl.abort();
    await expect(gone).rejects.toMatchObject({ name: 'AbortError' });
    expect((await Promise.all(kept)).map((u) => u.name)).toEqual(['Chloé', 'Bob']);
  });

  it('fail every call with the answer to the whole batch', async () => {
    const { api } = setup({ server: { batch: false } });
    const results = await Promise.allSettled([api.user.get({ id: 2 }), api.user.get({ id: 3 })]);
    for (const r of results) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'NOT_FOUND', message: 'this server takes no batches' });
  });

  it('refuse malformed batches, streams and too many calls', async () => {
    const { handler } = setup({ server: { batch: { maxCalls: 2 } } });
    const post = (body: Uint8Array) => handler(new Request('http://test/rpc/', { method: 'POST', headers: { 'content-type': 'application/vnd.tbr.batch' }, body: body as BodyInit }));
    expect((await post(new Uint8Array([1, 2, 3]))).status).toBe(400);
    const start = (i: number, path: string) => encodeStart(i, path, procedures[path as keyof typeof procedures].hash, new Uint8Array(0));
    expect((await post(encodeBatch([start(0, 'user.list'), start(1, 'user.list'), start(2, 'user.list')]))).status).toBe(413);
    const res = await post(encodeBatch([start(0, 'stream.forever'), start(1, 'user.list')]));
    expect(res.status).toBe(200);
    expect(new TextDecoder().decode(await res.arrayBuffer())).toContain('streams are not batched');
  });

  it('reject the calls when the response breaks off', async () => {
    const api = createClient<typeof appRouter>({
      url: 'http://test/rpc',
      procedures,
      batch: batch(),
      fetch: (async () => new Response(new Uint8Array([8, 0, 0, 0, 0, 0, 0, 0, 1]), { headers: { 'content-type': 'application/vnd.tbr.batch' } })) as unknown as typeof fetch,
    });
    const results = await Promise.allSettled([api.user.get({ id: 2 }), api.user.get({ id: 3 })]);
    for (const r of results) expect((r as PromiseRejectedResult).reason).toMatchObject({ name: 'RpcError', code: 'DISCONNECTED', status: 0 });
  });
});
