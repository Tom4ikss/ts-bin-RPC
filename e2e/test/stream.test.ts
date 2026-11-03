// Streaming options and failure modes, in process (DESIGN §14).
import { createClient, type ClientOptions } from 'ts-bin-rpc/client';
import { createHandler, stream, type StreamOptions } from 'ts-bin-rpc/server';
import { RpcError, type Batch } from 'ts-bin-rpc';
import { describe, expect, it, vi } from 'vitest';
import { encodeFrame, FrameReader, FRAME_DATA, FRAME_END, FRAME_HEARTBEAT, STREAM_CONTENT_TYPE } from '../../packages/ts-bin-rpc/src/frames.ts';
import { appRouter, type Tick } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = (seq: number): Tick => ({ seq, price: 1.5, side: 'buy' }) as Tick;

type Ticks = (typeof appRouter)['stream']['ticks'];
/** The fixture router with `stream.ticks` replaced. */
const withTicks = (ticks: Ticks) => ({ ...appRouter, stream: { ...appRouter.stream, ticks } });
const handlerOf = (router: typeof appRouter, onError?: (e: unknown) => void) => createHandler(router, { procedures, prefix: '/rpc', onError });
/** A fetch that answers in process; `delay` holds the response back, so the server queues frames. */
const via = (handler: (r: Request) => Promise<Response>, delay = 0) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await handler(new Request(input, init));
    if (delay) await sleep(delay);
    return res;
  }) as typeof fetch;
const clientOf = (fetchFn: typeof fetch, options: Partial<ClientOptions<typeof appRouter>> = {}) =>
  createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: fetchFn, ...options });

/** Runs a subscription to its end; resolves with the rows and the error, if any. */
function collect(api: ReturnType<typeof clientOf>, n = 0, signal?: AbortSignal) {
  return new Promise<{ rows: Tick[]; error?: RpcError }>((resolve) => {
    const rows: Tick[] = [];
    api.stream.ticks.subscribe({ n }, { row: (t) => rows.push(t), error: (error) => resolve({ rows, error }), end: () => resolve({ rows }) }, { signal });
  });
}

/** `n` ticks in bursts of 100, then the end; counts cleanups. */
function burst(n: number, options: StreamOptions, cleaned = { count: 0 }): Ticks {
  return async () =>
    stream<Tick>((emit, { end }) => {
      let seq = 0;
      const timer = setInterval(() => {
        for (let k = 0; k < 100 && seq < n; k++) emit(tick(seq++));
        if (seq >= n) end();
      }, 1);
      return () => {
        clearInterval(timer);
        cleaned.count++;
      };
    }, options);
}

describe('slow consumers', () => {
  it("end with SLOW_CONSUMER under overflow: 'error', and the source is cleaned up", async () => {
    const cleaned = { count: 0 };
    const api = clientOf(via(handlerOf(withTicks(burst(5000, { window: 1, maxBuffered: 4096, overflow: 'error' }, cleaned))), 60));
    const { rows, error } = await collect(api);
    expect(error).toMatchObject({ code: 'SLOW_CONSUMER' });
    expect(rows.length).toBeLessThan(5000);
    expect(cleaned.count).toBe(1);
  });

  it("lose the oldest batches under overflow: 'drop-oldest' and still get the end", async () => {
    const api = clientOf(via(handlerOf(withTicks(burst(5000, { window: 1, maxBuffered: 4096, overflow: 'drop-oldest' }))), 60));
    const { rows, error } = await collect(api);
    expect(error).toBeUndefined();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(5000);
    expect(rows.at(-1)!.seq).toBe(4999);
    // What arrives is in order, with gaps only where batches were dropped.
    expect(rows.every((r, i) => i === 0 || r.seq > rows[i - 1].seq)).toBe(true);
  });
});

describe('the wire', () => {
  async function frames(res: Response) {
    const fr = new FrameReader(1 << 20);
    const out: number[] = [];
    for await (const chunk of res.body!) {
      fr.push(chunk);
      for (let f = fr.next(); f; f = fr.next()) out.push(f.kind);
    }
    return out;
  }

  it('sends heartbeats on an idle stream, which the client skips', async () => {
    const idle: Ticks = async () =>
      stream<Tick>(
        (emit, { end }) => {
          const timer = setTimeout(() => (emit(tick(7)), end()), 60);
          return () => clearTimeout(timer);
        },
        { heartbeat: 10 },
      );
    const handler = handlerOf(withTicks(idle));
    const res = await handler(new Request('http://test/rpc/stream.ticks', { method: 'POST', body: procedures['stream.ticks'].input!.encode({ n: 0 }), headers: { 'content-type': 'application/vnd.tbr' } }));
    expect(res.headers.get('content-type')).toBe(STREAM_CONTENT_TYPE);
    const kinds = await frames(res);
    expect(kinds.filter((k) => k === FRAME_HEARTBEAT).length).toBeGreaterThanOrEqual(2);
    expect(kinds.slice(-2)).toEqual([FRAME_DATA, FRAME_END]);
    expect((await collect(clientOf(via(handler)))).rows.map((r) => r.seq)).toEqual([7]);
  });
});

