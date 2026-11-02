// Runs a suite in Node and in Playwright browsers, prints a Markdown table, writes bench/results/<suite>.md.
//   node bench/run.mjs <suite> [--quick] [--runtimes node,chromium,firefox,webkit]
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runGroups, env } from './lib/harness.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const suite = args.find((a) => !a.startsWith('--')) ?? 'core';
const quick = args.includes('--quick');
const rtArg = args.find((a) => a.startsWith('--runtimes='));
const runtimes = (rtArg ? rtArg.split('=')[1] : 'node,chromium,firefox,webkit').split(',');

const MIME = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html' };

// COOP/COEP make the page cross-origin isolated, which restores fine-grained performance.now().
function serve() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = path.join(root, url.pathname === '/' ? 'page.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-embedder-policy': 'require-corp',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function runNode() {
  const mod = await import(pathToFileURL(path.join(root, 'suites', `${suite}.mjs`)));
  if (mod.runNode) return { env: env(), rows: await mod.runNode({ quick }) };
  return { env: env(), rows: runGroups(mod.groups({ quick }), { quick }) };
}

async function runBrowser(name, origin) {
  const pw = await import('playwright');
  const browser = await pw[name].launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error(`[${name}]`, e));
    await page.goto(`${origin}/page.html`);
    return await page.evaluate(async ({ suite, quick }) => {
      const h = await import('/lib/harness.mjs');
      const mod = await import(`/suites/${suite}.mjs`);
      const rows = mod.runBrowser ? await mod.runBrowser({ quick }) : h.runGroups(mod.groups({ quick }), { quick });
      return { env: h.env(), rows };
    }, { suite, quick });
  } finally {
    await browser.close();
  }
}

const fmt = (us) => (us >= 1000 ? `${(us / 1000).toFixed(1)} ms` : us >= 10 ? `${us.toFixed(0)} µs` : `${us.toFixed(2)} µs`);

const results = {};
const server = runtimes.some((r) => r !== 'node') ? await serve() : null;
const origin = server && `http://127.0.0.1:${server.address().port}`;
for (const rt of runtimes) {
  process.stderr.write(`running ${suite} on ${rt}${quick ? ' (quick)' : ''}...\n`);
  results[rt] = rt === 'node' ? await runNode() : await runBrowser(rt, origin);
}
server?.close();

const first = results[runtimes[0]].rows;
const head = `| Group | Variant | ${runtimes.map((r) => `${r}`).join(' | ')} |`;
const sep = `|---|---|${runtimes.map(() => '---').join('|')}|`;
const lines = first.map((row, i) => {
  const cells = runtimes.map((rt) => {
    const r = results[rt].rows[i];
    const noisy = r.spread > 0.25 ? ' ~' : '';
    return r.ratio === 1 ? `${fmt(r.us)}${noisy}` : `${fmt(r.us)} (${r.ratio.toFixed(2)}x)${noisy}`;
  });
  return `| ${row.group} | ${row.variant} | ${cells.join(' | ')} |`;
});

const envLines = runtimes.map((rt) => `- ${rt}: ${results[rt].env.ua}${results[rt].env.isolated ? '' : ' (not isolated: coarse timer)'}`);
const md = [
  `# Suite \`${suite}\`${quick ? ' (quick)' : ''}`,
  '',
  `${new Date().toISOString().slice(0, 10)}, ${os.cpus()[0].model}, ${os.platform()} ${os.release()}.`,
  'Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.',
  '',
  ...envLines,
  '',
  head, sep, ...lines, '',
].join('\n');

console.log(md);
if (!quick) {
  await mkdir(path.join(root, 'results'), { recursive: true });
  await writeFile(path.join(root, 'results', `${suite}.md`), md);
}
