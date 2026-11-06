// The WebSocket transport (DESIGN §19) where HTTP has nothing alike: one socket for everything, live
// state across a dropped connection, idle close, malformed messages, slow clients.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient, webSocket, type WebSocketOptions } from 'ts-bin-rpc/client';
import { acceptWebSocket } from 'ts-bin-rpc/node';
import { createHandler, stream } from 'ts-bin-rpc/server';
import type { RpcError } from 'ts-bin-rpc';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appRouter, resetUnits, units, type Tick } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';
import { serveWebSockets, type TestSocket } from '../src/ws-server.ts';
import { encodeStart } from '../../packages/ts-bin-rpc/src/socket.ts';

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
    const conn = handler.socket(socket, new Request('http://x/rpc'));
    conn.message(encodeStart(1, 'stream.forever', procedures['stream.forever'].hash, new Uint8Array(0)));
    // the first write found the buffer full; frames queue in the sink up to maxBuffered, then the
    // stream fails with SLOW_CONSUMER, whose frame waits for the socket to drain
    await until(() => floods.cleaned === 1);
    expect(socket.sent).toBe(1);
    conn.close();
  });

  it('closes the connection on a malformed message', async () => {
    let code = 0;
    const conn = handler.socket({ send() {}, close: (c) => void (code = c ?? 0) }, new Request('http://x/rpc'));
    conn.message(new Uint8Array([1, 0, 0, 0, 9, 0, 0, 0]));
    expect(code).toBe(1002);
    let text = 0;
    const conn2 = handler.socket({ send() {}, close: (c) => void (text = c ?? 0) }, new Request('http://x/rpc'));
    conn2.message('hello');
    expect(text).toBe(1003);
  });
});
