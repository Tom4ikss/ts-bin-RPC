// Node only: the browser test page and its TypeScript modules with types stripped, no bundler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const roots: Record<string, string> = {
  app: import.meta.dirname,
  pkg: path.dirname(fileURLToPath(import.meta.resolve('ts-bin-rpc/runtime'))),
};

const page = `<!doctype html>
<meta charset="utf-8">
<script type="importmap">
{ "imports": {
  "ts-bin-rpc": "/pkg/index.ts",
  "ts-bin-rpc/runtime": "/pkg/runtime.ts",
  "ts-bin-rpc/client": "/pkg/client.ts"
} }
</script>
<script type="module">
  import { scenarios, socketScenarios } from '/app/scenarios.ts';
  const merge = (rs) => ({ passed: rs.reduce((n, r) => n + r.passed, 0), failures: rs.flatMap((r) => r.failures) });
  // one after the other: both read counters of the same server
  window.result = scenarios(location.origin).then(async (a) => merge([a, await socketScenarios(location.origin)])).catch((e) => ({ failures: [String(e && e.stack || e)], passed: 0 }));
</script>`;

export async function staticFiles(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/') return new Response(page, { headers: { 'content-type': 'text/html' } });
  const [, root, ...rest] = pathname.split('/');
  const dir = roots[root];
  const file = dir && path.join(dir, ...rest);
  if (!file || !file.startsWith(dir + path.sep) || !file.endsWith('.ts') || !fs.existsSync(file)) return new Response('not found', { status: 404 });
  const js = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'));
  return new Response(js, { headers: { 'content-type': 'text/javascript' } });
}
