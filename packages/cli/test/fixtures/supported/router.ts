import type { u8, u32, i64, f32 } from 'ts-bin-rpc';

export type Role = 'admin' | 'user' | 'guest';

export interface Address {
  city: string;
  zip?: string;
  verified?: boolean;
}

// Пользователь: кириллица проверяет, что позиции считаются в символах UTF-16, а не в байтах.
export interface User {
  id: u32;
  name: string;
  /** @renamedFrom mail */
  email: string;
  age: u8;
  score: number;
  balance: i64;
  isActive: boolean;
  role: Role;
  createdAt: Date;
  avatar: Uint8Array | null;
  address?: Address;
  tags: string[];
  manager: User | null;
  meta: { source: 'web' | 'app'; version: u32 };
}

export interface Page<T> {
  items: T[];
  total: u32;
}

export type Shape =
  | { kind: 'circle'; r: f32 }
  | { kind: 'rect'; w: f32; h: f32 };

export interface Series {
  ts: Float64Array;
  values: Float32Array;
}

type Ctx = { userId: string };

export const appRouter = {
  health: async () => 'ok' as const,
  ping: async (): Promise<void> => {},
  user: {
    get: async (input: { id: u32 }, _ctx: Ctx): Promise<User> => null!,
    list: async (input?: { limit?: u32; role?: Role }): Promise<Page<User>> => null!,
    rename: async (input: { id: u32; name: string }): Promise<void> => {},
  },
  shapes: async (): Promise<Shape[]> => [],
  series: async (input: { from: Date; to: Date }): Promise<Series> => null!,
};
