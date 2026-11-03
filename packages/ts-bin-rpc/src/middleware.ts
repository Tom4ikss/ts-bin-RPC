// Middleware (DESIGN §15): code that runs around procedures of a router subtree. `use()` wraps the
// procedures once; createHandler flattens nested wrappers into one chain per procedure at startup,
// so a request pays for the middleware it has and nothing for lookup or composition.
import type { AnyProcedure, AnyRouter } from './router.ts';

/** What every middleware sees of a call. One object per request, shared along the chain. */
export interface Call<C> {
  /** Procedure path, `'user.get'`. */
  readonly path: string;
  /** The decoded, verified input. */
  readonly input: unknown;
  readonly ctx: C;
}

declare const keep: unique symbol;
/** Out type of middleware that hands the context on unchanged. */
export type Keep = typeof keep;

declare const io: unique symbol;

/** A step of a chain: needs a context of type `In`, gives the next step `Out` (or the same, `Keep`). */
export interface Middleware<In, Out> {
  readonly [io]?: { in: (ctx: In) => void; out: Out };
  /** @internal */
  readonly step: Step;
}

/** @internal */
export type Step =
  | { kind: 'ctx'; fn: (call: Call<unknown>) => unknown }
  | { kind: 'around'; fn: (call: Call<unknown>, next: (ctx?: unknown) => Promise<unknown>) => unknown };

/**
 * Middleware that derives the context: checks it, adds to it, or replaces it. What it returns is
 * the `ctx` of the next step and of the procedure; what it throws is the call's error.
 *
 * ```ts
 * const authed = middleware(({ ctx }: Call<{ user?: User }>) => {
 *   if (!ctx.user) throw new RpcError('UNAUTHORIZED', 'sign in first');
 *   return { ...ctx, user: ctx.user };
 * });
 * ```
 */
export function middleware<In, Out>(fn: (call: Call<In>) => Out | Promise<Out>): Middleware<In, Out> {
  return { step: { kind: 'ctx', fn: fn as (call: Call<unknown>) => unknown } };
}

/**
 * Middleware around the rest of the chain: `next()` runs it and resolves with the procedure's
 * result, which `around` returns (or replaces). `next(ctx)` passes another context on; give the
 * types as `around<In, Out>(…)` then. For a stream, the rest ends when the procedure returns the
 * stream, not when the stream ends.
 *
 * ```ts
 * const timed = around(async ({ path }, next) => {
 *   const t0 = performance.now();
 *   try { return await next(); } finally { metrics.time(path, performance.now() - t0); }
 * });
 * ```
 */
export function around<In = unknown, Out = Keep>(
  fn: (call: Call<In>, next: [Out] extends [Keep] ? () => Promise<unknown> : (ctx: Out) => Promise<unknown>) => Promise<unknown>,
): Middleware<In, Out> {
  return { step: { kind: 'around', fn: fn as never } };
}

// ------------------------------------------------------------------------------------------ types

type CtxOf<F> = F extends (input: any, ctx: infer C, ...rest: any[]) => unknown ? (unknown extends C ? never : C) : never;
type CtxUnion<R> = { [K in keyof R]: R[K] extends AnyProcedure ? CtxOf<R[K]> : CtxUnion<R[K]> }[keyof R];
type Intersect<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/** The context the procedures of a subtree need together; `unknown` when none takes one. */
export type InnerContext<R> = [CtxUnion<R>] extends [never] ? unknown : Intersect<CtxUnion<R>>;

/** Shows up in a type error when a chain does not give a step the context it needs. */
export interface ContextMismatch<Needs, Got> {
  readonly needs: Needs;
  readonly got: Got;
}

/** What a chain needs from outside, given what its procedures need. */
export type ChainNeeds<M, Inner> = M extends readonly [infer H, ...infer T]
  ? H extends Middleware<infer In, infer Out>
    ? [Out] extends [Keep]
      ? In & ChainNeeds<T, Inner>
      : [Out] extends [ChainNeeds<T, Inner>] ? In : ContextMismatch<ChainNeeds<T, Inner>, Out>
    : never
  : Inner;

