// TanStack Query options from a client: `useQuery(rq.user.get.queryOptions({ id }))`. Plain option
// objects, no hooks, so it works with every TanStack Query adapter (React, Vue, Solid, Svelte,
// Angular). Only types come from @tanstack/query-core; nothing of it is imported at run time:
// streams take its `streamedQuery` from the app, `createQueryOptions(api, { streamedQuery })`.
import type { DataTag, InfiniteData, InfiniteQueryObserverOptions, MutationOptions, QueryFunctionContext, QueryKey, QueryObserverOptions } from '@tanstack/query-core';
import { CALL, type Callable, type RpcError } from './rpc.ts';
import type { CallOptions, Client, DecodeMode, InputArgs, LiveStream, StreamItem } from './router.ts';

/** Options of the call itself, apart from TanStack's: `queryOptions(input, { staleTime, tbr: { decode: 'lazy' } })`. */
export interface TbrOptions {
  /**
   * `'eager'` (default here): plain objects in the cache, which structural sharing, DevTools,
   * `dehydrate` and persisters need. `'lazy'`: views, for large responses read in part; structural
   * sharing is then off, since views are new values on every fetch.
   */
  decode?: DecodeMode;
  headers?: HeadersInit;
}

/**
 * `[path, input?]`: `[['user', 'get'], { id: 1 }]`. A path prefix, `[['user']]`, matches the namespace.
 * An infinite query has `'infinite'` after the input, since its data are pages.
 */
export type ProcedureKey = readonly [path: readonly string[], input?: unknown, kind?: 'infinite'];

type QueryOpts<O, S> = Omit<QueryObserverOptions<O, RpcError, S, O, ProcedureKey>, 'queryKey' | 'queryFn'> & { tbr?: TbrOptions };
type MutationOpts<O, V, C> = Omit<MutationOptions<O, RpcError, V, C>, 'mutationKey' | 'mutationFn'> & { tbr?: TbrOptions };

type InputOf<A extends unknown[]> = InputArgs<A> extends [] ? undefined : InputArgs<A> extends [input?: infer I] ? I : never;
/** The input without its `cursor`, which the page param fills. */
type PageInput<I> = Omit<NonNullable<I>, 'cursor'>;
type CursorOf<I> = NonNullable<I> extends { cursor?: unknown } ? NonNullable<I>['cursor'] : never;
type InfiniteOpts<O, S, C> = Omit<InfiniteQueryObserverOptions<O, RpcError, S, ProcedureKey, C>, 'queryKey' | 'queryFn' | 'initialPageParam'> & { tbr?: TbrOptions } & (undefined extends C
    ? { /** The cursor of the first page. Default: none. */ initialPageParam?: C }
    : { /** The cursor of the first page. */ initialPageParam: C });

/** Variables of a mutation: the input, or `void` when the procedure takes none. */
type Variables<A extends unknown[]> = InputArgs<A> extends [] ? void : InputArgs<A> extends [infer I] ? I : InputArgs<A> extends [input?: infer I] ? I | undefined : never;

export interface ProcedureOptions<A extends unknown[], O> {
  /** Options for `useQuery`, `useSuspenseQuery`, `queryClient.fetchQuery` and the like. */
  queryOptions<S = O>(
    ...args: [...InputArgs<A>, options?: QueryOpts<O, S>]
  ): Omit<QueryOpts<O, S>, 'tbr'> & {
    queryKey: DataTag<ProcedureKey, O, RpcError>;
    queryFn: (context: QueryFunctionContext<ProcedureKey>) => Promise<O>;
    queryKeyHashFn: (key: QueryKey) => string;
  };
  /** The key of a query with this input, typed for `getQueryData` and `setQueryData`. */
  queryKey(...input: InputArgs<A>): DataTag<ProcedureKey, O, RpcError>;
  /** Options for `useMutation`; the input is the mutation's variables. */
  mutationOptions<C = unknown>(
    options?: MutationOpts<O, Variables<A>, C>,
  ): Omit<MutationOpts<O, Variables<A>, C>, 'tbr'> & {
    mutationKey: ProcedureKey;
    mutationFn: (variables: Variables<A>) => Promise<O>;
  };
  /** `[['user', 'get']]`: every query of this procedure, whatever the input. */
  pathKey(): ProcedureKey;
}

