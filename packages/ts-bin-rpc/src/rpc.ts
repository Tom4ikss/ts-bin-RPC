// Protocol pieces shared by the server and the client (DESIGN §10): errors, statuses, headers and the
// procedure table that generated code exports.
import { decodeError, type Decoder, type Encoder, type SchemaDesc, type TypeDesc } from './runtime.ts';
import type { subscribe } from './stream-client.ts';
import type { subscribeLive } from './live-client.ts';
import type { CallOptions } from './router.ts';

export const CONTENT_TYPE = 'application/vnd.tbr';
/** Request: the client's hash of the procedure's contract. Response: the server's. */
export const SCHEMA_HEADER = 'x-tbr-schema';

/** HTTP status per error code. Codes not listed here are application errors and map to 400. */
export const STATUS: Readonly<Record<string, number>> = {
  BAD_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  SCHEMA_MISMATCH: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
  BAD_OUTPUT: 500,
  BAD_RESPONSE: 502,
};

export interface RpcErrorOptions {
  status?: number;
  cause?: unknown;
}

/** Thrown by procedures to send an error to the client; the client rethrows it with the same code. */
export class RpcError<Data = unknown> extends Error {
  override name = 'RpcError';
  readonly code: string;
  readonly data: Data | undefined;
  readonly status: number;

  constructor(code: string, message: string, data?: Data, options: RpcErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.data = data;
    this.status = options.status ?? STATUS[code] ?? 400;
  }
}


interface Entry<In, Out> {
  input: In | null;
  inputOptional: boolean;
  output: Out | null;
  /** A streaming procedure: output is the codec of a batch, `T[]`. */
  stream?: boolean;
  /** Of a live procedure (also a stream): the key field. `output` is the codec of a snapshot, `T[]`. */
  live?: string;
  /** Of a live procedure: the codec of a change, `{ set?: T[]; patch?: Patch<T>[]; removed?: K[] }`. */
  delta?: Out;
  /** Of a streaming procedure in the client table: opens subscriptions. */
  subscribe?: typeof subscribe | typeof subscribeLive;
  /** In the server table: whether the procedure takes `ctx`. Without it the handler does not call `context`. */
  ctx?: boolean;
  /** Marked by `query()`: the client sends GET with the input in the URL. */
  get?: boolean;
  /** Hash of the contract: the lockfile entries of every type the procedure reaches. */
  hash: string;
  /** In the server table: the input type and the schema, for `checks` and `refine`. */
  inputDesc?: { schema: SchemaDesc; type: TypeDesc };
}

/** What the client needs of a procedure: encode the input, read the output. */
export type ClientEntry = Entry<Encoder<any>, Decoder<any>>;
/** What the server needs of a procedure: read the input, encode the output. */
export type ServerEntry = Entry<Decoder<any>, Encoder<any>>;

/** `clientProcedures` of generated code (`procedures` fits too). */
export type ClientProcedures = { readonly [path: string]: ClientEntry };
/** `serverProcedures` of generated code (`procedures` fits too). */
export type ServerProcedures = { readonly [path: string]: ServerEntry };

/** Query parameters of a GET call: the contract hash, and the encoded input in base64url. */
export const HASH_PARAM = 'h';
export const INPUT_PARAM = 'i';
/**
 * Longest input, in base64url characters, that a client puts in a URL; longer inputs go by POST.
 * Proxies and servers commonly refuse URLs past 8 KB; this leaves room for the rest of the URL.
 */
export const MAX_GET_INPUT = 2048;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64_INDEX[B64.charCodeAt(i)] = i;

/** base64url without padding (RFC 4648 §5). */
export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '');
  }
  return s;
}

/** Bytes of base64url without padding; null when the text is not that. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array((text.length * 3) >> 2);
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const v = c < 128 ? B64_INDEX[c] : -1;
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out;
}

export function codeForStatus(status: number): string {
  for (const code in STATUS) if (STATUS[code] === status) return code;
  return status >= 500 ? 'INTERNAL' : 'BAD_RESPONSE';
}

/** An error envelope: of an HTTP response with its status, or of a stream frame (status from the code). */
export function readError(bytes: Uint8Array, status?: number): RpcError {
  let e;
  try {
    e = decodeError(bytes);
  } catch (cause) {
    return new RpcError('BAD_RESPONSE', `${status ? `HTTP ${status}` : 'stream'}: malformed error`, undefined, { status: status ?? 502, cause });
  }
  let data: unknown;
  if (e.data) {
    try {
      data = JSON.parse(new TextDecoder().decode(e.data));
    } catch {
      data = undefined;
    }
  }
  return new RpcError(e.code, e.message, data, { status });
}

/**
 * The hook of the ts-bin-rpc DevTools extension, `globalThis.__TBR_DEVTOOLS__`, which it defines
 * before the page's scripts run. Clients report every call and stream to it with the codecs to read
 * them, so the panel needs no schema. Without the extension it is undefined: a lookup per call.
 * Arguments are positional to keep the client small.
 */
export interface DevtoolsHook {
  /**
   * After a call: `input` as the caller passed it, `sent` the encoded input, `received` the response
   * body (a message of `proc.output` or an error envelope), `start` the `performance.now()` before
   * the request.
   */
  call(path: string, get: boolean, input: unknown, sent: Uint8Array, res: Response, received: Uint8Array, proc: ClientEntry, error: RpcError | undefined, start: number): void;
  /** When a subscription starts; `proc.output` reads a batch, `T[]`. */
  stream(path: string, input: unknown, proc: ClientEntry): DevtoolsTap | undefined;
}
export interface DevtoolsTap {
  /** A data frame; for live state, a snapshot (`kind` 5) or a delta (6), read with `proc.delta`. */
  batch(payload: Uint8Array, kind?: number): void;
  /** `stopped`: the client stopped the subscription. */
  end(error: RpcError | undefined, stopped: boolean): void;
}
export const devtoolsHook = (): DevtoolsHook | undefined => (globalThis as { __TBR_DEVTOOLS__?: DevtoolsHook }).__TBR_DEVTOOLS__;

/**
 * `client.user.get[CALL]`: the procedure as `(input, options)` whether it takes an input or not, for
 * adapters that hold the input apart from the options (`ts-bin-rpc/tanstack`). Not part of `Client<R>`.
 */
export const CALL: unique symbol = Symbol.for('ts-bin-rpc.call');
export interface Callable {
  readonly input: boolean;
  /** A streaming procedure: `'rows'`, or `'live'` for live state. Its rows come through `subscribe` on the client. */
  readonly stream?: 'rows' | 'live';
  call(input: unknown, options?: CallOptions): Promise<unknown>;
}
