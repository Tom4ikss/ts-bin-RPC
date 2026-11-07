// Numbers on the landing page. Speed comes from the latest published run of the bench workflow on
// GitHub Actions (bench/results/ci/generated.json), picked by bench/lib/headline.mjs, which also
// writes the README tables. Size after compression and bundle size do not depend on the machine;
// they are read from the tables in bench/results/*.md when the site builds.
//
// Speed is relative to JSON.parse(TextDecoder.decode(bytes)) over the same data, which is what
// `response.json()` does. Higher is better; 1 means as fast as JSON.
import result from '../../../bench/results/ci/generated.json';
import { ENCODES, READS, pick, versions } from '../../../bench/lib/headline.mjs';
import sizeMd from '../../../bench/results/size.md?raw';
import compressionMd from '../../../bench/results/generated-size.md?raw';

/** The cells of the table row whose first cells are `key`; the build fails when there is none. */
function cells(md: string, ...key: string[]): string[] {
  for (const line of md.split('\n')) {
    const c = line.split('|').slice(1, -1).map((x) => x.trim());
    if (key.every((k, i) => c[i] === k)) return c.slice(key.length);
  }
  throw new Error(`no row ${key.join(' | ')} in a bench result`);
}

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

// generated-size.md: size after compression relative to JSON compressed the same way. Negative is
// smaller.
const PAYLOADS: [label: string, row: string][] = [
  ['1000 users', '1000 users'],
  ['500 products, long text', '500 products, long text'],
  ['20 users', '20 users'],
  ['100k points vs JSON number arrays', '100k points, JSON as number arrays'],
  ['100k points vs JSON objects', '100k points, JSON as an array of objects'],
];
// columns of the table: raw, gzip-6, brotli-4, brotli-6, brotli-11, zstd-3
const PICK = [1, 2, 3, 5];
export const COMPRESSION = {
  columns: ['gzip-6', 'brotli-4', 'brotli-6', 'zstd-3'],
  rows: PAYLOADS.map(([label, row]) => {
    const c = cells(compressionMd, row);
    return { label, values: PICK.map((i) => Number(/\(([+-]?\d+)%\)/.exec(c[i])![1])) };
  }),
};

// size.md, esbuild minified ESM, gzip -9: the whole client bundle.
const bundle = (schema: string) => cells(sizeMd, schema, 'client')[1];
export const BUNDLE = {
  runtime: bundle('runtime only'),
  dashboard: bundle('example dashboard'),
  fixture: bundle('cli fixture "supported"'),
};

// libs.md: ts-bin-rpc against Apache Arrow JS, Flechette and Colyseus schema on the bench server.
// Speed is the ratio of ts-bin-rpc's speedup over JSON to the library's, per runtime.
import libsMd from '../../../bench/results/libs.md?raw';

const libRuntimes = cells(libsMd, 'Group', 'Variant');
const speedups = (group: string, variant: string) =>
  cells(libsMd, group, variant).map((c) => Number(/\(([\d.]+)x\)/.exec(c)![1]));
const bytes = (message: string, format: string) => {
  const [raw, gzip] = cells(libsMd, message, format);
  return { raw, gzip };
};

export const LIBS_MACHINE = /^\d{4}-\d\d-\d\d, ([^,]+), [^,]+, commit (\w+)\./m.exec(libsMd)!.slice(1);
export const LIBS_RUNTIMES = libRuntimes;

interface Versus {
  label: string;
  caption: string;
  group: string;
  ours: string;
  message: string;
  libs: [name: string, variant: string, format: string][];
}

const VERSUS: Versus[] = [
  {
    label: 'Table, every field',
    caption: '1000 users, every field of every row read',
    group: '1000 users, decode and read every field',
    ours: 'ts-bin-rpc, views',
    message: '1000 users',
    libs: [['Arrow JS', 'Arrow JS, columns', 'Arrow JS'], ['Flechette', 'Flechette, columns', 'Flechette']],
  },
  {
    label: 'Table, numbers',
    caption: '1000 users, the numeric columns read',
    group: '1000 users, decode and read the numbers',
    ours: 'ts-bin-rpc, columns',
    message: '1000 users',
    libs: [['Arrow JS', 'Arrow JS, columns', 'Arrow JS'], ['Flechette', 'Flechette, columns', 'Flechette']],
  },
  {
    label: 'Series',
    caption: '100k points in four columns, every value read',
    group: '100k points, decode and read every value',
    ours: 'ts-bin-rpc + verify',
    message: '100k points',
    libs: [['Arrow JS', 'Arrow JS', 'Arrow JS'], ['Flechette', 'Flechette', 'Flechette']],
  },
  {
    label: 'Game state',
    caption: '1000 entities, encoded and decoded',
    group: '1000 entities, full state: encode and decode',
    ours: 'ts-bin-rpc',
    message: '1000 entities, full state',
    libs: [['Colyseus', 'Colyseus schema', 'Colyseus schema']],
  },
  {
    label: 'Small patch',
    caption: '5 of 100 entities move: encode, decode, apply',
    group: '100 entities, 5 move: patch encode, decode and apply',
    ours: 'ts-bin-rpc',
    message: '100 entities, 5 move: patch',
    libs: [['Colyseus', 'Colyseus schema', 'Colyseus schema']],
  },
  {
    label: 'Large patch',
    caption: '50 of 1000 entities move: encode, decode, apply',
    group: '1000 entities, 50 move: patch encode, decode and apply',
    ours: 'ts-bin-rpc',
    message: '1000 entities, 50 move: patch',
    libs: [['Colyseus', 'Colyseus schema', 'Colyseus schema']],
  },
];

export const LIBS = VERSUS.map((v) => {
  const ours = speedups(v.group, v.ours);
  return {
    label: v.label,
    caption: v.caption,
    bytes: bytes(v.message, 'ts-bin-rpc'),
    vs: v.libs.map(([name, variant, format]) => {
      const theirs = speedups(v.group, variant);
      const ratios = ours.map((x, i) => x / theirs[i]);
      return { name, min: Math.min(...ratios), max: Math.max(...ratios), bytes: bytes(v.message, format) };
    }),
  };
});
