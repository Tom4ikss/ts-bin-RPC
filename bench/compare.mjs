// Compares two runs of a suite written by run.mjs: the ratio of every variant to its group's first
// variant (JSON in most suites), before and after. Absolute times on shared CI runners drift by tens
// of percent between machines; ratios measured within one run hold much better.
//   node bench/compare.mjs before.json after.json [--threshold=0.15]
// Prints a Markdown table of the changes and the variants whose ratio dropped by more than the
// threshold. Never fails: a slower run is a warning to look at, not a broken build.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const [beforeFile, afterFile] = args.filter((a) => !a.startsWith('--'));
const thArg = args.find((a) => a.startsWith('--threshold='));
const threshold = thArg ? Number(thArg.slice(12)) : 0.15;

const before = JSON.parse(readFileSync(beforeFile, 'utf8'));
const after = JSON.parse(readFileSync(afterFile, 'utf8'));
const runtimes = Object.keys(after.runtimes).filter((rt) => before.runtimes[rt]);
const key = (r) => `${r.group}\u0000${r.variant}`;

const lines = [];
const drops = [];
let worst = 0;
const rows = after.runtimes[runtimes[0]].rows;
for (const [i, row] of rows.entries()) {
  if (rows.findIndex((r) => r.group === row.group) === i) continue; // the baseline itself
  const cells = runtimes.map((rt) => {
    const a = after.runtimes[rt].rows.find((r) => key(r) === key(row));
    const b = before.runtimes[rt].rows.find((r) => key(r) === key(row));
    if (!a || !b) return '–';
    const change = a.ratio / b.ratio - 1;
    worst = Math.max(worst, Math.abs(change));
    if (change < -threshold) drops.push(`${row.group} / ${row.variant} / ${rt}: ${b.ratio.toFixed(2)}x → ${a.ratio.toFixed(2)}x`);
    const mark = change < -threshold ? ' ⚠' : '';
    return `${b.ratio.toFixed(2)} → ${a.ratio.toFixed(2)} (${change >= 0 ? '+' : '−'}${Math.abs(change * 100).toFixed(0)}%)${mark}`;
  });
  lines.push(`| ${row.group} | ${row.variant} | ${cells.join(' | ')} |`);
}

const short = (c) => (c ? c.slice(0, 7) : 'unknown');
console.log(`## Suite \`${after.suite}\`: ${short(before.commit)} (${before.date}) → ${short(after.commit)} (${after.date})

Ratio to the first variant of each group, before → after. ⚠ marks a drop of more than ${(threshold * 100).toFixed(0)}%.
Largest change either way: ${(worst * 100).toFixed(0)}%.

| Group | Variant | ${runtimes.join(' | ')} |
|---|---|${runtimes.map(() => '---').join('|')}|
${lines.join('\n')}
`);
if (drops.length) console.log(`**${drops.length} drop(s) over ${(threshold * 100).toFixed(0)}%:**\n\n${drops.map((d) => `- ${d}`).join('\n')}\n`);
else console.log(`No ratio dropped by more than ${(threshold * 100).toFixed(0)}%.\n`);
