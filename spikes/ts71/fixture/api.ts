declare const kind: unique symbol;
export type u32 = number & { readonly [kind]?: 'u32' };
export type f32 = number & { readonly [kind]?: 'f32' };
export type u64 = bigint & { readonly [kind]?: 'u64' };
export type i32 = number;            // plain alias: expected to be indistinguishable
export type UserId = u32;            // alias of a brand

export interface Point { x: f32; y: f32 }
export interface User {
  id: UserId;
  score: f32;
  big: u64;
  plain: i32;
  name: string;
  email?: string;
  role: 'admin' | 'user';
  tags: string[];
  pos: Point;
  shape: { kind: 'circle'; r: f32 } | { kind: 'rect'; w: f32; h: f32 };
}
