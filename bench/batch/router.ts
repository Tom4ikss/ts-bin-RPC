// The router of the batching bench: a quote that takes `delay` ms, as a call to a database would.
import type { f64, u32 } from 'ts-bin-rpc';

export interface Quote {
  symbol: string;
  bid: f64;
  ask: f64;
  at: f64;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const appRouter = {
  quote: async (input: { symbol: string; delay: u32 }): Promise<Quote> => {
    if (input.delay) await sleep(input.delay);
    const bid = 100 + (input.symbol.charCodeAt(0) % 7);
    return { symbol: input.symbol, bid: bid as f64, ask: (bid + 0.01) as f64, at: Date.now() as f64 };
  },
};
