// Type checks only (tsc, not vitest): the options go into the React hooks as they are.
import type { QueryClient, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import type { Client, RpcError } from 'ts-bin-rpc';
import { createQueryOptions } from 'ts-bin-rpc/tanstack';
import type { appRouter, User } from '../src/router.ts';

declare const api: Client<typeof appRouter>;
declare const hooks: { useQuery: typeof useQuery; useSuspenseQuery: typeof useSuspenseQuery; useMutation: typeof useMutation };
declare const queryClient: QueryClient;
type Is<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export function types() {
  const rq = createQueryOptions(api);

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
  return [u, e, n, v, c];
}
