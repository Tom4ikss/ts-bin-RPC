// Numbers on the landing page. Speed comes from the latest published run of the bench workflow on
// GitHub Actions (bench/results/ci/generated.json), picked by bench/lib/headline.mjs, which also
// writes the README tables. Size after compression and bundle size do not depend on the machine;
// they are copied from bench/results/*.md by hand. Update them when the results change.
//
// Speed is relative to JSON.parse(TextDecoder.decode(bytes)) over the same data, which is what
// `response.json()` does. Higher is better; 1 means as fast as JSON.
import result from '../../../bench/results/ci/generated.json';
import { ENCODES, READS, pick, versions } from '../../../bench/lib/headline.mjs';

export const SOURCE = {
  generated: 'bench/results/ci/generated.md',
  compression: 'bench/results/generated-size.md',
  size: 'bench/results/size.md',
};

export const MACHINE = `GitHub Actions ubuntu-latest, ${result.cpu}, headless ${versions(result)}, ${result.date}, commit ${result.commit.slice(0, 7)}`;
export const REPEAT = result.repeat;

export type Runtime = 'chromium' | 'firefox' | 'webkit' | 'node';
export const RUNTIMES: { id: Runtime; label: string }[] = [
  { id: 'chromium', label: 'Chromium' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'webkit', label: 'WebKit' },
  { id: 'node', label: 'Node' },
];

export interface Row {
  /** Speedup with response verification, the client's default (`verify: true`). */
  verified?: number;
  /** Speedup with `verify: false`, or the only value when verification does not apply. */
  plain: number;
  /** Median time of JSON and of ts-bin-rpc. */
  json: string;
  tbr: string;
  tbrVerified?: string;
}

export interface Scenario {
  id: string;
  label: string;
  caption: string;
  rows: Record<Runtime, Row>;
}

const TEXT: Record<string, [label: string, caption: string]> = {
  all: ['Read every field', '1000 users, every field of every object read once.'],
  partial: ['Read 2 of 7 fields', '1000 users, two fields read. Views skip what you never touch.'],
  numbers: ['Numeric fields only', '1000 users, only the numeric columns read.'],
  series: ['100k points', 'Four typed-array columns summed, against JSON number arrays. Nothing to parse.'],
  encode: ['Encode', '1000 users encoded, against JSON.stringify. No verification on this path.'],
  small: ['10 users', 'A small response: 10 users, every field. The gain is a few microseconds.'],
  text: ['Long text', '500 products with 12–52 word descriptions, every field.'],
  one: ['1 user', 'A single 150-byte object. Both take a microsecond or two; with verification JSON can be as fast or faster.'],
};

export const SCENARIOS: Scenario[] = Object.keys(TEXT).map((id) => {
  const s = [...READS, ...ENCODES].find((x) => x.id === id)!;
  const [label, caption] = TEXT[id];
  const rows = Object.fromEntries(RUNTIMES.map((r) => [r.id, pick(result, r.id, s)])) as Record<Runtime, Row>;
  return { id, label, caption, rows };
});

// compression.md, layout L (the chosen one): size after compression relative to JSON compressed
// the same way. Negative is smaller.
export const COMPRESSION = {
  columns: ['gzip-6', 'brotli-4', 'brotli-6', 'zstd-3'],
  rows: [
    { label: '1000 users', values: [-8, -18, -19, -6] },
    { label: '500 products, long text', values: [0, -9, -9, -3] },
    { label: '20 users', values: [10, 13, 10, 9] },
    { label: '100k points vs JSON number arrays', values: [-1, 9, 12, 2] },
    { label: '100k points vs JSON objects', values: [-21, -24, -24, -27] },
  ],
};

// size.md, esbuild minified ESM, gzip -9.
export const BUNDLE = {
  runtime: '4.0 KB',
  dashboard: '9.3 KB',
  fixture: '11.2 KB',
};
