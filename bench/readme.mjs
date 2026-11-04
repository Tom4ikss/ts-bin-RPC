// Rewrites the benchmark tables in README.md, between <!-- bench:start --> and <!-- bench:end -->,
// from a run of the `generated` suite. The bench workflow runs it after each published run.
//   node bench/readme.mjs [bench/results/ci/generated.json]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ENCODES, READS, RUNTIMES, pick, versions } from './lib/headline.mjs';

const root = path.join(import.meta.dirname, '..');
const file = process.argv[2] ?? path.join(root, 'bench/results/ci/generated.json');
const result = JSON.parse(readFileSync(file, 'utf8'));
const readme = path.join(root, 'README.md');

const x = (v) => {
  const s = `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)}×`;
  return v < 1 ? `**${s}**` : s;
};
const NAMES = { node: 'Node', chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' };
const table = (title, scenarios, key) => [
  `| ${title} | ${RUNTIMES.map((rt) => NAMES[rt]).join(' | ')} |`,
  `|---|${RUNTIMES.map(() => '---').join('|')}|`,
  ...scenarios.map((s) => `| ${s.label} | ${RUNTIMES.map((rt) => x(pick(result, rt, s)[key])).join(' | ')} |`),
];

const commit = result.commit ? `, commit [\`${result.commit.slice(0, 7)}\`](https://github.com/Tom4ikss/ts-bin-RPC/commit/${result.commit})` : '';
const block = [
  '<!-- bench:start -->',
  `GitHub Actions \`ubuntu-latest\` (${result.cpu}), ${versions(result)} through Playwright, ${result.date}${commit}.`,
  'Full tables, with times: [generated.md](bench/results/ci/generated.md).',
  '',
  ...table('Reading', READS, 'verified'),
  '',
  ...table('Encoding', ENCODES, 'plain'),
  '<!-- bench:end -->',
].join('\n');

const text = readFileSync(readme, 'utf8');
const re = /<!-- bench:start -->[\s\S]*?<!-- bench:end -->/;
if (!re.test(text)) throw new Error('README.md has no <!-- bench:start --> ... <!-- bench:end --> block');
writeFileSync(readme, text.replace(re, block));
console.log('README.md: benchmark tables updated');
