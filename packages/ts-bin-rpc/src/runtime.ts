// Runtime of generated codecs, wire format v0 (docs/FORMAT.md): message writer, lazy reader, column
// accessors and the verifier. Generated code calls into this module; nothing here knows user types.

if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('ts-bin-rpc needs a little-endian platform');

export const VERSION = 0;
export const FLAG_STRINGS = 1;
export const FLAG_ERROR = 2;
export const COL_OPTIONAL = 1;
export const COL_NULLABLE = 2;

export interface Limits {
  maxBytes: number;
  maxDepth: number;
  /** Tables and vector elements the verifier may visit: bounds the work for reused offsets. */
  maxNodes: number;
}

export const DEFAULT_LIMITS: Limits = { maxBytes: 64 * 1024 * 1024, maxDepth: 64, maxNodes: 16 * 1024 * 1024 };

export class EncodeError extends TypeError {
  override name = 'EncodeError';
  /** Where in the value: `[17].manager.age`; empty for the value itself. Set by Codec.encode. */
  path?: string;
}

export class VerifyError extends Error {
  override name = 'VerifyError';
  readonly code = 'BAD_INPUT';
}

export function bad(expected: string, got: unknown): never {
  throw new EncodeError(`expected ${expected}, got ${show(got)}`);
}

function show(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v.length > 40 ? v.slice(0, 40) + '…' : v);
  if (typeof v === 'bigint') return `${v}n`;
  if (v === null || typeof v !== 'object') return String(v);
  return Array.isArray(v) ? 'array' : (v.constructor?.name ?? 'object');
}

export function align(x: number, a: number): number {
  const r = x % a;
  return r === 0 ? x : x + a - r;
}

export function bit(b: Uint8Array, off: number, i: number): boolean {
  return (b[off + (i >>> 3)] & (1 << (i & 7))) !== 0;
}

/** Index of each row among the rows that hold a value (present and not null); -1 for the others. */
export function ranks(b: Uint8Array, pres: number, nul: number, n: number): Int32Array {
  const out = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) out[i] = (pres < 0 || bit(b, pres, i)) && (nul < 0 || !bit(b, nul, i)) ? k++ : -1;
  return out;
}

let scratch = new Int32Array(48);

/**
 * Column set of an object vector (FORMAT §6): `spec` holds `[fieldId, align, flags]` per field, flags bit 0 for
 * optional, bit 1 for nullable. Returns `[data, presence, null]` offsets per field, at the field's spec index;
 * -1 where the column or bitmap is absent. Columns of unknown fields are skipped.
 * The result is a shared buffer, valid until the next call: read it before constructing nested columns.
 */
export function catalog(dv: DataView, vec: number, spec: readonly number[]): Int32Array {
  const n = dv.getUint32(vec, true), nc = dv.getUint16(vec + 4, true), nb = (n + 7) >>> 3;
  if (scratch.length < spec.length) scratch = new Int32Array(spec.length);
  const out = scratch.fill(-1, 0, spec.length);
  for (let j = 0; j < nc; j++) {
    const e = vec + 8 + 8 * j, id = dv.getUint16(e, true), fl = dv.getUint16(e + 2, true);
    let k = 0;
    while (k < spec.length && spec[k] !== id) k += 3;
    if (k === spec.length) continue;
    let o = dv.getUint32(e + 4, true);
    if (fl & 1) (out[k + 1] = o), (o += nb);
    if (fl & 2) (out[k + 2] = o), (o += nb);
    out[k] = align(o, spec[k + 1]);
  }
  return out;
}

export type { u8, i8, u16, i16, u32, i32, f32, f64, u64, i64 } from './brands.ts';
export type { Expect, Same, InputOf, InputOptional, OutputOf, ProcedurePath, StreamItemOf, Columns } from './router.ts';
export { subscribe } from './stream-client.ts';
import type { Columns } from './router.ts';

/** `console.log(view)` in Node prints the plain value instead of view internals. */
export const INSPECT: unique symbol = Symbol.for('nodejs.util.inspect.custom') as never;

/** Views implement `[PLAIN]()`: a deep copy made of plain objects. */
export const PLAIN: unique symbol = Symbol.for('ts-bin-rpc.plain') as never;

/** Deep copy of a value returned by a view: plain objects, arrays, fresh dates and typed arrays. */
export function toPlain<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(toPlain) as T;
  if (PLAIN in v) return (v as { [PLAIN](): T })[PLAIN]();
  if (v instanceof Date) return new Date(v.getTime()) as T;
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return (v as unknown as TypedArray).slice() as T;
  return v;
}

/** Memo slot marker for lazily computed view fields whose value may itself be `undefined`. */
export const UNSET: unique symbol = Symbol('unset');

/** Column set behind an array of row views: generated code registers it when it reads a vector of objects. */
export const COLUMN_SETS: WeakMap<object, { columns(): Record<string, ArrayBufferView | undefined> }> = new WeakMap();

/**
 * Required numeric, boolean and Date fields of an array of row views as typed arrays over the
 * message, without copying. `undefined` for arrays that are not views (plain objects, toPlain).
 */
export function columnsOf<T>(rows: readonly T[]): Partial<Columns<T>> | undefined {
  return COLUMN_SETS.get(rows)?.columns() as Partial<Columns<T>> | undefined;
}

export type TypedArray =
  | Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array
  | Float32Array | Float64Array | BigUint64Array | BigInt64Array;

