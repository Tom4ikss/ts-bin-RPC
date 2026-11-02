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

export const appRouter = {
  users: async (): Promise<User[]> => [],
  user: async (): Promise<User> => null!,
};