/** Of a procedure whose input has a `cursor`: pages for `useInfiniteQuery`. */
export interface InfiniteProcedureOptions<A extends unknown[], O, I = InputOf<A>, C = CursorOf<I>> {
  /**
   * Options for `useInfiniteQuery` and `queryClient.fetchInfiniteQuery`: the input without `cursor`,
   * then `getNextPageParam`, which returns the next cursor or `undefined` after the last page.
   */
  infiniteQueryOptions<S = InfiniteData<O, C>>(
    ...args: {} extends PageInput<I> ? [input: PageInput<I> | undefined, options: InfiniteOpts<O, S, C>] : [input: PageInput<I>, options: InfiniteOpts<O, S, C>]
  ): Omit<InfiniteOpts<O, S, C>, 'tbr' | 'initialPageParam'> & {
    queryKey: DataTag<ProcedureKey, InfiniteData<O, C>, RpcError>;
    queryFn: (context: QueryFunctionContext<ProcedureKey, C>) => Promise<O>;
    initialPageParam: C;
    queryKeyHashFn: (key: QueryKey) => string;
  };
  /** The key of the infinite query with this input, typed for `getQueryData`. */
  infiniteQueryKey(...input: {} extends PageInput<I> ? [input?: PageInput<I>] : [input: PageInput<I>]): DataTag<ProcedureKey, InfiniteData<O, C>, RpcError>;
}

type StreamQueryOpts<Chunk, D, S> = Omit<QueryObserverOptions<D, RpcError, S, D, ProcedureKey>, 'queryKey' | 'queryFn'> & {
  tbr?: TbrOptions;
  /**
   * What a refetch does to the data: `'reset'` (default for streams) empties it and starts over,
   * `'append'` (default for live state) keeps it while the new stream comes, `'replace'` writes it
   * once the stream ends.
   */
  refetchMode?: 'append' | 'reset' | 'replace';
} & (
    | { reducer?: never; initialValue?: never }
    | {
        /** Folds each chunk into the data, instead of the default. Comes with `initialValue`. */
        reducer: (data: D, chunk: Chunk) => D;
        initialValue: D;
      }
  );

type StreamQueryResult<D, S> = Omit<QueryObserverOptions<D, RpcError, S, D, ProcedureKey>, 'queryKey' | 'queryFn'> & {
  queryKey: DataTag<ProcedureKey, D, RpcError>;
  queryFn: (context: QueryFunctionContext<ProcedureKey>) => Promise<D>;
  queryKeyHashFn: (key: QueryKey) => string;
};

/** Of a stream: a query whose data grow as batches arrive (`streamedQuery`). */
export interface StreamProcedureOptions<A extends unknown[], T> {
  /**
   * Options for `useQuery`: the data are every row so far, `T[]`, one update per batch. `reducer`
   * gets each batch instead: `(rows, batch) => [...rows, ...batch].slice(-100)` keeps the last 100.
   * The query stays fetching until the stream ends; leaving it stops the stream.
   */
  queryOptions<D = T[], S = D>(...args: [...InputArgs<A>, options?: StreamQueryOpts<readonly T[], D, S>]): StreamQueryResult<NoInfer<D>, NoInfer<S>>;
  queryKey(...input: InputArgs<A>): DataTag<ProcedureKey, T[], RpcError>;
  pathKey(): ProcedureKey;
}

