import { useEffect, useMemo, useState } from 'react';
import { RpcError } from 'ts-bin-rpc';
import type uPlot from 'uplot';
import type { Host, MetricKind, Overview, Series } from '../server/router.ts';
import { api, onCall, type CallStats } from './api.ts';
import { Chart } from './Chart.tsx';

const RANGES = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 3_600_000 },
  { label: '6h', ms: 6 * 3_600_000 },
  { label: '24h', ms: 86_400_000 },
  { label: '7d', ms: 7 * 86_400_000 },
];
const KINDS: { kind: MetricKind; label: string; unit: string }[] = [
  { kind: 'cpu', label: 'CPU', unit: '%' },
  { kind: 'memory', label: 'Memory', unit: '%' },
  { kind: 'rps', label: 'Requests', unit: 'req/s' },
  { kind: 'latency', label: 'Latency p99', unit: 'ms' },
];
const RESOLUTIONS = [1_000, 10_000, 100_000];
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];
const LIVE_MS = 2000;

interface Call extends CallStats {
  id: number;
  json?: number;
}

/** What the same answer would weigh as JSON: values rounded to 0.01, timestamps as integers. */
function jsonBytes(value: unknown): number {
  const round = (x: number) => Math.round(x * 100) / 100;
  return new TextEncoder().encode(
    JSON.stringify(value, (_, v) => (v instanceof Float64Array ? Array.from(v) : v instanceof Float32Array ? Array.from(v, round) : v)),
  ).length;
}

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

export function App() {
  const [range, setRange] = useState(RANGES[1]);
  const [kind, setKind] = useState(KINDS[0]);
  const [points, setPoints] = useState(RESOLUTIONS[1]);
  const [live, setLive] = useState(true);
  const [selected, setSelected] = useState(1);
  const [tick, setTick] = useState(0);

  const [hosts, setHosts] = useState<Host[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);

  useEffect(() => {
    let id = 0;
    return onCall((s) => setCalls((c) => [{ ...s, id: id++ }, ...c].slice(0, 8)));
  }, []);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((x) => x + 1), LIVE_MS);
    return () => clearInterval(t);
  }, [live]);

  useEffect(() => {
    const abort = new AbortController();
    const signal = abort.signal;
    const to = new Date(), from = new Date(to.getTime() - range.ms);
    // The JSON size of the last call of a procedure, for the stats table.
    const noteJson = (path: string, value: unknown) =>
      setCalls((c) => {
        const i = c.findIndex((x) => x.path === path && x.json === undefined);
        return i < 0 ? c : c.with(i, { ...c[i], json: jsonBytes(value) });
      });

    Promise.all([
      api.hosts(undefined, { signal }),
      api.overview({ kind: kind.kind, from, to, points: 600 }, { signal }),
      api.series({ host: selected, kind: kind.kind, from, to, points }, { signal }),
    ]).then(
      ([h, o, s]) => {
        setHosts(h);
        setOverview(o);
        setDetail(s);
        setError(null);
        noteJson('hosts', h);
        noteJson('overview', o);
        noteJson('series', s);
      },
      (e: unknown) => {
        if (signal.aborted) return;
        setError(e instanceof RpcError ? `${e.code}: ${e.message}` : String(e));
      },
    );
    return () => abort.abort();
  }, [range, kind, points, selected, tick]);

  const overviewData = useMemo((): uPlot.AlignedData | null => (overview ? [overview.t, ...overview.hosts.map((h) => h.v)] : null), [overview]);
  const overviewSeries = useMemo(() => overview?.hosts.map((h, i) => ({ label: h.name, color: COLORS[i % COLORS.length] })) ?? [], [overview]);
  const host = hosts.find((h) => h.id === selected);

  return (
    <main>
      <header>
        <h1>ts-bin-rpc dashboard</h1>
        <div className="controls">
          <Segmented items={KINDS} value={kind} onChange={setKind} label={(k) => k.label} />
          <Segmented items={RANGES} value={range} onChange={setRange} label={(r) => r.label} />
          <label className="live">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> live
          </label>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <section>
        <h2>
          {kind.label}, all hosts <small>600 points</small>
        </h2>
        {overviewData && <Chart data={overviewData} series={overviewSeries} unit={kind.unit} />}
      </section>

      <div className="grid">
        <section>
          <h2>Hosts</h2>
          <table className="hosts">
            <thead>
              <tr>
                <th>Host</th>
                <th>Region</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Requests</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => (
                <tr key={h.id} className={h.id === selected ? 'selected' : undefined} onClick={() => setSelected(h.id)}>
                  <td>{h.name}</td>
                  <td>{h.region}</td>
                  <td>
                    <span className={`status ${h.status}`}>{h.status}</span>
                  </td>
                  <td>{h.cpu.toFixed(0)}%</td>
                  <td>{h.memory.toFixed(0)}%</td>
                  <td>{h.rps.toFixed(0)}/s</td>
                  <td>{h.tags.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Calls</h2>
          <table className="calls">
            <thead>
              <tr>
                <th>Procedure</th>
                <th>Binary</th>
                <th>As JSON</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td>{c.path}</td>
                  <td>{kb(c.bytes)}</td>
                  <td>{c.json === undefined ? '…' : `${kb(c.json)} (${(c.json / c.bytes).toFixed(1)}×)`}</td>
                  <td>{c.ms.toFixed(0)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Sizes before HTTP compression. JSON: the same values, rounded to 0.01.</p>
        </section>
      </div>

      <section>
        <h2>
          {kind.label}, {host?.name ?? `host ${selected}`} <small>{detail ? `${detail.t.length.toLocaleString()} points` : ''}</small>
          <Segmented items={RESOLUTIONS} value={points} onChange={setPoints} label={(n) => `${n / 1000}k`} />
        </h2>
        {detail && <Chart data={[detail.t, detail.v]} series={[{ label: host?.name ?? '', color: COLORS[(selected - 1) % COLORS.length] }]} unit={kind.unit} />}
        <p className="note">At most one point per second: short ranges return fewer points than asked.</p>
      </section>
    </main>
  );
}

function Segmented<T>({ items, value, onChange, label }: { items: T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <span className="segmented">
      {items.map((it) => (
        <button key={label(it)} className={it === value ? 'on' : undefined} onClick={() => onChange(it)}>
          {label(it)}
        </button>
      ))}
    </span>
  );
}
