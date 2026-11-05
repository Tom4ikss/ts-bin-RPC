// Live state (DESIGN §18), in process: snapshots, deltas, resync of slow clients, encoding once.
import { createClient } from 'ts-bin-rpc/client';
import { createHandler } from 'ts-bin-rpc/server';
import type { LiveChanges, LiveSubscription, RpcError } from 'ts-bin-rpc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter, resetUnits, units, type Unit } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const handler = createHandler(appRouter, { procedures, prefix: '/rpc' });
const via = (delay = 0) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await handler(new Request(input, init));
    if (delay) await sleep(delay);
    return res;
  }) as typeof fetch;
const clientOf = (delay = 0) => createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: via(delay) });

type Sub = LiveSubscription<Unit, 'id'>;
/** A subscription that records its changes; `next()` waits for the next one. */
function watch(open: (h: Parameters<ReturnType<typeof clientOf>['stream']['units']['subscribe']>[0]) => Sub) {
  const changes: LiveChanges<number>[] = [];
  const waiting: (() => void)[] = [];
  let error: RpcError | undefined;
  let ended = false;
  const sub = open({
    change: (_state, c) => {
      changes.push(c);
      waiting.splice(0).forEach((w) => w());
    },
    error: (e) => ((error = e), waiting.splice(0).forEach((w) => w())),
    end: () => ((ended = true), waiting.splice(0).forEach((w) => w())),
  });
  const seen = { n: 0 };
  return {
    sub,
    changes,
    get error() { return error; },
    get ended() { return ended; },
    /** The change after the ones already returned. */
    async next(): Promise<LiveChanges<number>> {
      while (changes.length <= seen.n) {
        if (error || ended) throw new Error(`no more changes: ${error?.code ?? 'ended'}`);
        await new Promise<void>((r) => waiting.push(r));
      }
      return changes[seen.n++];
    },
    async until(ok: () => boolean, ms = 2000) {
      const t0 = Date.now();
      while (!ok()) {
        if (Date.now() - t0 > ms) throw new Error('timed out');
        await sleep(5);
      }
    },
  };
}

const open = (api = clientOf()) => watch((h) => api.stream.units.subscribe(h));
const subs: Sub[] = [];
beforeEach(() => resetUnits());
afterEach(async () => {
  subs.splice(0).forEach((s) => s.stop());
  await sleep(10);
  vi.restoreAllMocks();
});
const track = <T extends { sub: Sub }>(w: T) => (subs.push(w.sub), w);

describe('live state', () => {
  it('sends a snapshot, then the fields that changed', async () => {
    const w = track(open());
    const first = await w.next();
    expect(first).toEqual({ snapshot: true, set: [1, 2, 3], removed: [] });
    expect(w.sub.state.get(2)).toEqual({ id: 2, name: 'u2', x: 2, y: -2, hp: 100, kind: 'unit' });
    const two = w.sub.state.get(2);

    units.update(1, { x: 10 }).update(1, { y: 11 }).update(3, { hp: 7 });
    expect(await w.next()).toEqual({ snapshot: false, set: [1, 3], removed: [] });
    expect(w.sub.state.get(1)).toEqual({ id: 1, name: 'u1', x: 10, y: 11, hp: 100, kind: 'unit' });
    expect(w.sub.state.get(3)?.hp).toBe(7);
    expect(w.sub.state.get(2)).toBe(two); // untouched rows keep their identity
  });

  it('adds and removes rows, and sends a row whole when a field becomes undefined', async () => {
    const w = track(open());
    await w.next();
    units.set({ id: 4, name: 'new', x: 0, y: 0, hp: 1, kind: 'unit', target: 'u1', seenAt: new Date(5) });
    units.delete(2);
    expect(await w.next()).toEqual({ snapshot: false, set: [4], removed: [2] });
    expect(w.sub.state.get(4)).toEqual({ id: 4, name: 'new', x: 0, y: 0, hp: 1, kind: 'unit', target: 'u1', seenAt: new Date(5) });
    expect(w.sub.state.has(2)).toBe(false);

    units.update(4, { target: null, seenAt: new Date(5) }); // the same date: not a change
    await w.next();
    expect(w.sub.state.get(4)).toMatchObject({ target: null, seenAt: new Date(5) });
    units.update(4, { target: undefined });
    await w.next();
    expect(w.sub.state.get(4)).toEqual({ id: 4, name: 'new', x: 0, y: 0, hp: 1, kind: 'unit', seenAt: new Date(5) });
    expect(units.get(4)).not.toHaveProperty('target', null);
  });

  it('gives a new subscriber the current state, and encodes each change once for every subscriber', async () => {
    units.update(1, { name: 'moved' });
    const a = track(open());
    const b = track(open());
    await a.next();
    await b.next();
    expect(b.sub.state.get(1)?.name).toBe('moved');
    expect(units.subscribers).toBe(2);

    const encode = vi.spyOn(procedures['stream.units'].delta, 'encode');
    units.update(2, { x: 99 });
    await a.next();
    await b.next();
    expect(encode).toHaveBeenCalledTimes(1);
    expect(a.sub.state.get(2)?.x).toBe(99);
    expect(b.sub.state.get(2)?.x).toBe(99);
  });

  it('stops: the server forgets the subscriber', async () => {
    const w = open();
    await w.next();
    expect(units.subscribers).toBe(1);
    w.sub.stop();
    await w.until(() => units.subscribers === 0);
    units.update(1, { x: 5 });
    await sleep(20);
    expect(w.changes).toHaveLength(1);
    expect(w.ended).toBe(false); // stop() is not an end
  });

  it('sends a fresh snapshot to a client too slow for its queue', async () => {
    const snapshots = vi.spyOn(procedures['stream.unitsSmall'].output, 'encode');
    const api = clientOf(100);
    const w = track(watch((h) => api.stream.unitsSmall.subscribe(h)));
    await sleep(5);
    for (let i = 0; i < 25; i++) {
      units.update(1 + (i % 3), { name: `${i}`.padEnd(1000, '.') });
      await sleep(6);
    }
    await w.until(() => [1, 2, 3].every((id) => w.sub.state.get(id)?.name === units.get(id)?.name));
    expect(w.error).toBeUndefined();
    // the queued deltas and the first snapshot were replaced: the client saw only the latest snapshot
    expect(snapshots.mock.calls.length).toBeGreaterThan(1);
    expect(w.changes[0].snapshot).toBe(true);
    expect([...w.sub.state.values()]).toEqual([...units.values()]);
  });

  it('ends every subscriber with the error passed to end(), and with BAD_OUTPUT on a bad row', async () => {
    const w = track(open());
    await w.next();
    units.set({ id: 9, name: 42 as unknown as string, x: 0, y: 0, hp: 0, kind: 'unit' });
    await w.until(() => !!w.error);
    expect(w.error?.code).toBe('BAD_OUTPUT');
    expect(units.subscribers).toBe(0);

    resetUnits();
    const v = track(open());
    await v.next();
    units.end(new Error('shutting down'));
    await v.until(() => !!v.error);
    expect(v.error?.code).toBe('INTERNAL');
  });

  it('stops on an aborted signal', async () => {
    const ctl = new AbortController();
    const w = watch((h) => clientOf().stream.units.subscribe(h, { signal: ctl.signal }));
    await w.next();
    ctl.abort();
    await w.until(() => units.subscribers === 0);
  });
});
