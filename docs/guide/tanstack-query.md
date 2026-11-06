---
title: TanStack Query
description: "queryOptions, infiniteQueryOptions and mutationOptions for every procedure, streams as queries: typed keys and invalidation by path, for React, Vue, Solid, Svelte and Angular."
---

# TanStack Query

`ts-bin-rpc/tanstack` turns a client into option objects for TanStack Query. It has no hooks of its
own, so it works with every adapter: React, Vue, Solid, Svelte, Angular.

```sh
npm install @tanstack/react-query
```

```ts
import { createClient } from 'ts-bin-rpc/client';
import { experimental_streamedQuery } from '@tanstack/react-query';
import { createQueryOptions } from 'ts-bin-rpc/tanstack';
import type { appRouter } from '../server/router';
import { clientProcedures } from './tbr.gen';

export const api = createClient<typeof appRouter>({ url: '/rpc', procedures: clientProcedures });
// streamedQuery is needed only for streams as queries
export const rq = createQueryOptions(api, { streamedQuery: experimental_streamedQuery });
```

```tsx
function Profile({ id }: { id: number }) {
  const { data, error } = useQuery(rq.user.get.queryOptions({ id }));
  // data: User | undefined, error: RpcError | null
}
```

`rq` mirrors the router: `rq.user.get` is the procedure `user.get`.

## Queries

`queryOptions(input, options)` returns `queryKey` and `queryFn`, plus any TanStack options you pass:

```ts
useQuery(rq.user.get.queryOptions({ id }, { staleTime: 60_000 }));
useSuspenseQuery(rq.version.queryOptions());
queryClient.prefetchQuery(rq.user.list.queryOptions({ role: 'admin' }));

// `select` is typed from the procedure's output
const names = useQuery(rq.user.list.queryOptions(undefined, { select: (users) => users.map((u) => u.name) }));
```

The input comes first, as in a call. A procedure without input takes the options first:
`rq.version.queryOptions({ staleTime })`. With an optional input, pass `undefined` to give options
without one.

`queryFn` passes the query's abort signal to the call: an unmounted component or `cancelQueries`
cancels the request.

## Infinite queries

A procedure whose input has a `cursor` gets `infiniteQueryOptions`, for `useInfiniteQuery`. The page
param goes into `cursor`; you give the rest of the input and say where the next page starts:

```ts
// server
page: async (input: { cursor?: u32; limit?: u32 }): Promise<{ users: User[]; next?: u32 }> => …

// client
const users = useInfiniteQuery(rq.user.page.infiniteQueryOptions({ limit: 20 }, {
  getNextPageParam: (last) => last.next, // undefined: no more pages
}));
users.data?.pages.flatMap((p) => p.users);
users.fetchNextPage();
```

The first page goes without a cursor, unless you give `initialPageParam`; a required `cursor` makes
it required. The key is `[path, input, 'infinite']`, apart from the plain query of the same input
and still under `pathKey()`. `rq.user.page.infiniteQueryKey({ limit: 20 })` gives it for
`getQueryData`.

## Streams as queries

A stream's `queryOptions` give a query whose data grow as batches arrive, through TanStack's
`streamedQuery`. Pass it to `createQueryOptions` once, as above.

```ts
const ticks = useQuery(rq.market.ticks.queryOptions({ symbol: 'BTC' }));
ticks.data; // Tick[]: every row so far, one update per batch
```

- The query is `success` from the first batch and stays `fetching` until the stream ends.
- When the last component using it unmounts, the stream stops, as `sub.stop()` does.
- An error of the stream becomes the query's `error`.
- A refetch starts the stream over: `refetchMode: 'reset'` (default) empties the data first,
  `'append'` keeps it, `'replace'` swaps it in when the new stream ends.

A stream that does not end grows without a bound. Fold the batches with `reducer` and
`initialValue` to keep what you need:

