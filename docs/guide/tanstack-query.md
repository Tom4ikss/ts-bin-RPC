---
title: TanStack Query
description: "queryOptions and mutationOptions for every procedure: useQuery, useMutation, typed keys and invalidation by path, for React, Vue, Solid, Svelte and Angular."
---

# TanStack Query

`ts-bin-rpc/tanstack` turns a client into option objects for TanStack Query. It has no hooks of its
own, so it works with every adapter: React, Vue, Solid, Svelte, Angular.

```sh
npm install @tanstack/react-query
```

```ts
import { createClient } from 'ts-bin-rpc/client';
import { createQueryOptions } from 'ts-bin-rpc/tanstack';
import type { appRouter } from '../server/router';
import { clientProcedures } from './tbr.gen';

export const api = createClient<typeof appRouter>({ url: '/rpc', procedures: clientProcedures });
export const rq = createQueryOptions(api);
```

```tsx
function Profile({ id }: { id: number }) {
  const { data, error } = useQuery(rq.user.get.queryOptions({ id }));
  // data: User | undefined, error: RpcError | null
}
```

`rq` mirrors the router: `rq.user.get` is the procedure `user.get`. Streams are not in it; use
`api.x.subscribe()` for them.

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

`queryOptions`, `queryKey`, `mutationOptions` and `pathKey` are methods of `rq`. A procedure or a
namespace with one of these names is not reachable through `rq`; call it on the client.
