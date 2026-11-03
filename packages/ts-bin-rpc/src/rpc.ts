// Protocol pieces shared by the server and the client (DESIGN §10): errors, statuses, headers and the
// procedure table that generated code exports.
import type { Decoder, Encoder } from './runtime.ts';

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
  /** Hash of the contract: the lockfile entries of every type the procedure reaches. */
  hash: string;
}

/** What the client needs of a procedure: encode the input, read the output. */
export type ClientEntry = Entry<Encoder<any>, Decoder<any>>;
/** What the server needs of a procedure: read the input, encode the output. */
export type ServerEntry = Entry<Decoder<any>, Encoder<any>>;

/** `clientProcedures` of generated code (`procedures` fits too). */
export type ClientProcedures = { readonly [path: string]: ClientEntry };
/** `serverProcedures` of generated code (`procedures` fits too). */
export type ServerProcedures = { readonly [path: string]: ServerEntry };

export function codeForStatus(status: number): string {
  for (const code in STATUS) if (STATUS[code] === status) return code;
  return status >= 500 ? 'INTERNAL' : 'BAD_RESPONSE';
}
