// createHandler: a Fetch API handler, `(Request) => Promise<Response>`, for Bun.serve, Deno.serve,
// Cloudflare Workers, or Node through `ts-bin-rpc/node`.
import { DEFAULT_LIMITS, EncodeError, encodeError, VerifyError, type Limits } from './runtime.ts';
import { CONTENT_TYPE, RpcError, SCHEMA_HEADER, type ProcedureEntry, type Procedures } from './rpc.ts';
import type { AnyProcedure, AnyRouter } from './router.ts';

type CtxUnion<R> = {
  [K in keyof R]: R[K] extends AnyProcedure ? (Parameters<R[K]> extends [unknown, infer C, ...unknown[]] ? C : never) : CtxUnion<R[K]>;
}[keyof R];

type Intersect<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/** What `context` has to produce: every `ctx` parameter in the router at once. */
export type RouterContext<R> = [CtxUnion<R>] extends [never] ? undefined : Intersect<CtxUnion<R>>;

export interface HandlerOptions<R> {
  /** The `procedures` table from generated code. */
  procedures: Procedures;
  /** Path prefix of every procedure. Default: `/`. */
  prefix?: string;
  /** Builds the second argument of procedures, once per request. May throw RpcError. */
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
}

interface Route {
  fn: AnyProcedure;
  self: object;
  proc: ProcedureEntry;
}

const encoder = new TextEncoder();

export function createHandler<R extends AnyRouter>(router: R, options: HandlerOptions<R>): (request: Request) => Promise<Response> {
  const { procedures, context, schemaMismatch = 'warn', onError = defaultOnError } = options;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  let prefix = options.prefix ?? '/';
  if (!prefix.endsWith('/')) prefix += '/';

  const routes = new Map<string, Route>();
  const walk = (node: AnyRouter, path: string) => {
    for (const [key, value] of Object.entries(node)) {
      const p = path + key;
      if (typeof value === 'function') {
        const proc = procedures[p];
        if (!proc) throw new Error(`procedure '${p}' is missing from the generated code; run tbr generate`);
        routes.set(p, { fn: value, self: node, proc });
      } else if (value !== null && typeof value === 'object') walk(value, p + '.');
    }
  };
  walk(router, '');
  for (const p in procedures) if (!routes.has(p)) throw new Error(`generated code has procedure '${p}' that the router does not; run tbr generate`);

  const warned = new Set<string>();

  return async (request) => {
    const pathname = new URL(request.url).pathname;
    const path = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
    const route = routes.get(path);
    if (!route) return fail(new RpcError('NOT_FOUND', `unknown procedure '${path || pathname}'`));
    if (request.method !== 'POST') return fail(new RpcError('METHOD_NOT_ALLOWED', 'procedures are called with POST'), { allow: 'POST' });
    // Requiring our content type also keeps cross-site HTML forms and simple requests out: browsers send
    // a CORS preflight for anything else.
    if (request.headers.get('content-type')?.split(';')[0].trim() !== CONTENT_TYPE) {
      return fail(new RpcError('UNSUPPORTED_MEDIA_TYPE', `expected content-type ${CONTENT_TYPE}`));
    }
    const { proc } = route;
    const clientHash = request.headers.get(SCHEMA_HEADER);
    if (clientHash !== null && clientHash !== proc.hash && schemaMismatch !== 'ignore') {
      const message = `'${path}': the client was generated from another version of this procedure`;
      if (schemaMismatch === 'error') return fail(new RpcError('SCHEMA_MISMATCH', message), {}, proc);
      if (!warned.has(path)) {
        warned.add(path);
        console.warn(`ts-bin-rpc: ${message} (client ${clientHash}, server ${proc.hash})`);
      }
    }

    try {
      const declared = Number(request.headers.get('content-length') ?? 0);
      if (declared > limits.maxBytes) throw new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > limits.maxBytes) throw new RpcError('PAYLOAD_TOO_LARGE', `request is larger than ${limits.maxBytes} bytes`);

      let input: unknown;
      if (proc.input && bytes.length > 0) {
        try {
          input = proc.input.decode(bytes, { limits });
        } catch (e) {
          if (e instanceof VerifyError) throw new RpcError('BAD_INPUT', e.message);
          throw e;
        }
      } else if (proc.input && !proc.inputOptional) throw new RpcError('BAD_INPUT', 'input is missing');

      const ctx = context ? await context(request) : undefined;
      const result = await route.fn.call(route.self, input, ctx);
      let body = new Uint8Array(0);
      if (proc.output) {
        try {
          body = proc.output.encode(result);
        } catch (e) {
          if (!(e instanceof EncodeError)) throw e;
          // The procedure broke its own contract (TS lets `300` into a u8): a server bug, so 5xx, but
          // a code of its own so that monitoring tells it apart from crashes.
          onError(e, { path, request });
          return fail(new RpcError('BAD_OUTPUT', 'the procedure returned a value that does not match its declared type'), {}, proc);
        }
      }
      return new Response(body, { status: 200, headers: headers(proc) });
    } catch (e) {
      if (e instanceof RpcError) return fail(e, {}, proc);
      onError(e, { path, request });
      return fail(new RpcError('INTERNAL', 'internal error'), {}, proc);
    }
  };
}

function headers(proc?: ProcedureEntry, extra: Record<string, string> = {}): Record<string, string> {
  return { 'content-type': CONTENT_TYPE, ...(proc ? { [SCHEMA_HEADER]: proc.hash } : {}), ...extra };
}

function fail(e: RpcError, extra: Record<string, string> = {}, proc?: ProcedureEntry): Response {
  const data = e.data === undefined ? undefined : encoder.encode(JSON.stringify(e.data));
  return new Response(encodeError({ code: e.code, message: e.message, data }), { status: e.status, headers: headers(proc, extra) });
}

function defaultOnError(error: unknown, info: { path: string }) {
  if (error instanceof EncodeError) console.error(`ts-bin-rpc: procedure '${info.path}' returned an invalid value ${error.message}`);
  else console.error(`ts-bin-rpc: procedure '${info.path}' failed:`, error);
}
