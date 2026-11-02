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

export type IRType =
  | { kind: 'scalar'; scalar: ScalarKind }
  | { kind: 'string' }
  | { kind: 'bytes' } //                         Uint8Array, zero-copy subarray
  | { kind: 'typedArray'; array: TypedArrayKind } // zero-copy column
  | { kind: 'const'; value: string | number | boolean } // single-literal field, not on the wire
  | { kind: 'enum'; name: string } //             string literal union, values in Schema.enums
  | { kind: 'array'; element: IRType }
  | { kind: 'object'; name: string } //           Schema.objects
  | { kind: 'union'; name: string }; //           discriminated union, Schema.unions

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
  output: IRType | null; // null: Promise<void>
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
  }
}

export function fieldSignature(f: Pick<Field, 'type' | 'optional' | 'nullable'>): string {
  return `${signature(f.type)}${f.nullable ? ' | null' : ''}${f.optional ? ' | undefined' : ''}`;
}

export function formatLocation(l: Location | undefined): string {
  return l ? `${l.file}:${l.line}:${l.column}` : '<unknown>';
}
