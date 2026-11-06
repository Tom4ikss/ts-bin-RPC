// createHandler: a Fetch API handler, `(Request) => Promise<Response>`, for Bun.serve, Deno.serve,
// Cloudflare Workers, or Node through `ts-bin-rpc/node`.
import { DEFAULT_LIMITS, EncodeError, encodeError, RuleError, VerifyError, type Limits } from './runtime.ts';
import { CONTENT_TYPE, fromBase64Url, HASH_PARAM, INPUT_PARAM, RpcError, SCHEMA_HEADER, toBase64Url, type ServerEntry, type ServerProcedures } from './rpc.ts';
import type { AnyProcedure, AnyRouter } from './router.ts';
import { Validation, type InputValidation, type Validator } from './validate.ts';
import { STREAM_CONTENT_TYPE } from './frames.ts';
import { SINKS, Sink, toSource, type DirectOut } from './stream-server.ts';
import { encodeReply, MSG_FRAMES, MSG_RESPONSE, OP_START, OP_STOP, readRequest, type SocketRequest } from './socket.ts';
import { BATCH_CONTENT_TYPE, batchFrame, readBatch } from './batch.ts';
import { LiveSource } from './live-server.ts';
import { compose, unwrap } from './middleware.ts';
import { cacheControl, queryOptions } from './query.ts';
import type { Encoder } from './runtime.ts';

export { stream, channel, type Channel, type StreamOptions, type BatchOptions, type SubscriberOptions, type StreamControl, type StreamSetup } from './stream-server.ts';
export { live, type Live, type LiveOptions } from './live-server.ts';
export type { Stream, LiveStream } from './router.ts';
export { use, middleware, around, type Call, type Middleware, type Keep, type WithContext, type ContextMismatch } from './middleware.ts';
export { query, type QueryOptions, type Queried } from './query.ts';
export type { Query } from './router.ts';

type CtxUnion<R> = {
  [K in keyof R]: R[K] extends AnyProcedure ? (Parameters<R[K]> extends [unknown, infer C, ...unknown[]] ? C : never) : CtxUnion<R[K]>;
}[keyof R];

type Intersect<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/** What `context` has to produce: every `ctx` parameter in the router at once. */
export type RouterContext<R> = [CtxUnion<R>] extends [never] ? undefined : Intersect<CtxUnion<R>>;

export interface HandlerOptions<R> {
  /** `serverProcedures` (or `procedures`) from generated code. */
  procedures: ServerProcedures;
  /** Path prefix of every procedure. Default: `/`. */
  prefix?: string;
  /**
   * Builds the second argument of procedures, once per request, only for procedures that take one.
   * May throw RpcError.
   */
  context?: (request: Request) => RouterContext<R> | Promise<RouterContext<R>>;
  /**
   * The client was generated from another version of a procedure's contract. `warn` logs once per
   * procedure and serves the call: safe changes stay compatible. `error` answers 409 SCHEMA_MISMATCH.
   * Default: `warn`.
   */
  schemaMismatch?: 'warn' | 'error' | 'ignore';
  limits?: Partial<Limits>;
  /**
   * Called with errors other than RpcError; the client gets `500 INTERNAL` without details. An output
   * that does not match its type arrives as EncodeError with `path`; the client gets `500 BAD_OUTPUT`.
   * Default: console.error.
   */
  onError?: (error: unknown, info: { path: string; request: Request }) => void;
  /**
   * Implementations of the `Check<'name'>` checks in the input types, by name. The formats (`Email`,
   * `Uuid`…) come from `ts-bin-rpc/formats`. A check the inputs use without an implementation
   * fails createHandler. A function returns `true`, `false` or an error message; a Standard Schema
   * (Zod, Valibot…) works too.
   */
  checks?: Record<string, Validator>;
  /**
   * Checks across the fields of a type, by type name: `{ DateRange: (r) => r.start <= r.end || 'starts after it ends' }`.
   * They run on every value of the type in an input, after the checks of its fields. Same results as `checks`.
   */
  refine?: Record<string, Validator>;
  /**
   * Batches: several calls in one request, sent by clients with `batch()` (FORMAT §14). `maxCalls`
   * caps the calls in one batch; `false` refuses batches. Default: `{ maxCalls: 64 }`.
   */
  batch?: { maxCalls?: number } | false;
}

