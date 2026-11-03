import type { f64, u32 } from 'ts-bin-rpc';
import type { Stream } from 'ts-bin-rpc/server';

interface Tick {
  seq: u32;
  price: f64;
}

export const appRouter = {
  feed: async (input: { symbol: string }): Promise<Stream<Tick>> => null!,
  plain: (): Stream<Tick> => null!,
  generator: async function* (): AsyncGenerator<{ left: u32 }> {},
  iterable: async (): Promise<AsyncIterable<string>> => null!,
  web: async (): Promise<ReadableStream<Tick>> => null!,
  last: async (): Promise<Tick> => null!,
};
