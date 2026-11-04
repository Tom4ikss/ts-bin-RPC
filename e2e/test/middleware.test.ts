// Middleware: order, context, results and errors of a chain, in process; type checks run with tsc.
import { createClient } from 'ts-bin-rpc/client';
import { around, createHandler, middleware, use, type Call, type RouterContext } from 'ts-bin-rpc/server';
import { RpcError, toPlain } from 'ts-bin-rpc';
import { describe, expect, it, vi } from 'vitest';
import { appRouter, type Authed, type Ctx } from '../src/router.ts';
import { procedures } from '../src/tbr.gen.ts';

const via = (handler: (r: Request) => Promise<Response>) => (async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;
type Account = (typeof appRouter)['account'];

/** The fixture router with `account` replaced, served in process. */
function serve(account: Account, onError?: (e: unknown) => void, user: string | null = 'ann') {
  const handler = createHandler({ ...appRouter, account }, { procedures, prefix: '/rpc', context: () => ({ user }), onError });
  return createClient<typeof appRouter>({ url: 'http://test/rpc', procedures, fetch: via(handler) });
}

const me = async (_: void, ctx: Authed) => ({ name: ctx.user });
/** A stand-in for the rest of `account`, so that only `me` matters. */
const rest = (a: Account) => ({ deposit: a.deposit, trace: a.trace, ticks: a.ticks });

describe('a chain', () => {
  it('runs outermost first, and the procedure gets the last context', async () => {
    const seen: string[] = [];
    const step = (name: string) =>
      around(async ({ ctx }: Call<Ctx>, next) => {
        seen.push(`${name} ${JSON.stringify(ctx)}`);
        return next();
      });
    const named = middleware(({ ctx }: Call<Ctx>): Authed => ({ ...ctx, user: `${ctx.user}!` }));
    const slow = middleware(async ({ ctx }: Call<Authed>): Promise<Authed> => ({ ...ctx, user: `${ctx.user}?` }));
    const api = serve(use([step('a'), named, step('b'), slow], { me, ...rest(appRouter.account) }));
    expect(toPlain(await api.account.me())).toEqual({ name: 'ann!?' });
    expect(seen).toEqual(['a {"user":"ann"}', 'b {"user":"ann!"}']);
  });

  it('lets around answer without the procedure, or replace its result', async () => {
    const procedure = vi.fn(me);
    const authed = middleware(({ ctx }: Call<Ctx>): Authed => ({ ...ctx, user: ctx.user ?? '' }));
    const cached = around(async () => ({ name: 'cached' }));
    expect(toPlain(await serve(use([authed, cached], { me: procedure, ...rest(appRouter.account) })).account.me())).toEqual({ name: 'cached' });
    expect(procedure).not.toHaveBeenCalled();
    const upper = around(async (_, next) => {
      const r = (await next()) as { name: string };
      return { name: r.name.toUpperCase() };
    });
    expect(toPlain(await serve(use([upper, authed], { me, ...rest(appRouter.account) })).account.me())).toEqual({ name: 'ANN' });
  });

  it('sends an RpcError from a step as is, and other errors as INTERNAL to onError', async () => {
    const onError = vi.fn();
    const deny = middleware((_: Call<Ctx>): Authed => {
      throw new RpcError('FORBIDDEN', 'no');
    });
    await expect(serve(use([deny], { me, ...rest(appRouter.account) }), onError).account.me()).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    const broken = middleware(async (_: Call<Ctx>): Promise<Authed> => {
      throw new Error('secret');
    });
    const e = await serve(use([broken], { me, ...rest(appRouter.account) }), onError).account.me().catch((x: RpcError) => x);
    expect(e).toMatchObject({ code: 'INTERNAL', message: 'internal error' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]).toMatchObject([{ message: 'secret' }, { path: 'account.me' }]);
  });
});

describe('use()', () => {
  it('runs the chain on direct calls too, with paths from the outermost use()', async () => {
    const paths: string[] = [];
    const log = around(async ({ path }, next) => (paths.push(path), next()));
    const router = use([log], { a: use([log], { b: async () => 1 }), c: async (input: { x: number }) => input.x });
    expect(await router.a.b()).toBe(1);
    expect(await router.c({ x: 2 })).toBe(2);
    expect(paths).toEqual(['a.b', 'a.b', 'c']);
  });

  it('does not change procedures that need no context', () => {
    const timed = around(async (_, next) => next());
    const router = use([timed], { ping: async () => 'pong' });
    // No context option: the router needs none.
    expect(() => createHandler(router, { procedures: { ping: { input: null, inputOptional: false, output: null, hash: '' } } })).not.toThrow();
  });
});

// Types, checked by tsc over e2e: what a chain asks of its callers and gives its procedures.
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const typeChecks = () => {
  const authed = middleware(({ ctx }: Call<Ctx>): Authed => ({ ...ctx, user: ctx.user ?? '' }));
  const tx = around<Authed, Authed & { tx: number }>(async ({ ctx }, next) => next({ ...ctx, tx: 1 }));
  const r = use([authed, tx], { run: async (input: { n: number }, ctx: Authed & { tx: number }) => ctx.tx + input.n });
  const outer: Eq<RouterContext<typeof r>, Ctx> = true;
  const whole: Eq<RouterContext<typeof appRouter>, Ctx> = true;
  // @ts-expect-error the chain gives Authed, the procedure needs a database too
  use([authed], { x: async (_: void, ctx: Authed & { db: string }) => ctx.db });
  // tx needs Authed from outside: callers give it, nothing has to derive it.
  const outside: Eq<RouterContext<ReturnType<typeof use<[typeof tx], { y: (_: void, ctx: Authed & { tx: number }) => Promise<number> }>>>, Authed> = true;
  // @ts-expect-error next() of a middleware that keeps the context takes no context
  around(async (_, next) => next({}));
  return [outer, whole, outside];
};

// Unannotated parameters inside use(): ctx gets the chain's context, an unused input `never` (none).
export const contextualChecks = () => {
  const authed = middleware(({ ctx }: Call<Ctx>): Authed => ({ ...ctx, user: ctx.user ?? '' }));
  const timed = around(async (_, next) => next());
  const tx = around<Authed, Authed & { tx: number }>(async ({ ctx }, next) => next({ ...ctx, tx: 1 }));
  const r = use([timed, authed], {
    me: async (_, ctx) => ctx.user,
    rename: async (input: { name: string }, ctx) => `${ctx.user}:${input.name}`,
    plain: async (input: { n: number }) => input.n,
    annotated: async (_: void, ctx: Authed) => ctx.user,
    nested: use([tx], { t: async (_, ctx) => ctx.tx }),
  });
  const me: Eq<Parameters<typeof r.me>, [_: never, ctx: Ctx]> = true;
  const meOut: Eq<Awaited<ReturnType<typeof r.me>>, string> = true;
  const rename: Eq<Parameters<typeof r.rename>[0], { name: string }> = true;
  const nested: Eq<Parameters<typeof r.nested.t>[1], Ctx> = true;
  const nestedOut: Eq<Awaited<ReturnType<typeof r.nested.t>>, number> = true;
  // @ts-expect-error an input without a type is no input: reading it is an error
  use([authed], { bad: async (input, ctx) => input.id + ctx.user });
  // A chain that only passes the context on: the procedure may need more, callers give it.
  const keep = use([timed], { me: async (_: void, ctx: Authed) => ctx.user });
  const keepCtx: Eq<Parameters<typeof keep.me>[1], Authed> = true;
  // @ts-expect-error the chain gives Authed, the procedure needs a database too
  use([authed], { x: async (_: void, ctx: Authed & { db: string }) => ctx.db });
  return [me, meOut, rename, nested, nestedOut, keepCtx];
};
