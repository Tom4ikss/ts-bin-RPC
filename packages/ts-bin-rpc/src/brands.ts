// Numeric brands. The optional symbol-keyed property keeps plain literals assignable
// (`{ id: 1 }` fits `u32`) and stays out of autocomplete; the codegen reads the literal
// to pick the wire width. Ranges are checked by the encoder, not by the type system.
export declare const tbr: unique symbol;
// A named type, so that hovers keep it: `u32 & Min<1>` shows as `number & Wire<"u32"> & Min<1>`,
// where an inline `{ readonly [tbr]?: 'u32' }` would be spelled out.
type Wire<W extends string> = { readonly [tbr]?: W };

export type u8 = number & Wire<'u8'>;
export type i8 = number & Wire<'i8'>;
export type u16 = number & Wire<'u16'>;
export type i16 = number & Wire<'i16'>;
export type u32 = number & Wire<'u32'>;
export type i32 = number & Wire<'i32'>;
export type f32 = number & Wire<'f32'>;
export type f64 = number & Wire<'f64'>;
export type u64 = bigint & Wire<'u64'>;
export type i64 = bigint & Wire<'i64'>;

// Validation rules, checked by the server when it decodes a procedure's input. Like brands, they
// are optional symbol-keyed properties: any string fits `string & MaxLength<64>` for the type
// checker, and the codegen reads the literals. Combine them with `&`.
export declare const tbrRule: unique symbol;
// `| object` lets any rule be assigned to any other: `string & MinLength<1>` from an input goes into
// an output field of `string & MaxLength<64>` without a cast. Rules are checked at run time, not by
// the types. The union keeps `R` for tbr generate to read.
type Rule<R> = { readonly [tbrRule]?: R | object };

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
/**
 * A named check the server runs on the decoded value, for what `Min`… cannot say. On any type,
 * objects included. Its implementation goes to `createHandler({ checks: { [name]: … } })`:
 * a function returning `true`, `false` or an error message, or a Standard Schema.
 */
export type Check<Name extends string> = Rule<{ readonly check: Name }>;

/** `name@domain.tld`, checked by `formats.email` from `ts-bin-rpc/formats`. */
export type Email = string & Check<'email'>;
/** `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` in hex, any version, checked by `formats.uuid`. */
export type Uuid = string & Check<'uuid'>;
/** An absolute URL that `new URL()` accepts, checked by `formats.url`. */
export type Url = string & Check<'url'>;
/** A calendar date, `YYYY-MM-DD`, checked by `formats.isoDate`. */
export type IsoDate = string & Check<'isoDate'>;
/** A date and time with an offset (RFC 3339), `2026-11-04T18:00:00Z`, checked by `formats.isoDateTime`. */
export type IsoDateTime = string & Check<'isoDateTime'>;

// Encodings: how a value goes on the wire, read by tbr generate like the rules. Like rules, any value
// fits them for the type checker.
export declare const tbrEnc: unique symbol;
type Enc<E> = { readonly [tbrEnc]?: E | object };

/**
 * A number stored as the integer `Math.round(value * N)` in the integer brand it goes with:
 * `i32 & Scale<100>` keeps two decimals in 4 bytes, `i16 & Scale<100>` coordinates of ±327 in 2.
 * Reads give `raw / N`. `N` is a positive integer; values out of the brand's range are an encoder error.
 */
export type Scale<N extends number> = Enc<{ readonly scale: N }>;
/**
 * In an array of objects, the field's column is sent as its first value and the differences
 * between neighbours, in 1, 2 or 4 bytes each, when that is smaller. For integer brands (8–32 bit),
 * scaled ones and `Date`; sorted or slowly changing values: time stamps, sequence numbers, prices.
 */
export type Delta = Enc<{ readonly delta: true }>;

