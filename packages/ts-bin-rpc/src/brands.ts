// Numeric brands. The optional symbol-keyed property keeps plain literals assignable
// (`{ id: 1 }` fits `u32`) and stays out of autocomplete; the codegen reads the literal
// to pick the wire width. Ranges are checked by the encoder, not by the type system.
export declare const tbr: unique symbol;

export type u8 = number & { readonly [tbr]?: 'u8' };
export type i8 = number & { readonly [tbr]?: 'i8' };
export type u16 = number & { readonly [tbr]?: 'u16' };
export type i16 = number & { readonly [tbr]?: 'i16' };
export type u32 = number & { readonly [tbr]?: 'u32' };
export type i32 = number & { readonly [tbr]?: 'i32' };
export type f32 = number & { readonly [tbr]?: 'f32' };
export type f64 = number & { readonly [tbr]?: 'f64' };
export type u64 = bigint & { readonly [tbr]?: 'u64' };
export type i64 = bigint & { readonly [tbr]?: 'i64' };
