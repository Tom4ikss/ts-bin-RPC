// createClient<AppRouter>: a proxy whose calls POST the encoded input (GET for queries) and return views
// over the response.
import { FLAG_ERROR, toPlain, VerifyError, type Limits } from './runtime.ts';
import { codeForStatus, CONTENT_TYPE, HASH_PARAM, INPUT_PARAM, MAX_GET_INPUT, readError, RpcError, SCHEMA_HEADER, toBase64Url, type ClientEntry, type ClientProcedures } from './rpc.ts';
import type { StreamEnv } from './stream-client.ts';
import type { CallOptions, Client, DecodeMode, ProcedurePath } from './router.ts';

export interface ClientOptions<R = unknown> {
  /** Base URL of the procedures, e.g. `/rpc` or `https://api.example.com/rpc`. */
  url: string;
  /** `clientProcedures` (or `procedures`) from generated code. */
  procedures: ClientProcedures;
  /** Default: globalThis.fetch. */
  fetch?: typeof fetch;
  /** Sent with every call; a function is called before each one. */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /**
   * What calls return. `'lazy'` (default): views that read the response bytes on access. `'eager'`:
   * plain objects, as `toPlain` gives, safe to mutate, spread and clone. A map sets it per procedure,
   * `CallOptions.decode` per call.
   */
  decode?: DecodeMode | { readonly [P in ProcedurePath<R>]?: DecodeMode };
  /**
   * Verify responses before reading them. Default: on in development, off in production builds
   * (`process.env.NODE_ENV === 'production'`, which bundlers replace at build time).
   */
  verify?: boolean;
  limits?: Partial<Limits>;
  /** Log every call to the console: procedure, time, size, result. */
  debug?: boolean;
}


// Not @types/node: the client runs in browsers, where bundlers replace this expression.
declare const process: { env: { NODE_ENV?: string } };
/** Production builds skip response verification by default; without a bundler this is false. */
function production(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

export function createClient<R>(options: ClientOptions<R>): Client<R> {
  const { procedures, verify = !production(), limits, debug = false } = options;
  const decode = options.decode as DecodeMode | Readonly<Record<string, DecodeMode | undefined>> | undefined;
  const base = options.url.replace(/\/+$/, '');
  const warned = new Set<string>();
  const modeOf = (path: string, opts: CallOptions) => opts.decode ?? (typeof decode === 'string' ? decode : decode?.[path]);

  async function userHeaders(opts: CallOptions): Promise<Headers> {
    const headers = new Headers(typeof options.headers === 'function' ? await options.headers() : options.headers);
    if (opts.headers) new Headers(opts.headers).forEach((v, k) => headers.set(k, v));
    return headers;
  }

  async function requestHeaders(proc: ClientEntry, opts: CallOptions): Promise<Headers> {
    const headers = await userHeaders(opts);
    headers.set('content-type', CONTENT_TYPE);
    headers.set(SCHEMA_HEADER, proc.hash);
    return headers;
  }

  async function call(path: string, args: unknown[]): Promise<unknown> {
    const proc = procedures[path];
    if (!proc) throw new RpcError('NOT_FOUND', `procedure '${path}' is not in the generated code; run tbr generate`);
    if (proc.stream) throw new TypeError(`'${path}' is a stream: call ${path}.subscribe()`);
    const [input, opts = {}] = (proc.input ? args : [undefined, args[0]]) as [unknown, CallOptions | undefined];
    opts.signal?.throwIfAborted();
    const body = proc.input && !(input === undefined && proc.inputOptional) ? proc.input.encode(input) : new Uint8Array(0);
    // A query goes by GET, the input in the URL, so that HTTP caches can keep the response; the
    // contract hash goes there too, so that a new contract gets new URLs. Without our headers the
    // request stays simple: no CORS preflight unless the caller adds headers.
    const encoded = proc.get ? toBase64Url(body) : '';
    const get = proc.get === true && encoded.length <= MAX_GET_INPUT;

    const t0 = debug ? performance.now() : 0;
    const fetchFn = options.fetch ?? globalThis.fetch;
    const res = get
      ? await fetchFn(`${base}/${path}?${HASH_PARAM}=${proc.hash}${encoded ? `&${INPUT_PARAM}=${encoded}` : ''}`, { method: 'GET', headers: await userHeaders(opts), signal: opts.signal })
      : await fetchFn(`${base}/${path}`, { method: 'POST', body, headers: await requestHeaders(proc, opts), signal: opts.signal });
    const bytes = new Uint8Array(await res.arrayBuffer());

    let result: unknown;
    let error: RpcError | undefined;
    if (res.headers.get('content-type')?.split(';')[0].trim() !== CONTENT_TYPE) {
      error = new RpcError(res.ok ? 'BAD_RESPONSE' : codeForStatus(res.status), `HTTP ${res.status}: not a ts-bin-rpc response`, undefined, { status: res.status });
    } else if (!res.ok || (bytes.length > 3 && bytes[3] & FLAG_ERROR)) {
      error = readError(bytes, res.status);
    } else if (proc.output) {
      try {
        const mode = modeOf(path, opts);
        result = mode === 'eager' ? proc.output.decode(bytes, { verify, limits }) : proc.output.view(bytes, { verify, limits });
      } catch (e) {
        if (!(e instanceof VerifyError)) throw e;
        error = new RpcError('BAD_RESPONSE', `invalid response: ${e.message}`, undefined, { status: res.status, cause: e });
      }
    }

    if (debug) {
      const ms = (performance.now() - t0).toFixed(1);
      console.groupCollapsed(`tbr ${get ? 'GET ' : ''}${path} ${error ? error.code : res.status} ${ms} ms, ${body.length} B → ${bytes.length} B`);
      if (proc.input) console.log('input', input);
      if (error) console.log('error', error);
      else console.log('output', toPlain(result));
      console.groupEnd();
      const serverHash = res.headers.get(SCHEMA_HEADER);
      if (serverHash && serverHash !== proc.hash && !warned.has(path)) {
        warned.add(path);
        console.warn(`ts-bin-rpc: '${path}': the server has another version of this procedure (client ${proc.hash}, server ${serverHash})`);
      }
    }
    if (error) throw error;
    return result;
  }

  const proxy = (path: string): unknown => {
    const children = new Map<string, unknown>();
    return new Proxy(() => {}, {
      get(_, key) {
        // `then` stays undefined so that `await api.user` does not try to call a procedure.
        if (typeof key !== 'string' || key === 'then') return undefined;
        let child = children.get(key);
        if (!child) children.set(key, (child = proxy(path ? `${path}.${key}` : key)));
        return child;
      },
      apply(_, __, args) {
        // `x.subscribe(...)` of a streaming procedure `x`; a procedure named `subscribe` wins.
        const parent = path.endsWith('.subscribe') && !procedures[path] ? procedures[path.slice(0, -10)] : undefined;
        if (parent?.stream) {
          if (!parent.subscribe) throw new TypeError(`'${path}': these procedures have no stream client; pass clientProcedures or procedures`);
          return parent.subscribe(streams, path.slice(0, -10), parent, args);
        }
        return call(path, args);
      },
    });
  };
  const streams: StreamEnv = {
    url: base,
    fetch: (input, init) => (options.fetch ?? globalThis.fetch)(input, init),
    headers: requestHeaders,
    mode: modeOf,
    verify,
    limits,
    debug,
  };
  return proxy('') as Client<R>;
}
