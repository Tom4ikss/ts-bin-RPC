// Playground. Two terminals: `pnpm watch` regenerates tbr.lock.json and src/tbr.gen.ts when this file
// changes, `pnpm serve` runs the server (restarts on changes) at http://localhost:3000.
// Then: `pnpm client`, or open http://localhost:3000 and use `api` in the browser console.
// `pnpm ir` prints the schema, `pnpm check` classifies changes against the lockfile.
import { RpcError, type u8, type u32, type f32 } from 'ts-bin-rpc';

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

export type Ctx = { userId: string | null };

const users: User[] = [
  { id: 1, name: 'Ада', email: 'ada@example.com', age: 36, role: 'admin', createdAt: new Date('2020-01-01'), avatar: null, tags: ['math'] },
  { id: 2, name: 'Bob', email: 'bob@example.com', age: 29, role: 'user', createdAt: new Date('2022-06-15'), avatar: new Uint8Array([1, 2, 3]), tags: [] },
  { id: 3, name: 'Chloé', email: 'chloe@example.com', age: 41, role: 'guest', createdAt: new Date('2024-03-03'), avatar: null, tags: ['ops'] },
];

export const appRouter = {
  user: {
    get: async (input: { id: u32 }, ctx: Ctx): Promise<User> => {
      if (!ctx.userId) throw new RpcError('UNAUTHORIZED', 'send an authorization header');
      const user = users.find((u) => u.id === input.id);
      if (!user) throw new RpcError('NOT_FOUND', `no user ${input.id}`, { id: input.id });
      return user;
    },
    list: async (input?: { limit?: u32; role?: Role }): Promise<User[]> =>
      users.filter((u) => !input?.role || u.role === input.role).slice(0, input?.limit ?? users.length),
  },
  shapes: async (): Promise<Shape[]> => [
    { kind: 'circle', r: 1.5 },
    { kind: 'rect', w: 2, h: 3 },
  ],
  telemetry: async (): Promise<{ ts: Float64Array; values: Float32Array }> => {
    const n = 100_000;
    const ts = new Float64Array(n), values = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ts[i] = Date.now() + i;
      values[i] = Math.sin(i / 100);
    }
    return { ts, values };
  },
};
