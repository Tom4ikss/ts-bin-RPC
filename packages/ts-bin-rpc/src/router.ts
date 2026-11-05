// Types derived from a router: a plain object of `(input, ctx) => result` functions, nested by namespace.
// Shared by the client (call signatures), the server (lookup) and generated code (staleness checks).
import type { RpcError } from './rpc.ts';
import type { tbr } from './brands.ts';

export type AnyProcedure = (...args: any[]) => unknown;
export type AnyRouter = { readonly [key: string]: AnyProcedure | AnyRouter };

/** `'user.get' | 'user.list' | ...` */
export type ProcedurePath<R, P extends string = ''> = {
  [K in keyof R & string]: R[K] extends AnyProcedure ? `${P}${K}` : ProcedurePath<R[K], `${P}${K}.`>;
}[keyof R & string];

export type ProcedureAt<R, P extends string> = P extends `${infer H}.${infer T}`
  ? H extends keyof R ? ProcedureAt<R[H], T> : never
  : P extends keyof R ? R[P] : never;

/** Input of a procedure without `undefined`; `never` when it takes none. */
export type InputOf<R, P extends string> = Exclude<Parameters<Extract<ProcedureAt<R, P>, AnyProcedure>>[0], undefined | void>;

export type InputOptional<R, P extends string> = undefined extends Parameters<Extract<ProcedureAt<R, P>, AnyProcedure>>[0] ? true : false;

export type OutputOf<R, P extends string> = Awaited<ReturnType<Extract<ProcedureAt<R, P>, AnyProcedure>>>;

/** Whether a procedure declares a second parameter, `ctx`. */
export type TakesContext<R, P extends string> = Parameters<Extract<ProcedureAt<R, P>, AnyProcedure>>['length'] extends 0 | 1 ? false : true;

// ------------------------------------------------------------------------------------------ queries

export declare const tbrQuery: unique symbol;

/** A procedure marked by `query()`: free of side effects, called with GET, cacheable over HTTP. */
export type Query<F> = F & { readonly [tbrQuery]: true };

/** Whether a procedure is a query. */
export type IsQuery<R, P extends string> = ProcedureAt<R, P> extends { readonly [tbrQuery]: true } ? true : false;

// ------------------------------------------------------------------------------------------ streams

export declare const tbrStream: unique symbol;

/**
 * What a streaming procedure returns: `stream()` or `channel().subscribe()` on the server. The rows
 * travel in batches; the client reads them with `subscribe`.
 */
export interface Stream<T> {
  readonly [tbrStream]: T;
}

/** Row type of a streaming result, `never` for others. Async iterables and ReadableStreams stream too. */
export type StreamItem<O> = O extends Stream<infer T> ? T : O extends AsyncIterable<infer T> ? T : O extends ReadableStream<infer T> ? T : never;

export type StreamItemOf<R, P extends string> = StreamItem<OutputOf<R, P>>;

/** `'u32'` for `u32`; `'none'` for plain `number` and `bigint`, which have no brand. */
type BrandTag<V> = [V extends { readonly [tbr]?: infer B } ? Exclude<B, undefined> : never] extends [infer B] ? ([B] extends [never] ? 'none' : B) : 'none';
type NumberColumn<B> = [B] extends ['u8'] ? Uint8Array : [B] extends ['i8'] ? Int8Array : [B] extends ['u16'] ? Uint16Array : [B] extends ['i16'] ? Int16Array
  : [B] extends ['u32'] ? Uint32Array : [B] extends ['i32'] ? Int32Array : [B] extends ['f32'] ? Float32Array : Float64Array;
type ColumnOf<V> = [V] extends [boolean] ? Uint8Array : [V] extends [Date] ? Float64Array : [V] extends [bigint] ? ([BrandTag<V>] extends ['u64'] ? BigUint64Array : BigInt64Array) : NumberColumn<BrandTag<V>>;
type ColumnKey<T, K extends keyof T> = undefined extends T[K] ? never : null extends T[K] ? never
  : [number] extends [T[K]] ? K : [bigint] extends [T[K]] ? K : [boolean] extends [T[K]] ? K : [T[K]] extends [Date] ? K : never;

/**
 * Required numeric, boolean and Date fields of a batch as typed arrays over the message bytes:
 * `Float32Array` for `f32`, `Uint32Array` for `u32`, `Float64Array` for `number` and `Date`
 * (milliseconds), `Uint8Array` (0 or 1) for `boolean`.
 */
export type Columns<T> = { readonly [K in keyof T as K extends string ? ColumnKey<T, K> : never]: ColumnOf<T[K]> };

/** One frame of a stream: its rows, plus their numeric columns without copying. */
export interface Batch<T> extends ReadonlyArray<T> {
  readonly columns: Partial<Columns<T>>;
}

