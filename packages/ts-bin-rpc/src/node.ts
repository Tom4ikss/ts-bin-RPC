/// <reference types="node" />
// Node's http/https/http2-compat servers speak (req, res), not Fetch: this adapts a Fetch handler.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_LIMITS } from './runtime.ts';
import { STREAM_CONTENT_TYPE } from './frames.ts';
import { SINKS } from './stream-server.ts';

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

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) for (const x of v) headers.append(k, x);
        else if (v !== undefined) headers.set(k, v);
      }
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      // request.signal aborts when the client goes away: streaming procedures stop their sources.
      const abort = new AbortController();
      res.once('close', () => abort.abort());
      const response = await handler(new Request(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body, signal: abort.signal }));

      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      if (!response.body || response.headers.get('content-type') !== STREAM_CONTENT_TYPE) {
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
