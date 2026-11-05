import type { u8, u32 } from 'ts-bin-rpc';

type Role = 'admin' | 'user';
type Shape = { kind: 'circle'; r: number } | { kind: 'square'; side: number };

interface User {
  id: u32;
  name: string;
  mail: string;
  age: u8;
  role: Role;
  nick?: string;
  prefs?: Record<string, string>;
}

interface NewUser {
  name: string;
  mail: string;
  invite: string;
}

export const appRouter = {
  get: async (input: { id: u32 }): Promise<User> => null!,
  create: async (input: NewUser): Promise<User> => null!,
  shapes: async (): Promise<Shape[]> => [],
};
