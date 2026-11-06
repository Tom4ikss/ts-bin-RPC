// What the audit before the beta found: error data with bigints, cookies through the Node adapter,
// bodies read only for a procedure, queries that cannot be public, statuses of errors.
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { RpcError } from 'ts-bin-rpc';
import { batch, createClient } from 'ts-bin-rpc/client';
import { toNodeListener } from 'ts-bin-rpc/node';
import { createHandler, query, SOCKET_PROTOCOL } from 'ts-bin-rpc/server';
import { afterEach, describe, expect, it } from 'vitest';
import { appRouter } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';
import { encodeStart } from '../../packages/ts-bin-rpc/src/socket.ts';
import { decodeError } from '../../packages/ts-bin-rpc/src/runtime.ts';

const via = (handler: (r: Request) => Promise<Response>) => (async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;

const servers: http.Server[] = [];
afterEach(() => void servers.splice(0).forEach((s) => s.close()));
const listen = async (listener: http.RequestListener) => {
  const server = http.createServer(listener);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return (server.address() as AddressInfo).port;
};

describe('errors', () => {
  const router = { ...appRouter, crash: async (): Promise<string> => { throw new RpcError('LIMIT', 'over the limit', { max: 10n, at: [1n] }); } };
  const handler = createHandler(router, { procedures, prefix: '/rpc', onError: () => {} });

  it('send bigints in data as decimal strings, over HTTP, in batches and over a socket', async () => {
    const expected = { code: 'LIMIT', status: 400, data: { max: '10', at: ['1'] } };
    const api = createClient<typeof router>({ url: 'http://test/rpc', procedures, fetch: via(handler) });
    await expect(api.crash()).rejects.toMatchObject(expected);
    const batched = createClient<typeof router>({ url: 'http://test/rpc', procedures, fetch: via(handler), batch: batch() });
    await expect(Promise.all([batched.crash(), batched.crash()])).rejects.toMatchObject(expected);

    const sent: Uint8Array[] = [];
    const conn = handler.socket({ send: (b) => void sent.push(b), close() {} }, new Request('http://x/rpc', { headers: { 'sec-websocket-protocol': SOCKET_PROTOCOL } }));
    conn.message(encodeStart(1, 'crash', procedures.crash.hash, new Uint8Array(0)));
    await expect.poll(() => sent.length).toBe(1);
    const e = decodeError(sent[0].slice(8));
    expect(JSON.parse(new TextDecoder().decode(e.data))).toEqual(expected.data);
  });

  it('go out with an error status whatever the procedure set', async () => {
    const odd = { ...appRouter, crash: async (): Promise<string> => { throw new RpcError('ODD', 'odd', undefined, { status: 99 }); } };
    const res = await createHandler(odd, { procedures, prefix: '/rpc' })(new Request('http://x/rpc/crash', { method: 'POST', headers: { 'content-type': 'application/vnd.tbr' } }));
    expect(res.status).toBe(500);
  });

  it('of GET requests are not cached', async () => {
    const handler = createHandler(appRouter, { procedures, prefix: '/rpc' });
    for (const url of ['http://x/rpc/nope', 'http://x/rpc/echo']) {
      const res = await handler(new Request(url));
      expect([res.status, res.headers.get('cache-control')]).toEqual([url.endsWith('nope') ? 404 : 405, 'no-store']);
    }
  });
});

describe('queries', () => {
  it('that take ctx cannot be public', () => {
    // a function of its own: query() marks the function it gets
    const router = { ...appRouter, whoami: query((_: void, ctx: { user: string | null }) => appRouter.whoami(_, ctx), { public: true }) };
    const marked = { ...procedures, whoami: { ...procedures.whoami, get: true } };
    expect(() => createHandler(router, { procedures: marked, prefix: '/rpc', context: () => ({ user: null }) })).toThrow("query 'whoami' takes ctx, so its responses may differ by user: it cannot be public");
  });
});

describe('toNodeListener', () => {
  it('keeps every Set-Cookie', async () => {
    const port = await listen(toNodeListener(async () => {
      const headers = new Headers();
      headers.append('set-cookie', 'a=1; Path=/');
      headers.append('set-cookie', 'b=2; Path=/');
      return new Response('ok', { headers });
    }));
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('answers a request for an unknown procedure without reading its body', async () => {
    const port = await listen(toNodeListener(createHandler(appRouter, { procedures, prefix: '/rpc' })));
    const socket = net.connect(port, '127.0.0.1');
    // a body announced but never sent: the answer must not wait for it
    socket.write('POST /rpc/nope HTTP/1.1\r\nhost: x\r\ncontent-type: application/vnd.tbr\r\ncontent-length: 1000000\r\n\r\nTB');
    const head = await new Promise<string>((resolve) => socket.once('data', (d) => resolve(String(d))));
    socket.destroy();
    expect(head).toMatch(/^HTTP\/1\.1 404/);
  });

  it('refuses a body over the handler limit as it arrives', async () => {
    const handler = createHandler(appRouter, { procedures, prefix: '/rpc', limits: { maxBytes: 1024 } });
    const port = await listen(toNodeListener(handler));
    const res = await fetch(`http://127.0.0.1:${port}/rpc/echo`, { method: 'POST', headers: { 'content-type': 'application/vnd.tbr' }, body: new Uint8Array(4096) });
    expect(res.status).toBe(413);
  });
});
