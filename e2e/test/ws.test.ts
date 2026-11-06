// The WebSocket transport (DESIGN §19) where HTTP has nothing alike: one socket for everything, live
// state across a dropped connection, idle close, malformed messages, slow clients.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient, webSocket, type WebSocketOptions } from 'ts-bin-rpc/client';
import { acceptWebSocket } from 'ts-bin-rpc/node';
import { createHandler, SOCKET_PROTOCOL, stream } from 'ts-bin-rpc/server';
import type { RpcError } from 'ts-bin-rpc';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appRouter, resetUnits, units, type Tick } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';
import { serveWebSockets, type TestSocket } from '../src/ws-server.ts';
import { encodeStart } from '../../packages/ts-bin-rpc/src/socket.ts';

/** An upgrade request as a browser on the server's own page sends it. */
const upgrade = (headers: Record<string, string> = {}) => new Request('http://x/rpc', { headers: { 'sec-websocket-protocol': SOCKET_PROTOCOL, ...headers } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (ok: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await sleep(5);
  }
};

/** A fast producer of 64 KB rows, for the slow-client test; counts its cleanups. */
const floods = { cleaned: 0 };
const flood = async () =>
  stream<Tick>((emit) => {
    const timer = setInterval(() => {
      for (let i = 0; i < 50; i++) emit({ seq: i, price: 1, side: 'buy', venue: 'x'.repeat(64 * 1024) } as Tick);
    }, 1);
    return () => (clearInterval(timer), floods.cleaned++);
  }, { maxBuffered: 1 << 20 });
const router = { ...appRouter, stream: { ...appRouter.stream, forever: flood } };
const handler = createHandler(router, { procedures, prefix: '/rpc', onError: () => {} });

let server: http.Server;
let ws: string;
const sockets: TestSocket[] = [];
beforeAll(async () => {
  server = http.createServer();
  const accept = acceptWebSocket(handler);
  serveWebSockets(server, {
    '/rpc': (s, req) => {
      sockets.push(s);
      accept(s, req);
    },
  });
  await new Promise<void>((r) => server.listen(0, r));
  ws = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`;
});
afterAll(() => server.close());

const clientOf = (o: WebSocketOptions = {}) => createClient<typeof router>({ url: 'http://unused/rpc', procedures, socket: webSocket(ws, { calls: true, ...o }), fetch: () => Promise.reject(new Error('no HTTP here')) });

describe('WebSocket transport', () => {
  it('carries calls and subscriptions on one socket', async () => {
    const before = sockets.length;
    const api = clientOf();
    const rows: number[] = [];
    const done = new Promise<void>((end) => api.stream.ticks.subscribe({ n: 50, burst: 5 }, { row: (t) => rows.push(t.seq), end }));
    const [a, b] = await Promise.all([api.user.get({ id: 1 }), api.user.get({ id: 3 })]);
    await done;
    expect([a.name, b.name]).toEqual(['Ада', 'Chloé']);
    expect(rows).toEqual([...Array(50).keys()]);
    expect(sockets.length - before).toBe(1);
  });

  it('keeps live state across a dropped socket and fails plain streams with DISCONNECTED', async () => {
    resetUnits();
    const api = clientOf();
    const snapshots: boolean[] = [];
    const live = api.stream.units.subscribe((_, c) => snapshots.push(c.snapshot));
    let error: RpcError | undefined;
    api.stream.ticks.subscribe({ n: 100_000, burst: 1 }, { error: (e) => (error = e) });
    await until(() => live.state.size === 3);
    const first = sockets.at(-1)!;

    first.kill();
    await until(() => !!error);
    expect(error?.code).toBe('DISCONNECTED');
    units.update(2, { name: 'while away' });
    await until(() => live.state.get(2)?.name === 'while away');
    expect(sockets.at(-1)).not.toBe(first);
    expect(snapshots.filter(Boolean).length).toBe(2); // the first one and the one after reconnecting
    units.update(2, { hp: 5 });
    await until(() => live.state.get(2)?.hp === 5);
    live.stop();
  });

  it('closes an idle socket and opens a new one on use', async () => {
    const api = clientOf({ idle: 30 });
    await api.user.list();
    const s = sockets.at(-1)!;
    let closed = false;
    s.on('close', () => (closed = true));
    await until(() => closed);
    expect((await api.user.get({ id: 2 })).name).toBe('Bob');
    expect(sockets.at(-1)).not.toBe(s);
  });

  it('aborts a call', async () => {
    const api = clientOf();
    const ctl = new AbortController();
    const p = api.user.get({ id: 1 }, { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect((await api.user.get({ id: 2 })).name).toBe('Bob'); // the socket is still fine
  });

  it('stops the source of a client too slow for its queue', async () => {
    // a socket that never takes anything out of its buffer
    const socket = { sent: 0, bufferedAmount: 1 << 30, send() { this.sent++; }, close() {} };
    const conn = handler.socket(socket, upgrade());
    conn.message(encodeStart(1, 'stream.forever', procedures['stream.forever'].hash, new Uint8Array(0)));
    // the first write found the buffer full; frames queue in the sink up to maxBuffered, then the
    // stream fails with SLOW_CONSUMER, whose frame waits for the socket to drain
    await until(() => floods.cleaned === 1);
    expect(socket.sent).toBe(1);
    conn.close();
  });

  /** A socket that records what the server sends and how it closes. */
  const fake = () => {
    const s = { code: 0, reason: '', sent: [] as Uint8Array[], send(b: Uint8Array) { s.sent.push(b); }, close(c?: number, r?: string) { s.code = c ?? 0; s.reason = r ?? ''; } };
    return s;
  };

  it('closes the connection on a malformed message, answers an unknown operation', async () => {
    for (const bad of [new Uint8Array([1, 0, 0, 0, 1, 0, 0]), encodeStart(0, 'version', '', new Uint8Array(0))]) {
      const s = fake();
      handler.socket(s, upgrade()).message(bad);
      expect(s.code).toBe(1002);
    }
    const text = fake();
    handler.socket(text, upgrade()).message('hello');
    expect(text.code).toBe(1003);
    // an operation of a newer client: an error under its ID, the socket stays
    const op = fake();
    handler.socket(op, upgrade()).message(new Uint8Array([1, 0, 0, 0, 9, 0, 0, 0]));
    expect(op.code).toBe(0);
    expect(op.sent.length).toBe(1);
    expect([...op.sent[0].subarray(0, 8)]).toEqual([1, 0, 0, 0, 1, 0, 400 & 255, 400 >> 8]);
    // and one it may ignore
    const skip = fake();
    handler.socket(skip, upgrade()).message(new Uint8Array([1, 0, 0, 0, 200, 0, 0, 0]));
    expect([skip.code, skip.sent.length]).toEqual([0, 0]);
  });

  it('refuses sockets from other sites and from clients of another protocol', () => {
    const other = fake();
    handler.socket(other, upgrade({ origin: 'https://evil.example', host: 'x' }));
    expect([other.code, other.reason]).toEqual([1008, 'origin not allowed']);
    const own = fake();
    handler.socket(own, upgrade({ origin: 'http://x', host: 'x' }));
    expect(own.code).toBe(0);
    const allowed = fake();
    createHandler(router, { procedures, prefix: '/rpc', socket: { allowedOrigins: ['https://app.example'] } }).socket(allowed, upgrade({ origin: 'https://app.example', host: 'api.example' }));
    expect(allowed.code).toBe(0);
    const old = fake();
    handler.socket(old, new Request('http://x/rpc'));
    expect(old.code).toBe(1002);
  });

  it('closes a socket that reuses a live request ID, and limits subscriptions', async () => {
    const dup = fake();
    const conn = handler.socket(dup, upgrade());
    const start = (id: number) => conn.message(encodeStart(id, 'stream.forever', procedures['stream.forever'].hash, new Uint8Array(0)));
    start(1);
    start(1);
    expect([dup.code, dup.reason]).toEqual([1002, 'request ID 1 is in use']);
    conn.close();

    const few = fake();
    const limited = createHandler(router, { procedures, prefix: '/rpc', onError: () => {}, socket: { maxSubscriptions: 2 } });
    const c = limited.socket(few, upgrade());
    for (const id of [1, 2, 3]) c.message(encodeStart(id, 'stream.forever', procedures['stream.forever'].hash, new Uint8Array(0)));
    await until(() => few.sent.some((b) => b[0] === 3));
    const third = few.sent.find((b) => b[0] === 3)!;
    expect([third[4], third[6] | (third[7] << 8)]).toEqual([1, 429]);
    c.close();
  });
});
