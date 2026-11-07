// Bytes per message of the `libs` suite: raw and after gzip, for bench/results/libs.md.
//   pnpm -C bench gen && node bench/gen/libs.mjs && node bench/node/libs-size.mjs
import { gzipSync } from 'node:zlib';
import { sizes } from '../suites/libs.mjs';

const kb = (n) => (n >= 10240 ? `${(n / 1024).toFixed(0)} KB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const lines = ['| Message | Format | Bytes | gzip |', '|---|---|---|---|'];
for (const [message, formats] of sizes()) {
  for (const [format, bytes] of Object.entries(formats)) lines.push(`| ${message} | ${format} | ${kb(bytes.length)} | ${kb(gzipSync(bytes, { level: 6 }).length)} |`);
}
console.log(lines.join('\n'));
