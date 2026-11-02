// `pnpm serve`: the router at http://localhost:3000/rpc, plus a page that exposes a client as `api`
// in the browser console (modules served with types stripped, no bundler).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHandler } from 'ts-bin-rpc/server';
import { toNodeListener } from 'ts-bin-rpc/node';
import { appRouter } from './router.ts';
import { procedures } from './tbr.gen.ts';

const port = Number(process.env.PORT ?? 3000);

const rpc = createHandler(appRouter, {
  procedures,
  prefix: '/rpc',
  context: (req) => ({ userId: req.headers.get('authorization')?.replace(/^Bearer /, '') ?? null }),
});

const roots: Record<string, string> = {
  app: import.meta.dirname,
  pkg: path.dirname(fileURLToPath(import.meta.resolve('ts-bin-rpc/runtime'))),
};

const page = `<!doctype html>
<meta charset="utf-8">
<title>ts-bin-rpc playground</title>
<script type="importmap">
{ "imports": { "ts-bin-rpc": "/pkg/index.ts", "ts-bin-rpc/runtime": "/pkg/runtime.ts", "ts-bin-rpc/client": "/pkg/client.ts" } }
</script>
<script type="module">
  import { createClient } from 'ts-bin-rpc/client';
  import { toPlain } from 'ts-bin-rpc';
  import { procedures } from '/app/tbr.gen.ts';
  window.api = createClient({ url: '/rpc', procedures, debug: true, headers: { authorization: 'Bearer me' } });
  window.toPlain = toPlain;
</script>
<body style="font: 15px system-ui; margin: 2em">
<p>Open the console and try:</p>
<pre>await api.user.get({ id: 1 })
await api.user.list({ role: 'user' })
await api.shapes()
(await api.telemetry()).values
await api.user.get({ id: 99 })   // RpcError NOT_FOUND</pre>
<p>Calls are logged with <code>debug: true</code>; the Network tab shows the binary bodies.</p>`;

async function files(req: Request): Promise<Response> {
  const pathname = new URL(req.url).pathname;
  if (pathname === '/') return new Response(page, { headers: { 'content-type': 'text/html' } });
  const [, root, ...rest] = pathname.split('/');
  const dir = roots[root];
  const file = dir && path.join(dir, ...rest);
  if (!file || !file.startsWith(dir + path.sep) || !file.endsWith('.ts') || !fs.existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(stripTypeScriptTypes(fs.readFileSync(file, 'utf8')), { headers: { 'content-type': 'text/javascript' } });
}

http
  .createServer(toNodeListener((req) => (new URL(req.url).pathname.startsWith('/rpc/') ? rpc(req) : files(req))))
  .listen(port, () => console.log(`http://localhost:${port}`));
