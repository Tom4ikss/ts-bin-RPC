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

function settings(quick) {
  return { warmupMs: quick ? 50 : 300, batchMs: quick ? 10 : 25, samples: quick ? 5 : 15 };
}

/** Warms `fn` up and returns the iteration count of one batch. */
function calibrate(fn, input, { warmupMs, batchMs }) {
  const tw = performance.now();
  while (performance.now() - tw < warmupMs) sink = (sink + fn(input)) | 0;
  let iters = 1;
  while (time(fn, input, iters) < batchMs) iters *= 2;
  return iters;
}

function summary(r) {
  r.sort((a, b) => a - b);
  return { us: r[r.length >> 1], min: r[0], max: r[r.length - 1] };
}

export function measure(fn, input, { quick = false } = {}) {
  const s = settings(quick);
  const iters = calibrate(fn, input, s);
  const r = [];
  for (let k = 0; k < s.samples; k++) r.push((time(fn, input, iters) * 1000) / iters);
  return summary(r);
}

// groups: [{ group, cases: [{ label, fn, input }] }]; the first case of a group is the baseline.
// Samples of a group's cases are interleaved, so slow drift (GC heap growth, JIT tier changes, thermal
// throttling) affects every case alike instead of whichever one runs last.
export function runGroups(groups, opts = {}) {
  const s = settings(opts.quick);
  const rows = [];
  for (const g of groups) {
    const iters = g.cases.map((c) => calibrate(c.fn, c.input, s));
    const r = g.cases.map(() => []);
    for (let k = 0; k < s.samples; k++) {
      g.cases.forEach((c, j) => r[j].push((time(c.fn, c.input, iters[j]) * 1000) / iters[j]));
    }
    let base;
    g.cases.forEach((c, j) => {
      const m = summary(r[j]);
      base ??= m.us;
      rows.push({ group: g.group, variant: c.label, us: m.us, spread: (m.max - m.min) / m.us, ratio: base / m.us });
    });
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
