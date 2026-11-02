// Handler and client options, in process.
import { createClient } from 'ts-bin-rpc/client';
import { createHandler } from 'ts-bin-rpc/server';
import { RpcError } from 'ts-bin-rpc';
import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';

const via = (handler: (r: Request) => Promise<Response>) => (async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;
const client = (fetchFn: typeof fetch, debug = false) => createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: fetchFn, debug });

describe('createHandler', () => {
  it('refuses a router that does not match the generated code', () => {
    const { crash: _, ...fewer } = appRouter;
    expect(() => createHandler(fewer, { procedures, prefix: '/rpc' })).toThrow("generated code has procedure 'crash' that the router does not; run tbr generate");
    expect(() => createHandler({ ...appRouter, extra: async () => 1 }, { procedures, prefix: '/rpc' })).toThrow("procedure 'extra' is missing");
  });

  it('answers 409 SCHEMA_MISMATCH when asked to', async () => {
    const handler = createHandler(appRouter, { procedures: { ...procedures, whoami: { ...procedures.whoami, hash: 'server' } }, prefix: '/rpc', schemaMismatch: 'error' });
    await expect(client(via(handler)).whoami()).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH', status: 409 });
  });

  it('answers 500 BAD_OUTPUT when a procedure breaks its own types, with the path for onError', async () => {
    const onError = vi.fn();
    const broken = { ...appRouter, user: { ...appRouter.user, list: async () => [{ ...(await appRouter.user.get({ id: 1 })), id: -5 }] } };
    const handler = createHandler(broken, { procedures, prefix: '/rpc', onError });
    const e = await client(via(handler)).user.list().catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'BAD_OUTPUT', status: 500, message: 'the procedure returned a value that does not match its declared type' });
    expect(onError.mock.calls[0][0]).toMatchObject({ name: 'EncodeError', path: '[0].id', message: 'at [0].id: expected u32, got -5' });
    expect(onError.mock.calls[0][1].path).toBe('user.list');
  });

  it('limits the request size', async () => {
    const handler = createHandler(appRouter, { procedures, prefix: '/rpc', limits: { maxBytes: 64 } });
    await expect(client(via(handler)).echo({ text: 'x'.repeat(100), bytes: new Uint8Array() })).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
  });
});

describe('createClient', () => {
  it('reports responses that are not ts-bin-rpc messages', async () => {
    const proxy = via(async () => new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    const e = await client(proxy).whoami().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RpcError);
    expect(e).toMatchObject({ code: 'BAD_RESPONSE', status: 502, message: 'HTTP 502: not a ts-bin-rpc response' });
  });

  it('logs calls in debug mode', async () => {
    const handler = createHandler(appRouter, { procedures, prefix: '/rpc' });
    const group = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    try {
      await client(via(handler), true).user.get({ id: 1 });
      expect(group.mock.calls[0][0]).toMatch(/^tbr user\.get 200 [\d.]+ ms, \d+ B → \d+ B$/);
      expect(log).toHaveBeenCalledWith('output', expect.objectContaining({ name: 'Ада', tags: ['founder'] }));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('does not treat `then` as a procedure', async () => {
    const api = client(via(createHandler(appRouter, { procedures, prefix: '/rpc' })));
    expect((await Promise.resolve(api.user)) === api.user).toBe(true);
  });
});
