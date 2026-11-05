import type { u32 } from 'ts-bin-rpc';
import type { LiveStream } from 'ts-bin-rpc/server';

interface Unit {
  id: u32;
  /** @renamedFrom name */
  title: string;
  x: number;
  kind: 'unit';
  target?: string | null;
}

interface Account {
  login: 'ada' | 'bob';
  balance: u32;
}

export const appRouter = {
  units: (): LiveStream<Unit, 'id'> => null!,
  team: async (input: { team: string }): Promise<LiveStream<Unit, 'id'>> => null!,
  accounts: (): LiveStream<Account, 'login'> => null!,
};
