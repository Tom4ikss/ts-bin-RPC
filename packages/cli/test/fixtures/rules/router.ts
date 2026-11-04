// Validation rules in every place they can go: table fields, columns of a list of objects, nested
// lists, typed arrays and the root of an input.
import type { i64, Max, MaxLength, Min, MinLength, Pattern, u32, u64, u8 } from 'ts-bin-rpc';

export type Slug = string & MinLength<2> & MaxLength<8> & Pattern<'^[a-z-]+$'>;

export interface Member {
  name: string & MinLength<1>;
  age?: u8 & Min<18> & Max<120>;
  balance: i64 & Min<-1000> & Max<1000>;
  score: number & Min<0> & Max<1>;
  tags: Slug[] & MaxLength<3>;
  note: (string & MaxLength<4>) | null;
}

export interface Signup {
  email: string & Pattern<'^[^@]+@[^@]+$'>;
  members: Member[] & MinLength<1>;
  matrix: (u32 & Max<9>)[][] & MaxLength<2>;
  key: Uint8Array & MinLength<4> & MaxLength<4>;
  limit: u64 & Max<10000000000000000000n>;
}

export const appRouter = {
  signup: async (input: Signup): Promise<Member> => input.members[0],
  count: async (input: u32 & Min<1> & Max<10>): Promise<void> => {},
  slugs: async (input: Slug[]): Promise<void> => {},
};
