---
title: WebSocket
description: Subscriptions and calls over one WebSocket, with live state that reconnects by itself.
---

# WebSocket

By default every call is an HTTP request and every subscription an HTTP response that stays open.
With a WebSocket, subscriptions, and calls if you want, share one connection instead. Nothing
changes in the router, the generated code or the calls: only the client options and a few lines
where the server accepts sockets.

```ts
// client
import { createClient, webSocket } from 'ts-bin-rpc/client';

const api = createClient<AppRouter>({
  url: '/rpc',
  procedures: clientProcedures,
  socket: webSocket('wss://example.com/rpc', { calls: true }),
});

api.prices.subscribe({ symbol: 'BTC' }, (tick) => draw(tick)); // over the socket
await api.order.place({ symbol: 'BTC', amount: 1 }); // over the socket too, with calls: true
```

## When to use it

- **Many subscriptions per page.** Browsers keep at most six HTTP/1.1 connections per host, and
  each open stream takes one. Over HTTP/2 this limit goes away, over a socket too.
- **Calls that follow a stream closely**, like orders on a trading screen: a call over an open socket
  skips the HTTP request headers and, without HTTP/2, the connection setup.
- **Live state that has to come back after a dropped connection.** Over a socket it starts again by
  itself, see below.

For pages that call and subscribe now and then, HTTP is simpler: it goes through every proxy, caches
queries and carries headers.

## Client

`webSocket(url, options?)` returns a transport for `createClient({ socket })`. It connects on first
use and keeps one socket for everything that uses it.

- **`calls`**: calls go over the socket too. Default: `false`, only subscriptions do.
  [Queries](queries.md) always go by GET over HTTP, so that HTTP caches keep working.
- **`idle`**: milliseconds with nothing open after which the socket closes. It opens again on the
  next call or subscription. Default: 30000.
- **`WebSocket`**: the constructor to use. Default: `globalThis.WebSocket`, which Node has since 22.

Headers do not go over a socket: browsers cannot set them on one. The server gets the URL and the
cookies of the socket, so put a token in the URL or use a cookie (see the server's `context`
below). `headers` in the client options and in `CallOptions` still apply to HTTP calls.

### When the connection drops

- **Live subscriptions** ([live state](live.md)) start again on a new socket, with a backoff
  from 250 ms to 5 s. The first frame on the new socket is a snapshot, so the state is whole again
  and the handler sees `snapshot: true`. They keep trying until you call `stop()`.
- **Streams** end with `DISCONNECTED`, as over HTTP: rows sent while the connection was down are
  gone, and only the app knows whether to subscribe again and from where.
- **Calls** in flight reject with a `TypeError`, as `fetch` does when a connection fails.

`signal` aborts a call or a subscription over a socket the same way it does over HTTP.

## Server

`createHandler` returns a Fetch handler that also takes sockets:
`handler.socket(ws, request)` serves one connection. `ws` is anything with `send(bytes)`,
`close(code?, reason?)` and, for backpressure, `bufferedAmount`. `request` is the upgrade request:
`context(request)` gets it for every call, as it gets the request of an HTTP call. Hand the
connection every message and tell it when the socket closed:

```ts
const conn = handler.socket(ws, request);
// on each message: conn.message(data); on close: conn.close();
```

### Node, with `ws`

```ts
import { WebSocketServer } from 'ws';
import { acceptWebSocket, toNodeListener } from 'ts-bin-rpc/node';

const server = http.createServer(toNodeListener(handler));
new WebSocketServer({ server, path: '/rpc' }).on('connection', acceptWebSocket(handler));
server.listen(3000);
```

### Bun

```ts
Bun.serve({
  fetch(request, server) {
    if (request.headers.get('upgrade') === 'websocket') {
      return server.upgrade(request, { data: { request } }) ? undefined : new Response('upgrade failed', { status: 400 });
    }
    return handler(request);
  },
  websocket: {
    open: (ws) => void (ws.data.conn = handler.socket(ws, ws.data.request)),
    message: (ws, message) => ws.data.conn.message(message),
    close: (ws) => ws.data.conn.close(),
  },
});
```

### Deno

```ts
Deno.serve((request) => {
  if (request.headers.get('upgrade') !== 'websocket') return handler(request);
  const { socket, response } = Deno.upgradeWebSocket(request);
  socket.binaryType = 'arraybuffer';
  const conn = handler.socket(socket, request); // before returning the response
  socket.onmessage = (e) => conn.message(e.data);
  socket.onclose = () => conn.close();
  return response;
});
```

### Auth

`context` runs for every call over the socket with the upgrade request, so it reads the cookie or
a token from the URL there:

```ts
createHandler(appRouter, {
  procedures,
  context: (request) => ({
    user: userFrom(request.headers.get('authorization') ?? new URL(request.url).searchParams.get('token')),
  }),
});
```

Check the `Origin` header of the upgrade request before you accept a socket that authenticates by
cookie: browsers send cookies with a WebSocket from any site.

### Slow clients

When the socket has more than 1 MB queued, subscriptions stop writing to it and queue frames
in their own buffers, up to `maxBuffered`. Past that, a stream does what its `overflow` option says
and live state sends a fresh snapshot, as over HTTP ([streams](streams.md#options)). A socket
without `bufferedAmount` (Bun's has a method instead) is written to without waiting.

## On the wire

A message from the client starts a call or a subscription under an ID it picks, or stops one. A
message from the server carries the ID and either the whole response of a call, with its HTTP status,
or stream frames of a subscription, the same frames an HTTP stream has. Payloads stay 8-byte
aligned, so views over them need no copy. The format is in [FORMAT §13](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/docs/FORMAT.md#13-websocket).

## Performance

In the [stream benchmark](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/stream-transport.md)
a socket is as fast as an HTTP stream at 1 000 and 20 000 ticks a second (p50 delay 0.1 ms with
`window: 0`) and sends a third of the bytes of JSON over a WebSocket. For 200 000 ticks at once an
HTTP stream is faster (46 against 57 ms): each socket message is an event of its own in the page,
while `fetch` merges chunks.

`webSocket` adds about 0.9 KB gzip to the client, only when you import it.
