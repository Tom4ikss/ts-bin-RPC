// Runs a suite in Node and in Playwright browsers, prints a Markdown table, writes
// bench/results/<suite>.md and the raw medians to <suite>.json.
//   node bench/run.mjs <suite> [--quick] [--runtimes=node,chromium,firefox,webkit] [--out=dir] [--repeat=n]
// With --repeat, every runtime runs the suite n times, each in a fresh process or browser, the
// repeats taking turns between runtimes; a row gets the median time and the median ratio.
import { execFileSync, execSync } from 'node:child_process';
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
const repeatArg = args.find((a) => a.startsWith('--repeat='));
const repeat = repeatArg ? Number(repeatArg.slice(9)) : 1;
const outArg = args.find((a) => a.startsWith('--out='));
const out = outArg ? path.resolve(outArg.slice(6)) : path.join(root, 'results');

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

// A child process per run, so that every repeat starts with a cold JIT, as a browser does.
if (args.includes('--child')) {
  process.stdout.write(JSON.stringify(await runNode()));
  process.exit(0);
}
function runNodeChild() {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), suite, '--child', ...(quick ? ['--quick'] : [])], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(out);
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

const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

const runs = Object.fromEntries(runtimes.map((rt) => [rt, []]));
const server = runtimes.some((r) => r !== 'node') ? await serve() : null;
const origin = server && `http://127.0.0.1:${server.address().port}`;
for (let k = 0; k < repeat; k++) {
  for (const rt of runtimes) {
    process.stderr.write(`running ${suite} on ${rt}${quick ? ' (quick)' : ''}${repeat > 1 ? `, ${k + 1} of ${repeat}` : ''}...\n`);
    runs[rt].push(rt === 'node' ? (repeat > 1 ? runNodeChild() : await runNode()) : await runBrowser(rt, origin));
  }
}
server?.close();

// One run: as measured. Several: per row, the median time and ratio, and as spread the range of the
// ratio over the runs, since that is what moves the conclusions.
const results = Object.fromEntries(
  runtimes.map((rt) => {
    const rs = runs[rt];
    if (rs.length === 1) return [rt, rs[0]];
    const rows = rs[0].rows.map((row, i) => {
      const ratios = rs.map((r) => r.rows[i].ratio);
      const ratio = median(ratios);
      return { ...row, us: median(rs.map((r) => r.rows[i].us)), ratio, spread: (Math.max(...ratios) - Math.min(...ratios)) / ratio, ratios };
    });
    return [rt, { env: rs[0].env, rows }];
  }),
);

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

const commit = process.env.GITHUB_SHA ?? gitHead();
const date = new Date().toISOString().slice(0, 10);
const cpu = os.cpus()[0].model;
const envLines = runtimes.map((rt) => `- ${rt}: ${results[rt].env.ua}${results[rt].env.isolated ? '' : ' (not isolated: coarse timer)'}`);
const md = [
  `# Suite \`${suite}\`${quick ? ' (quick)' : ''}`,
  '',
  `${date}, ${cpu}, ${os.platform()} ${os.release()}${commit ? `, commit ${commit.slice(0, 7)}` : ''}.`,
  repeat > 1
    ? `Median of ${repeat} runs per runtime, each in a fresh process or browser; ratio is speed relative to the first variant of the group, the median over the runs; \`~\` marks rows whose ratio ranged over 25% between runs.`
    : 'Median per operation; ratio is speed relative to the first variant of the group; `~` marks spread over 25%.',
  '',
  ...envLines,
  '',
  head, sep, ...lines, '',
].join('\n');

console.log(md);
if (!quick || outArg) {
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, `${suite}.md`), md);
  const raw = { suite, quick, repeat, date, commit, cpu, os: `${os.platform()} ${os.release()}`, runtimes: results };
  await writeFile(path.join(out, `${suite}.json`), `${JSON.stringify(raw, null, 1)}\n`);
}

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