export type TypedCtor =
  | Uint8ArrayConstructor | Int8ArrayConstructor | Uint16ArrayConstructor | Int16ArrayConstructor
  | Uint32ArrayConstructor | Int32ArrayConstructor | Float32ArrayConstructor | Float64ArrayConstructor
  | BigUint64ArrayConstructor | BigInt64ArrayConstructor;

type View<C extends TypedCtor> = InstanceType<C>;

function makeTyped<C extends TypedCtor>(ctor: C, buffer: ArrayBufferLike, off: number, n: number): View<C> {
  return new (ctor as unknown as new (b: ArrayBufferLike, o: number, n: number) => View<C>)(buffer, off, n);
}

const ASCII = /^[\x00-\x7f]*$/;
function isAscii(s: string): boolean {
  return ASCII.test(s);
}

const textEncoder = new TextEncoder();
const asciiDecoder = new TextDecoder('utf-8');
const utf16Decoder = new TextDecoder('utf-16le');
const utf16StrictDecoder = new TextDecoder('utf-16le', { fatal: true });

// ---------------------------------------------------------------------------------------------- writer

/**
 * Forward-only message writer. Positions returned by `alloc` stay valid when the buffer grows; `buf`
 * and `dv` do not, so callers re-read them after anything that may allocate.
 */
export class Writer {
  buf: Uint8Array<ArrayBuffer>;
  dv: DataView;
  pos: number;
  readonly strings: boolean;
  #ascii: string[] = [];
  #asciiLen = 0;
  #utf16: string[] = [];
  #utf16Len = 0;
  #vtables = new Map<number, number>();

  constructor(strings: boolean, capacity = 256) {
    this.buf = new Uint8Array(capacity);
    this.dv = new DataView(this.buf.buffer);
    this.strings = strings;
    this.pos = strings ? 24 : 8;
  }

  /** Reserves `size` zeroed bytes at the next position p with p % align === phase. */
  alloc(size: number, align: number, phase = 0): number {
    const p = this.pos + ((phase - this.pos) & (align - 1));
    const end = p + size;
    if (end > this.buf.length) this.#grow(end);
    this.pos = end;
    return p;
  }