/** Of live state: a query whose data are the rows of the state, kept up to date. */
export interface LiveProcedureOptions<A extends unknown[], T, K extends keyof T> {
  /**
   * Options for `useQuery`: the data are the rows of the state, `T[]`, a new array on every change,
   * where unchanged rows stay the same objects. `order` sorts them by key, as in `subscribe`.
   */
  queryOptions<D = T[], S = D>(
    ...args: [...InputArgs<A>, options?: StreamQueryOpts<readonly T[], D, S> & { order?: 'asc' | 'desc' | ((a: T[K], b: T[K]) => number) }]
  ): StreamQueryResult<NoInfer<D>, NoInfer<S>>;
  queryKey(...input: InputArgs<A>): DataTag<ProcedureKey, T[], RpcError>;
  pathKey(): ProcedureKey;
}

export interface Namespace {
  /** `[['user']]`: every query under this namespace; `[[]]` at the root, every query of the client. */
  pathKey(): ProcedureKey;
}

// No `as` clause: a mapped type with one does not see the keys of NoInfer<…>, which `use()` returns.
export type QueryOptionsProxy<R> = Namespace & {
  readonly [K in keyof R]: R[K] extends (...args: infer A) => infer O
    ? Awaited<O> extends LiveStream<infer T, infer Key>
      ? LiveProcedureOptions<A, T, Key>
      : [StreamItem<Awaited<O>>] extends [never]
        ? ProcedureOptions<A, Awaited<O>> & ('cursor' extends keyof NonNullable<InputOf<A>> ? InfiniteProcedureOptions<A, Awaited<O>> : {})
        : StreamProcedureOptions<A, StreamItem<Awaited<O>>>
    : QueryOptionsProxy<R[K]>;
};

export interface QueryOptionsConfig {
  /**
   * `experimental_streamedQuery` of TanStack Query (`streamedQuery` once it is stable), from your
   * adapter or `@tanstack/query-core`, for the `queryOptions` of streams.
   */
  streamedQuery?: (options: never) => (context: never) => unknown;
}

/**
 * Hashes a key as TanStack Query does, so that `getQueryData(key)` finds a query without our hash,
 * and also takes bigints, on which TanStack's default throws. With `u64` or `i64` in inputs, set it
 * for the whole client: `new QueryClient({ defaultOptions: { queries: { queryKeyHashFn: hashKey } } })`.
 */
export function hashKey(key: QueryKey): string {
  return JSON.stringify(key, (_, v: unknown) => {
    if (typeof v === 'bigint') return { $bigint: v.toString() };
    if (!isPlainObject(v)) return v;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) sorted[k] = v[k];
    return sorted;
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (Object.prototype.toString.call(v) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === null || proto === Object.prototype;
}

/**
 * Chunks pushed by a subscription, as an async iterable for `streamedQuery`. It ends with the
 * stream, with its error, or when `signal` aborts, after which a subscription calls nothing.
 */
function chunks(open: (push: (chunk: unknown) => void, done: (error?: unknown) => void) => { stop(): void }, signal: AbortSignal): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      const queue: unknown[] = [];
      let wake: (() => void) | undefined, over = false, error: unknown, sub: { stop(): void } | undefined;
      const done = (e?: unknown) => ((over = true), (error = e), wake?.());
      return {
        async next() {
          if (!sub && !over) {
            sub = open((c) => (queue.push(c), wake?.()), done);
            if (signal.aborted) done();
            else signal.addEventListener('abort', () => done(), { once: true });
          }
          for (;;) {
            if (queue.length) return { value: queue.shift(), done: false };
            if (error) throw error;
            if (over) return { value: undefined, done: true };
            await new Promise<void>((r) => (wake = r));
            wake = undefined;
          }
        },
        async return() {
          over = true;
          sub?.stop();
          return { value: undefined, done: true };
        },
      };
    },
  };
}

