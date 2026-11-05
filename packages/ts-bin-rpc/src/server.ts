// createHandler: a Fetch API handler, `(Request) => Promise<Response>`, for Bun.serve, Deno.serve,
// Cloudflare Workers, or Node through `ts-bin-rpc/node`.
import { DEFAULT_LIMITS, EncodeError, encodeError, RuleError, VerifyError, type Limits } from './runtime.ts';
import { CONTENT_TYPE, fromBase64Url, HASH_PARAM, INPUT_PARAM, RpcError, SCHEMA_HEADER, toBase64Url, type ServerEntry, type ServerProcedures } from './rpc.ts';
import type { AnyProcedure, AnyRouter } from './router.ts';
import { Validation, type InputValidation, type Validator } from './validate.ts';
import { STREAM_CONTENT_TYPE } from './frames.ts';
import { SINKS, Sink, toSource } from './stream-server.ts';
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

export function createHandler<R extends AnyRouter>(router: R, options: HandlerOptions<R>): (request: Request) => Promise<Response> {
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

  return async (request) => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const path = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
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
    const clientHash = get ? url.searchParams.get(HASH_PARAM) : request.headers.get(SCHEMA_HEADER);
    if (clientHash !== null && clientHash !== proc.hash && schemaMismatch !== 'ignore') {
      const message = `'${path}': the client was generated from another version of this procedure`;
      if (schemaMismatch === 'error') return fail(new RpcError('SCHEMA_MISMATCH', message), noStore, proc);
      if (!warned.has(path)) {
        warned.add(path);
        console.warn(`ts-bin-rpc: ${message} (client ${clientHash}, server ${proc.hash})`);
      }
    }

    try {
      let bytes: Uint8Array;
      if (get) {
        const text = url.searchParams.get(INPUT_PARAM) ?? '';
        if (text.length > Math.ceil((limits.maxBytes * 4) / 3)) throw new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`);
        const decoded = fromBase64Url(text);
        if (!decoded) throw new RpcError('BAD_INPUT', `'${INPUT_PARAM}' is not base64url`);
        bytes = decoded;
      } else {
        const declared = Number(request.headers.get('content-length') ?? 0);
        if (declared > limits.maxBytes) throw new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`);
        bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.length > limits.maxBytes) throw new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`);
      }

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
      const ctx = context && proc.ctx !== false ? await context(request) : undefined;
      const result = await route.fn.call(route.self, input, ctx);
      if (proc.stream) {
        const source = toSource(result);
        if (!source || !proc.output || !proc.live !== !(source instanceof LiveSource)) {
          const expected = proc.live ? 'live().by().subscribe()' : 'stream(), channel().subscribe() or an async iterable';
          const got = source instanceof LiveSource ? 'live state' : result === null ? 'null' : typeof result;
          onError(new TypeError(`${proc.live ? 'live' : 'streaming'} procedure returned ${got}, not ${expected}`), { path, request });
          return fail(new RpcError('BAD_OUTPUT', 'the procedure returned a value that does not match its declared type'), {}, proc);
        }
        const sink = new Sink(request.signal);
        source.start({ encoder: proc.output as Encoder<unknown[]>, delta: proc.delta, sink, report: (e) => onError(e, { path, request }) });
        // no-transform and X-Accel-Buffering keep proxies (nginx, CDNs) from buffering the frames.
        const response = new Response(sink.readable, {
          status: 200,
          headers: headers(proc, { 'content-type': STREAM_CONTENT_TYPE, 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' }),
        });
        SINKS.set(response, sink);
        return response;
      }
      let body = new Uint8Array(0);
      if (proc.output) {
        try {
          body = proc.output.encode(result);
        } catch (e) {
          if (!(e instanceof EncodeError)) throw e;
          // The procedure broke its own contract (TS lets `300` into a u8): a server bug, so 5xx, but
          // a code of its own so that monitoring tells it apart from crashes.
          onError(e, { path, request });
          return fail(new RpcError('BAD_OUTPUT', 'the procedure returned a value that does not match its declared type'), noStore, proc);
        }
      }
      if (get) {
        // The cache revalidates with If-None-Match; an unchanged response goes back without a body.
        const etag = entityTag(body);
        const cached = { 'cache-control': route.cache!, etag };
        if (matches(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers: { [SCHEMA_HEADER]: proc.hash, ...cached } });
        return new Response(body, { status: 200, headers: headers(proc, cached) });
      }
      return new Response(body, { status: 200, headers: headers(proc) });
    } catch (e) {
      if (e instanceof RpcError) return fail(e, noStore, proc);
      onError(e, { path, request });
      return fail(new RpcError('INTERNAL', 'internal error'), noStore, proc);
    }
  };
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

function fail(e: RpcError, extra: Record<string, string> = {}, proc?: ServerEntry): Response {
  const data = e.data === undefined ? undefined : encoder.encode(JSON.stringify(e.data));
  return new Response(encodeError({ code: e.code, message: e.message, data }), { status: e.status, headers: headers(proc, extra) });
}

function defaultOnError(error: unknown, info: { path: string }) {
  if (error instanceof EncodeError) console.error(`ts-bin-rpc: procedure '${info.path}' returned an invalid value ${error.message}`);
  else console.error(`ts-bin-rpc: procedure '${info.path}' failed:`, error);
}