  #grow(min: number) {
    if (min > DEFAULT_LIMITS.maxBytes) throw new EncodeError(`message exceeds ${DEFAULT_LIMITS.maxBytes} bytes`);
    const next = new Uint8Array(Math.max(min, this.buf.length * 2));
    next.set(this.buf);
    this.buf = next;
    this.dv = new DataView(next.buffer);
  }

  vtable(key: number): number {
    return this.#vtables.get(key) ?? -1;
  }

  setVtable(key: number, at: number) {
    this.#vtables.set(key, at);
  }

  // Raw stores: positions and values come from generated code.
  ru8(at: number, v: number) { this.buf[at] = v; }
  ru16(at: number, v: number) { this.dv.setUint16(at, v, true); }
  ru32(at: number, v: number) { this.dv.setUint32(at, v, true); }
  ri32(at: number, v: number) { this.dv.setInt32(at, v, true); }

  // Checked stores: values come from the user.
  bool(at: number, v: boolean) {
    if (v !== true && v !== false) bad('boolean', v);
    this.buf[at] = v ? 1 : 0;
  }
  u8(at: number, v: number) {
    if (typeof v !== 'number' || (v & 0xff) !== v) bad('u8', v);
    this.buf[at] = v;
  }
  i8(at: number, v: number) {
    if (typeof v !== 'number' || (v << 24) >> 24 !== v) bad('i8', v);
    this.dv.setInt8(at, v);
  }
  u16(at: number, v: number) {
    if (typeof v !== 'number' || (v & 0xffff) !== v) bad('u16', v);
    this.dv.setUint16(at, v, true);
  }
  i16(at: number, v: number) {
    if (typeof v !== 'number' || (v << 16) >> 16 !== v) bad('i16', v);
    this.dv.setInt16(at, v, true);
  }
  u32(at: number, v: number) {
    if (typeof v !== 'number' || v >>> 0 !== v) bad('u32', v);
    this.dv.setUint32(at, v, true);
  }
  i32(at: number, v: number) {
    if (typeof v !== 'number' || (v | 0) !== v) bad('i32', v);
    this.dv.setInt32(at, v, true);
  }
  f32(at: number, v: number) {
    if (typeof v !== 'number') bad('number', v);
    this.dv.setFloat32(at, v, true);
  }
  f64(at: number, v: number) {
    if (typeof v !== 'number') bad('number', v);
    this.dv.setFloat64(at, v, true);
  }
  u64(at: number, v: bigint) {
    if (typeof v !== 'bigint' || BigInt.asUintN(64, v) !== v) bad('u64', v);
    this.dv.setBigUint64(at, v, true);
  }
  i64(at: number, v: bigint) {
    if (typeof v !== 'bigint' || BigInt.asIntN(64, v) !== v) bad('i64', v);
    this.dv.setBigInt64(at, v, true);
  }
  ts(at: number, v: Date) {
    if (!(v instanceof Date)) bad('Date', v);
    this.dv.setFloat64(at, v.getTime(), true);
  }

  /** String reference in a table slot: u32 start, u32 (len << 1) | block. */
  str(at: number, s: string) {
    if (typeof s !== 'string') bad('string', s);
    const n = s.length;
    if (isAscii(s)) {
      this.dv.setUint32(at, this.#asciiLen, true);
      this.dv.setUint32(at + 4, n * 2, true);
      this.#ascii.push(s);
      this.#asciiLen += n;
    } else {
      if (!s.isWellFormed()) bad('a string without lone surrogates', s);
      this.dv.setUint32(at, this.#utf16Len, true);
      this.dv.setUint32(at + 4, n * 2 + 1, true);
      this.#utf16.push(s);
      this.#utf16Len += n;
    }
  }

  /** String column body: u32 asciiBase, u32 utf16Base, u32 ref per row (length or back-reference). */
  strCol(values: ArrayLike<unknown>, n: number): number {
    const p = this.alloc(8 + 4 * n, 4);
    this.dv.setUint32(p, this.#asciiLen, true);
    this.dv.setUint32(p + 4, this.#utf16Len, true);
    const refs = makeTyped(Uint32Array, this.buf.buffer, p + 8, n);
    const seen = n > 1 ? new Map<string, number>() : undefined;
    for (let i = 0; i < n; i++) {
      const s = values[i];
      if (typeof s !== 'string') bad('string', s);
      if (seen !== undefined) {
        const j = seen.get(s);
        if (j !== undefined) {
          refs[i] = j * 2 + 1;
          continue;
        }
        seen.set(s, i);
      }
      const len = s.length;
      if (isAscii(s)) {
        this.#ascii.push(s);
        this.#asciiLen += len;
        refs[i] = len * 4;
      } else {
        if (!s.isWellFormed()) bad('a string without lone surrogates', s);
        this.#utf16.push(s);
        this.#utf16Len += len;
        refs[i] = len * 4 + 2;
      }
    }
    return p;
  }

  /** Vector of a typed array: u32 count, elements aligned to their size. */
  typed(v: unknown, ctor: TypedCtor): number {
    if (!(v instanceof ctor)) bad(ctor.name, v);
    const a = v as TypedArray;
    const p = this.alloc(4, 4);
    this.dv.setUint32(p, a.length, true);
    const d = this.alloc(a.byteLength, ctor.BYTES_PER_ELEMENT);
    this.buf.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), d);
    return p;
  }

  /** List body of typed arrays: u32 child vector, u32 offsets[n + 1]; the child holds all elements. */
  typedList(values: ArrayLike<unknown>, n: number, ctor: TypedCtor): number {
    const p = this.alloc(4 + 4 * (n + 1), 4);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (!(v instanceof ctor)) bad(ctor.name, v);
      this.dv.setUint32(p + 4 + 4 * i, total, true);
      total += (v as TypedArray).length;
    }
    this.dv.setUint32(p + 4 + 4 * n, total, true);
    const size = ctor.BYTES_PER_ELEMENT;
    const c = this.alloc(4, 4);
    this.dv.setUint32(c, total, true);
    let d = this.alloc(total * size, size);
    for (let i = 0; i < n; i++) {
      const a = values[i] as TypedArray;
      this.buf.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), d);
      d += a.byteLength;
    }
    this.dv.setUint32(p, c, true);
    return p;
  }

  finish(root: number, flags = 0): Uint8Array<ArrayBuffer> {
    if (this.strings) {
      flags |= FLAG_STRINGS;
      const aLen = this.#asciiLen;
      const a = this.alloc(aLen, 1);
      if (aLen) {
        const text = this.#ascii.length === 1 ? this.#ascii[0] : this.#ascii.join('');
        // JavaScriptCore's encodeInto is about 2x slower than encode() on large strings; elsewhere
        // encodeInto wins by 5-10% and spares an allocation, which matters for small messages.
        if (aLen >= 4096) this.buf.set(textEncoder.encode(text), a);
        else textEncoder.encodeInto(text, this.buf.subarray(a, a + aLen));
      }
      const uLen = this.#utf16Len;
      const u = this.alloc(uLen * 2, 2);
      const w16 = makeTyped(Uint16Array, this.buf.buffer, u, uLen);
      let k = 0;
      for (const s of this.#utf16) for (let i = 0; i < s.length; i++) w16[k++] = s.charCodeAt(i);
      this.dv.setUint32(8, a, true);
      this.dv.setUint32(12, aLen, true);
      this.dv.setUint32(16, u, true);
      this.dv.setUint32(20, uLen, true);
    }
    this.buf[0] = 0x54;
    this.buf[1] = 0x42;
    this.buf[2] = VERSION;
    this.buf[3] = flags;
    this.dv.setUint32(4, root, true);
    return this.buf.subarray(0, this.pos);
  }
}

// ---------------------------------------------------------------------------------------------- reader

/** Lazy reader over one message. Trusts the bytes: run `Check` first on anything not from your own server. */
export class Reader {
  readonly bytes: Uint8Array;
  readonly dv: DataView;
  readonly flags: number;
  readonly root: number;
  #aOff = 0;
  #aLen = 0;
  #uOff = 0;
  #uLen = 0;
  #ascii: string | undefined = undefined;
  #utf16: string | undefined;

