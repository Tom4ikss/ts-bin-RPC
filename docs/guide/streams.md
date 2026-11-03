---
title: Streams
description: Server-to-client streams of rows over one HTTP response, in batches with typed-array columns.
---

# Streams

A procedure can return a stream of rows instead of one value: telemetry, prices, progress, logs.
The client subscribes, and rows arrive over a single HTTP response as they are produced. Rows go
out in batches, and each batch can be read row by row or as typed-array columns over the bytes.

```ts
// server
import { stream } from 'ts-bin-rpc/server';
import type { f32, f64, u32 } from 'ts-bin-rpc';

export interface Tick {
  t: f64;
  price: f32;
  size: u32;
  side: 'buy' | 'sell';
}

export const appRouter = {
  ticks: async (input: { symbol: string }) =>
    stream<Tick>((emit) => {
      const off = feed.on(input.symbol, (t) => emit(t));
      return () => off(); // runs when the stream ends, for any reason
    }),
};
```

```ts
// client
const sub = api.ticks.subscribe({ symbol: 'BTC' }, (tick) => draw(tick.price));
sub.stop();
```

## Server

### `stream()`

`stream<T>(setup, options?)` wraps a source of your own. `setup(emit, { end, signal })` runs when a
client subscribes and returns a cleanup function.

- **`emit(row)`** queues a row. It goes out in the next batch.
- **`end()`** closes the stream normally. **`end(error)`** closes it with an error: an `RpcError`
  reaches the client as is, anything else is reported to `onError` and arrives as `INTERNAL`.
- **`signal`** aborts when the stream ends, for code that takes an `AbortSignal`.
- **The cleanup always runs once:** the client stopped, the connection dropped, the server ended
  the stream, a row failed to encode, or `setup` threw.

Errors thrown before `return` are ordinary errors: the client gets an HTTP error response, as for
any call. This is the place for auth and input checks.

```ts
ticks: async (input: { symbol: string }, ctx: Ctx) => {
  if (!ctx.user) throw new RpcError('UNAUTHORIZED', 'sign in first');
  return stream<Tick>((emit, { end }) => {
    const ws = connectUpstream(input.symbol);
    ws.onmessage = (m) => emit(parse(m));
    ws.onclose = () => end(new RpcError('UPSTREAM', 'feed lost', { retryIn: 5 }));
    return () => ws.close();
  });
},
```

A procedure is a stream when it returns `Stream<T>`, `Promise<Stream<T>>`, an `AsyncIterable<T>`
(an async generator, too) or a `ReadableStream<T>`. `tbr generate` finds it from the type, and the
lockfile records the output as `stream <type>`. Turning a call into a stream, or back, is a
breaking change.

```ts
countdown: async function* (input: { from: u32 }) {
  for (let i = input.from; i > 0; i--) yield { left: i };
},
```

Async iterables are read only as fast as the client reads. Sources that push, as with `stream()`,
are bounded by `maxBuffered` below.

### `channel()`

Many clients watching the same thing: a channel groups subscribers by topic and encodes each batch
once for all of them.

```ts
import { channel } from 'ts-bin-rpc/server';

const prices = channel<Tick>();
feed.on('tick', (t) => prices.publish(t.symbol, t));

export const appRouter = {
  prices: (input: { symbol: string }) => prices.subscribe(input.symbol),
};
```

`prices.subscribers(topic)` counts the subscribers of a topic, and `prices.end(topic, error?)`
closes every stream of it.

### Options

| Option | Default | |
|---|---|---|
| `window` | 16 | ms from the first row of a batch to sending it. `0` sends at the end of the current task. |
| `maxRows` | 512 | a batch is sent at once when it has this many rows |
| `maxBuffered` | 4 MB | bytes queued for one client that has not read them yet |
| `overflow` | `'error'` | when the queue is full: `'error'` ends the stream with `SLOW_CONSUMER`, `'drop-oldest'` drops the oldest batches |
| `heartbeat` | 15000 | ms of silence before an empty frame, so that proxies keep the connection open; `0` turns it off |

