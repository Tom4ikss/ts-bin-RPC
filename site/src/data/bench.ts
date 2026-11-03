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
      chromium: { verified: 2.34, plain: 2.93, json: '209 µs', tbr: '71 µs', tbrVerified: '90 µs' },
      firefox: { verified: 3.38, plain: 4.07, json: '310 µs', tbr: '76 µs', tbrVerified: '92 µs' },
      webkit: { verified: 3.34, plain: 4.12, json: '283 µs', tbr: '69 µs', tbrVerified: '85 µs' },
      node: { verified: 5.58, plain: 8.02, json: '448 µs', tbr: '56 µs', tbrVerified: '80 µs' },
    },
  },
  {
    id: 'partial',
    label: 'Read 2 of 7 fields',
    caption: '1000 users, two fields read. Views skip what you never touch.',
    rows: {
      chromium: { verified: 4.13, plain: 6.45, json: '209 µs', tbr: '32 µs', tbrVerified: '51 µs' },
      firefox: { verified: 6.04, plain: 8.62, json: '311 µs', tbr: '36 µs', tbrVerified: '51 µs' },
      webkit: { verified: 4.66, plain: 6.11, json: '283 µs', tbr: '46 µs', tbrVerified: '61 µs' },
      node: { verified: 8.82, plain: 16.21, json: '440 µs', tbr: '27 µs', tbrVerified: '50 µs' },
    },
  },
  {
    id: 'numbers',
    label: 'Numeric fields only',
    caption: '1000 users, only the numeric columns read.',
    rows: {
      chromium: { verified: 5.49, plain: 20.41, json: '211 µs', tbr: '10 µs', tbrVerified: '38 µs' },
      firefox: { verified: 10.86, plain: 33.48, json: '308 µs', tbr: '9.21 µs', tbrVerified: '28 µs' },
      webkit: { verified: 6.08, plain: 34.1, json: '285 µs', tbr: '8.35 µs', tbrVerified: '47 µs' },
      node: { verified: 11.13, plain: 35.21, json: '449 µs', tbr: '13 µs', tbrVerified: '40 µs' },
    },
  },
  {
    id: 'series',
    label: '100k points',
    caption: 'Four typed-array columns summed, against JSON number arrays. Nothing to parse.',
    rows: {
      chromium: { verified: 17.6, plain: 15.1, json: '7.8 ms', tbr: '515 µs', tbrVerified: '442 µs' },
      firefox: { verified: 117.51, plain: 118.53, json: '15.9 ms', tbr: '134 µs', tbrVerified: '135 µs' },
      webkit: { verified: 21.56, plain: 21.53, json: '9.5 ms', tbr: '441 µs', tbrVerified: '440 µs' },
      node: { verified: 137.19, plain: 136.8, json: '13.2 ms', tbr: '97 µs', tbrVerified: '97 µs' },
    },
  },
  {
    id: 'encode',
    label: 'Encode',
    caption: '1000 users encoded, against JSON.stringify. No verification on this path.',
    rows: {
      chromium: { plain: 1.91, json: '263 µs', tbr: '137 µs' },
      firefox: { plain: 1.7, json: '282 µs', tbr: '166 µs' },
      webkit: { plain: 1.86, json: '207 µs', tbr: '111 µs' },
      node: { plain: 2.34, json: '377 µs', tbr: '161 µs' },
    },
  },
  {
    id: 'small',
    label: '10 users',
    caption: 'A small response: 10 users, every field. The gain is a few microseconds.',
    rows: {
      chromium: { verified: 1.29, plain: 1.7, json: '2.08 µs', tbr: '1.23 µs', tbrVerified: '1.61 µs' },
      firefox: { verified: 1.37, plain: 1.78, json: '3.27 µs', tbr: '1.84 µs', tbrVerified: '2.39 µs' },
      webkit: { verified: 1.31, plain: 1.6, json: '2.62 µs', tbr: '1.64 µs', tbrVerified: '1.99 µs' },
      node: { verified: 2.8, plain: 4.06, json: '4.45 µs', tbr: '1.10 µs', tbrVerified: '1.59 µs' },
    },
  },
  {
    id: 'text',
    label: 'Long text',
    caption: '500 products with 12–52 word descriptions. With verification JSON is close, and ahead in Chromium.',
    rows: {
      chromium: { verified: 0.91, plain: 2.09, json: '107 µs', tbr: '51 µs', tbrVerified: '117 µs' },
      firefox: { verified: 1.97, plain: 3.2, json: '262 µs', tbr: '82 µs', tbrVerified: '133 µs' },
      webkit: { verified: 1.48, plain: 2.68, json: '165 µs', tbr: '62 µs', tbrVerified: '111 µs' },
      node: { verified: 1.66, plain: 5.39, json: '223 µs', tbr: '41 µs', tbrVerified: '134 µs' },
    },
  },
  {
    id: 'one',
    label: '1 user',
    caption: 'A single 150-byte object. With verification JSON is as fast or faster in browsers; both are under a microsecond.',
    rows: {
      chromium: { verified: 0.94, plain: 1.19, json: '0.40 µs', tbr: '0.33 µs', tbrVerified: '0.42 µs' },
      firefox: { verified: 0.66, plain: 0.94, json: '0.47 µs', tbr: '0.49 µs', tbrVerified: '0.70 µs' },
      webkit: { verified: 0.83, plain: 1.04, json: '0.47 µs', tbr: '0.45 µs', tbrVerified: '0.56 µs' },
      node: { verified: 1.51, plain: 2.08, json: '0.59 µs', tbr: '0.28 µs', tbrVerified: '0.39 µs' },
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
  runtime: '3.9 KB',
  dashboard: '9.1 KB',
  fixture: '11.1 KB',
};
