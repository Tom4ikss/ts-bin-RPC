// Names of anonymous types come from their place in the contract, not from the order of procedures.
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
  ticks: async (): Promise<Tick[]> => [],
  users: async (): Promise<Page<User>> => null!,
  posts: async (): Promise<Page<Post>> => null!,
  patchUser: async (input: Partial<User>): Promise<void> => {},
  patchPost: async (input: Partial<Post>): Promise<void> => {},
};
