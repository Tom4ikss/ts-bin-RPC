import type { f64, u32 } from 'ts-bin-rpc';
import { query, type Stream } from 'ts-bin-rpc/server';

interface Tick {
  seq: u32;
  price: f64;
}

export const appRouter = {
  feed: query(async (input: { symbol: string }): Promise<Stream<Tick>> => null!),
};
