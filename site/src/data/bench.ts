// Numbers on the landing page. Every value is copied from bench/results/*.md in the repository;
// nothing is computed or rounded here except for display. Update them when the results change.
//
// Speed is relative to JSON.parse(TextDecoder.decode(bytes)) over the same data, which is what
// `response.json()` does. Higher is better; 1 means as fast as JSON.

export const SOURCE = {
  generated: 'bench/results/generated.md',
  core: 'bench/results/core.md',
  compression: 'bench/results/generated-size.md',
  size: 'bench/results/size.md',
};

export const MACHINE = 'Apple M3 Pro, headless Chromium 156, Firefox 157, WebKit 27.2, Node 22.13, 2026-11-03';

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
  /** Median time of JSON and of ts-bin-rpc, as printed in the results. */
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

// generated.md: "generated" and "generated + verify" against "JSON".
export const SCENARIOS: Scenario[] = [
  {
    id: 'all',
    label: 'Read every field',
    caption: '1000 users, every field of every object read once.',
    rows: {
      chromium: { verified: 2.63, plain: 2.88, json: '211 µs', tbr: '73 µs', tbrVerified: '80 µs' },
      firefox: { verified: 3.69, plain: 4.07, json: '318 µs', tbr: '78 µs', tbrVerified: '86 µs' },
      webkit: { verified: 3.7, plain: 4.18, json: '282 µs', tbr: '67 µs', tbrVerified: '76 µs' },
      node: { verified: 7.14, plain: 8.09, json: '471 µs', tbr: '58 µs', tbrVerified: '66 µs' },
    },
  },
  {
    id: 'partial',
    label: 'Read 2 of 7 fields',
    caption: '1000 users, two fields read. Views skip what you never touch.',
    rows: {
      chromium: { verified: 4.92, plain: 5.87, json: '208 µs', tbr: '36 µs', tbrVerified: '42 µs' },
      firefox: { verified: 6.99, plain: 8.65, json: '310 µs', tbr: '36 µs', tbrVerified: '44 µs' },
      webkit: { verified: 5.29, plain: 6.26, json: '280 µs', tbr: '45 µs', tbrVerified: '53 µs' },
      node: { verified: 12.73, plain: 16.54, json: '460 µs', tbr: '28 µs', tbrVerified: '36 µs' },
    },
  },
  {
    id: 'numbers',
    label: 'Numeric fields only',
    caption: '1000 users, only the numeric columns read.',
    rows: {
      chromium: { verified: 7.33, plain: 19.79, json: '209 µs', tbr: '11 µs', tbrVerified: '29 µs' },
      firefox: { verified: 14.35, plain: 33.26, json: '309 µs', tbr: '9.28 µs', tbrVerified: '22 µs' },
      webkit: { verified: 7.18, plain: 35.99, json: '277 µs', tbr: '7.71 µs', tbrVerified: '39 µs' },
      node: { verified: 17.66, plain: 36.69, json: '460 µs', tbr: '13 µs', tbrVerified: '26 µs' },
    },
  },
  {
    id: 'series',
    label: '100k points',
    caption: 'Four typed-array columns summed, against JSON number arrays. Nothing to parse.',
    rows: {
      chromium: { verified: 17.78, plain: 15.18, json: '7.9 ms', tbr: '519 µs', tbrVerified: '443 µs' },
      firefox: { verified: 96.51, plain: 115.29, json: '15.7 ms', tbr: '136 µs', tbrVerified: '163 µs' },
      webkit: { verified: 21.19, plain: 21.18, json: '9.2 ms', tbr: '436 µs', tbrVerified: '436 µs' },
      node: { verified: 135.98, plain: 136.46, json: '12.8 ms', tbr: '94 µs', tbrVerified: '94 µs' },
    },
  },
  {
    id: 'encode',
    label: 'Encode',
    caption: '1000 users encoded, against JSON.stringify. No verification on this path.',
    rows: {
      chromium: { plain: 1.88, json: '269 µs', tbr: '143 µs' },
      firefox: { plain: 1.65, json: '290 µs', tbr: '175 µs' },
      webkit: { plain: 2.28, json: '205 µs', tbr: '90 µs' },
      node: { plain: 2.36, json: '366 µs', tbr: '155 µs' },
    },
  },
  {
    id: 'small',
    label: '10 users',
    caption: 'A small response: 10 users, every field. The gain is a few microseconds.',
    rows: {
      chromium: { verified: 1.45, plain: 1.7, json: '2.09 µs', tbr: '1.23 µs', tbrVerified: '1.44 µs' },
      firefox: { verified: 1.48, plain: 1.78, json: '3.32 µs', tbr: '1.86 µs', tbrVerified: '2.24 µs' },
      webkit: { verified: 1.43, plain: 1.63, json: '2.65 µs', tbr: '1.62 µs', tbrVerified: '1.85 µs' },
      node: { verified: 3.26, plain: 4.03, json: '4.41 µs', tbr: '1.09 µs', tbrVerified: '1.35 µs' },
    },
  },
  {
    id: 'text',
    label: 'Long text',
    caption: '500 products with 12–52 word descriptions, every field.',
    rows: {
      chromium: { verified: 1.64, plain: 2.07, json: '106 µs', tbr: '51 µs', tbrVerified: '65 µs' },
      firefox: { verified: 2.68, plain: 3.21, json: '260 µs', tbr: '81 µs', tbrVerified: '97 µs' },
      webkit: { verified: 2.08, plain: 2.64, json: '159 µs', tbr: '60 µs', tbrVerified: '76 µs' },
      node: { verified: 3.99, plain: 5.46, json: '227 µs', tbr: '42 µs', tbrVerified: '57 µs' },
    },
  },
  {
    id: 'one',
    label: '1 user',
    caption: 'A single 150-byte object. With verification JSON is as fast or faster in browsers; both are under a microsecond.',
    rows: {
      chromium: { verified: 0.94, plain: 1.19, json: '0.40 µs', tbr: '0.34 µs', tbrVerified: '0.43 µs' },
      firefox: { verified: 0.74, plain: 0.94, json: '0.46 µs', tbr: '0.49 µs', tbrVerified: '0.62 µs' },
      webkit: { verified: 0.92, plain: 1.07, json: '0.47 µs', tbr: '0.44 µs', tbrVerified: '0.51 µs' },
      node: { verified: 1.64, plain: 2.1, json: '0.59 µs', tbr: '0.28 µs', tbrVerified: '0.36 µs' },
    },
  },
];

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
