import type { Check, Max, MaxLength, Min, MinLength, Pattern, u32, u64 } from 'ts-bin-rpc';
import type { Item as OtherItem } from './other.ts';

interface Item {
  title: string;
}

interface Bad {
  a: unknown;
  b: any;
  c: () => void;
  d: [number, string?];
  e: Record<number, string>;
  f: Map<Date, number>;
  g: Set<string>;
  h: { x: u32 } | { y: string };
  i: string | number;
  j: 1 | 2 | 3;
  k: symbol;
  l: object;
  m: (string | null)[];
  n: Promise<string>;
  method(): void;
  o: { [k: string]: string; id: string };
  p: Record<string, string | null>;
  q: [string, ...u32[]];
  r: [];
  s: Nested;
}

type Nested = [string, Nested[]];

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
  badRules: async (input: BadRules) => {},
  version: 1,
};

export interface BadRules {
  a: string & Min<1>;
  b: u32 & MinLength<1>;
  c: u32 & Pattern<'x'>;
  d: string & Pattern<'('>;
  e: u32 & Min<5> & Max<1>;
  f: string & MinLength<3> & MaxLength<1>;
  g: u32 & Min<number>;
  h: string & MinLength<-1>;
  i: Item & MaxLength<1>;
  j: boolean & Max<1>;
  k: u64 & Min<0.5>;
  l: string & Check<string>;
  m: string & Check<'not-a-name'>;
}