/** A procedure with its `ctx` parameter typed as `C` (dropped when `C` is `unknown`). */
type WithCtxFn<F, C> = F extends (...args: infer P) => infer O
  ? P extends []
    ? () => O
    : P extends [infer I, ...unknown[]]
      ? [unknown] extends [C] ? (input: I) => O : (input: I, ctx: C) => O
      : P extends [(infer I)?, ...unknown[]]
        ? [unknown] extends [C] ? (input?: I) => O : (input: I | undefined, ctx: C) => O
        : never
  : never;

/** The router as seen from outside a chain: every procedure takes the chain's outer context. */
export type WithContext<R, C> = { readonly [K in keyof R]: R[K] extends AnyProcedure ? WithCtxFn<R[K], C> : WithContext<R[K], C> };

type Chain = readonly Middleware<any, any>[];
/** No arguments when the chain fits its procedures; otherwise one that no call can pass, named for the error. */
type Checked<M extends Chain, R> = [ChainNeeds<M, InnerContext<R>>] extends [ContextMismatch<infer N, infer G>] ? [contextMismatch: ContextMismatch<N, G>] : [];

// ------------------------------------------------------------------------------------------ runtime

const CHAINS = new WeakMap<AnyProcedure, { chain: readonly Step[]; inner: AnyProcedure; self: object }>();

/**
 * Runs middleware around every procedure of a router or namespace, outermost first. Procedures
 * inside take the context the chain gives; callers outside give the context the chain needs.
 *
 * ```ts
 * export const appRouter = use([timed], {
 *   ping: async () => 'pong',
 *   user: use([authed], { get: async (input: { id: u32 }, ctx: Authed) => ctx.db.user(input.id) }),
 * });
 * ```
 */
export function use<const M extends Chain, R extends AnyRouter>(chain: M, router: R, ...mismatch: Checked<M, R>): WithContext<R, ChainNeeds<M, InnerContext<R>>> {
  const steps = chain.map((m) => m.step);
  const wrap = (node: AnyRouter, prefix: string): AnyRouter => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'function') {
        // A procedure already behind use(): one chain, so that direct calls see the same path.
        const inner = unwrap(value, node);
        const all = [...steps, ...inner.chain];
        const fn = compose(all, inner.fn, inner.self, prefix + key);
        CHAINS.set(fn, { chain: all, inner: inner.fn, self: inner.self });
        out[key] = fn;
      } else if (value !== null && typeof value === 'object') out[key] = wrap(value, `${prefix}${key}.`);
      else out[key] = value;
    }
    return out as AnyRouter;
  };
  return wrap(router, '') as never;
}

/**
 * The chain of a router function and the function under it, nested `use()` already flattened:
 * what createHandler composes once per procedure, with the full path. Plain functions have none.
 */
export function unwrap(fn: AnyProcedure, self: object): { chain: Step[]; fn: AnyProcedure; self: object } {
  const w = CHAINS.get(fn);
  return w ? { chain: [...w.chain], fn: w.inner, self: w.self } : { chain: [], fn, self };
}

type Run = (call: { path: string; input: unknown; ctx: unknown }) => unknown;

/**
 * One function for a chain and its procedure. Steps run in order; a context step that returns a
 * value (not a promise) goes on without an extra microtask.
 */
export function compose(chain: readonly Step[], fn: AnyProcedure, self: object, path: string): AnyProcedure {
  let run: Run = (call) => fn.call(self, call.input, call.ctx);
  for (let i = chain.length - 1; i >= 0; i--) {
    const step = chain[i], next = run;
    if (step.kind === 'ctx') {
      const derive = step.fn;
      run = (call) => {
        const ctx = derive(call as Call<unknown>);
        if (ctx instanceof Promise) return ctx.then((c) => ((call.ctx = c), next(call)));
        call.ctx = ctx;
        return next(call);
      };
    } else {
      const wrap = step.fn;
      run = (call) =>
        wrap(call as Call<unknown>, (...ctx: unknown[]) => {
          if (ctx.length) call.ctx = ctx[0];
          return Promise.resolve(next(call));
        });
    }
  }
  const top = run;
  return function (this: unknown, input: unknown, ctx: unknown) {
    return top({ path, input, ctx });
  };
}
