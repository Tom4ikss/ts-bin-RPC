// TanStack Query options from a client: `useQuery(rq.user.get.queryOptions({ id }))`. Plain option
// objects, no hooks, so it works with every TanStack Query adapter (React, Vue, Solid, Svelte,
// Angular). Only types come from @tanstack/query-core; nothing of it is imported at run time.
import type { DataTag, MutationOptions, QueryFunctionContext, QueryKey, QueryObserverOptions } from '@tanstack/query-core';
import { CALL, type Callable, type RpcError } from './rpc.ts';
import type { AnyProcedure, CallOptions, Client, DecodeMode, InputArgs, StreamItem } from './router.ts';

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

/** `[path, input?]`: `[['user', 'get'], { id: 1 }]`. A path prefix, `[['user']]`, matches the namespace. */
export type ProcedureKey = readonly [path: readonly string[], input?: unknown];

type QueryOpts<O, S> = Omit<QueryObserverOptions<O, RpcError, S, O, ProcedureKey>, 'queryKey' | 'queryFn'> & { tbr?: TbrOptions };
type MutationOpts<O, V, C> = Omit<MutationOptions<O, RpcError, V, C>, 'mutationKey' | 'mutationFn'> & { tbr?: TbrOptions };

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

export interface Namespace {
  /** `[['user']]`: every query under this namespace; `[[]]` at the root, every query of the client. */
  pathKey(): ProcedureKey;
}

// No `as` clause: a mapped type with one does not see the keys of NoInfer<…>, which `use()` returns.
export type QueryOptionsProxy<R> = Namespace & {
  readonly [K in keyof R]: R[K] extends (...args: infer A) => infer O
    ? [StreamItem<Awaited<O>>] extends [never] ? ProcedureOptions<A, Awaited<O>> : never
    : QueryOptionsProxy<R[K]>;
};

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

/** TanStack Query options for every procedure of `api`, nested as the router. Streams are left out. */
export function createQueryOptions<R>(api: Client<R>): QueryOptionsProxy<R> {
  const node = (path: string[]): unknown => {
    const children = new Map<string, unknown>();
    const target = (api as unknown as Record<string, unknown>);
    const at = (): Callable => path.reduce<any>((o, k) => o[k], target)[CALL];
    const key = (input: unknown): ProcedureKey => (input === undefined ? [path] : [path, input]);
    const callOptions = (tbr: TbrOptions | undefined, signal?: AbortSignal): CallOptions => ({ decode: tbr?.decode ?? 'eager', headers: tbr?.headers, signal });
    const split = (args: unknown[]): [unknown, Record<string, unknown> | undefined] => (at().input ? [args[0], args[1] as never] : [undefined, args[0] as never]);
    const methods: Record<string, (...args: any[]) => unknown> = {
      pathKey: () => [path],
      queryKey: (input?: unknown) => key(input),
      queryOptions: (...args: unknown[]) => {
        const [input, options = {}] = split(args);
        const { tbr, ...rest } = options as { tbr?: TbrOptions };
        return {
          ...(tbr?.decode === 'lazy' ? { structuralSharing: false } : {}),
          ...rest,
          queryKey: key(input),
          queryFn: ({ signal }: { signal: AbortSignal }) => at().call(input, callOptions(tbr, signal)),
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
