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

// Validation rules, checked by the server when it decodes a procedure's input. Like brands, they
// are optional symbol-keyed properties: any string fits `string & MaxLength<64>` for the type
// checker, and the codegen reads the literals. Combine them with `&`.
export declare const tbrRule: unique symbol;
type Rule<R> = { readonly [tbrRule]?: R };

/** At least `N`, inclusive. On numeric brands, `number` and `bigint`. NaN breaks it. */
export type Min<N extends number | bigint> = Rule<{ readonly min: N }>;
/** At most `N`, inclusive. On numeric brands, `number` and `bigint`. NaN breaks it. */
export type Max<N extends number | bigint> = Rule<{ readonly max: N }>;
/** At least `N` long: UTF-16 code units of a string (its `length`), elements of an array. */
export type MinLength<N extends number> = Rule<{ readonly minLength: N }>;
/** At most `N` long: UTF-16 code units of a string (its `length`), elements of an array. */
export type MaxLength<N extends number> = Rule<{ readonly maxLength: N }>;
/** A string matching the regular expression `P` (source text, no flags; anchor it with `^…$`). */
export type Pattern<P extends string> = Rule<{ readonly pattern: P }>;
