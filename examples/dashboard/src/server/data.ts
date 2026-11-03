// Synthetic metrics: a deterministic function of (host, metric, time). Every range and resolution agree
// with each other, and live mode is just a window that moves with the clock.
import type { MetricKind, Region } from './router.ts';

export interface HostSeed {
  id: number;
  name: string;
  region: Region;
  tags: string[];
  load: number; // 0..1, scales cpu and traffic
  phase: number; // shifts the daily cycle, per region
  down?: boolean;
}

export const HOSTS: HostSeed[] = [
  { id: 1, name: 'api-eu-1', region: 'eu-west', tags: ['api'], load: 0.55, phase: 0 },
  { id: 2, name: 'api-eu-2', region: 'eu-west', tags: ['api'], load: 0.6, phase: 0.02 },
  { id: 3, name: 'db-eu-1', region: 'eu-west', tags: ['db', 'primary'], load: 0.4, phase: 0.01 },
  { id: 4, name: 'api-us-1', region: 'us-east', tags: ['api'], load: 0.7, phase: 0.25 },
  { id: 5, name: 'api-us-2', region: 'us-east', tags: ['api', 'canary'], load: 0.85, phase: 0.26 },
  { id: 6, name: 'worker-us-1', region: 'us-east', tags: ['worker'], load: 0.5, phase: 0.3 },
  { id: 7, name: 'api-ap-1', region: 'ap-south', tags: ['api'], load: 0.45, phase: 0.6 },
  { id: 8, name: 'cache-ap-1', region: 'ap-south', tags: ['cache'], load: 0.3, phase: 0.62, down: true },
];

export const KINDS: Record<MetricKind, { unit: string; label: string }> = {
  cpu: { unit: '%', label: 'CPU' },
  memory: { unit: '%', label: 'Memory' },
  rps: { unit: 'req/s', label: 'Requests' },
  latency: { unit: 'ms', label: 'Latency p99' },
};

const DAY = 86_400_000;
const KIND_SEED: Record<MetricKind, number> = { cpu: 1, memory: 2, rps: 3, latency: 4 };

/** Noise in [0, 1), fixed per (host, metric, second). */
function noise(host: number, kind: number, second: number): number {
  let h = Math.imul(host, 0x9e3779b1) ^ Math.imul(kind, 0x85ebca77) ^ Math.imul(second | 0, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 2 ** 32;
}

export function sample(host: HostSeed, kind: MetricKind, t: number): number {
  if (host.down && t > Date.now() - 20 * 60_000) return 0;
  const s = Math.floor(t / 1000);
  const n = noise(host.id, KIND_SEED[kind], s);
  const daily = Math.sin(2 * Math.PI * (t / DAY + host.phase)); // -1..1
  const wave = Math.sin(t / 420_000 + host.id); // ~45 min period
  const rps = Math.max(0, 900 * host.load * (1 + 0.5 * daily) + 60 * wave + 80 * (n - 0.5));
  switch (kind) {
    case 'rps':
      return rps;
    case 'cpu':
      return Math.min(100, Math.max(0, 100 * host.load * (0.75 + 0.3 * daily) + 6 * wave + 10 * (n - 0.5)));
    case 'memory':
      // a slow leak, collected every 30 minutes
      return 35 + 30 * host.load + 20 * ((t / 1_800_000 + host.phase * 7) % 1) + 2 * (n - 0.5);
    case 'latency':
      return 12 + 0.03 * rps + 6 * n + (n > 0.999 ? 80 : 0); // a spike every ~20 minutes
  }
}

/** `points` timestamps from `from` to `to`, at most one per second. */
export function timeline(from: number, to: number, points: number): Float64Array {
  const n = Math.max(2, Math.min(points, Math.floor((to - from) / 1000) + 1));
  const t = new Float64Array(n);
  const step = (to - from) / (n - 1);
  for (let i = 0; i < n; i++) t[i] = Math.round(from + i * step);
  return t;
}

export function series(host: HostSeed, kind: MetricKind, t: Float64Array): Float32Array {
  const v = new Float32Array(t.length);
  for (let i = 0; i < t.length; i++) v[i] = sample(host, kind, t[i]);
  return v;
}
