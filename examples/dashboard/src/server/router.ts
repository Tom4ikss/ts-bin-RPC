// The dashboard's API. `pnpm gen` turns these types into tbr.lock.json and src/server/tbr.gen.ts.
import { RpcError, type f32, type u16, type u32 } from 'ts-bin-rpc';
import { HOSTS, KINDS, sample, series, timeline } from './data.ts';

export type Region = 'eu-west' | 'us-east' | 'ap-south';
export type Status = 'up' | 'degraded' | 'down';
export type MetricKind = 'cpu' | 'memory' | 'rps' | 'latency';

export interface Host {
  id: u16;
  name: string;
  region: Region;
  status: Status;
  tags: string[];
  /** Latest values. */
  cpu: f32;
  memory: f32;
  rps: f32;
}

/** A time series as two columns: timestamps in ms since the epoch, values. */
export interface Series {
  t: Float64Array;
  v: Float32Array;
}

export interface SeriesQuery {
  host: u16;
  kind: MetricKind;
  from: Date;
  to: Date;
  /** Upper bound on the number of points; the server samples the range evenly. */
  points: u32;
}

export interface OverviewQuery {
  kind: MetricKind;
  region?: Region;
  from: Date;
  to: Date;
  points: u32;
}

/** One metric for many hosts on a shared time axis. */
export interface Overview {
  unit: string;
  t: Float64Array;
  hosts: { id: u16; name: string; v: Float32Array }[];
}

const MAX_POINTS = 500_000;

function range(q: { from: Date; to: Date; points: u32 }): Float64Array {
  const from = q.from.getTime(), to = q.to.getTime();
  if (!(from < to)) throw new RpcError('BAD_INPUT', '`from` must be before `to`');
  if (q.points < 2 || q.points > MAX_POINTS) throw new RpcError('BAD_INPUT', `points must be within 2..${MAX_POINTS}`, { max: MAX_POINTS });
  return timeline(from, to, q.points);
}

export const appRouter = {
  hosts: async (input?: { region?: Region }): Promise<Host[]> => {
    const now = Date.now();
    return HOSTS.filter((h) => !input?.region || h.region === input.region).map((h) => {
      const cpu = sample(h, 'cpu', now);
      return {
        id: h.id,
        name: h.name,
        region: h.region,
        status: h.down ? 'down' : cpu > 80 ? 'degraded' : 'up',
        tags: h.tags,
        cpu,
        memory: sample(h, 'memory', now),
        rps: sample(h, 'rps', now),
      };
    });
  },

  series: async (input: SeriesQuery): Promise<Series> => {
    const host = HOSTS.find((h) => h.id === input.host);
    if (!host) throw new RpcError('NOT_FOUND', `no host ${input.host}`, { host: input.host });
    const t = range(input);
    return { t, v: series(host, input.kind, t) };
  },

  overview: async (input: OverviewQuery): Promise<Overview> => {
    const t = range(input);
    const hosts = HOSTS.filter((h) => !input.region || h.region === input.region);
    return { unit: KINDS[input.kind].unit, t, hosts: hosts.map((h) => ({ id: h.id, name: h.name, v: series(h, input.kind, t) })) };
  },
};

export type AppRouter = typeof appRouter;
