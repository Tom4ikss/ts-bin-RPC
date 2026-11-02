// Every IR construct in both layouts: a single object (row table) and a vector of objects (columns).
import type { u8, i8, u16, i16, u32, i32, f32, u64, i64 } from 'ts-bin-rpc';

export type Color = 'red' | 'green' | 'blue';

export interface Leaf {
  label: string;
  weight?: f32;
}

export interface Node {
  name: string;
  children: Node[];
  leaf?: Leaf | null;
  tags?: string[] | null;
}

export type Event =
  | { type: 'click'; x: i16; y: i16 }
  | { type: 'key'; code: string; mods: Color[] }
  | { type: 'tick' };

export interface Everything {
  b: boolean;
  u8: u8;
  i8: i8;
  u16: u16;
  i16: i16;
  u32: u32;
  i32: i32;
  f32: f32;
  f64: number;
  u64: u64;
  i64: i64;
  when: Date;
  s: string;
  color: Color;
  bytes: Uint8Array;
  f32s: Float32Array;
  i64s: BigInt64Array;
  version: 2;
  optS?: string;
  nullS: string | null;
  bothS?: string | null;
  optU32?: u32;
  nullColor: Color | null;
  bothDate?: Date | null;
  bothBool?: boolean | null;
  nested: Leaf;
  optNested?: Leaf;
  nullNested: Leaf | null;
  bothNested?: Leaf | null;
  event: Event;
  optEvent?: Event;
  nullEvent: Event | null;
  optBytes?: Uint8Array;
  nullSeries: Float64Array | null;
  matrix: u32[][];
  words: string[][];
  blobs: Uint8Array[];
  series: Float64Array[];
  events: Event[];
  leaves: Leaf[];
  colors: Color[];
  flags: boolean[];
  dates: Date[];
  big: u64[];
  consts: 'x'[];
  optList?: u8[];
  tree: Node;
}

export const appRouter = {
  everything: async (input: Everything): Promise<Everything[]> => [input],
  events: async (input: Event[]): Promise<Event> => input[0],
  nodes: async (input: Node[]): Promise<Node[][]> => [input],
  scalar: async (input: u64): Promise<Date[]> => [],
  text: async (input: string): Promise<'ok'> => 'ok',
  bytes: async (input: Uint8Array): Promise<Float32Array> => new Float32Array(),
  color: async (input: Color): Promise<Color[][]> => [],
};
