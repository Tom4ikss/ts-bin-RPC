import type { u32 } from 'ts-bin-rpc';
import type { Item as OtherItem } from './other.ts';

interface Item {
  title: string;
}

interface Bad {
  a: unknown;
  b: any;
  c: () => void;
  d: [number, string];
  e: Record<string, number>;
  f: Map<string, number>;
  g: Set<string>;
  h: { x: u32 } | { y: string };
  i: string | number;
  j: 1 | 2 | 3;
  k: symbol;
  l: object;
  m: (string | null)[];
  n: Promise<string>;
  method(): void;
}

function overloaded(input: { a: string }): Promise<void>;
function overloaded(input: { b: string }): Promise<void>;
async function overloaded(_input: unknown): Promise<void> {}

export const appRouter = {
  bad: async (): Promise<Bad> => null!,
  collide: async (input: { a: Item; b: OtherItem }): Promise<void> => {},
  overloaded,
  tooMany: async (a: string, b: string, c: string) => {},
  maybe: async (): Promise<string | null> => null,
  nullInput: async (input: string | null) => {},
  version: 1,
};
