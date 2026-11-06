// Source types the generated Contract must accept as they are written.
import type { u32 } from 'ts-bin-rpc';

export type Color = 'red' | 'green';

export interface Item {
  a?: string;
  b: string | undefined;
  c: string | null | undefined;
  ids: readonly u32[];
  pair: readonly [u32, string];
  color: Color;
  colors: Color[];
  tags: ReadonlyArray<string>;
}

export const appRouter = {
  item: async (input: { b: string | undefined; ids: readonly u32[] }): Promise<Item> => null!,
};
