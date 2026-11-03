// Live samples over a stream. Each batch comes with typed-array columns over the frame bytes; they go
// into the chart's arrays directly, without an object per row.
import { useEffect, useMemo, useState } from 'react';
import type uPlot from 'uplot';
import { api } from './api.ts';
import { Chart } from './Chart.tsx';

const EVERY = 100;
const KEEP = 300; // samples per host: 30 s

export function Live({ hosts, colors }: { hosts: { id: number; name: string }[]; colors: string[] }) {
  const [data, setData] = useState<uPlot.AlignedData | null>(null);
  const [stats, setStats] = useState({ rows: 0, batches: 0 });
  const [error, setError] = useState<string | null>(null);
  const ids = hosts.map((h) => h.id).join();

  useEffect(() => {
    if (!hosts.length) return;
    const lane = new Map(hosts.map((h, i) => [h.id, i]));
    const t: number[] = [];
    const ys: (number | null)[][] = hosts.map(() => []);
    let rows = 0, batches = 0;

    const sub = api.live.subscribe(
      { every: EVERY },
      {
        batch: (b) => {
          const { host, t: ts, rps } = b.columns;
          for (let i = 0; i < b.length; i++) {
            if (t.at(-1) !== ts![i]) {
              t.push(ts![i]);
              for (const y of ys) y.push(null);
            }
            const k = lane.get(host![i]);
            if (k !== undefined) ys[k][t.length - 1] = rps![i];
          }
          if (t.length > KEEP) {
            t.splice(0, t.length - KEEP);
            for (const y of ys) y.splice(0, y.length - KEEP);
          }
          rows += b.length;
          batches++;
          setData([t.slice(), ...ys.map((y) => y.slice())]);
          setStats({ rows, batches });
        },
        error: (e) => setError(`${e.code}: ${e.message}`),
      },
    );
    return () => sub.stop();
    // hosts change identity on every refresh; resubscribe only when the set of hosts changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const series = useMemo(() => hosts.map((h) => ({ label: h.name, color: colors[(h.id - 1) % colors.length] })), [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <h2>
        Requests, live <small>a sample of every host each {EVERY} ms · {stats.rows.toLocaleString()} rows in {stats.batches.toLocaleString()} batches</small>
      </h2>
      {error && <p className="error">{error}</p>}
      {data && <Chart data={data} series={series} unit="req/s" height={220} />}
      <p className="note">
        One <code>fetch</code> for the whole stream. Rows arrive in batches of up to 16 ms; <code>batch.columns</code> are typed arrays over each frame.
      </p>
    </section>
  );
}
