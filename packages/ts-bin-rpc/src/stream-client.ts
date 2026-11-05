// Subscriptions to streaming procedures (DESIGN §14): one fetch whose body is a stream of frames.
// Each data frame is a batch of rows; rows go to the handler, batches with their columns, and
// to iterators of the subscription.
import { columnsOf, toPlain, VerifyError, type Limits } from './runtime.ts';
import { CONTENT_TYPE, codeForStatus, devtoolsHook, readError, RpcError, type ClientEntry, type DevtoolsTap } from './rpc.ts';
import { FrameReader, FRAME_DATA, FRAME_END, FRAME_ERROR, STREAM_CONTENT_TYPE } from './frames.ts';
import type { CallOptions, DecodeMode, StreamHandler, Subscription } from './router.ts';

export interface StreamEnv {
  url: string;
  fetch: typeof fetch;
  headers: (proc: ClientEntry, opts: CallOptions) => Promise<Headers>;
  mode: (path: string, opts: CallOptions) => DecodeMode | undefined;
  verify: boolean;
  limits?: Partial<Limits>;
  debug: boolean;
}

interface Queue {
  rows: unknown[];
  error?: RpcError;
  done: boolean;
  wake?: () => void;
}

/**
 * Generated code puts this function into the client table of a router with streams, so that
 * clients of routers without them do not ship it.
 */
export function subscribe(env: StreamEnv, path: string, proc: ClientEntry, args: unknown[]): Subscription<unknown> {
  const [input, handler, opts = {}] = (proc.input ? args : [undefined, ...args]) as [unknown, StreamHandler<unknown> | undefined, CallOptions | undefined];
  const h = typeof handler === 'function' ? { row: handler } : (handler ?? {});
  const abort = new AbortController();
  const queues = new Set<Queue>();
  let started = false;
  let over = false; // stopped, ended or failed: nothing more is delivered
  let stopped = false;
  let tap: DevtoolsTap | undefined;

  const wakeAll = () => {
    for (const q of queues) q.wake?.();
  };
  const finish = (error?: RpcError) => {
    if (over) return;
    over = true;
    abort.abort();
    if (error) {
      if (h.error) safely(() => h.error!(error));
      else if (!queues.size) console.error(`ts-bin-rpc: stream '${path}' failed:`, error);
      for (const q of queues) q.error = error;
    } else if (!stopped) h.end && safely(h.end);
    tap?.end(error, stopped);
    for (const q of queues) q.done = true;
    wakeAll();
  };

  const deliver = (payload: Uint8Array) => {
    tap?.batch(payload);
    const view = proc.output!.view(payload, { verify: env.verify, rules: false, limits: env.limits }) as unknown[];
    const rows = env.mode(path, opts) === 'eager' ? (toPlain(view) as unknown[]) : view;
    if (h.batch) {
      Object.defineProperty(rows, 'columns', { get: () => columnsOf(view) ?? {} });
      safely(() => h.batch!(rows as never));
    }
    if (h.row) for (let i = 0; i < rows.length && !over; i++) safely(() => h.row!(rows[i]));
    for (const q of queues) {
      for (let i = 0; i < rows.length; i++) q.rows.push(rows[i]);
      q.wake?.();
    }
  };

  const run = async () => {
    started = true;
    tap = devtoolsHook()?.stream(path, input, proc);
    let frames = 0, bytes = 0;
    const t0 = env.debug ? performance.now() : 0;
    try {
      const body = proc.input && !(input === undefined && proc.inputOptional) ? proc.input.encode(input) : new Uint8Array(0);
      const res = await env.fetch(`${env.url}/${path}`, { method: 'POST', body, headers: await env.headers(proc, opts), signal: abort.signal });
      const type = res.headers.get('content-type')?.split(';')[0].trim();
      if (type !== STREAM_CONTENT_TYPE || !res.ok || !res.body) {
        const b = new Uint8Array(await res.arrayBuffer());
        return finish(type === CONTENT_TYPE ? readError(b, res.status) : new RpcError(res.ok ? 'BAD_RESPONSE' : codeForStatus(res.status), `HTTP ${res.status}: not a ts-bin-rpc stream`, undefined, { status: res.status }));
      }
      const reader = res.body.getReader();
      const fr = new FrameReader(env.limits?.maxBytes ?? 64 * 1024 * 1024);
      for (;;) {
        const r = await reader.read();
        if (over) return void reader.cancel().catch(() => {});
        if (r.done) return finish(new RpcError('DISCONNECTED', `stream '${path}' closed before the server ended it`, undefined, { status: 0 }));
        bytes += r.value.length;
        fr.push(r.value);
        for (let f = fr.next(); f && !over; f = fr.next()) {
          frames++;
          if (f.kind === FRAME_DATA) deliver(f.payload);
          else if (f.kind === FRAME_ERROR) return void (finish(readError(f.payload)), reader.cancel().catch(() => {}));
          else if (f.kind === FRAME_END) return void (finish(), reader.cancel().catch(() => {}));
        }
      }
    } catch (e) {
      if (over) return;
      if (e instanceof VerifyError || (e instanceof Error && e.message.startsWith('malformed stream frame'))) {
        finish(new RpcError('BAD_RESPONSE', `invalid stream: ${e.message}`, undefined, { status: 200, cause: e }));
      } else finish(new RpcError('DISCONNECTED', `stream '${path}' failed: ${e instanceof Error ? e.message : String(e)}`, undefined, { status: 0, cause: e }));
    } finally {
      if (env.debug) console.log(`tbr ${path} stream closed after ${(performance.now() - t0).toFixed(0)} ms: ${frames} frames, ${bytes} B`);
    }
  };

  const start = () => {
    if (!started && !over) void run();
  };

  const sub: Subscription<unknown> = {
    stop() {
      stopped = true;
      finish();
    },
    [Symbol.asyncIterator]() {
      const q: Queue = { rows: [], done: over };
      queues.add(q);
      return {
        next: async (): Promise<IteratorResult<unknown>> => {
          start();
          for (;;) {
            if (q.rows.length) return { value: q.rows.shift(), done: false };
            if (q.error) throw q.error;
            if (q.done) return { value: undefined, done: true };
            await new Promise<void>((r) => (q.wake = r));
            q.wake = undefined;
          }
        },
        return: async (): Promise<IteratorResult<unknown>> => {
          queues.delete(q);
          if (!queues.size && !handler) sub.stop();
          return { value: undefined, done: true };
        },
      };
    },
  };

  if (opts.signal) {
    if (opts.signal.aborted) sub.stop();
    else opts.signal.addEventListener('abort', () => sub.stop(), { once: true });
  }
  if (handler) start();
  return sub;
}

/** A handler that throws must not break the stream: rethrow outside of it, as event listeners do. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    queueMicrotask(() => {
      throw e;
    });
  }
}
