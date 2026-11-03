// Numbers on the landing page. Every value is copied from bench/results/*.md in the repository;
// nothing is computed or rounded here except for display. Update them when the results change.
//
// Speed is relative to JSON.parse(TextDecoder.decode(bytes)) over the same data, which is what
// `response.json()` does. Higher is better; 1 means as fast as JSON.

export const SOURCE = {
  generated: 'bench/results/generated.md',
  core: 'bench/results/core.md',
  compression: 'bench/results/compression.md',
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
      chromium: { verified: 2.5, plain: 3.15, json: '213 µs', tbr: '68 µs', tbrVerified: '85 µs' },
      firefox: { verified: 3.5, plain: 4.17, json: '328 µs', tbr: '79 µs', tbrVerified: '94 µs' },
      webkit: { verified: 3.42, plain: 4.14, json: '292 µs', tbr: '71 µs', tbrVerified: '85 µs' },
      node: { verified: 5.7, plain: 8.13, json: '476 µs', tbr: '58 µs', tbrVerified: '83 µs' },
    },
  },
  {
    id: 'partial',
    label: 'Read 2 of 8 fields',
    caption: '1000 users, two fields read. Views skip what you never touch.',
    rows: {
      chromium: { verified: 4.09, plain: 6.38, json: '210 µs', tbr: '33 µs', tbrVerified: '51 µs' },
      firefox: { verified: 6.22, plain: 8.96, json: '329 µs', tbr: '37 µs', tbrVerified: '53 µs' },
      webkit: { verified: 4.46, plain: 5.99, json: '281 µs', tbr: '47 µs', tbrVerified: '63 µs' },
      node: { verified: 8.87, plain: 16.74, json: '469 µs', tbr: '28 µs', tbrVerified: '53 µs' },
    },
  },
  {
    id: 'numbers',
    label: 'Numeric fields only',
    caption: '1000 users, only the numeric columns read.',
    rows: {
      chromium: { verified: 5.3, plain: 19.05, json: '211 µs', tbr: '11 µs', tbrVerified: '40 µs' },
      firefox: { verified: 10.95, plain: 34.86, json: '323 µs', tbr: '9.27 µs', tbrVerified: '30 µs' },
      webkit: { verified: 6.02, plain: 34.52, json: '287 µs', tbr: '8.31 µs', tbrVerified: '48 µs' },
      node: { verified: 11.12, plain: 37.12, json: '471 µs', tbr: '13 µs', tbrVerified: '42 µs' },
    },
  },
  {
    id: 'encode',
    label: 'Encode',
    caption: '1000 users encoded, against JSON.stringify. No verification on this path.',
    rows: {
      chromium: { plain: 1.91, json: '252 µs', tbr: '132 µs' },
      firefox: { plain: 1.67, json: '295 µs', tbr: '176 µs' },
      webkit: { plain: 1.92, json: '205 µs', tbr: '107 µs' },
      node: { plain: 2.4, json: '379 µs', tbr: '158 µs' },
    },
  },
  {
    id: 'small',
    label: '10 users',
    caption: 'A small response: 10 users, every field. The gain is a few microseconds.',
    rows: {
      chromium: { verified: 1.31, plain: 1.72, json: '2.12 µs', tbr: '1.23 µs', tbrVerified: '1.61 µs' },
      firefox: { verified: 1.39, plain: 1.82, json: '3.41 µs', tbr: '1.87 µs', tbrVerified: '2.45 µs' },
      webkit: { verified: 1.29, plain: 1.57, json: '2.68 µs', tbr: '1.71 µs', tbrVerified: '2.08 µs' },
      node: { verified: 2.78, plain: 3.97, json: '4.48 µs', tbr: '1.13 µs', tbrVerified: '1.61 µs' },
    },
  },
];

// compression.md, layout L (the chosen one): size after compression relative to JSON compressed
// the same way. Negative is smaller.
export const COMPRESSION = {
  columns: ['gzip-6', 'brotli-4', 'brotli-6', 'zstd-3'],
  rows: [
    { label: '1000 users', values: [-8, -17, -20, -7] },
    { label: '500 products, long text', values: [5, -5, -4, 2] },
    { label: '20 users', values: [5, 8, 4, 6] },
    { label: '100k points', values: [-21, -24, -24, -27] },
  ],
};

// size.md, esbuild minified ESM, gzip -9.
export const BUNDLE = {
  runtime: '3.8 KB',
  dashboard: '9.1 KB',
  fixture: '11.0 KB',
};
