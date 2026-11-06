// Column encodings of a list of objects: packed columns of fields with absent rows, delta columns,
// and scaled numbers anywhere.
import type { Delta, i16, i32, i64, Max, Min, MinLength, Scale, u16, u32, u8 } from 'ts-bin-rpc';

export interface Row {
  id: u32;
  x?: number;
  hp?: u8 | null;
  at?: Date;
  ok?: boolean | null;
  big?: i64;
  side?: 'buy' | 'sell';
  level?: u32 & Min<10>;
  name?: string;
  tag?: (string & MinLength<2>) | null;
}

export interface Tick {
  seq: u32 & Delta;
  t: Date & Delta;
  price: i32 & Scale<100> & Delta;
  size: u16 & Delta;
  bid?: (i32 & Scale<100> & Delta) | null;
  level?: i16 & Scale<10> & Min<-5> & Max<5>;
}

export interface Quote {
  bid: i32 & Scale<100>;
  ask?: (i16 & Scale<4>) | null;
  steps: (u16 & Scale<4>)[];
}

export const appRouter = {
  rows: async (rows: Row[]): Promise<Row[]> => rows,
  ticks: async (ticks: Tick[]): Promise<Tick[]> => ticks,
  quote: async (q: Quote): Promise<Quote> => q,
  price: async (p: i32 & Scale<100>): Promise<i32 & Scale<100>> => p,
};
