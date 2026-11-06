// Fixture app for end-to-end tests: every kind of procedure the protocol distinguishes.
import { RpcError, type f32, type Max, type MaxLength, type MinLength, type Pattern, type u32, type u64 } from 'ts-bin-rpc';
import { around, channel, live, middleware, query, stream, use, type Call } from 'ts-bin-rpc/server';

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

/** A row of the live state. */
export interface Unit {
  id: u32;
  name: string;
  x: number;
  y: number;
  hp: u32;
  kind: 'unit';
  target?: string | null;
  seenAt?: Date;
}

/** The live state behind `live.units`; tests change it directly. */
export const units = live<Unit>().by('id', { window: 5 });
const unit = (id: number, name = `u${id}`): Unit => ({ id, name, x: id, y: -id, hp: 100, kind: 'unit' });
/** Back to three units and no subscribers' changes pending. */
export function resetUnits() {
  units.clear();
  for (const id of [1, 2, 3]) units.set(unit(id));
}
resetUnits();

/** Streams of `forever` that are running and that have run their cleanup: tests watch disconnects. */
const streams = { running: 0, cleaned: 0 };
/** Calls that reached the queries: a cached response does not get here. */
export const queryCalls = { count: 0 };
const quotes = channel<Tick>({ window: 5 });

/** The context behind `authed`: a signed-in user. */
export type Authed = Ctx & { user: string };
const authed = middleware(({ ctx }: Call<Ctx>): Authed => {
  if (!ctx.user) throw new RpcError('UNAUTHORIZED', 'sign in first');
  return { ...ctx, user: ctx.user };
});
/** What `audited` saw of each call, oldest first. */
const audit: string[] = [];
const audited = around(async ({ path }, next) => {
  try {
    const result = await next();
    audit.push(`${path} ok`);
    return result;
  } catch (e) {
    audit.push(`${path} ${e instanceof RpcError ? e.code : 'error'}`);
    throw e;
  }
});
/** Passes a context of its own on: as a transaction would. */
const traced = around<Authed, Authed & { trace: string }>(async ({ ctx, path }, next) => next({ ...ctx, trace: `${ctx.user}@${path}` }));

export const appRouter = {
  user: {
    get: async (input: { id: u32 }): Promise<User> => {
      const user = users.find((u) => u.id === input.id);
      if (!user) throw new RpcError('NOT_FOUND', `no user ${input.id}`, { id: input.id });
      return user;
    },
    list: async (input?: { role?: Role; limit?: u32 }): Promise<User[]> =>
      users.filter((u) => !input?.role || u.role === input.role).slice(0, input?.limit ?? users.length),
    /** Users by id, `limit` at a time after the `cursor` id: the cursor of the next page in `next`. */
    page: async (input: { cursor?: u32; limit?: u32 }): Promise<{ users: User[]; next?: u32 }> => {
      const after = users.filter((u) => u.id > (input.cursor ?? 0)), page = after.slice(0, input.limit ?? 2);
      return { users: page, next: after.length > page.length ? page[page.length - 1].id : undefined };
    },
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
  /** Rules are checked on the server's inputs; the output breaks its own MaxLength, and the client lets it through. */
  rename: async (input: { name: string & MinLength<1> & MaxLength<20>; nick: (string & Pattern<'^[a-z]+$'>)[]; age: u32 & Max<150> }): Promise<{ name: string & MaxLength<3> }> => ({
    name: input.name,
  }),
  crash: async (): Promise<string> => {
    throw new Error('secret stack details');
  },
  /** Procedures behind middleware: `audited` around all, `authed` for each. */
  account: use([audited, authed], {
    // Unannotated parameters take their types from the chain: ctx is Authed, `_` is no input.
    me: async (_, ctx) => ({ name: ctx.user }),
    deposit: async (input: { amount: u32 }, ctx): Promise<{ user: string; amount: u32 }> => {
      if (input.amount === 0) throw new RpcError('BAD_INPUT', 'nothing to deposit');
      return { user: ctx.user, amount: input.amount };
    },
    trace: use([traced], {
      get: async (_, ctx) => ({ trace: ctx.trace }),
    }),
    /** A query behind middleware: private, revalidated every time. */
    profile: query(async (_, ctx) => ({ name: ctx.user, trace: false })),
    ticks: async (input: { n: u32 }, ctx: Authed) => stream<Tick>((emit, { end }) => {
      for (let i = 0; i < input.n; i++) emit(tick(i, ctx.user));
      end();
    }),
  }),
  /** Queries: GET, cacheable over HTTP. */
  catalog: query(
    {
      user: async (input: { id: u32 }): Promise<User> => {
        queryCalls.count++;
        const user = users.find((u) => u.id === input.id);
        if (!user) throw new RpcError('NOT_FOUND', `no user ${input.id}`);
        return user;
      },
      size: async (): Promise<{ users: u32 }> => (queryCalls.count++, { users: users.length }),
      /** Echoes its input: past 2 KB of base64 the client sends it by POST. */
      echo: async (input: { text: string }) => (queryCalls.count++, input),
    },
    { maxAge: 60 },
  ),
  /** How many calls reached the queries of `catalog`: cached responses do not. Not a query itself. */
  queryHits: async (): Promise<{ count: u32 }> => ({ count: queryCalls.count }),
  /** A query for shared caches. */
  version: query(async (): Promise<{ version: string }> => ({ version: '1.0' }), { public: true, maxAge: 300 }),
  /** Reads and clears what `audited` saw. */
  audit: async (): Promise<{ calls: string[] }> => ({ calls: audit.splice(0) }),
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
    /** Live state: a snapshot of every unit, then the changes. */
    units: () => units.subscribe(),
    /** The same state with a small queue: a slow client gets a fresh snapshot instead of an error. */
    unitsSmall: () => units.subscribe({ maxBuffered: 4096 }),
    /** Moves a unit, or adds it when there is none with this id. */
    move: async (input: { id: u32; x: number; y: number }): Promise<void> => {
      if (units.has(input.id)) units.update(input.id, { x: input.x, y: input.y });
      else units.set({ ...unit(input.id), x: input.x, y: input.y });
    },
    /** Removes a unit. */
    kill: async (input: { id: u32 }): Promise<{ removed: boolean }> => ({ removed: units.delete(input.id) }),
    /** An async generator streams too. */
    countdown: async function* (input: { from: u32 }) {
      for (let i = input.from; i > 0; i--) yield { left: i as u32 };
    },
  },
};
