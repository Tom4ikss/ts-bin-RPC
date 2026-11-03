// Contract of the generated-code benchmark: the same users as bench/lib/data.mjs.
import type { u8, u32 } from 'ts-bin-rpc';

export interface User {
  id: u32;
  score: number;
  age: u8;
  isActive: boolean;
  name: string;
  email: string;
  city: string;
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

export const appRouter = {
  users: async (): Promise<User[]> => [],
  user: async (): Promise<User> => null!,
  products: async (): Promise<Product[]> => [],
  series: async (): Promise<Series> => null!,
};
