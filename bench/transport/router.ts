// The feed of the transport bench: the same ticks for ts-bin-rpc streams, NDJSON and SSE.
import type { f32, f64, u32 } from 'ts-bin-rpc';
import { stream } from 'ts-bin-rpc/server';

export interface Tick {
  /** Send time, ms since the epoch with a fraction: the client subtracts it from its own clock. */
  t: f64;
  price: f32;
  size: u32;
  side: 'buy' | 'sell';
}

export interface Feed {
  n: u32;
  /** Ticks per second; 0 is as fast as the server can make them. */
  rate: u32;
  /** Batch window of the ts-bin-rpc stream, ms; 0 sends at the end of each event loop task. */
  window: u32;
}

const now = () => performance.timeOrigin + performance.now();

/**
 * Makes `n` ticks at `rate` per second: on a 1 ms timer, every tick that is due; at rate 0, bursts of
 * 1000 per macrotask. `flush` runs after each timer tick or burst, so line-based transports write
 * once per event loop task, not once per tick. Returns the cleanup.
 */
export function produce(feed: Feed, emit: (t: Tick) => void, flush: () => void, end: () => void): () => void {
  let seq = 0;
  const start = performance.now();
  const step = () => {
    const due = feed.rate ? Math.min(feed.n, Math.floor(((performance.now() - start) * feed.rate) / 1000) + 1) : Math.min(feed.n, seq + 1000);
    for (; seq < due; seq++) emit({ t: now(), price: (100 + (seq % 50) / 8) as f32, size: (seq % 1000) as u32, side: seq & 1 ? 'sell' : 'buy' });
    flush();
    if (seq >= feed.n) {
      stop();
      end();
    }
  };
  let timer: ReturnType<typeof setInterval> | ReturnType<typeof setImmediate> | undefined;
  const stop = () => {
    if (feed.rate) clearInterval(timer as ReturnType<typeof setInterval>);
    else clearImmediate(timer as ReturnType<typeof setImmediate>);
    timer = undefined;
  };
  if (feed.rate) timer = setInterval(step, 1);
  else {
    const loop = () => {
      step();
      if (timer !== undefined) timer = setImmediate(loop);
    };
    timer = setImmediate(loop);
  }
  return stop;
}

export const appRouter = {
  feed: async (input: Feed) => stream<Tick>((emit, { end }) => produce(input, emit, () => {}, end), { window: input.window }),
};