  /** `utf16` and `dv` come from `Check`, which has already decoded and wrapped the same aligned bytes. */
  constructor(bytes: Uint8Array, utf16?: string, dv?: DataView) {
    if (bytes.byteOffset & 7) bytes = bytes.slice(); // typed array columns need an aligned start
    this.bytes = bytes;
    this.dv = dv ?? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 8 || bytes[0] !== 0x54 || bytes[1] !== 0x42) throw new VerifyError('not a ts-bin-rpc message');
    if (bytes[2] !== VERSION) throw new VerifyError(`unsupported format version ${bytes[2]}`);
    this.flags = bytes[3];
    this.root = this.dv.getUint32(4, true);
    if (this.flags & FLAG_STRINGS) {
      this.#aOff = this.dv.getUint32(8, true);
      this.#aLen = this.dv.getUint32(12, true);
      this.#uOff = this.dv.getUint32(16, true);
      this.#uLen = this.dv.getUint32(20, true);
    }
    this.#utf16 = utf16;
  }

  get ascii(): string {
    return (this.#ascii ??= asciiDecoder.decode(this.bytes.subarray(this.#aOff, this.#aOff + this.#aLen)));
  }

  get utf16(): string {
    return (this.#utf16 ??= utf16Decoder.decode(this.bytes.subarray(this.#uOff, this.#uOff + this.#uLen * 2)));
  }

  str(at: number): string {
    const start = this.dv.getUint32(at, true);
    const lb = this.dv.getUint32(at + 4, true);
    return (lb & 1 ? this.utf16 : this.ascii).substring(start, start + (lb >>> 1));
  }

  /** vtable position of the table at `o`. */
  vt(o: number): number {
    return o - this.dv.getInt32(o, true);
  }

  /** Position of field `id` of the table at `o`, or 0 when absent. */
  at(o: number, vt: number, id: number): number {
    if (4 + 2 * id >= this.dv.getUint16(vt, true)) return 0;
    const f = this.dv.getUint16(vt + 4 + 2 * id, true);
    return f === 0 ? 0 : o + f;
  }

  typed<C extends TypedCtor>(ctor: C, off: number, n: number): View<C> {
    return makeTyped(ctor, this.bytes.buffer, this.bytes.byteOffset + off, n);
  }

  /** Typed array stored as a vector (u32 count, aligned elements), zero-copy. */
  typedAt<C extends TypedCtor>(vec: number, ctor: C): View<C> {
    return this.typed(ctor, align(vec + 4, ctor.BYTES_PER_ELEMENT), this.dv.getUint32(vec, true));
  }
}

// ------------------------------------------------------------------------------------------- columns

export interface Col<T> {
  get(i: number): T;
}

export class StrCol implements Col<string> {
  readonly #r: Reader;
  readonly #refs: Uint32Array;
  readonly #aBase: number;
  readonly #uBase: number;
  #starts: Uint32Array | undefined = undefined;
  #vals: (string | undefined)[] | undefined = undefined;

  constructor(r: Reader, body: number, n: number) {
    this.#r = r;
    this.#aBase = r.dv.getUint32(body, true);
    this.#uBase = r.dv.getUint32(body + 4, true);
    this.#refs = r.typed(Uint32Array, body + 8, n);
  }

  #build(): Uint32Array {
    const refs = this.#refs, n = refs.length;
    const starts = new Uint32Array(n);
    let a = this.#aBase, u = this.#uBase;
    for (let i = 0; i < n; i++) {
      const ref = refs[i];
      if (ref & 1) continue;
      if (ref & 2) {
        starts[i] = u;
        u += ref >>> 2;
      } else {
        starts[i] = a;
        a += ref >>> 2;
      }
    }
    this.#vals = new Array(n);
    return (this.#starts = starts);
  }

  get(i: number): string {
    const starts = this.#starts ?? this.#build();
    const vals = this.#vals!;
    let v = vals[i];
    if (v !== undefined) return v;
    const ref = this.#refs[i];
    if (ref & 1) v = this.get(ref >>> 1);
    else v = (ref & 2 ? this.#r.utf16 : this.#r.ascii).substring(starts[i], starts[i] + (ref >>> 2));
    return (vals[i] = v);
  }
}

export class NumCol<T extends number | bigint> implements Col<T> {
  readonly #t: ArrayLike<T>;
  constructor(t: ArrayLike<T>) { this.#t = t; }
  get(i: number): T { return this.#t[i]; }
}

export class BoolCol implements Col<boolean> {
  readonly #t: Uint8Array;
  constructor(t: Uint8Array) { this.#t = t; }
  get(i: number): boolean { return this.#t[i] !== 0; }
}

export class DateCol implements Col<Date> {
  readonly #t: Float64Array;
  constructor(t: Float64Array) { this.#t = t; }
  get(i: number): Date { return new Date(this.#t[i]); }
}

export class EnumCol<T extends string> implements Col<T> {
  readonly #t: Uint8Array | Uint16Array;
  readonly #values: readonly string[];
  constructor(t: Uint8Array | Uint16Array, values: readonly string[]) {
    this.#t = t;
    this.#values = values;
  }
  get(i: number): T { return this.#values[this.#t[i]] as T; }
}

export class ConstCol<T> implements Col<T> {
  readonly #v: T;
  constructor(v: T) { this.#v = v; }
  get(): T { return this.#v; }
}

/** List body: u32 child vector, u32 offsets[n + 1]. Each row is a memoized `Array` over the child. */
export class ListCol<T> implements Col<T[]> {
  readonly #r: Reader;
  readonly #b: number;
  readonly #make: (r: Reader, vec: number) => Col<T>;
  #child: Col<T> | undefined = undefined;
  #vals: (T[] | undefined)[] = [];

  constructor(r: Reader, body: number, make: (r: Reader, vec: number) => Col<T>) {
    this.#r = r;
    this.#b = body;
    this.#make = make;
  }

  get(i: number): T[] {
    let v = this.#vals[i];
    if (v !== undefined) return v;
    const dv = this.#r.dv, b = this.#b;
    const s = dv.getUint32(b + 4 + 4 * i, true), e = dv.getUint32(b + 8 + 4 * i, true);
    v = new Array(e - s);
    if (e > s) {
      const c = (this.#child ??= this.#make(this.#r, dv.getUint32(b, true))); // empty lists may have a null child
      for (let j = s; j < e; j++) v[j - s] = c.get(j);
    }
    return (this.#vals[i] = v);
  }
}

/** List body of typed arrays: each row is a zero-copy `subarray` of the child vector. */
export class TypedListCol<C extends TypedCtor> implements Col<View<C>> {
  readonly #r: Reader;
  readonly #b: number;
  readonly #ctor: C;
  #data: View<C> | undefined = undefined;
  #vals: (View<C> | undefined)[] = [];

  constructor(r: Reader, body: number, ctor: C) {
    this.#r = r;
    this.#b = body;
    this.#ctor = ctor;
  }

  get(i: number): View<C> {
    let v = this.#vals[i];
    if (v !== undefined) return v;
    const dv = this.#r.dv, b = this.#b;
    const data = (this.#data ??= this.#r.typedAt(dv.getUint32(b, true), this.#ctor));
    v = data.subarray(dv.getUint32(b + 4 + 4 * i, true), dv.getUint32(b + 8 + 4 * i, true)) as View<C>;
    return (this.#vals[i] = v);
  }
}

// -------------------------------------------------------------------------------------------- verifier

/** Bounds and consistency checks; generated verifiers drive it along the schema. */
/** No byte of `bytes[off, off + n)` has the high bit set. Reads aligned 32-bit words: 4–7x faster than a byte loop. */
export function asciiOnly(bytes: Uint8Array, off: number, n: number): boolean {
  const end = off + n;
  let i = off, acc = 0;
  for (const head = Math.min(end, (off + 3) & ~3); i < head; i++) acc |= bytes[i];
  const words = (end - i) >>> 2;
  if (words > 0) {
    const w = new Uint32Array(bytes.buffer, bytes.byteOffset + i, words);
    for (let k = 0; k < words; k++) acc |= w[k];
    i += words * 4;
  }
  for (; i < end; i++) acc |= bytes[i];
  return (acc & 0x80808080) === 0;
}

export class Check {
  readonly bytes: Uint8Array;
  readonly dv: DataView;
  readonly len: number;
  readonly root: number;
  readonly flags: number;
  readonly asciiLen: number = 0;
  readonly utf16Len: number = 0;
  readonly #utf16: string | undefined;
  readonly #maxDepth: number;
  #nodes: number;

  constructor(bytes: Uint8Array, limits: Partial<Limits> = {}) {
    if (bytes.byteOffset & 7) bytes = bytes.slice();
    this.bytes = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.len = bytes.length;
    const maxBytes = limits.maxBytes ?? DEFAULT_LIMITS.maxBytes;
    this.#maxDepth = limits.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    this.#nodes = limits.maxNodes ?? DEFAULT_LIMITS.maxNodes;
    if (this.len > maxBytes) this.fail(`message is larger than ${maxBytes} bytes`);
    if (this.len < 8 || bytes[0] !== 0x54 || bytes[1] !== 0x42) this.fail('not a ts-bin-rpc message');
    if (bytes[2] !== VERSION) this.fail(`unsupported format version ${bytes[2]}`);
    this.flags = bytes[3];
    if (this.flags & ~(FLAG_STRINGS | FLAG_ERROR)) this.fail('reserved flags are set');
    this.root = this.dv.getUint32(4, true);
    let utf16: string | undefined;
    if (this.flags & FLAG_STRINGS) {
      if (this.len < 24) this.fail('header is truncated');
      const aOff = this.dv.getUint32(8, true), aLen = this.dv.getUint32(12, true);
      const uOff = this.dv.getUint32(16, true), uLen = this.dv.getUint32(20, true);
      this.need(aOff, aLen);
      this.need(uOff, uLen * 2);
      if (uOff & 1) this.fail('UTF-16 block is not aligned');
      if (!asciiOnly(bytes, aOff, aLen)) this.fail('ASCII block holds a non-ASCII byte');
      if (uLen === 0) utf16 = '';
      else {
        try {
          utf16 = utf16StrictDecoder.decode(bytes.subarray(uOff, uOff + uLen * 2));
        } catch {
          this.fail('UTF-16 block is malformed');
        }
      }
      this.asciiLen = aLen;
      this.utf16Len = uLen;
    }
    this.#utf16 = utf16;
  }

  fail(message: string): never {
    throw new VerifyError(message);
  }

  /** A reader over the verified bytes that reuses the UTF-16 block decoded here. */
  reader(): Reader {
    return new Reader(this.bytes, this.#utf16, this.dv);
  }

  need(off: number, size: number) {
    if (off + size > this.len) this.fail(`${size} bytes at ${off} are out of bounds`);
  }

  /** Offsets of tables and vectors never point into the header; 0 is a null pointer where the format allows one. */
  target(off: number) {
    if (off < 8) this.fail(off === 0 ? 'unexpected null offset' : 'offset points into the header');
  }

  u32(at: number): number {
    this.need(at, 4);
    return this.dv.getUint32(at, true);
  }

  nodes(k: number) {
    this.#nodes -= k;
    if (this.#nodes < 0) this.fail('message holds too many elements');
  }

  depth(d: number) {
    if (d > this.#maxDepth) this.fail('message is nested too deeply');
  }

  /** Checks the table at `o` and its vtable; returns the vtable position. */
  table(o: number, d: number): number {
    this.depth(d);
    this.nodes(1);
    this.target(o);
    this.need(o, 4);
    const vt = o - this.dv.getInt32(o, true);
    if (vt < 0) this.fail('vtable is out of bounds');
    this.need(vt, 4);
    const vs = this.dv.getUint16(vt, true), ts = this.dv.getUint16(vt + 2, true);
    if (vs < 4 || vs & 1) this.fail('vtable size is invalid');
    this.need(vt, vs);
    if (ts < 4) this.fail('table size is invalid');
    this.need(o, ts);
    return vt;
  }

  /** Position of field `id` (its slot is `size` bytes) or 0 when absent. */
  field(o: number, vt: number, id: number, size: number): number {
    if (4 + 2 * id >= this.dv.getUint16(vt, true)) return 0;
    const f = this.dv.getUint16(vt + 4 + 2 * id, true);
    if (f === 0) return 0;
    if (f < 4 || f + size > this.dv.getUint16(vt + 2, true)) this.fail(`field ${id} lies outside its table`);
    return o + f;
  }

  bool(at: number) {
    if (this.bytes[at] > 1) this.fail('boolean is not 0 or 1');
  }

  tag(at: number) {
    if (this.bytes[at] > 1) this.fail('presence tag is not 0 or 1');
  }

  enumIndex(at: number, width: number, valid: Uint8Array) {
    const i = width === 1 ? this.bytes[at] : this.dv.getUint16(at, true);
    if (valid[i] !== 1) this.fail(`enum index ${i} is unknown`);
  }

  str(at: number) {
    const start = this.dv.getUint32(at, true), lb = this.dv.getUint32(at + 4, true);
    if (start + (lb >>> 1) > (lb & 1 ? this.utf16Len : this.asciiLen)) this.fail('string lies outside its block');
  }

  strCol(b: number, n: number) {
    this.need(b, 8 + 4 * n);
    const dv = this.dv;
    let a = dv.getUint32(b, true), u = dv.getUint32(b + 4, true);
    for (let i = 0; i < n; i++) {
      const ref = dv.getUint32(b + 8 + 4 * i, true);
      if (ref & 1) {
        const j = ref >>> 1;
        if (j >= i || dv.getUint32(b + 8 + 4 * j, true) & 1) this.fail('string back-reference is invalid');
      } else if (ref & 2) u += ref >>> 2;
      else a += ref >>> 2;
    }
    if (a > this.asciiLen || u > this.utf16Len) this.fail('string column lies outside its block');
  }

  /** Vector header: returns the element count and charges it to the node budget. */
  vec(off: number, d: number): number {
    this.depth(d);
    this.target(off);
    const n = this.u32(off);
    this.nodes(n);
    return n;
  }

  bools(b: number, n: number) {
    this.need(b, n);
    for (let i = 0; i < n; i++) if (this.bytes[b + i] > 1) this.fail('boolean is not 0 or 1');
  }

  /** Enum column; rows without a value (bitmaps) hold a placeholder and are skipped. */
  enums(b: number, n: number, width: number, valid: Uint8Array, pres = -1, nul = -1) {
    this.need(b, n * width);
    for (let i = 0; i < n; i++) if (this.has(pres, nul, i)) this.enumIndex(b + i * width, width, valid);
  }

  /** Typed array vector: returns the element count. */
  typed(vec: number, size: number, d: number): number {
    const n = this.vec(vec, d);
    this.need(align(vec + 4, size), n * size);
    return n;
  }

  /** List offsets: n + 1 non-decreasing values within the child vector. */
  offsets(off: number, n: number, childCount: number) {
    this.need(off, 4 * (n + 1));
    let prev = this.dv.getUint32(off, true);
    for (let i = 1; i <= n; i++) {
      const cur = this.dv.getUint32(off + 4 * i, true);
      if (cur < prev) this.fail('list offsets decrease');
      prev = cur;
    }
    if (prev > childCount) this.fail('list offsets exceed the child vector');
  }

  typedList(b: number, n: number, size: number, d: number) {
    this.need(b, 4);
    const cn = this.typed(this.dv.getUint32(b, true), size, d);
    this.offsets(b + 4, n, cn);
  }

  has(pres: number, nul: number, i: number): boolean {
    return (pres < 0 || bit(this.bytes, pres, i)) && (nul < 0 || !bit(this.bytes, nul, i));
  }

  count(pres: number, nul: number, n: number): number {
    if (pres < 0 && nul < 0) return n;
    let k = 0;
    for (let i = 0; i < n; i++) if (this.has(pres, nul, i)) k++;
    return k;
  }

  /**
   * Column set of an object vector (spec as in `catalog`, names for messages): verifies the catalog and
   * calls `body(k, data, n, presence, null)` for each column of a known field, k its spec index / 3.
   * Returns the row count.
   */
  cols(off: number, d: number, type: string, names: readonly string[], spec: readonly number[], body: (k: number, b: number, n: number, pres: number, nul: number) => void): number {
    const n = this.vec(off, d);
    this.need(off + 4, 4);
    const dv = this.dv, nc = dv.getUint16(off + 4, true), nb = (n + 7) >>> 3;
    this.need(off + 8, 8 * nc);
    const seen = new Uint8Array(names.length);
    for (let j = 0; j < nc; j++) {
      const e = off + 8 + 8 * j, id = dv.getUint16(e, true), fl = dv.getUint16(e + 2, true), o0 = dv.getUint32(e + 4, true);
      if (fl & ~3) this.fail(`${type}: unknown column flags`);
      let o = o0;
      const pres = fl & 1 ? o : -1;
      if (fl & 1) o += nb;
      const nul = fl & 2 ? o : -1;
      if (fl & 2) o += nb;
      this.need(o0, o - o0);
      let k = 0;
      while (k < names.length && spec[3 * k] !== id) k++;
      if (k === names.length) continue;
      const allow = spec[3 * k + 2];
      if (seen[k]++) this.fail(`${type}.${names[k]}: duplicate column`);
      if (fl & 1 & ~allow) this.fail(`${type}.${names[k]}: required column has absent rows`);
      if (fl & 2 & ~allow) this.fail(`${type}.${names[k]}: column has nulls`);
      body(k, align(o, spec[3 * k + 1]), n, pres, nul);
    }
    for (let k = 0; k < names.length; k++) if (!seen[k] && !(spec[3 * k + 2] & 1)) this.fail(`${type}.${names[k]}: column is missing`);
    return n;
  }
}

// ---------------------------------------------------------------------------------------------- codec

export interface ViewOptions {
  /** Verify the message before reading it. Default: true. */
  verify?: boolean;
  limits?: Partial<Limits>;
}

export interface Encoder<T> {
  encode(value: T): Uint8Array<ArrayBuffer>;
}

export interface Decoder<T> {
  /** Lazy views over the message: fields are read on access. */
  view(bytes: Uint8Array, options?: ViewOptions): T;
  /** Plain objects, safe to mutate and spread. */
  decode(bytes: Uint8Array, options?: ViewOptions): T;
  verify(bytes: Uint8Array, limits?: Partial<Limits>): void;
}

/** Both halves; generated code also exports each half alone, so bundles keep only the one they use. */
export interface Codec<T> extends Encoder<T>, Decoder<T> {}

// ------------------------------------------------------------------------------------ type descriptors

/** The schema as data, emitted next to the codecs. Only read after an encode fails, to find where. */
export type TypeDesc =
  | { kind: 'scalar'; scalar: string }
  | { kind: 'string' }
  | { kind: 'bytes' }
  | { kind: 'typedArray'; array: string }
  | { kind: 'const'; value: string | number | boolean }
  | { kind: 'enum'; name: string }
  | { kind: 'array'; element: TypeDesc }
  | { kind: 'object'; name: string }
  | { kind: 'union'; name: string };

export interface SchemaDesc {
  objects: Record<string, readonly { name: string; type: TypeDesc; optional?: boolean; nullable?: boolean }[]>;
  enums: Record<string, readonly string[]>;
  unions: Record<string, { discriminant: string; variants: Record<string, string> }>;
}

export interface Mismatch {
  path: string;
  expected: string;
  got: unknown;
}

const SCALAR_OK: Record<string, (v: any) => boolean> = {
  bool: (v) => v === true || v === false,
  u8: (v) => typeof v === 'number' && (v & 0xff) === v,
  i8: (v) => typeof v === 'number' && (v << 24) >> 24 === v,
  u16: (v) => typeof v === 'number' && (v & 0xffff) === v,
  i16: (v) => typeof v === 'number' && (v << 16) >> 16 === v,
  u32: (v) => typeof v === 'number' && v >>> 0 === v,
  i32: (v) => typeof v === 'number' && (v | 0) === v,
  f32: (v) => typeof v === 'number',
  f64: (v) => typeof v === 'number',
  u64: (v) => typeof v === 'bigint' && BigInt.asUintN(64, v) === v,
  i64: (v) => typeof v === 'bigint' && BigInt.asIntN(64, v) === v,
  timestamp: (v) => v instanceof Date,
};
const SCALAR_NAME: Record<string, string> = { bool: 'boolean', f32: 'number', f64: 'number', timestamp: 'Date' };

/**
 * First value the encoder rejects, with its path; mirrors the checks of generated encoders. Null when
 * the value is fine, which means the descriptor and the encoder disagree.
 */
export function locate(schema: SchemaDesc, type: TypeDesc, value: unknown, path = ''): Mismatch | null {
  const miss = (expected: string, got: unknown = value): Mismatch => ({ path, expected, got });
  switch (type.kind) {
    case 'scalar':
      return SCALAR_OK[type.scalar](value) ? null : miss(SCALAR_NAME[type.scalar] ?? type.scalar);
    case 'string':
      if (typeof value !== 'string') return miss('string');
      return isAscii(value) || value.isWellFormed() ? null : miss('a string without lone surrogates');
    case 'bytes':
      return value instanceof Uint8Array ? null : miss('Uint8Array');
    case 'typedArray':
      return value instanceof (globalThis as unknown as Record<string, TypedCtor>)[type.array] ? null : miss(type.array);
    case 'const':
      return value === type.value ? null : miss(JSON.stringify(type.value));
    case 'enum': {
      const values = schema.enums[type.name];
      return values.includes(value as string) ? null : miss(`${type.name} (${values.map((v) => JSON.stringify(v)).join(' | ')})`);
    }
    case 'array': {
      if (!Array.isArray(value)) return miss('array');
      for (let i = 0; i < value.length; i++) {
        const m = locate(schema, type.element, value[i], `${path}[${i}]`);
        if (m) return m;
      }
      return null;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null) return miss(type.name);
      for (const f of schema.objects[type.name]) {
        const v = (value as Record<string, unknown>)[f.name];
        if (v == null && (f.optional || f.nullable)) continue;
        const m = locate(schema, f.type, v, path ? `${path}.${f.name}` : f.name);
        if (m) return m;
      }
      return null;
    }
    case 'union': {
      if (typeof value !== 'object' || value === null) return miss(type.name);
      const u = schema.unions[type.name];
      const tag = (value as Record<string, unknown>)[u.discriminant];
      const object = typeof tag === 'string' ? u.variants[tag] : undefined;
      if (object === undefined) {
        const at = path ? `${path}.${u.discriminant}` : u.discriminant;
        return { path: at, expected: `${type.name} variant (${Object.keys(u.variants).map((t) => JSON.stringify(t)).join(' | ')})`, got: tag };
      }
      return locate(schema, { kind: 'object', name: object }, value, path);
    }
  }
}

/** Rebuilds an encoder error with the path of the offending value. */
function explain(e: EncodeError, schema: SchemaDesc, type: TypeDesc, value: unknown): EncodeError {
  const m = locate(schema, type, value);
  if (!m) return e;
  const out = new EncodeError(`${m.path ? `at ${m.path}: ` : ''}expected ${m.expected}, got ${show(m.got)}`);
  out.path = m.path;
  return out;
}

export interface EncoderDef<T> {
  /** For error messages: where in the value an encode failed. */
  desc?: { schema: SchemaDesc; type: TypeDesc };
  strings: boolean;
  size: number;
  align: number;
  write(w: Writer, at: number, v: T): void;
}

export interface DecoderDef<T> {
  size: number;
  read(r: Reader, at: number): T;
  check(c: Check, at: number): void;
  plain(v: T): T;
}

export function encoder<T>(d: EncoderDef<T>): Encoder<T> {
  // Messages of one procedure tend to have similar sizes: start where the last one ended instead of
  // growing from a small buffer, which left ~2x the message in garbage on every encode.
  let capacity = 256;
  return {
    encode(value) {
      const w = new Writer(d.strings, capacity);
      const at = w.alloc(d.size, d.align);
      try {
        d.write(w, at, value);
      } catch (e) {
        throw e instanceof EncodeError && d.desc ? explain(e, d.desc.schema, d.desc.type, value) : e;
      }
      const bytes = w.finish(at);
      capacity = Math.max(256, bytes.length + (bytes.length >>> 3));
      return bytes;
    },
  };
}

export function decoder<T>(d: DecoderDef<T>): Decoder<T> {
  const open = (bytes: Uint8Array, o: ViewOptions = {}): Reader => {
    if (o.verify === false) {
      const r = new Reader(bytes);
      if (r.flags & FLAG_ERROR) throw new VerifyError('message is an error envelope');
      return r;
    }
    const c = new Check(bytes, o.limits);
    if (c.flags & FLAG_ERROR) c.fail('message is an error envelope');
    c.need(c.root, d.size);
    d.check(c, c.root);
    return c.reader();
  };
  return {
    view(bytes, o) {
      const r = open(bytes, o);
      return d.read(r, r.root);
    },
    decode(bytes, o) {
      const r = open(bytes, o);
      return d.plain(d.read(r, r.root));
    },
    verify(bytes, limits) {
      open(bytes, { limits });
    },
  };
}

export function codec<T>(e: Encoder<T>, d: Decoder<T>): Codec<T> {
  return { encode: e.encode, view: d.view, decode: d.decode, verify: d.verify };
}

// ------------------------------------------------------------------------------------- error envelope

/** Error envelope (FORMAT §9): flag ERROR, root table { 0: code, 1: message, 2?: data }. */
export interface ErrorEnvelope {
  code: string;
  message: string;
  /** UTF-8 JSON. */
  data?: Uint8Array;
}

export function encodeError(e: ErrorEnvelope): Uint8Array<ArrayBuffer> {
  const w = new Writer(true);
  const root = w.alloc(4, 4);
  const vt = w.alloc(10, 2);
  w.ru16(vt, 10);
  w.ru16(vt + 2, 24);
  w.ru16(vt + 4, 4);
  w.ru16(vt + 6, 12);
  w.ru16(vt + 8, e.data ? 20 : 0);
  const t = w.alloc(24, 8, 4);
  w.ri32(t, t - vt);
  w.str(t + 4, e.code);
  w.str(t + 12, e.message);
  if (e.data) w.ru32(t + 20, w.typed(e.data, Uint8Array));
  w.ru32(root, t);
  return w.finish(root, FLAG_ERROR);
}

/** Verifies and reads an error envelope; throws VerifyError on anything else. */
export function decodeError(bytes: Uint8Array, limits?: Partial<Limits>): ErrorEnvelope {
  const c = new Check(bytes, limits);
  if (!(c.flags & FLAG_ERROR)) c.fail('not an error envelope');
  const t = c.u32(c.root);
  const vt = c.table(t, 1);
  const code = c.field(t, vt, 0, 8), message = c.field(t, vt, 1, 8), data = c.field(t, vt, 2, 4);
  if (!code || !message) c.fail('error envelope without code or message');
  c.str(code);
  c.str(message);
  if (data) c.typed(c.u32(data), 1, 2);
  const r = c.reader();
  const e: ErrorEnvelope = { code: r.str(code), message: r.str(message) };
  if (data) e.data = r.typedAt(r.dv.getUint32(data, true), Uint8Array).slice();
  return e;
}