```ts
// the last 100 ticks
rq.market.ticks.queryOptions({ symbol: 'BTC' }, { reducer: (rows: Tick[], batch) => [...rows, ...batch].slice(-100), initialValue: [] });
// only the last price
rq.market.ticks.queryOptions({ symbol: 'BTC' }, { reducer: (_: number | null, batch) => batch.at(-1)?.price ?? null, initialValue: null });
```

[Live state](./live.md) works the same way, and its data are the rows of the state, `T[]`, a new
array on every change, where unchanged rows stay the same objects. `order` sorts them by key, as in
`subscribe`; a refetch keeps the old rows until the new snapshot (`refetchMode: 'append'`).

```ts
const units = useQuery(rq.game.units.queryOptions({ order: 'asc' }));
```

For a feed where every frame matters or that renders 60 times a second, `subscribe` is still the
tool: a query renders through the cache, and a stream into a query is for data you would show the
same way as a fetched list.

## Mutations

```ts
const deposit = useMutation(rq.account.deposit.mutationOptions({
  onSuccess: () => queryClient.invalidateQueries({ queryKey: rq.account.pathKey() }),
}));
deposit.mutate({ amount: 5 });
```

The input of the procedure is the mutation's variables. A procedure without input takes none:
`mutate()`.

## Keys and invalidation

A key is the procedure's path and its input: `[['user', 'get'], { id: 3 }]`.

```ts
rq.user.get.queryKey({ id: 3 }); // [['user', 'get'], { id: 3 }]
rq.user.get.pathKey();           // [['user', 'get']]: every input
rq.user.pathKey();               // [['user']]: everything under user
rq.pathKey();                    // [[]]: every query of this client
```

TanStack Query matches keys by prefix, so `invalidateQueries({ queryKey: rq.user.pathKey() })`
refetches `user.get` and `user.list`. The path sits in an array of its own, so a key of your app
such as `['user', 5]` is not under it.

Keys carry their data type: `getQueryData` and `setQueryData` know it.

```ts
const user = queryClient.getQueryData(rq.user.get.queryKey({ id: 3 })); // User | undefined
queryClient.setQueryData(rq.user.get.queryKey({ id: 3 }), (old) => old && { ...old, name: 'Chloé' });
```

### Inputs with `u64`, `i64`

TanStack Query hashes keys with `JSON.stringify`, which throws on a `bigint`. The options from `rq`
bring their own `queryKeyHashFn`, `hashKey`, which hashes everything else the same way. Methods
that take only a key, such as `getQueryData`, use the client's default, so set it there if your
inputs have 64-bit integers:

```ts
import { hashKey } from 'ts-bin-rpc/tanstack';

const queryClient = new QueryClient({ defaultOptions: { queries: { queryKeyHashFn: hashKey } } });
```

## Views or plain objects

Responses go into the cache as plain objects (`decode: 'eager'`). TanStack Query needs them:

- structural sharing keeps unchanged rows the same objects across refetches, so memoized components
  do not re-render;
- DevTools show their fields;
- `dehydrate`, `persistQueryClient` and SSR serialize them.

A [view](./views.md) is a class instance over the response bytes. For a large response that you
read in part, such as a chart over 100 000 points, ask for views:

```ts
useQuery(rq.metrics.series.queryOptions({ n: 100_000 }, { tbr: { decode: 'lazy' } }));
```

Structural sharing is then off for that query: views are new values on every fetch. Do not
dehydrate or persist such queries.

`tbr: { headers }` adds headers to the call.

## Errors

A failed call rejects with the [`RpcError`](./server-client.md#errors), which becomes the query's
`error`. TanStack Query retries a failed query three times by default, `BAD_INPUT` and `NOT_FOUND`
included. To retry only what can succeed:

```ts
new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => n < 3 && !(e instanceof RpcError && e.status >= 400 && e.status < 500) },
  },
});
```

## Names

`queryOptions`, `queryKey`, `infiniteQueryOptions`, `infiniteQueryKey`, `mutationOptions` and
`pathKey` are methods of `rq`. A procedure or a
namespace with one of these names is not reachable through `rq`; call it on the client.
