// v1 with a procedure first in the router, and in sorted order, that reaches the same anonymous types.
import type { u32 } from 'ts-bin-rpc';

interface Tick {
  side: 'buy' | 'sell';
  at: { day: u32 };
}

interface User {
  id: u32;
  name: string;
}

interface Post {
  id: u32;
  title: string;
}

type Page<T> = { items: T[]; next?: u32 };

export const appRouter = {
  aPick: async (input: { side: 'buy' | 'sell'; at: { day: u32 } }): Promise<void> => {},
  posts: async (): Promise<Page<Post>> => null!,
  ticks: async (): Promise<Tick[]> => [],
  users: async (): Promise<Page<User>> => null!,
  patchPost: async (input: Partial<Post>): Promise<void> => {},
  patchUser: async (input: Partial<User>): Promise<void> => {},
};