/** TanStack Query options for every procedure of `api`, nested as the router. */
export function createQueryOptions<R>(api: Client<R>, config: QueryOptionsConfig = {}): QueryOptionsProxy<R> {
  const node = (path: string[]): unknown => {
    const children = new Map<string, unknown>();
    const target = (api as unknown as Record<string, unknown>);
    const proc = (): any => path.reduce<any>((o, k) => o[k], target);
    const at = (): Callable => proc()[CALL];
    const key = (input: unknown): ProcedureKey => (input === undefined ? [path] : [path, input]);
    const callOptions = (tbr: TbrOptions | undefined, signal?: AbortSignal): CallOptions => ({ decode: tbr?.decode ?? 'eager', headers: tbr?.headers, signal });
    const split = (args: unknown[]): [unknown, Record<string, unknown> | undefined] => (at().input ? [args[0], args[1] as never] : [undefined, args[0] as never]);
    const streamOptions = (input: unknown, options: Record<string, unknown>, live: boolean) => {
      const { tbr, refetchMode = live ? 'append' : 'reset', reducer, initialValue, order, ...rest } = options as Record<string, any>;
      if (!config.streamedQuery) throw new TypeError(`ts-bin-rpc: '${path.join('.')}' is a stream: pass streamedQuery, createQueryOptions(api, { streamedQuery })`);
      const args = (handler: unknown, signal: AbortSignal) => [...(at().input ? [input] : []), handler, { ...callOptions(tbr, signal), order }];
      const queryFn = (config.streamedQuery as (o: object) => unknown)({
        refetchMode,
        reducer: reducer ?? (live ? (_: unknown, rows: unknown) => rows : (data: unknown[], rows: unknown[]) => data.concat(rows)),
        initialValue: reducer ? initialValue : [],
        streamFn: ({ signal }: { signal: AbortSignal }) =>
          chunks(
            (push, done) =>
              proc().subscribe(
                ...args(live ? { change: (state: ReadonlyMap<unknown, unknown>) => push([...state.values()]), error: done, end: done } : { batch: push, error: done, end: done }, signal),
              ),
            signal,
          ),
      });
      return { ...rest, queryKey: key(input), queryFn, queryKeyHashFn: hashKey };
    };
    const methods: Record<string, (...args: any[]) => unknown> = {
      pathKey: () => [path],
      queryKey: (input?: unknown) => key(input),
      queryOptions: (...args: unknown[]) => {
        const [input, options = {}] = split(args);
        const kind = at().stream;
        if (kind) return streamOptions(input, options, kind === 'live');
        const { tbr, ...rest } = options as { tbr?: TbrOptions };
        return {
          ...(tbr?.decode === 'lazy' ? { structuralSharing: false } : {}),
          ...rest,
          queryKey: key(input),
          queryFn: ({ signal }: { signal: AbortSignal }) => at().call(input, callOptions(tbr, signal)),
          queryKeyHashFn: hashKey,
        };
      },
      infiniteQueryKey: (input?: unknown) => [path, input, 'infinite'],
      infiniteQueryOptions: (input: unknown, options: Record<string, unknown>) => {
        const { tbr, initialPageParam, ...rest } = options as { tbr?: TbrOptions; initialPageParam?: unknown };
        return {
          ...(tbr?.decode === 'lazy' ? { structuralSharing: false } : {}),
          ...rest,
          initialPageParam,
          queryKey: [path, input, 'infinite'],
          queryFn: ({ pageParam, signal }: { pageParam: unknown; signal: AbortSignal }) =>
            at().call(pageParam === undefined ? input : { ...(input as object), cursor: pageParam }, callOptions(tbr, signal)),
          queryKeyHashFn: hashKey,
        };
      },
      mutationOptions: (options: { tbr?: TbrOptions } = {}) => {
        const { tbr, ...rest } = options;
        return { ...rest, mutationKey: [path], mutationFn: (input: unknown) => at().call(input, callOptions(tbr)) };
      },
    };
    return new Proxy(methods, {
      get(_, k) {
        if (typeof k !== 'string') return undefined;
        if (Object.hasOwn(methods, k)) return methods[k];
        let child = children.get(k);
        if (!child) children.set(k, (child = node([...path, k])));
        return child;
      },
    });
  };
  return node([]) as QueryOptionsProxy<R>;
}
