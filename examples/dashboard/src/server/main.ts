// `pnpm build && pnpm start`: the RPC handler plus the built client from dist/, on one port.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { listener } from './handler.ts';

const port = Number(process.env.PORT ?? 3001);
const dist = path.join(import.meta.dirname, '..', '..', 'dist');
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

if (!fs.existsSync(dist)) throw new Error('dist/ is missing: run `pnpm build` first');

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/rpc/')) return void listener(req, res);
    const file = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`http://localhost:${port}`));