describe('cancellation', () => {
  it('an aborted signal stops the subscription and runs the server cleanup', async () => {
    const cleaned = { count: 0 };
    const api = clientOf(via(handlerOf(withTicks(burst(1e9, { window: 1 }, cleaned)))));
    const abort = new AbortController();
    const end = vi.fn();
    const rows: Tick[] = [];
    api.stream.ticks.subscribe({ n: 0 }, { row: (t) => rows.push(t), end }, { signal: abort.signal });
    while (rows.length < 100) await sleep(2);
    abort.abort();
    for (let i = 0; i < 100 && !cleaned.count; i++) await sleep(5);
    expect(cleaned.count).toBe(1);
    const seen = rows.length;
    await sleep(20);
    expect(rows.length).toBe(seen);
    expect(end).not.toHaveBeenCalled();
  });

  it('a signal aborted before the call never fetches', async () => {
    const fetchFn = vi.fn(via(handlerOf(appRouter)));
    clientOf(fetchFn).stream.ticks.subscribe({ n: 1 }, () => {}, { signal: AbortSignal.abort() });
    await sleep(10);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('decoding', () => {
  it("gives plain rows with decode: 'eager', and columns either way", async () => {
    for (const decode of ['lazy', 'eager'] as const) {
      const api = clientOf(via(handlerOf(appRouter)), { decode });
      const batches: Batch<Tick>[] = [];
      await new Promise<void>((end) => api.stream.ticks.subscribe({ n: 20, burst: 20 }, { batch: (b) => batches.push(b), end }));
      const b = batches[0];
      expect(Object.keys(b[0]).length > 0).toBe(decode === 'eager');
      expect(b.columns.seq).toBeInstanceOf(Uint32Array);
      expect(Array.from(b.columns.seq!)).toEqual(b.map((t) => t.seq));
      expect('venue' in b.columns).toBe(false); // optional fields have no column
    }
  });
});

describe('failures', () => {
  it('a row that breaks its type ends the stream with BAD_OUTPUT and reaches onError', async () => {
    const onError = vi.fn();
    const bad: Ticks = async () => stream<Tick>((emit) => void emit({ ...tick(0), seq: -1 } as Tick));
    const { error } = await collect(clientOf(via(handlerOf(withTicks(bad), onError))));
    expect(error).toMatchObject({ code: 'BAD_OUTPUT' });
    expect(onError.mock.calls[0][0]).toMatchObject({ name: 'EncodeError', path: '[0].seq' });
  });

  it('a stream procedure that returns no stream answers 500 BAD_OUTPUT', async () => {
    const onError = vi.fn();
    const { error } = await collect(clientOf(via(handlerOf(withTicks((async () => 42) as unknown as Ticks), onError))));
    expect(error).toMatchObject({ code: 'BAD_OUTPUT', status: 500 });
    expect(onError).toHaveBeenCalled();
  });

  it('a thrown error in the setup becomes INTERNAL without its message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const crash: Ticks = async () =>
        stream<Tick>(() => {
          throw new Error('secret');
        });
      const res = await collect(clientOf(via(handlerOf(withTicks(crash)))));
      expect(res.error).toMatchObject({ code: 'INTERNAL' });
      expect(res.error!.message).not.toContain('secret');
    } finally {
      error.mockRestore();
    }
  });

  it('a stream that closes without an end is DISCONNECTED', async () => {
    const cut = (async () => new Response(encodeFrame(FRAME_DATA, procedures['stream.ticks'].output.encode([tick(1)])), { headers: { 'content-type': STREAM_CONTENT_TYPE } })) as typeof fetch;
    const { rows, error } = await collect(clientOf(cut));
    expect(rows.map((r) => r.seq)).toEqual([1]);
    expect(error).toMatchObject({ code: 'DISCONNECTED', status: 0 });
  });

  it('a malformed frame is BAD_RESPONSE', async () => {
    const junk = (async () => new Response(new Uint8Array([1, 0, 0, 0, 9, 0, 0, 0]), { headers: { 'content-type': STREAM_CONTENT_TYPE } })) as typeof fetch;
    expect((await collect(clientOf(junk))).error).toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('calling a stream procedure directly is a TypeError', async () => {
    const api = clientOf(via(handlerOf(appRouter)));
    await expect((api.stream.ticks as unknown as (i: unknown) => Promise<unknown>)({ n: 1 })).rejects.toThrow(TypeError);
  });
});
