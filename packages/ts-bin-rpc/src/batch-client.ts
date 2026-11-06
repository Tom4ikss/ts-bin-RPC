// Batching on the client (DESIGN §21): calls made close together go in one request, and each gets
// a Response of its own as the server answers it, so the code that reads HTTP responses reads these
// too. A module of its own: clients without `batch()` do not carry it.
import { CONTENT_TYPE, SCHEMA_HEADER, type ClientEntry } from './rpc.ts';
import { BATCH_CONTENT_TYPE, BatchReader, encodeBatch } from './batch.ts';
import { encodeStart, MSG_RESPONSE } from './socket.ts';

export interface BatchOptions {
  /**
   * Milliseconds a call waits for others to go with it. Default: 0, the calls made in the same task,
   * such as those of one `Promise.all` or of the components of one render.
   */
  window?: number;
  /** At most this many calls in one request; more start another. Default: 32. The server takes 64. */
  maxCalls?: number;
  /** Inputs larger than this many bytes go alone, as do calls with `headers` of their own. Default: 64 KB. */
  maxBytes?: number;
}

/** What `createClient` gives a batcher: the base URL, its fetch and its headers. */
export interface BatchEnv {
  url: string;
  fetch: typeof fetch;
  headers(opts: object): Promise<Headers>;
}

/** Sends a call, in a batch or alone; createClient reads the Response as that of a request of its own. */
export type Batcher = (path: string, proc: ClientEntry, body: Uint8Array, signal?: AbortSignal) => Promise<Response>;

/** `createClient({ batch: batch() })`: calls of one task go in one request. */
export type BatchLink = (env: BatchEnv) => Batcher;

interface Pending {
  path: string;
  proc: ClientEntry;
  body: Uint8Array;
  signal?: AbortSignal;
  resolve: (r: Response) => void;
  reject: (e: unknown) => void;
  done: boolean;
}

/** Calls made close together go in one POST, and come back as each ends: `createClient({ batch: batch() })`. */
export function batch(options: BatchOptions = {}): BatchLink {
  const window = options.window ?? 0, maxCalls = options.maxCalls ?? 32, maxBytes = options.maxBytes ?? 64 * 1024;
  return (env) => {
    let queue: Pending[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (p: Pending, r: Response) => {
      if (p.done) return;
      p.done = true;
      p.resolve(r);
    };
    const failed = (p: Pending, e: unknown) => {
      if (p.done) return;
      p.done = true;
      p.reject(e);
    };

    const flush = () => {
      clearTimeout(timer);
      timer = undefined;
      const calls = queue.filter((p) => !p.done);
      queue = [];
      if (calls.length === 1) {
        const [p] = calls;
        p.done = true;
        alone(p.path, p.proc, p.body, p.signal).then(p.resolve, p.reject);
      } else if (calls.length) void send(calls);
    };

    // a call alone goes as it would without batching
    const alone: Batcher = async (path, proc, body, signal) => {
      const headers = await env.headers({});
      headers.set('content-type', CONTENT_TYPE);
      headers.set(SCHEMA_HEADER, proc.hash);
      return env.fetch(`${env.url}/${path}`, { method: 'POST', body: body as BodyInit, headers, signal });
    };

    const send = async (calls: Pending[]) => {
      try {
        const headers = await env.headers({});
        headers.set('content-type', BATCH_CONTENT_TYPE);
        const body = encodeBatch(calls.map((p, i) => encodeStart(i, p.path, p.proc.hash, p.body)));
        // the prefix itself, with its slash: routes mounted at `/rpc/*` take it
        const res = await env.fetch(`${env.url}/`, { method: 'POST', body, headers });
        if (!res.ok || res.headers.get('content-type')?.split(';')[0].trim() !== BATCH_CONTENT_TYPE || !res.body) {
          // the batch as a whole failed: every call gets the response, as if it had gone alone
          const bytes = new Uint8Array(await res.arrayBuffer());
          for (const p of calls) settle(p, new Response(bytes, { status: res.status, headers: res.headers }));
          return;
        }
        const reader = new BatchReader();
        const stream = res.body.getReader();
        for (;;) {
          const { done, value } = await stream.read();
          if (done) break;
          const messages = reader.push(value);
          if (!messages) throw new TypeError('malformed batch response');
          for (const m of messages) {
            const p = m.length >= 8 && m[4] === MSG_RESPONSE ? calls[(m[0] | (m[1] << 8) | (m[2] << 16) | (m[3] << 24)) >>> 0] : undefined;
            if (p) settle(p, new Response(m.subarray(8), { status: m[6] | (m[7] << 8), headers: { 'content-type': CONTENT_TYPE } }));
          }
        }
        if (!reader.done) throw new TypeError('the batch response was cut off');
        for (const p of calls) failed(p, new TypeError('the batch response has no answer to this call'));
      } catch (e) {
        // as fetch does when the connection fails
        for (const p of calls) failed(p, e);
      }
    };

    return (path, proc, body, signal) => {
      if (body.length > maxBytes) return alone(path, proc, body, signal);
      return new Promise<Response>((resolve, reject) => {
        const p: Pending = { path, proc, body, signal, resolve, reject, done: false };
        // an aborted call leaves the batch; once sent, the server still runs it, and its answer is dropped
        signal?.addEventListener('abort', () => failed(p, signal.reason), { once: true });
        queue.push(p);
        if (queue.length >= maxCalls) flush();
        else timer ??= setTimeout(flush, window);
      });
    };
  };
}
