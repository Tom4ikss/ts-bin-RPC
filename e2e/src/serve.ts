// Starts the fixture server under Node, Bun or Deno on $PORT (0: any free port) and prints
// `listening <port>`. Under Node it also serves the browser test page and its modules.
import { handler } from './app.ts';

declare const Bun: { serve(o: { port: number; fetch: (r: Request) => Promise<Response> }): { port: number } } | undefined;
declare const Deno:
  | { env: { get(k: string): string | undefined }; serve(o: { port: number; onListen(a: { port: number }): void }, h: (r: Request) => Promise<Response>): unknown }
  | undefined;

const port = Number((typeof Deno !== 'undefined' ? Deno.env.get('PORT') : process.env.PORT) ?? 0);

if (typeof Deno !== 'undefined') {
  Deno.serve({ port, onListen: (a) => console.log(`listening ${a.port}`) }, handler);
} else if (typeof Bun !== 'undefined') {
  console.log(`listening ${Bun.serve({ port, fetch: handler }).port}`);
} else {
  const http = await import('node:http');
  const { toNodeListener } = await import('ts-bin-rpc/node');
  const { staticFiles } = await import('./static.ts');
  const server = http.createServer(toNodeListener((r) => (new URL(r.url).pathname.startsWith('/rpc/') ? handler(r) : staticFiles(r))));
  server.listen(port, () => {
    const address = server.address();
    console.log(`listening ${typeof address === 'object' && address ? address.port : port}`);
  });
}
