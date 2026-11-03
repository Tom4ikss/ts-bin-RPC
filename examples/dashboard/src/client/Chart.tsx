// A uPlot chart. Columns from the response go to uPlot as they are: timestamps are a Float64Array in ms
// (`ms: 1`), values are Float32Array views over the response bytes. Nothing is copied.
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';

export interface ChartProps {
  data: uPlot.AlignedData;
  series: { label: string; color: string }[];
  unit: string;
  height?: number;
}

export function Chart({ data, series, unit, height = 280 }: ChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const key = series.map((s) => s.label).join('\n') + unit;

  useEffect(() => {
    const node = el.current!;
    const opts: uPlot.Options = {
      width: node.clientWidth,
      height,
      ms: 1,
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: true } },
      axes: [{}, { label: unit, size: 60 }],
      series: [{}, ...series.map((s) => ({ label: s.label, stroke: s.color, width: 1.5, value: (_: uPlot, v: number | null) => (v == null ? '—' : `${v.toFixed(1)} ${unit}`) }))],
    };
    const p = (plot.current = new uPlot(opts, data, node));
    const resize = new ResizeObserver(() => p.setSize({ width: node.clientWidth, height }));
    resize.observe(node);
    return () => {
      resize.disconnect();
      p.destroy();
      plot.current = null;
    };
    // a new chart only when the series change; data updates go through setData below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, height]);

  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  return <div ref={el} className="chart" />;
}
