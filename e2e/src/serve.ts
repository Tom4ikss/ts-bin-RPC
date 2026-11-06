// Starts the fixture server under Node, Bun or Deno on $PORT (0: any free port) and prints
// `listening <port>`. WebSockets at /rpc on each, with the runtime's own API. Under Node it also
// serves the browser test page and its modules.
import { handler } from './app.ts';
import type { SocketConnection } from 'ts-bin-rpc/server';

interface BunSocket {
  data: { request: Request; conn?: SocketConnection };
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
}
declare const Bun:
  | {
      serve(o: {
        port: number;
        fetch: (r: Request, server: { upgrade(r: Request, o: { data: BunSocket['data'] }): boolean }) => Promise<Response> | Response | undefined;
        websocket: { open(ws: BunSocket): void; message(ws: BunSocket, m: string | Uint8Array): void; close(ws: BunSocket): void };
      }): { port: number };
    }
  | undefined;
declare const Deno:
  | {
      env: { get(k: string): string | undefined };
      serve(o: { port: number; onListen(a: { port: number }): void }, h: (r: Request) => Promise<Response> | Response): unknown;
      upgradeWebSocket(r: Request): { socket: WebSocket; response: Response };
    }
  | undefined;

const port = Number((typeof Deno !== 'undefined' ? Deno.env.get('PORT') : process.env.PORT) ?? 0);
const upgrade = (r: Request) => r.headers.get('upgrade')?.toLowerCase() === 'websocket' && new URL(r.url).pathname === '/rpc';

if (typeof Deno !== 'undefined') {
  const deno = Deno;
  deno.serve({ port, onListen: (a) => console.log(`listening ${a.port}`) }, (r) => {
    if (!upgrade(r)) return handler(r);
    const { socket, response } = deno.upgradeWebSocket(r);
    socket.binaryType = 'arraybuffer';
    let conn: SocketConnection | undefined;
    socket.onopen = () => (conn = handler.socket(socket, r));
    socket.onmessage = (e) => (typeof e.data === 'string' ? socket.close(1003) : conn?.message(e.data as ArrayBuffer));
    socket.onclose = () => conn?.close();
    return response;
  });
} else if (typeof Bun !== 'undefined') {
  const server = Bun.serve({
    port,
    fetch: (r, s) => (upgrade(r) ? (s.upgrade(r, { data: { request: r } }) ? undefined : new Response('upgrade failed', { status: 400 })) : handler(r)),
    websocket: {
      open: (ws) => void (ws.data.conn = handler.socket(ws, ws.data.request)),
      message: (ws, m) => (typeof m === 'string' ? ws.close(1003) : ws.data.conn?.message(m)),
      close: (ws) => ws.data.conn?.close(),
    },
  });
  console.log(`listening ${server.port}`);
} else {
  const http = await import('node:http');
  const { toNodeListener, acceptWebSocket } = await import('ts-bin-rpc/node');
  const { staticFiles } = await import('./static.ts');
  const { serveWebSockets } = await import('./ws-server.ts');
  const server = http.createServer(toNodeListener((r) => (new URL(r.url).pathname.startsWith('/rpc/') ? handler(r) : staticFiles(r))));
  serveWebSockets(server, { '/rpc': acceptWebSocket(handler) });
  server.listen(port, () => {
    const address = server.address();
    console.log(`listening ${typeof address === 'object' && address ? address.port : port}`);
  });
}
