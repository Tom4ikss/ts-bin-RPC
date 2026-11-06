// Handler and client options, in process.
import { createClient, type ClientOptions } from 'ts-bin-rpc/client';
import { createHandler } from 'ts-bin-rpc/server';
import { RpcError } from 'ts-bin-rpc';
import { ABI, abi } from 'ts-bin-rpc/runtime';
import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';
import { context } from '../src/app.ts';

const via = (handler: (r: Request) => Promise<Response>) => (async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;
const client = (fetchFn: typeof fetch, debug = false) => createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: fetchFn, debug });

describe('createHandler', () => {
  it('refuses a router that does not match the generated code', () => {
    const { crash: _, ...fewer } = appRouter;
    expect(() => createHandler(fewer, { context, procedures, prefix: '/rpc' })).toThrow("generated code has procedure 'crash' that the router does not; run tbr generate");
    expect(() => createHandler({ ...appRouter, extra: async () => 1 }, { context, procedures, prefix: '/rpc' })).toThrow("procedure 'extra' is missing");
  });

  it('answers 409 SCHEMA_MISMATCH when asked to', async () => {
    const handler = createHandler(appRouter, { context, procedures: { ...procedures, whoami: { ...procedures.whoami, hash: 'server' } }, prefix: '/rpc', schemaMismatch: 'error' });
    await expect(client(via(handler)).whoami()).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH', status: 409 });
  });

  it('answers 500 BAD_OUTPUT when a procedure breaks its own types, with the path for onError', async () => {
    const onError = vi.fn();
    const broken = { ...appRouter, user: { ...appRouter.user, list: async () => [{ ...(await appRouter.user.get({ id: 1 })), id: -5 }] } };
    const handler = createHandler(broken, { context, procedures, prefix: '/rpc', onError });
    const e = await client(via(handler)).user.list().catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'BAD_OUTPUT', status: 500, message: 'the procedure returned a value that does not match its declared type' });
    expect(onError.mock.calls[0][0]).toMatchObject({ name: 'EncodeError', path: '[0].id', message: 'at [0].id: expected u32, got -5' });
    expect(onError.mock.calls[0][1].path).toBe('user.list');
  });

  it('builds the context only for procedures that take it', async () => {
    const context = vi.fn(() => ({ user: 'ann' }));
    const api = client(via(createHandler(appRouter, { procedures, prefix: '/rpc', context })));
    await api.user.get({ id: 1 });
    await api.series({ n: 1 });
    expect(context).not.toHaveBeenCalled();
    await api.whoami();
    await api.account.me(); // a procedure behind middleware that needs it
    expect(context).toHaveBeenCalledTimes(2);
  });

  it('refuses generated code of another runtime ABI', () => {
    expect(() => abi(ABI)).not.toThrow();
    expect(() => abi(ABI - 1)).toThrow('run tbr generate');
  });

  it('limits the request size', async () => {
    const handler = createHandler(appRouter, { context, procedures, prefix: '/rpc', limits: { maxBytes: 64 } });
    await expect(client(via(handler)).echo({ text: 'x'.repeat(100), bytes: new Uint8Array() })).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
  });
});

