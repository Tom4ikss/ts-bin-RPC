// Runtime-agnostic micro-benchmark harness: works in Node and in browsers.
// Each case is timed in batches long enough to hide coarse timers; the median batch wins.

let sink = 0;

export function consume(v) {
  sink = (sink + (typeof v === 'number' ? v : 1)) | 0;
}

function time(fn, input, iters) {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) sink = (sink + fn(input)) | 0;
  return performance.now() - t0;
}

export function measure(fn, input, { quick = false } = {}) {
  const warmupMs = quick ? 50 : 300;
  const batchMs = quick ? 10 : 25;
  const samples = quick ? 5 : 15;

  const tw = performance.now();
  while (performance.now() - tw < warmupMs) sink = (sink + fn(input)) | 0;

  let iters = 1;
  while (time(fn, input, iters) < batchMs) iters *= 2;

  const r = [];
  for (let s = 0; s < samples; s++) r.push((time(fn, input, iters) * 1000) / iters);
  r.sort((a, b) => a - b);
  return { us: r[samples >> 1], min: r[0], max: r[samples - 1] };
}

// groups: [{ group, cases: [{ label, fn, input }] }]; the first case of a group is the baseline.
export function runGroups(groups, opts = {}) {
  const rows = [];
  for (const g of groups) {
    let base;
    for (const c of g.cases) {
      const m = measure(c.fn, c.input, opts);
      base ??= m.us;
      rows.push({ group: g.group, variant: c.label, us: m.us, spread: (m.max - m.min) / m.us, ratio: base / m.us });
    }
  }
  if (sink === 0x7fffffff) console.log('');
  return rows;
}

export function env() {
  if (typeof navigator !== 'undefined' && navigator.userAgent && typeof process === 'undefined') {
    return { runtime: 'browser', ua: navigator.userAgent, isolated: globalThis.crossOriginIsolated === true };
  }
  return { runtime: 'node', ua: `node ${process.version}`, isolated: true };
}
