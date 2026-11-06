// The WebSocket transport of the client (DESIGN §19): one socket for subscriptions and, with
// `calls: true`, calls. Each request becomes a Response, so the code that reads HTTP responses and
// streams reads these too. Live subscriptions survive a dropped socket: they start again on the next
// one, and its first frame is a fresh snapshot.
import { CONTENT_TYPE, type ClientEntry } from './rpc.ts';
import { encodeFrame, FRAME_ERROR, STREAM_CONTENT_TYPE } from './frames.ts';
import { encodeStart, encodeStop, MSG_FRAMES, MSG_RESPONSE, SKIPPABLE, SOCKET_PROTOCOL } from './socket.ts';

export interface WebSocketOptions {
  /**
   * Calls go over the socket too. Queries keep GET over HTTP, for HTTP caches. Default: false, only
   * subscriptions do.
   */
  calls?: boolean;
  /** Closes the socket after this many milliseconds with nothing open; it opens again on use. Default: 30000. */
  idle?: number;
  /** Default: globalThis.WebSocket. */
  WebSocket?: new (url: string, protocols?: string | string[]) => WebSocket;
}

/** `createClient({ socket })`: sends requests over a socket instead of fetch. */
export interface SocketTransport {
  readonly calls: boolean;
  request(path: string, proc: ClientEntry, body: Uint8Array, signal?: AbortSignal): Promise<Response>;
}

interface Route {
  start: Uint8Array<ArrayBuffer>;
  /** Live state: starts again when the socket drops. */
  live: boolean;
  sent: boolean;
  resolve: (r: Response) => void;
  reject: (e: unknown) => void;
  /** The body of a subscription, once its first frames came. */
  body?: ReadableStreamDefaultController<Uint8Array>;
}

/** How long a socket has to stay open for reconnecting to start again from the shortest delay. */
const STABLE_MS = 5000;

/**
 * Subscriptions (and calls, with `calls: true`) over one WebSocket:
 * `createClient({ url: '/rpc', procedures, socket: webSocket('wss://example.com/rpc') })`.
 */
export function webSocket(url: string, options: WebSocketOptions = {}): SocketTransport {
  const WS = options.WebSocket ?? globalThis.WebSocket;
  const idle = options.idle ?? 30_000;
  const routes = new Map<number, Route>();
  let ws: WebSocket | undefined;
  let ready = false;
  let next = 1;
  let retries = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (ws || retryTimer) return;
    const s = (ws = new WS(url, [SOCKET_PROTOCOL]));
    s.binaryType = 'arraybuffer';
    let opened = 0;
    s.onopen = () => {
      ready = true;
      opened = Date.now();
      for (const r of routes.values()) send(r);
    };
    s.onmessage = (e) => message(new Uint8Array(e.data as ArrayBuffer));
    s.onclose = () => {
      if (ws !== s) return;
      ws = undefined;
      ready = false;
      // A server that closes sockets as soon as they open must not get a new one every 250 ms:
      // the backoff starts over only after a socket that lasted.
      if (opened && Date.now() - opened >= STABLE_MS) retries = 0;
      for (const [id, r] of routes) {
        if (r.live) {
          r.sent = false;
          continue;
        }
        routes.delete(id);
        // as fetch does when the connection fails: the stream reader and the call see a TypeError
        const e = new TypeError('the WebSocket closed');
        if (r.body) r.body.error(e);
        else r.reject(e);
      }
      if (routes.size) {
        const ms = Math.min(5000, 250 * 2 ** retries++) * (0.5 + Math.random() / 2);
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          if (routes.size) connect();
        }, ms);
      }
    };
  };

  const send = (r: Route) => {
    if (!ready) return connect();
    if (r.sent) return;
    r.sent = true;
    ws!.send(r.start);
  };

  /** Forgets a request; the socket closes after `idle` with nothing open. */
  const forget = (id: number) => {
    routes.delete(id);
    if (!routes.size && ws) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (routes.size || !ws) return;
        // a request made while it closes goes to a new socket
        const s = ws;
        ws = undefined;
        ready = false;
        s.close();
      }, idle);
    }
  };

  const drop = (id: number, reason?: unknown) => {
    const r = routes.get(id);
    if (!r) return;
    forget(id);
    if (r.body) {
      if (reason !== undefined) r.body.error(reason);
    } else r.reject(reason);
    if (ready && r.sent) ws!.send(encodeStop(id));
  };

  const message = (b: Uint8Array<ArrayBuffer>) => {
    if (b.length < 8) return;
    const id = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
    const r = routes.get(id);
    if (!r) return;
    const body = b.subarray(8);
    if (b[4] === MSG_RESPONSE) {
      if (r.body) {
        // a live subscription that could not start again: its stream ends with the error
        forget(id);
        r.body.enqueue(encodeFrame(FRAME_ERROR, body));
        r.body.close();
      } else {
        forget(id);
        r.resolve(new Response(body, { status: b[6] | (b[7] << 8), headers: { 'content-type': CONTENT_TYPE } }));
      }
    } else if (b[4] === MSG_FRAMES) {
      if (!r.body) {
        const stream = new ReadableStream<Uint8Array>({ start: (c) => void (r.body = c), cancel: () => drop(id) });
        r.resolve(new Response(stream, { status: 200, headers: { 'content-type': STREAM_CONTENT_TYPE } }));
      }
      r.body!.enqueue(body);
    } else if (b[4] < SKIPPABLE) {
      drop(id, new TypeError(`unknown WebSocket message type ${b[4]}: update ts-bin-rpc`));
    }
  };

  return {
    calls: options.calls ?? false,
    request(path, proc, body, signal) {
      signal?.throwIfAborted();
      clearTimeout(idleTimer);
      return new Promise<Response>((resolve, reject) => {
        const id = next;
        next = next >= 0xffffffff ? 1 : next + 1;
        const r: Route = { start: encodeStart(id, path, proc.hash, body), live: !!proc.live, sent: false, resolve, reject };
        routes.set(id, r);
        signal?.addEventListener('abort', () => drop(id, signal.reason), { once: true });
        send(r);
      });
    },
  };
}
