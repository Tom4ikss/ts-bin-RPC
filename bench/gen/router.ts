// Contract of the generated-code benchmark: the same users as bench/lib/data.mjs.
import type { f32, u8, u32 } from 'ts-bin-rpc';

export interface User {
  id: u32;
  score: number;
  age: u8;
  isActive: boolean;
  name: string;
  email: string;
  city: string;
}

/** Rows inside an object: decode reads the array through the table. */
export interface Page {
  users: User[];
  total: u32;
}

/** Text-heavy rows: a description of 12–52 words. */
export interface Product {
  id: u32;
  title: string;
  description: string;
  price: number;
  stock: u32;
  tags: string[];
}

/** A numeric series as typed-array columns. */
export interface Series {
  t: Float64Array;
  x: Float32Array;
  y: Float32Array;
  v: Float32Array;
}

/** One trade in a market feed: the unit of a stream. */
export interface Tick {
  t: number;
  price: f32;
  size: u32;
  side: 'buy' | 'sell';
}

export const appRouter = {
  users: async (): Promise<User[]> => [],
  user: async (): Promise<User> => null!,
  page: async (): Promise<Page> => null!,
  products: async (): Promise<Product[]> => [],
  series: async (): Promise<Series> => null!,
  tick: async (): Promise<Tick> => null!,
  ticks: async (): Promise<Tick[]> => [],
};
