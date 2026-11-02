// Playground: edit the types, `pnpm watch` regenerates tbr.lock.json and src/tbr.gen.ts on every save;
// `pnpm ir` prints the schema, `pnpm check` classifies changes against the lockfile, `pnpm demo` runs src/demo.ts.
import type { u8, u32, f32 } from 'ts-bin-rpc';

export type Role = 'admin' | 'user' | 'guest';

export interface User {
  id: u32;
  name: string;
  email: string;
  age: u8;
  role: Role;
  createdAt: Date;
  avatar: Uint8Array | null;
  tags: string[];
}

export type Shape =
  | { kind: 'circle'; r: f32 }
  | { kind: 'rect'; w: f32; h: f32 };

type Ctx = { userId: string };

export const appRouter = {
  user: {
    get: async (input: { id: u32 }, _ctx: Ctx): Promise<User> => null!,
    list: async (input?: { limit?: u32; role?: Role }): Promise<User[]> => [],
  },
  shapes: async (): Promise<Shape[]> => [],
  telemetry: async (): Promise<{ ts: Float64Array; values: Float32Array }> => null!,
};


appRouter.user.get({id: 2000}, {userId: "dsc"})
