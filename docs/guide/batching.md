---
title: Batching
description: Calls made in the same task go in one HTTP request, and each comes back as soon as it ends.
---

# Batching

A page that renders often calls several procedures at once: a dozen components, each with its own
query. Each call is a request of its own, and over HTTP/1.1 a browser runs at most six at a time
per host. With `batch()`, the calls made in the same task go in one request, and the server
answers each one as soon as it ends: a slow call does not hold the fast ones.

```ts
import { batch, createClient } from 'ts-bin-rpc/client';

const api = createClient<AppRouter>({ url: '/rpc', procedures: clientProcedures, batch: batch() });

// one request
const [user, orders, prices] = await Promise.all([api.user.get({ id }), api.orders.list({ id }), api.prices.latest()]);
```

Nothing changes on the server: `createHandler` takes batches at the prefix itself (`POST /rpc/`).

## What goes in a batch

- Calls made in the same task: one `Promise.all`, the effects of one render. A call waits for the
  others until the task ends, which is a `setTimeout(0)`.
- **Queries** keep GET, so that HTTP caches keep working ([queries](queries.md)).
- **Calls with `headers` of their own** go alone: a batch is one request, with one set of headers.
- **Large inputs** go alone, above `maxBytes`.
- **A call alone in its task** goes as it would without batching, as a request of its own.
- **Streams** are not batched: each is a response of its own, or a [WebSocket](websocket.md) carries
  them all.

## Options

`batch(options?)`:

- **`window`**: milliseconds a call waits for others. Default: 0, the end of the task. A longer
  window catches calls of later tasks too, at the cost of that delay on every call.
- **`maxCalls`**: calls in one request, at most. More start another request. Default: 32.
- **`maxBytes`**: inputs larger than this go alone. Default: 64 KB.

On the server, `createHandler({ batch })`:

- **`maxCalls`**: calls in one batch, at most; a larger batch gets `413 PAYLOAD_TOO_LARGE`.
  Default: 64.
- **`batch: false`** refuses batches with `404`: every call of the batch gets that error.

## How calls behave

Each call of a batch behaves as it would alone: its own result or `RpcError`, with its status.

- **`context`** runs once for the batch, as it runs once for any request. A context that reads a
  session from a database reads it once for all the calls.
- **Errors** are per call. Only a batch that fails as a whole (a server that refuses batches, a
  proxy error) fails every call, with that response.
- **`signal`** aborts a call before its batch goes: it leaves the batch. After that, the server runs
  it anyway, and its answer is dropped.
- **The `headers` function** of the client runs once per request, so once per batch.
- **DevTools** and `debug` show each call on its own.
- A connection that breaks rejects the calls of the batch with a `TypeError`, as `fetch` does.

## Performance

`n` calls at once from Chromium to a Node server on the same machine
([batch.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/batch.md)):

| Calls | A request per call, HTTP/1.1 | `batch()`, HTTP/1.1 | A request per call, HTTP/2 | `batch()`, HTTP/2 |
|---|---|---|---|---|
| 50 | 9.3 ms | 1.2 ms | 9.1 ms | 1.4 ms |
| 200 | 29.3 ms | 3.5 ms | 33.4 ms | 3.7 ms |
| 50, each 20 ms on the server | 207 ms | 26.2 ms | 27.3 ms | 22.6 ms |

The last row is the six-connection limit of HTTP/1.1: 50 calls of 20 ms take nine rounds one by
one. HTTP/2 has no such limit, and batching saves the cost of each request: headers, the routing
of each, the context. Calls over a WebSocket cost about the same as batches.

## On the wire

A batch is a POST to the prefix with `content-type: application/vnd.tbr.batch`. Its body is the
messages that start calls over a WebSocket, one after another, each with its length. The response
streams a message per call, in the order the calls end: the same message a WebSocket carries for a
call's answer, with its HTTP status. Inputs and outputs stay 8-byte aligned. The format is in
[FORMAT §14](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/docs/FORMAT.md#14-батчи).

`batch()` adds about 1.1 KB gzip to a client that imports it, and nothing to one that does not.
