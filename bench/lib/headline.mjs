// The headline numbers of the `generated` suite, picked from a run.mjs result (results/ci/generated.json):
// the README tables and the landing page both read them through this, so the two always agree.

/** Reading scenarios: JSON against the generated view, with and without verification. */
export const READS = [
  { id: 'all', group: '1000 users, all fields', label: '1000 users, every field' },
  { id: 'partial', group: '1000 users, 2 fields', label: '1000 users, 2 of 7 fields' },
  { id: 'numbers', group: '1000 users, numbers only', label: '1000 users, numeric fields only' },
  { id: 'series', group: '100k points, every value', label: '100k points, every value', json: 'JSON, number arrays' },
  { id: 'small', group: '10 users, all fields', label: '10 users, every field' },
  { id: 'text', group: '500 products (long text), all fields', label: '500 products with long text' },
  { id: 'one', group: '1 user, all fields', label: '1 user' },
];

/** Encoding scenarios: JSON.stringify plus TextEncoder against the generated encoder. */
export const ENCODES = [
  { id: 'encode', group: 'encode 1000 users', label: '1000 users' },
  { id: 'encode-text', group: 'encode 500 products', label: '500 products with long text' },
  { id: 'encode-series', group: 'encode 100k points', label: '100k points', json: 'JSON, number arrays' },
];

export const RUNTIMES = ['node', 'chromium', 'firefox', 'webkit'];

const fmt = (us) => (us >= 1000 ? `${(us / 1000).toFixed(1)} ms` : us >= 10 ? `${us.toFixed(0)} µs` : `${us.toFixed(2)} µs`);

/**
 * Speed relative to JSON of one scenario on one runtime: `plain` without verification, `verified`
 * with it (reads only), and the median times as text.
 */
export function pick(result, rt, s) {
  const rows = result.runtimes[rt].rows.filter((r) => r.group === s.group);
  const get = (variant) => {
    const r = rows.find((x) => x.variant === variant);
    if (!r) throw new Error(`${rt}: no "${variant}" in "${s.group}"`);
    return r;
  };
  const json = get(s.json ?? 'JSON');
  const plain = get('generated');
  const verified = rows.find((x) => x.variant === 'generated + verify');
  return {
    plain: json.us / plain.us,
    verified: verified && json.us / verified.us,
    json: fmt(json.us),
    tbr: fmt(plain.us),
    tbrVerified: verified && fmt(verified.us),
  };
}

/** Browser and runtime versions from the user agents, e.g. "Chromium 141, Firefox 142, WebKit 26.0, Node 22.21". */
export function versions(result) {
  const ua = (rt) => result.runtimes[rt]?.env.ua ?? '';
  const node = /node v(\d+\.\d+)/.exec(ua('node'))?.[1];
  const chromium = /Chrome\/(\d+)/.exec(ua('chromium'))?.[1];
  const firefox = /Firefox\/(\d+)/.exec(ua('firefox'))?.[1];
  const webkit = /Version\/([\d.]+)/.exec(ua('webkit'))?.[1];
  return [chromium && `Chromium ${chromium}`, firefox && `Firefox ${firefox}`, webkit && `WebKit ${webkit}`, node && `Node ${node}`]
    .filter(Boolean)
    .join(', ');
}