export type StreamHandler<T> =
  | ((row: T) => void)
  | {
      row?(row: T): void;
      batch?(batch: Batch<T>): void;
      /** The stream failed; without this callback the error goes to an iterator or the console. */
      error?(error: RpcError): void;
      /** The server ended the stream. */
      end?(): void;
    };

/** A running subscription. Also an async iterable of rows: `for await (const row of sub)`. */
export interface Subscription<T> extends AsyncIterable<T> {
  /** Stops reading and tells the server; no `end` or `error` callback follows. */
  stop(): void;
}

export interface StreamProcedure<A extends unknown[], T> {
  subscribe(...args: [...InputArgs<A>, handler?: StreamHandler<T>, options?: CallOptions]): Subscription<T>;
}

// --------------------------------------------------------------------------------------- live state

export declare const tbrLive: unique symbol;

/**
 * What a live procedure returns: `live<T>().by(key).subscribe()` on the server. A subscriber gets the
 * rows keyed by `K`, then the changes to them; the client keeps the state.
 */
export interface LiveStream<T, K extends keyof T> {
  readonly [tbrLive]: { row: T; key: K };
}

/** Row type of a live result, `never` for others. */
export type LiveItem<O> = O extends LiveStream<infer T, any> ? T : never;
/** Key field of a live result. */
export type LiveKey<O> = O extends LiveStream<any, infer K> ? K : never;
export type LiveItemOf<R, P extends string> = LiveItem<OutputOf<R, P>>;
export type LiveKeyOf<R, P extends string> = LiveKey<OutputOf<R, P>>;

/** What changed: keys of rows set or changed, keys of rows removed. After a snapshot, every key is in `set`. */
export interface LiveChanges<Key> {
  /** The whole state arrived: on subscribe, and again when the client fell behind. */
  readonly snapshot: boolean;
  readonly set: readonly Key[];
  readonly removed: readonly Key[];
}

export type LiveHandler<T, K extends keyof T> =
  | ((state: ReadonlyMap<T[K], T>, changes: LiveChanges<T[K]>) => void)
  | {
      /** After the snapshot and after each batch of changes. A changed row is a new object. */
      change?(state: ReadonlyMap<T[K], T>, changes: LiveChanges<T[K]>): void;
      /** The stream failed; without this callback the error goes to the console. */
      error?(error: RpcError): void;
      /** The server ended the stream. */
      end?(): void;
    };

/** A running live subscription. */
export interface LiveSubscription<T, K extends keyof T> {
  /** The rows by key, kept up to date; empty until the snapshot arrives. */
  readonly state: ReadonlyMap<T[K], T>;
  /** Stops reading and tells the server; no `end` or `error` callback follows. */
  stop(): void;
}

export interface LiveProcedure<A extends unknown[], T, K extends keyof T> {
  subscribe(...args: [...InputArgs<A>, handler?: LiveHandler<T, K>, options?: CallOptions]): LiveSubscription<T, K>;
}

/** Client arguments for a procedure's parameter list: the input only, `ctx` stays on the server. */
export type InputArgs<A extends unknown[]> = A extends []
  ? []
  : A extends [infer I, ...unknown[]]
    ? [I] extends [void] ? [] : undefined extends I ? [input?: I] : [input: I]
    : A extends [input?: infer I, ...rest: unknown[]]
      ? [input?: I]
      : [];

/** What a call returns: `'lazy'` views that read the response on access, or `'eager'` plain objects. */
export type DecodeMode = 'lazy' | 'eager';

export interface CallOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** Overrides the client's `decode` for this call. */
  decode?: DecodeMode;
}

export type ClientProcedure<F> = F extends (...args: infer A) => infer O
  ? Awaited<O> extends LiveStream<infer T, infer K>
    ? LiveProcedure<A, T, K>
    : [StreamItem<Awaited<O>>] extends [never]
    ? (...args: [...InputArgs<A>, options?: CallOptions]) => Promise<Awaited<O>>
      : StreamProcedure<A, StreamItem<Awaited<O>>>
  : never;

export type Client<R> = {
  readonly [K in keyof R]: R[K] extends AnyProcedure ? ClientProcedure<R[K]> : Client<R[K]>;
};

// ------------------------------------------------------------------------------- staleness checks

/** Shows up in a type error when generated code no longer matches the router. */
export interface StaleCodegen_RunTbrGenerate<Where extends string> {
  readonly where: Where;
}

/** `true` when the generated and the source type accept the same values, else a readable error type. */
export type Same<Generated, Source, Where extends string> = [Generated] extends [Source]
  ? [Source] extends [Generated] ? true : StaleCodegen_RunTbrGenerate<Where>
  : StaleCodegen_RunTbrGenerate<Where>;

export type Expect<T extends true> = T;