`stream()` takes all of them. `channel(options)` takes `window` and `maxRows` for its topics, and
`subscribe(topic, options)` takes the rest for each subscriber.

Why batches: encoding a message per row costs about as much as JSON, while a batch of 32 rows is
6–16× cheaper to encode and read. A 16 ms window is one frame of a 60 Hz display. When latency
matters more than CPU, use `window: 0`; see the measurements below.

## Client

`api.x.subscribe(input?, handler?, options?)` returns a `Subscription`. The handler is a function
for each row, or an object:

```ts
const sub = api.ticks.subscribe({ symbol: 'BTC' }, {
  row: (tick) => {},
  batch: (b) => chart.append(b.columns.t!, b.columns.price!),
  error: (e) => toast(`${e.code}: ${e.message}`),
  end: () => {},
});
```

- **`row`** gets each row, a [view](./views.md) like any response.
- **`batch`** gets the rows of a frame as a read-only array with `columns`: the required numeric,
  boolean and `Date` fields as typed arrays over the frame bytes, so `price: f32` is a
  `Float32Array` and `t: f64` a `Float64Array`. Optional, nullable and non-numeric fields have no
  column.
- **`error`** gets an `RpcError`: the server's error, `SLOW_CONSUMER`, `DISCONNECTED` (status 0)
  when the connection closed before the server ended the stream, or `BAD_RESPONSE` for bytes that
  are not a valid stream. Without an `error` handler and without an iterator, errors go to
  `console.error`.
- **`end`** runs when the server ends the stream, not after `stop()`.

`sub.stop()` closes the connection, and the server runs its cleanup. In React:

```ts
useEffect(() => {
  const sub = api.ticks.subscribe({ symbol }, (t) => setLast(t.price));
  return () => sub.stop();
}, [symbol]);
```

A `Subscription` is also an async iterable. Without a handler, the request starts on the first
`next()`, and `break` stops the stream:

```ts
for await (const tick of api.ticks.subscribe({ symbol: 'BTC' })) {
  if (tick.price > limit) break;
}
```

Call options work as for calls: `signal` stops the subscription like `stop()`, and `decode: 'eager'`
gives plain objects instead of views. Calling a stream procedure without `.subscribe` throws a
`TypeError`.

There is no automatic reconnect yet. Rows sent while a client was disconnected are not replayed.

## Wire

The request is the same `POST {prefix}/{procedure}`. The response has
`content-type: application/vnd.tbr-stream` and is a sequence of frames: an 8-byte header (payload
length, frame kind), then the payload padded to 8 bytes. A data frame carries one message of type
`T[]`; error frames carry the usual error envelope. With `debug: true` the client logs each stream
when it closes, with its frames and bytes.

Streams use the Fetch API on both sides, so they work under Node (with `toNodeListener`), Bun,
Deno and Workers. Behind a proxy, turn response buffering off for these paths; the server sends
`x-accel-buffering: no` for nginx. Over HTTP/1.1 a browser opens at most six connections per
origin, and each subscription holds one; HTTP/2 does not have this limit.

The client bundle carries the stream client only when the router has stream procedures:
generated code refers to it from `clientProcedures`.

## Measurements

A Node server sends ticks to a Chromium page that reads every field
([stream-transport.md](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/stream-transport.md)),
against NDJSON over `fetch` and SSE with `EventSource`, all with the same producer:

| 20 000 ticks/s | Delay p50 | Page main thread | Bytes |
|---|---|---|---|
| ts-bin-rpc, window 16 ms | 9.6 ms | 147 ms | 1.0 MB |
| ts-bin-rpc, window 0 | 0.35 ms | 261 ms | 1.2 MB |
| NDJSON | 0.30 ms | 279 ms | 3.7 MB |
| SSE | 0.26 ms | 429 ms | 4.1 MB |

The default window trades about 10 ms of delay for half the main-thread time of NDJSON. With
`window: 0` the delay is that of NDJSON and SSE, and the bytes are a third. At full speed,
200 000 ticks arrive in 46 ms against 85 ms with NDJSON and 750 ms with SSE.
