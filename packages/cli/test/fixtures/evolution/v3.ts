// Breaking: rename without @renamedFrom, type change, required input field, new enum value and union
// variant in output, procedure removed.
import type { u16, u32 } from 'ts-bin-rpc';

type Role = 'admin' | 'user' | 'guest';
type Shape = { kind: 'circle'; r: number } | { kind: 'square'; side: number } | { kind: 'dot' };

interface User {
  id: u32;
  fullName: string;
  /** @renamedFrom mail */
  email: string;
  age: u16;
  role: Role;
  bio?: string;
  prefs?: Map<string, u32>;
}

interface NewUser {
  name: string;
  /** @renamedFrom mail */
  email: string;
  password: string;
  invite?: string;
}

export const appRouter = {
  get: async (input: { id: u32 }): Promise<User> => null!,
  list: async (input?: { limit?: u32 }): Promise<User[]> => [],
  shapes: async (): Promise<Shape[]> => [],
  signUp: async (input: NewUser): Promise<User> => null!,
};