interface Route {
  fn: AnyProcedure;
  self: object;
  proc: ServerEntry;
  /** `Cache-Control` of a query, which also takes GET; undefined for other procedures. */
  cache?: string;
  /** Checks and refinements of the input; null when the input has none. */
  validate: InputValidation | null;
}

const encoder = new TextEncoder();

export function createHandler<R extends AnyRouter>(router: R, options: HandlerOptions<R>): Handler {
  const { procedures, context, schemaMismatch = 'warn', onError = defaultOnError } = options;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  let prefix = options.prefix ?? '/';
  if (!prefix.endsWith('/')) prefix += '/';

  const validation = new Validation(options.checks, options.refine);
  const routes = new Map<string, Route>();
  const walk = (node: AnyRouter, path: string) => {
    for (const [key, value] of Object.entries(node)) {
      const p = path + key;
      if (typeof value === 'function') {
        const proc = procedures[p];
        if (!proc) throw new Error(`procedure '${p}' is missing from the generated code; run tbr generate`);
        // Middleware of nested use() is flattened and composed once, here, with the full path.
        const { chain, fn, self } = unwrap(value, node);
        // query() may mark the function under use() or the use() wrapper around it.
        const q = queryOptions(value) ?? queryOptions(fn);
        if (q && proc.stream) throw new Error(`procedure '${p}' is a stream and cannot be a query`);
        if (proc.get && !q) throw new Error(`generated code calls '${p}' with GET, but the router does not mark it with query(); run tbr generate`);
        if (proc.input && !proc.inputDesc && !validation.empty) throw new Error(`generated code for '${p}' predates checks and refine; run tbr generate`);
        const validate = proc.inputDesc ? validation.plan(proc.inputDesc.schema, proc.inputDesc.type) : null;
        routes.set(p, { fn: chain.length ? compose(chain, fn, self, p) : fn, self, proc, cache: q && cacheControl(q), validate });
      } else if (value !== null && typeof value === 'object') walk(value, p + '.');
    }
  };
  walk(router, '');
  for (const p in procedures) if (!routes.has(p)) throw new Error(`generated code has procedure '${p}' that the router does not; run tbr generate`);
  const unused = validation.unused();
  if (unused.length) throw new Error(`refine names ${unused.map((n) => `'${n}'`).join(', ')}, which no procedure input contains`);

  const warned = new Set<string>();
  /** A client of another version of the contract: logged once, or the error to answer with. */
  const mismatch = (path: string, proc: ServerEntry, clientHash: string | null): RpcError | undefined => {
    if (clientHash === null || clientHash === proc.hash || schemaMismatch === 'ignore') return undefined;
    const message = `'${path}': the client was generated from another version of this procedure`;
    if (schemaMismatch === 'error') return new RpcError('SCHEMA_MISMATCH', message);
    if (!warned.has(path)) {
      warned.add(path);
      console.warn(`ts-bin-rpc: ${message} (client ${clientHash}, server ${proc.hash})`);
    }
    return undefined;
  };

  /** Decodes the input, runs the procedure and encodes its result: everything but HTTP. */
  const execute = async (route: Route, path: string, bytes: Uint8Array, request: Request, ctxOf: () => unknown = () => context!(request)): Promise<Outcome> => {
    const { proc } = route;
    try {
      let input: unknown;
      if (proc.input && bytes.length > 0) {
        try {
          input = proc.input.decode(bytes, { limits });
        } catch (e) {
          if (e instanceof RuleError) throw new RpcError('BAD_INPUT', e.message, { field: e.field, rule: e.rule, limit: e.limit, ...(e.index !== undefined && { index: e.index }) });
          if (e instanceof VerifyError) throw new RpcError('BAD_INPUT', e.message);
          throw e;
        }
      } else if (proc.input && !proc.inputOptional) throw new RpcError('BAD_INPUT', 'input is missing');
      if (route.validate && input !== undefined) {
        const f = await route.validate(input);
        if (f) throw new RpcError('BAD_INPUT', `${f.path || 'input'}${f.message.startsWith('is ') ? ' ' : ': '}${f.message}`, { ...f });
      }

      // Only procedures that take ctx (and their middleware) pay for building it.
      const ctx = context && proc.ctx !== false ? await ctxOf() : undefined;
      const result = await route.fn.call(route.self, input, ctx);
      if (proc.stream) {
        const source = toSource(result);
        if (!source || !proc.output || !proc.live !== !(source instanceof LiveSource)) {
          const expected = proc.live ? 'live().by().subscribe()' : 'stream(), channel().subscribe() or an async iterable';
          const got = source instanceof LiveSource ? 'live state' : result === null ? 'null' : typeof result;
          onError(new TypeError(`${proc.live ? 'live' : 'streaming'} procedure returned ${got}, not ${expected}`), { path, request });
          return { error: new RpcError('BAD_OUTPUT', 'the procedure returned a value that does not match its declared type') };
        }
        return {
          start: (sink) => source.start({ encoder: proc.output as Encoder<unknown[]>, delta: proc.delta, sink, report: (e) => onError(e, { path, request }) }),
        };
      }
      if (!proc.output) return { body: new Uint8Array(0) };
      try {
        return { body: proc.output.encode(result) };
      } catch (e) {
        if (!(e instanceof EncodeError)) throw e;
        // The procedure broke its own contract (TS lets `300` into a u8): a server bug, so 5xx, but
        // a code of its own so that monitoring tells it apart from crashes.
        onError(e, { path, request });
        return { error: new RpcError('BAD_OUTPUT', 'the procedure returned a value that does not match its declared type') };
      }
    } catch (e) {
      if (e instanceof RpcError) return { error: e };
      onError(e, { path, request });
      return { error: new RpcError('INTERNAL', 'internal error') };
    }
  };

  /** The body of a POST, within `limits.maxBytes`. */
  const readBody = async (request: Request): Promise<Uint8Array> => {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > limits.maxBytes) throw new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > limits.maxBytes) throw new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`);
    return bytes;
  };

  const maxCalls = options.batch === false ? 0 : (options.batch?.maxCalls ?? 64);
  // A batch (FORMAT §14): the calls run at once, each answered as it ends. `context` runs once for
  // all of them, as for any one request.
  const batch = async (request: Request): Promise<Response> => {
    if (!maxCalls) return fail(new RpcError('NOT_FOUND', 'this server takes no batches'));
    let calls: Uint8Array[] | undefined;
    try {
      calls = readBatch(await readBody(request));
    } catch (e) {
      if (e instanceof RpcError) return fail(e);
      throw e;
    }
    const starts = calls?.map(readRequest);
    if (!starts || starts.some((r) => r?.op !== OP_START)) return fail(new RpcError('BAD_INPUT', 'malformed batch'));
    if (starts.length > maxCalls) return fail(new RpcError('PAYLOAD_TOO_LARGE', `a batch takes at most ${maxCalls} calls`));
    let ctx: Promise<unknown> | undefined;
    const ctxOf = () => (ctx ??= Promise.resolve().then(() => context!(request)));
    const answer = async ({ id, path, hash, input }: SocketRequest): Promise<Uint8Array> => {
      const route = routes.get(path);
      let out: Outcome;
      if (!route) out = { error: new RpcError('NOT_FOUND', `unknown procedure '${path}'`) };
      else if (route.proc.stream) out = { error: new RpcError('BAD_INPUT', `'${path}' is a stream; streams are not batched`) };
      else {
        const wrong = mismatch(path, route.proc, hash || null);
        out = wrong ? { error: wrong } : await execute(route, path, input, request, ctxOf);
      }
      if ('error' in out) return batchFrame(encodeReply(id, MSG_RESPONSE, out.error.status, errorBody(out.error)));
      return batchFrame(encodeReply(id, MSG_RESPONSE, 200, 'body' in out ? out.body : new Uint8Array(0)));
    };
    let left = starts.length;
    const readable = new ReadableStream<Uint8Array>({
      start(c) {
        if (!left) return c.close();
        for (const s of starts as SocketRequest[]) {
          void answer(s).then((frame) => {
            try {
              c.enqueue(frame);
              if (--left === 0) c.close();
            } catch {
              // the client went away
            }
          });
        }
      },
    });
    return new Response(readable, { status: 200, headers: { 'content-type': BATCH_CONTENT_TYPE, 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' } });
  };

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const path = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
    if (path === '' && request.method === 'POST' && request.headers.get('content-type')?.split(';')[0].trim() === BATCH_CONTENT_TYPE) return batch(request);
    const route = routes.get(path);
    if (!route) return fail(new RpcError('NOT_FOUND', `unknown procedure '${path || pathname}'`));
    const get = request.method === 'GET';
    if (get ? !route.cache : request.method !== 'POST') {
      const allow = route.cache ? 'GET, POST' : 'POST';
      return fail(new RpcError('METHOD_NOT_ALLOWED', route.cache ? 'queries are called with GET or POST' : 'procedures are called with POST'), { allow });
    }
    // Requiring our content type also keeps cross-site HTML forms and simple requests out: browsers send
    // a CORS preflight for anything else. A GET has no body; only queries, free of side effects, take it.
    if (!get && request.headers.get('content-type')?.split(';')[0].trim() !== CONTENT_TYPE) {
      return fail(new RpcError('UNSUPPORTED_MEDIA_TYPE', `expected content-type ${CONTENT_TYPE}`));
    }
    const { proc } = route;
    // Errors of a GET must not be cached: the next call should reach the procedure again.
    const noStore: Record<string, string> = get ? { 'cache-control': 'no-store' } : {};
    const wrong = mismatch(path, proc, get ? url.searchParams.get(HASH_PARAM) : request.headers.get(SCHEMA_HEADER));
    if (wrong) return fail(wrong, noStore, proc);

    let bytes: Uint8Array;
    try {
      if (get) {
        const text = url.searchParams.get(INPUT_PARAM) ?? '';
        if (text.length > Math.ceil((limits.maxBytes * 4) / 3)) throw new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`);
        const decoded = fromBase64Url(text);
        if (!decoded) throw new RpcError('BAD_INPUT', `'${INPUT_PARAM}' is not base64url`);
        bytes = decoded;
      } else bytes = await readBody(request);
    } catch (e) {
      if (e instanceof RpcError) return fail(e, noStore, proc);
      onError(e, { path, request });
      return fail(new RpcError('INTERNAL', 'internal error'), noStore, proc);
    }

    const out = await execute(route, path, bytes, request);
    if ('error' in out) return fail(out.error, noStore, proc);
    if ('start' in out) {
      const sink = new Sink(request.signal);
      out.start(sink);
      // no-transform and X-Accel-Buffering keep proxies (nginx, CDNs) from buffering the frames.
      const response = new Response(sink.readable, {
        status: 200,
        headers: headers(proc, { 'content-type': STREAM_CONTENT_TYPE, 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' }),
      });
      SINKS.set(response, sink);
      return response;
    }
    const body = out.body;
    if (get) {
      // The cache revalidates with If-None-Match; an unchanged response goes back without a body.
      const etag = entityTag(body);
      const cached = { 'cache-control': route.cache!, etag };
      if (matches(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers: { [SCHEMA_HEADER]: proc.hash, ...cached } });
      return new Response(body, { status: 200, headers: headers(proc, cached) });
    }
    return new Response(body, { status: 200, headers: headers(proc) });
  };

  // One WebSocket connection (FORMAT §13): calls and subscriptions by ID. `request` is the upgrade
  // request: `context` gets it for every call, as it gets the request of an HTTP call, so its headers
  // have to stay readable (Deno closes the request it upgrades: pass a copy made before).
  const socket = (ws: SocketLike, request: Request): SocketConnection => {
    const subs = new Map<number, AbortController>();
    let closed = false;
    const reply = (id: number, type: number, status: number, body: Uint8Array) => {
      if (!closed) ws.send(encodeReply(id, type, status, body));
    };
    const start = async (id: number, path: string, hash: string, bytes: Uint8Array) => {
      const route = routes.get(path);
      const respond = (e: RpcError) => reply(id, MSG_RESPONSE, e.status, errorBody(e));
      if (!route) return respond(new RpcError('NOT_FOUND', `unknown procedure '${path}'`));
      const wrong = mismatch(path, route.proc, hash || null);
      if (wrong) return respond(wrong);
      if (bytes.length > limits.maxBytes) return respond(new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`));
      const abort = new AbortController();
      if (route.proc.stream) subs.set(id, abort);
      // a view over a message needs it 8-aligned; WebSocket servers may hand out slices of a pool
      const out = await execute(route, path, bytes.byteOffset % 8 ? bytes.slice() : bytes, request);
      if (closed || abort.signal.aborted) return;
      if ('error' in out) {
        subs.delete(id);
        return respond(out.error);
      }
      if ('body' in out) return reply(id, MSG_RESPONSE, 200, out.body);
      const sink = new Sink(abort.signal);
      out.start(sink);
      sink.direct(socketOut(ws, (chunk) => reply(id, MSG_FRAMES, 0, chunk), () => subs.get(id) === abort && subs.delete(id)));
    };
    return {
      message(data) {
        if (closed) return;
        if (typeof data === 'string') return ws.close(1003, 'ts-bin-rpc messages are binary');
        const req = readRequest(toBytes(data));
        if (!req) return ws.close(1002, 'malformed ts-bin-rpc message');
        if (req.op === OP_STOP) {
          subs.get(req.id)?.abort();
          subs.delete(req.id);
          return;
        }
        void start(req.id, req.path, req.hash, req.input);
      },
      close() {
        closed = true;
        for (const a of subs.values()) a.abort();
        subs.clear();
      },
    };
  };

  return Object.assign(handler, { socket });
}

type Outcome = { error: RpcError } | { body: Uint8Array<ArrayBuffer> } | { start: (sink: Sink) => void };

/** What `handler.socket()` needs of a WebSocket: `ws` in Node, Bun's and Deno's sockets, browsers'. */
export interface SocketLike {
  send(data: Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  /** Bytes queued to send. Without it, subscriptions do not wait for a slow client. */
  readonly bufferedAmount?: number;
}

/** A connection to a WebSocket: hand it every message, and tell it when the socket closed. */
export interface SocketConnection {
  message(data: ArrayBuffer | ArrayBufferView | ArrayBufferView[] | string): void;
  close(): void;
}

/** A Fetch handler that also takes WebSocket connections: `handler.socket(ws, upgradeRequest)`. */
export type Handler = ((request: Request) => Promise<Response>) & { socket(ws: SocketLike, request: Request): SocketConnection };

/** Above this many bytes queued on the socket, subscriptions queue frames in their sinks (maxBuffered). */
const SOCKET_HIGH_WATER = 1 << 20;

/** A sink's output over a socket shared by subscriptions; 'drain' is polled, as sockets do not tell. */
function socketOut(ws: SocketLike, send: (chunk: Uint8Array) => void, end: () => void): DirectOut {
  return {
    write(chunk) {
      send(chunk);
      return (ws.bufferedAmount ?? 0) < SOCKET_HIGH_WATER;
    },
    end,
    once(_event, listener) {
      const timer = setInterval(() => {
        if ((ws.bufferedAmount ?? 0) >= SOCKET_HIGH_WATER / 2) return;
        clearInterval(timer);
        listener();
      }, 5);
    },
  };
}

function toBytes(data: ArrayBuffer | ArrayBufferView | ArrayBufferView[]): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (!Array.isArray(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  // `ws` hands a fragmented message over as its fragments
  const n = data.reduce((s, d) => s + d.byteLength, 0);
  const out = new Uint8Array(n);
  let at = 0;
  for (const d of data) {
    out.set(new Uint8Array(d.buffer, d.byteOffset, d.byteLength), at);
    at += d.byteLength;
  }
  return out;
}

/**
 * A strong validator: a 64-bit hash of the body, quoted. Two murmur3-style lanes over 32-bit words.
 * Not cryptographic, and it need not be: the tag only tells versions of one URL apart. Synchronous
 * and faster than crypto.subtle.digest at every size in Node (0.07 µs for 150 bytes against a fixed
 * ~9 µs; 40 µs for 100 KB against 50 µs).
 */
function entityTag(b: Uint8Array): string {
  let h1 = 0x9747b28c ^ b.length, h2 = 0x2b2ae35c ^ b.length;
  const n = b.length & ~3;
  for (let i = 0; i < n; i += 4) {
    const k = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
    let a = Math.imul(k, 0xcc9e2d51);
    a = Math.imul((a << 15) | (a >>> 17), 0x1b873593);
    h1 ^= a;
    h1 = (Math.imul((h1 << 13) | (h1 >>> 19), 5) + 0xe6546b64) | 0;
    let c = Math.imul(k, 0x85ebca77);
    c = Math.imul((c << 13) | (c >>> 19), 0xc2b2ae3d);
    h2 ^= c;
    h2 = (Math.imul((h2 << 17) | (h2 >>> 15), 9) + 0x165667b1) | 0;
  }
  let t = 0;
  for (let i = n, s = 0; i < b.length; i++, s += 8) t |= b[i] << s;
  h1 = fmix(h1 ^ Math.imul(t, 0xcc9e2d51) ^ h2);
  h2 = fmix(h2 ^ Math.imul(t, 0x85ebca77) ^ h1);
  const out = new Uint8Array(8);
  new DataView(out.buffer).setUint32(0, h1);
  new DataView(out.buffer).setUint32(4, h2);
  return `"${toBase64Url(out)}"`;
}

function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/** Whether an If-None-Match header lists the tag: `*`, or the tag among others, weak or strong. */
function matches(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header.split(',').some((t) => t.trim().replace(/^W\//, '') === etag);
}

function headers(proc?: ServerEntry, extra: Record<string, string> = {}): Record<string, string> {
  return { 'content-type': CONTENT_TYPE, ...(proc ? { [SCHEMA_HEADER]: proc.hash } : {}), ...extra };
}

function errorBody(e: RpcError): Uint8Array<ArrayBuffer> {
  const data = e.data === undefined ? undefined : encoder.encode(JSON.stringify(e.data));
  return encodeError({ code: e.code, message: e.message, data }) as Uint8Array<ArrayBuffer>;
}

function fail(e: RpcError, extra: Record<string, string> = {}, proc?: ServerEntry): Response {
  return new Response(errorBody(e), { status: e.status, headers: headers(proc, extra) });
}

function defaultOnError(error: unknown, info: { path: string }) {
  if (error instanceof EncodeError) console.error(`ts-bin-rpc: procedure '${info.path}' returned an invalid value ${error.message}`);
  else console.error(`ts-bin-rpc: procedure '${info.path}' failed:`, error);
}
