// Type checks only (tsc, not vitest): the options go into the React hooks as they are.
import type { experimental_streamedQuery, QueryClient, useInfiniteQuery, useMutation, useQuery, useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import type { Client, RpcError } from 'ts-bin-rpc';
import { createQueryOptions } from 'ts-bin-rpc/tanstack';
import type { appRouter, Tick, Unit, User } from '../src/router.ts';

declare const api: Client<typeof appRouter>;
declare const hooks: { useQuery: typeof useQuery; useSuspenseQuery: typeof useSuspenseQuery; useMutation: typeof useMutation; useInfiniteQuery: typeof useInfiniteQuery; useSuspenseInfiniteQuery: typeof useSuspenseInfiniteQuery };
declare const streamedQuery: typeof experimental_streamedQuery;
declare const queryClient: QueryClient;
type Is<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export function types() {
  const rq = createQueryOptions(api, { streamedQuery });

  const user = hooks.useQuery(rq.user.get.queryOptions({ id: 3 }));
  const u: Is<typeof user.data, User | undefined> = true;
  const e: Is<typeof user.error, RpcError | null> = true;

  const names = hooks.useQuery(rq.user.list.queryOptions(undefined, { select: (users) => users.map((x) => x.name) }));
  const n: Is<typeof names.data, string[] | undefined> = true;

  const version = hooks.useSuspenseQuery(rq.version.queryOptions());
  const v: Is<typeof version.data, { version: string }> = true;

  const deposit = hooks.useMutation(rq.account.deposit.mutationOptions({ onSuccess: (out) => out.amount }));
  deposit.mutate({ amount: 5 });
  // @ts-expect-error the input of deposit
  deposit.mutate({ amount: 'five' });

  const cached = queryClient.getQueryData(rq.user.get.queryKey({ id: 3 }));
  const c: Is<typeof cached, User | undefined> = true;
  queryClient.setQueryData(rq.user.get.queryKey({ id: 3 }), (old) => old && { ...old, name: 'C' });
  void queryClient.invalidateQueries({ queryKey: rq.account.pathKey() });
  const pages = hooks.useInfiniteQuery(rq.user.page.infiniteQueryOptions({ limit: 10 }, { getNextPageParam: (last) => last.next }));
  const p: Is<typeof pages.data, { pages: { users: User[]; next?: number }[]; pageParams: (number | undefined)[] } | undefined> = true;
  void pages.fetchNextPage();
  const flat = hooks.useSuspenseInfiniteQuery(rq.user.page.infiniteQueryOptions(undefined, { getNextPageParam: (last) => last.next, select: (d) => d.pages.flatMap((x) => x.users) }));
  const f: Is<typeof flat.data, User[]> = true;
  // @ts-expect-error the cursor comes from the page param, not the input
  rq.user.page.infiniteQueryOptions({ cursor: 1 }, { getNextPageParam: () => undefined });
  // @ts-expect-error only procedures with a cursor have pages
  void rq.user.get.infiniteQueryOptions;

  const ticks = hooks.useQuery(rq.stream.ticks.queryOptions({ n: 10 }));
  const t: Is<typeof ticks.data, Tick[] | undefined> = true;
  const last = hooks.useQuery(rq.stream.ticks.queryOptions({ n: 10 }, { reducer: (_: Tick | null, batch) => batch.at(-1) ?? null, initialValue: null }));
  const l: Is<typeof last.data, Tick | null | undefined> = true;
  const live = hooks.useQuery(rq.stream.units.queryOptions({ order: 'asc', select: (rows) => rows.length }));
  const lv: Is<typeof live.data, number | undefined> = true;
  const rows = queryClient.getQueryData(rq.stream.units.queryKey());
  const r: Is<typeof rows, Unit[] | undefined> = true;
  return [u, e, n, v, c, p, f, t, l, lv, r];
}
