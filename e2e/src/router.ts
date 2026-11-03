// Fixture app for end-to-end tests: every kind of procedure the protocol distinguishes.
import { RpcError, type f32, type u32, type u64 } from 'ts-bin-rpc';
import { channel, stream } from 'ts-bin-rpc/server';

export interface Ctx {
  user: string | null;
}

export type Role = 'admin' | 'user';

export interface User {
  id: u32;
  name: string;
  role: Role;
  balance: u64;
  createdAt: Date;
  tags: string[];
  manager?: User | null;
}

export type Event = { type: 'login'; at: Date; user: string } | { type: 'failure'; code: u32; message: string };

const boss: User = { id: 1, name: 'Ада', role: 'admin', balance: 2n ** 60n, createdAt: new Date(Date.UTC(2020, 0, 1)), tags: ['founder'], manager: null };
const users: User[] = [
  boss,
  { id: 2, name: 'Bob', role: 'user', balance: 0n, createdAt: new Date(Date.UTC(2021, 5, 1)), tags: [], manager: boss },
  { id: 3, name: 'Chloé', role: 'user', balance: 42n, createdAt: new Date(Date.UTC(2022, 2, 3)), tags: ['ops', 'oncall'] },
];

/** A row of the streaming procedures. */
export interface Tick {
  seq: u32;
  price: f32;
  side: 'buy' | 'sell';
  venue?: string;
}

const tick = (seq: number, venue?: string): Tick => ({ seq, price: 100 + seq / 4, side: seq % 2 ? 'sell' : 'buy', ...(venue && { venue }) });

/** Streams of `forever` that are running and that have run their cleanup: tests watch disconnects. */
const streams = { running: 0, cleaned: 0 };
const quotes = channel<Tick>({ window: 5 });

export const appRouter = {
  user: {
    get: async (input: { id: u32 }): Promise<User> => {
      const user = users.find((u) => u.id === input.id);
      if (!user) throw new RpcError('NOT_FOUND', `no user ${input.id}`, { id: input.id });
      return user;
    },
    list: async (input?: { role?: Role; limit?: u32 }): Promise<User[]> =>
      users.filter((u) => !input?.role || u.role === input.role).slice(0, input?.limit ?? users.length),
    rename: async (input: { id: u32; name: string }, ctx: Ctx): Promise<void> => {
      if (!ctx.user) throw new RpcError('UNAUTHORIZED', 'sign in first');
      if (!users.some((u) => u.id === input.id)) throw new RpcError('NOT_FOUND', `no user ${input.id}`);
    },
  },
  whoami: async (_: void, ctx: Ctx): Promise<{ user: string | null }> => ({ user: ctx.user }),
  series: async (input: { n: u32 }): Promise<{ t: Float64Array; v: Float32Array }> => {
    const t = new Float64Array(input.n), v = new Float32Array(input.n);
    for (let i = 0; i < input.n; i++) {
      t[i] = 1_700_000_000_000 + i * 1000;
      v[i] = Math.sin(i / 10);
    }
    return { t, v };
  },
  events: async (): Promise<Event[]> => [
    { type: 'login', at: new Date(Date.UTC(2024, 0, 1)), user: 'Ада' },
    { type: 'failure', code: 503, message: 'upstream 🔥' },
  ],
  echo: async (input: { text: string; bytes: Uint8Array }): Promise<{ text: string; bytes: Uint8Array }> => input,
  crash: async (): Promise<string> => {
    throw new Error('secret stack details');
  },
  stream: {
    /** `n` ticks, `burst` at a time every millisecond, then the end. */
    ticks: async (input: { n: u32; burst?: u32 }) => {
      if (input.n > 100_000) throw new RpcError('BAD_INPUT', 'at most 100000 ticks');
      return stream<Tick>(
        (emit, { end }) => {
          let seq = 0;
          const timer = setInterval(() => {
            for (let k = 0; k < (input.burst ?? 10) && seq < input.n; k++) emit(tick(seq++));
            if (seq >= input.n) end();
          }, 1);
          return () => clearInterval(timer);
        },
        { window: 5 },
      );
    },
    /** One tick, then an error from the source. */
    failing: async () =>
      stream<Tick>((emit, { end }) => {
        emit(tick(0));
        const timer = setTimeout(() => end(new RpcError('UPSTREAM', 'feed lost', { retryIn: 5 })), 20);
        return () => clearTimeout(timer);
      }),
    /** Never ends; counts running streams and cleanups. */
    forever: async () =>
      stream<Tick>((emit) => {
        streams.running++;
        let seq = 0;
        const timer = setInterval(() => emit(tick(seq++)), 2);
        return () => {
          clearInterval(timer);
          streams.running--;
          streams.cleaned++;
        };
      }),
    stats: async (): Promise<{ running: u32; cleaned: u32 }> => ({ ...streams }),
    /** A topic of the `quotes` channel. */
    quotes: (input: { symbol: string }) => quotes.subscribe(input.symbol),
    /** Publishes `n` ticks to a topic; answers how many subscribers it had. */
    publish: async (input: { symbol: string; n: u32 }): Promise<{ subscribers: u32 }> => {
      const subscribers = quotes.subscribers(input.symbol);
      for (let i = 0; i < input.n; i++) quotes.publish(input.symbol, tick(i, input.symbol));
      return { subscribers };
    },
    /** An async generator streams too. */
    countdown: async function* (input: { from: u32 }) {
      for (let i = input.from; i > 0; i--) yield { left: i as u32 };
    },
  },
};
