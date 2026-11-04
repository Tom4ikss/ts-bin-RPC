// Queries (DESIGN §16): procedures without side effects, called with GET so that browsers and CDNs
// can cache them. `tbr` reads the mark from the type and tells the client to use GET; the server
// reads the options from the function at startup.
import type { AnyProcedure, AnyRouter, Query } from './router.ts';

export interface QueryOptions {
  /**
   * Seconds a response stays fresh: `Cache-Control: max-age`. Without it caches revalidate every
   * time, and an unchanged response comes back as `304 Not Modified` without a body.
   */
  maxAge?: number;
  /**
   * Let shared caches (CDNs, proxies) keep the response: `public`. Default: `private`, browser cache
   * only, since a response may depend on cookies or the `Authorization` header.
   */
  public?: boolean;
}

/** A router or namespace with every procedure marked as a query. */
export type Queried<R> = { readonly [K in keyof R]: R[K] extends AnyProcedure ? Query<R[K]> : Queried<R[K]> };

const QUERIES = new WeakMap<AnyProcedure, QueryOptions>();

/**
 * Marks a procedure, or every procedure of a namespace, as a query: free of side effects, so the
 * client calls it with GET and HTTP caches may keep the response. The procedure itself does not
 * change: the server adds `Cache-Control` and `ETag`, and answers `304` to an unchanged response.
 *
 * ```ts
 * export const appRouter = {
 *   products: query(async (input: { category: string }) => db.products(input), { maxAge: 60 }),
 *   catalog: query({ brands: async () => db.brands(), tags: async () => db.tags() }, { public: true, maxAge: 300 }),
 * };
 * ```
 */
export function query<R extends AnyRouter>(router: R, options?: QueryOptions): Queried<R>;
// F has no constraint: `F extends AnyProcedure` would type the parameters of `query(async (_, ctx) => …)`
// inside use() as any, before the chain's context reaches them.
export function query<F>(procedure: F, options?: QueryOptions): Query<F>;
export function query(target: AnyProcedure | AnyRouter, options: QueryOptions = {}): unknown {
  if (typeof target !== 'function' && (target === null || typeof target !== 'object')) {
    throw new TypeError(`query() takes a procedure or a namespace, got ${target === null ? 'null' : typeof target}`);
  }
  if (options.maxAge !== undefined && !(Number.isInteger(options.maxAge) && options.maxAge >= 0)) {
    throw new TypeError(`query(): maxAge must be a whole number of seconds, got ${options.maxAge}`);
  }
  const mark = (node: AnyProcedure | AnyRouter): unknown => {
    if (typeof node === 'function') {
      QUERIES.set(node, options);
      return node;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) out[key] = typeof value === 'function' || (value !== null && typeof value === 'object') ? mark(value) : value;
    return out;
  };
  return mark(target);
}

/** The options of a query, or undefined for other procedures. */
export function queryOptions(fn: AnyProcedure): QueryOptions | undefined {
  return QUERIES.get(fn);
}

/** `Cache-Control` of a query's successful responses. */
export function cacheControl(options: QueryOptions): string {
  return `${options.public ? 'public' : 'private'}, ${options.maxAge === undefined ? 'no-cache' : `max-age=${options.maxAge}`}`;
}
