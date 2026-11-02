// Safe: optional field added, optional field removed, renames marked with @renamedFrom, input field made
// optional, procedure added.
import type { u8, u32 } from 'ts-bin-rpc';

type Role = 'admin' | 'user';
type Shape = { kind: 'circle'; r: number } | { kind: 'square'; side: number };

interface User {
  id: u32;
  name: string;
  /** @renamedFrom mail */
  email: string;
  age: u8;
  role: Role;
  bio?: string;
}

interface NewUser {
  name: string;
  /** @renamedFrom mail */
  email: string;
  invite?: string;
}

export const appRouter = {
  get: async (input: { id: u32 }): Promise<User> => null!,
  create: async (input: NewUser): Promise<User> => null!,
  list: async (input?: { limit?: u32 }): Promise<User[]> => [],
  shapes: async (): Promise<Shape[]> => [],
};
