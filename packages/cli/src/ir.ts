// Schema IR: what the codegen knows about the contract, independent of TypeScript's API.

export const SCALARS = ['bool', 'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64', 'u64', 'i64', 'timestamp'] as const;
export type ScalarKind = (typeof SCALARS)[number];

export const TYPED_ARRAYS = [
  'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
] as const;
export type TypedArrayKind = (typeof TYPED_ARRAYS)[number];

export interface Location {
  file: string;
  line: number;
  column: number;
}

/**
 * Validation rules from `Min`, `Max`, `MinLength`, `MaxLength`, `Pattern`, `Check`. Not part of the wire format
 * or of `signature()`: the server checks them when it decodes an input. Limits of 64-bit integers
 * are decimal strings, so that the IR stays JSON.
 */
export interface Rules {
  min?: number | string;
  max?: number | string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** `Check<'name'>`: named checks the server runs on the decoded value, in source order. */
  checks?: string[];
}

export type IRType =
  | { kind: 'scalar'; scalar: ScalarKind; rules?: Rules }
  | { kind: 'string'; rules?: Rules }
  | { kind: 'bytes'; rules?: Rules } //          Uint8Array, zero-copy subarray
  | { kind: 'typedArray'; array: TypedArrayKind; rules?: Rules } // zero-copy column
  | { kind: 'const'; value: string | number | boolean } // single-literal field, not on the wire
  | { kind: 'enum'; name: string; rules?: Rules } //             string literal union, values in Schema.enums
  | { kind: 'array'; element: IRType; rules?: Rules }
  | { kind: 'object'; name: string; rules?: Rules } //           Schema.objects
  | { kind: 'union'; name: string; rules?: Rules } //            discriminated union, Schema.unions
  // On the wire, maps and tuples are the synthetic object `object`: `{ keys: K[]; values: V[] }` and
  // `{ 0: A; 1: B }`. `Record<string, V>` and `Map<string, V>` have the same wire format.
  | { kind: 'map'; key: IRType; value: IRType; record: boolean; readonly?: true; object: string; rules?: Rules }
  | { kind: 'tuple'; elements: TupleElement[]; readonly?: true; object: string; rules?: Rules };

export interface TupleElement {
  type: IRType;
  optional: boolean; // `T | undefined`
  nullable: boolean;
}

export interface Field {
  name: string;
  type: IRType;
  optional: boolean; // `x?: T` or `T | undefined`
  nullable: boolean; // `T | null`
  renamedFrom?: string; // JSDoc `@renamedFrom oldName`
  location?: Location;
}

export interface ObjectDef {
  name: string;
  fields: Field[];
  location?: Location;
  /**
   * The wire form of a map or a tuple type, named after it: `Map<string, User>`, `[u32, string]`.
   * Of a live procedure (DESIGN §18): `Patch<Unit, "id">`, the changed fields of a row, and
   * `LiveDelta<Unit, "id">`, one change of the state.
   */
  synthetic?: 'map' | 'tuple' | 'patch' | 'delta';
  /** Of a patch: the row type, whose lockfile entry owns the field IDs. */
  base?: string;
}

export interface EnumDef {
  name: string;
  values: string[]; // sorted; the lockfile owns the wire indices
}

export interface UnionDef {
  name: string;
  discriminant: string;
  variants: { tag: string; object: string }[]; // sorted by tag
}

export interface Procedure {
  path: string; // 'user.get'
  input: IRType | null; // null: the handler takes no input
  inputOptional: boolean;
  output: IRType | null; // null: Promise<void>; for a stream, the row type
  /** Returns `Stream<T>`: output is the row type, and each frame on the wire is a `T[]` message. */
  stream?: boolean;
  /** Returns `LiveStream<T, K>` (also a stream): the key field and the delta object (DESIGN §18). */
  live?: { key: string; delta: string };
  /** Takes a second parameter, `ctx`: the server builds the context only for these. */
  ctx?: boolean;
  /** Marked by `query()`: the client calls it with GET. */
  get?: boolean;
  location?: Location;
}

export interface Schema {
  procedures: Procedure[];
  objects: Record<string, ObjectDef>;
  enums: Record<string, EnumDef>;
  unions: Record<string, UnionDef>;
}

// Canonical text of a type; two fields are wire-compatible only if their signatures are equal.
export function signature(t: IRType): string {
  switch (t.kind) {
    case 'scalar': return t.scalar;
    case 'string': return 'string';
    case 'bytes': return 'bytes';
    case 'typedArray': return t.array;
    case 'const': return `const ${JSON.stringify(t.value)}`;
    case 'enum': return `enum ${t.name}`;
    case 'array': return `${signature(t.element)}[]`;
    case 'object': return `object ${t.name}`;
    case 'union': return `union ${t.name}`;
    case 'map': return `Map<${signature(t.key)}, ${signature(t.value)}>`;
    case 'tuple': return `[${t.elements.map(fieldSignature).join(', ')}]`;
  }
}

/** The object a map or a tuple is on the wire; any other type as is. */
export function wire(t: IRType): IRType {
  return t.kind === 'map' || t.kind === 'tuple' ? { kind: 'object', name: t.object } : t;
}

export function fieldSignature(f: Pick<Field, 'type' | 'optional' | 'nullable'>): string {
  return `${signature(f.type)}${f.nullable ? ' | null' : ''}${f.optional ? ' | undefined' : ''}`;
}

export function formatLocation(l: Location | undefined): string {
  return l ? `${l.file}:${l.line}:${l.column}` : '<unknown>';
}
