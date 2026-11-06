/// <reference types="node" />
// Node's http/https/http2-compat servers speak (req, res), not Fetch: this adapts a Fetch handler.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_LIMITS } from './runtime.ts';
import { STREAM_CONTENT_TYPE } from './frames.ts';
import { BATCH_CONTENT_TYPE } from './batch.ts';
import { SINKS } from './stream-server.ts';
import type { Handler } from './server.ts';

export interface NodeListenerOptions {
  /** Requests with a larger body are answered 413 before the handler runs. Default: 64 MB. */
  maxBytes?: number;
}

export function toNodeListener(
  handler: (request: Request) => Response | Promise<Response>,
  options: NodeListenerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const maxBytes = options.maxBytes ?? DEFAULT_LIMITS.maxBytes;
  return async (req, res) => {
    try {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of req as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > maxBytes) {
          res.writeHead(413).end();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      }
      const body = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) {
        body.set(c, at);
        at += c.length;
      }

      const { url, headers } = head(req);
      const method = req.method ?? 'GET';
      // request.signal aborts when the client goes away: streaming procedures stop their sources.
      const abort = new AbortController();
      res.once('close', () => abort.abort());
      const response = await handler(new Request(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body, signal: abort.signal }));

      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      const type = response.headers.get('content-type');
      // streams and batches go out as they come: a batch answers each call as it ends
      if (!response.body || (type !== STREAM_CONTENT_TYPE && type !== BATCH_CONTENT_TYPE)) {
        res.end(new Uint8Array(await response.arrayBuffer()));
        return;
      }
      // A stream: headers now, so the client's fetch resolves before the first frame, then each chunk
      // as it comes, waiting for 'drain' when the socket is full.
      res.flushHeaders();
      // A response straight from the handler: its sink writes frames to res itself, with no
      // ReadableStream in between. A middleware that wrapped or started reading the body gets the
      // body as is.
      const sink = SINKS.get(response);
      if (sink && !response.body.locked) {
        sink.direct(res);
        return;
      }
      const reader = response.body.getReader();
      res.once('close', () => void reader.cancel().catch(() => {}));
      for (;;) {
        const r = await reader.read();
        if (r.done || res.destroyed) break;
        if (!res.write(r.value)) await new Promise<void>((ok) => { res.once('drain', ok); res.once('close', ok); });
      }
      res.end();
    } catch (e) {
      // The client went away (an aborted fetch, a closed tab): nobody to answer, nothing to report.
      if (req.destroyed || res.destroyed) return;
      console.error('ts-bin-rpc: request failed:', e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  };
}

function head(req: IncomingMessage): { url: URL; headers: Headers } {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    // HTTP/2 pseudo-headers (`:path`, `:authority`…) are not headers to Fetch
    if (k.startsWith(':')) continue;
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else if (v !== undefined) headers.set(k, v);
  }
  const host = req.headers.host ?? (req.headers[':authority'] as string | undefined) ?? 'localhost';
  const scheme = (req.headers[':scheme'] as string | undefined) ?? 'http';
  return { url: new URL(req.url ?? '/', `${scheme}://${host}`), headers };
}

/** What `acceptWebSocket` needs of a socket of the `ws` package (or anything shaped like it). */
export interface NodeWebSocket {
  send(data: Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  readonly bufferedAmount: number;
  on(event: 'message', listener: (data: ArrayBuffer | ArrayBufferView | ArrayBufferView[], isBinary: boolean) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
}

/**
 * Serves calls and subscriptions over WebSocket connections of the `ws` package:
 * `new WebSocketServer({ server, path: '/rpc' }).on('connection', acceptWebSocket(handler))`.
 * `context` gets the upgrade request, with its cookies and headers, for every call.
 */
export function acceptWebSocket(handler: Handler): (ws: NodeWebSocket, req: IncomingMessage) => void {
  return (ws, req) => {
    const { url, headers } = head(req);
    const abort = new AbortController();
    const conn = handler.socket(ws, new Request(url, { headers, signal: abort.signal }));
    ws.on('message', (data, isBinary) => (isBinary ? conn.message(data) : ws.close(1003, 'ts-bin-rpc messages are binary')));
    ws.on('close', () => {
      abort.abort();
      conn.close();
    });
  };
}
