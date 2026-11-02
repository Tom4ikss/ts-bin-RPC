import type { User, u32 } from './api.ts';

// Plain async functions: no schemas, no validators, no builder chain.
export const appRouter = {
  user: {
    get: async (input: { id: u32 }): Promise<User> => ({} as User),
    list: async (input: { limit: u32; cursor?: string }): Promise<User[]> => [],
  },
  health: async (): Promise<{ ok: boolean }> => ({ ok: true }),
};
export type AppRouter = typeof appRouter;