describe('createClient', () => {
  describe('decode', () => {
    const handler = createHandler(appRouter, { context, procedures, prefix: '/rpc' });
    const make = (decode?: ClientOptions<typeof appRouter>['decode']) =>
      createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: via(handler), decode });
    const isPlain = (v: object) => Object.keys(v).length > 0;
    const owns = (a: ArrayBufferView) => a.byteOffset === 0 && a.buffer.byteLength === a.byteLength;

    it('returns views by default', async () => {
      const user = await make().user.get({ id: 1 });
      expect(isPlain(user)).toBe(false);
      expect(() => Object.assign(user, { name: 'x' })).toThrow(TypeError);
      expect(isPlain((await make().user.list())[0])).toBe(false);
      // Typed arrays are read-only own properties over the response, hidden like the getters.
      const series = await make().series({ n: 4 });
      expect([isPlain(series), JSON.stringify({ ...series }), owns(series.t), series.t.length]).toEqual([false, '{}', false, 4]);
      expect(() => Object.assign(series, { t: new Float64Array() })).toThrow(TypeError);
      expect(series.t).toBe(series.t);
    });

    it("returns plain objects with decode: 'eager'", async () => {
      const api = make('eager');
      const user = await api.user.get({ id: 1 });
      expect(Object.keys(user)).toEqual(expect.arrayContaining(['id', 'name', 'role', 'balance', 'createdAt', 'tags']));
      user.name = 'Ada';
      expect(structuredClone(user)).toEqual({ ...user });
      const [row] = await api.user.list();
      expect({ ...row }).toMatchObject({ id: 1, tags: ['founder'] });
      expect(row.createdAt).toBeInstanceOf(Date);
      const { t, v } = await api.series({ n: 4 });
      // Typed arrays are copies, not views over the response bytes.
      expect([owns(t), owns(v), t.length]).toEqual([true, true, 4]);
    });

    it('takes a mode per procedure and per call', async () => {
      const api = make({ 'user.get': 'eager' });
      expect(isPlain(await api.user.get({ id: 1 }))).toBe(true);
      expect(isPlain((await api.user.list())[0])).toBe(false);
      expect(isPlain((await api.user.list(undefined, { decode: 'eager' }))[0])).toBe(true);
      expect(isPlain(await api.user.get({ id: 1 }, { decode: 'lazy' }))).toBe(false);
      expect(isPlain(await make('eager').user.get({ id: 1 }, { decode: 'lazy' }))).toBe(false);
      expect(isPlain(await make('eager').echo({ text: 'hi', bytes: new Uint8Array([1]) }))).toBe(true);
    });

    it('checks procedure paths in the map', () => {
      // @ts-expect-error: no such procedure
      make({ 'user.gett': 'eager' });
      // @ts-expect-error: a namespace is not a procedure
      make({ user: 'eager' });
    });
  });

  it('verifies responses unless NODE_ENV is production', async () => {
    const handler = createHandler(appRouter, { context, procedures, prefix: '/rpc' });
    const seen: unknown[] = [];
    const output = procedures['user.get'].output!;
    const spied = { ...procedures, 'user.get': { ...procedures['user.get'], output: { ...output, view: (b: Uint8Array, o?: { verify?: boolean }) => (seen.push(o?.verify), output.view(b, o)) } } };
    const get = (verify?: boolean) => createClient<typeof appRouter>({ url: 'http://test/rpc', procedures: spied, fetch: via(handler), verify }).user.get({ id: 1 });
    const env = process.env.NODE_ENV;
    try {
      await get();
      process.env.NODE_ENV = 'production';
      await get();
      await get(true);
      process.env.NODE_ENV = 'development';
      await get();
      await get(false);
    } finally {
      process.env.NODE_ENV = env;
    }
    expect(seen).toEqual([true, false, true, true, false]);
  });

  it('reports responses that are not ts-bin-rpc messages', async () => {
    const proxy = via(async () => new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    const e = await client(proxy).whoami().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RpcError);
    expect(e).toMatchObject({ code: 'BAD_RESPONSE', status: 502, message: 'HTTP 502: not a ts-bin-rpc response' });
  });

  it('logs calls in debug mode', async () => {
    const handler = createHandler(appRouter, { context, procedures, prefix: '/rpc' });
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
    const api = client(via(createHandler(appRouter, { context, procedures, prefix: '/rpc' })));
    expect((await Promise.resolve(api.user)) === api.user).toBe(true);
  });
});

describe('toNodeListener', () => {
  it('stays quiet when the client goes away mid-request', async () => {
    const http = await import('node:http');
    const net = await import('node:net');
    const { toNodeListener } = await import('ts-bin-rpc/node');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = http.createServer();
    const handled = new Promise<void>((resolve) => {
      const listener = toNodeListener(createHandler(appRouter, { context, procedures, prefix: '/rpc' }));
      server.on('request', (req, res) => void listener(req, res).then(resolve));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as import('node:net').AddressInfo;
      const socket = net.connect(port, '127.0.0.1');
      socket.write('POST /rpc/user.get HTTP/1.1\r\nhost: x\r\ncontent-type: application/vnd.tbr\r\ncontent-length: 100\r\n\r\nTB');
      await new Promise((r) => setTimeout(r, 50));
      socket.destroy();
      await handled;
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      server.close();
    }
  });
});

describe('validation rules', () => {
  const api = client(via(createHandler(appRouter, { context, procedures, prefix: '/rpc' })));

  it('answer 400 BAD_INPUT with the field, the rule and the row', async () => {
    await expect(api.rename({ name: '', nick: [], age: 1 })).rejects.toMatchObject({
      code: 'BAD_INPUT',
      status: 400,
      message: 'rename:input.name is shorter than 1',
      data: { field: 'rename:input.name', rule: 'minLength', limit: 1 },
    });
    await expect(api.rename({ name: 'Ann', nick: ['ann', 'Bo'], age: 1 })).rejects.toMatchObject({
      code: 'BAD_INPUT',
      data: { field: 'rename:input.nick[]', rule: 'pattern', limit: '^[a-z]+$', index: 1 },
    });
    await expect(api.rename({ name: 'Ann', nick: [], age: 151 })).rejects.toMatchObject({ data: { rule: 'max', limit: 150 } });
  });

  it('are not checked on outputs', async () => {
    expect((await api.rename({ name: 'Annabel', nick: ['ann'], age: 30 })).name).toBe('Annabel');
  });
});
