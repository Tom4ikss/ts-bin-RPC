// TypeSource: the only module that talks to TypeScript. Backend: TypeScript 7.1 (`typescript/sync`).
// Everything else consumes the neutral `Desc` shapes below, so a TS 6 backend can be swapped in.
import fs from 'node:fs';
import path from 'node:path';
import { API, TypeFlags, SymbolFlags } from 'typescript/sync';
import { SyntaxKind } from 'typescript/ast';
import type { Checker, Snapshot, Symbol as TsSymbol, Type } from 'typescript/sync';
import type { Location } from './ir.ts';

export interface TypeRef {
  readonly id: number;
}

export interface PropDesc {
  name: string;
  type: TypeRef;
  optional: boolean;
  renamedFrom?: string;
  location?: Location;
}

export type Desc =
  | { k: 'string' | 'number' | 'boolean' | 'bigint' | 'undefined' | 'null' | 'void' | 'any' | 'unknown' | 'never' | 'symbol' | 'nonPrimitive' }
  | { k: 'literal'; value: string | number | boolean }
  | { k: 'brand'; base: 'number' | 'bigint'; tag: string }
  | { k: 'union'; members: TypeRef[]; alias?: string }
  | { k: 'array'; element: TypeRef }
  | { k: 'tuple' }
  | { k: 'builtin'; name: string } // Date, typed arrays, Map, Set, Promise, ...
  | { k: 'function' }
  | { k: 'object'; name?: string; props: PropDesc[]; indexSignature: boolean; location?: Location }
  | { k: 'other'; text: string };

export interface RawProcedure {
  path: string;
  params: { type: TypeRef; optional: boolean }[];
  returns: TypeRef;
  overloads: number;
  location?: Location;
}

export type RouterEntry = RawProcedure | { path: string; problem: string; location?: Location };

export interface TypeSource {
  router(file: string, exportName: string): RouterEntry[];
  describe(t: TypeRef): Desc;
  text(t: TypeRef): string;
  close(): void;
}

interface AstTypeNode {
  kind: SyntaxKind;
  type?: AstTypeNode;
  types?: AstTypeNode[];
}

const BRAND_PREFIX = '__@tbr@';
const BUILTINS = new Set([
  'Date', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array',
  'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Uint8ClampedArray', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'RegExp', 'Error', 'ReadonlyMap', 'ReadonlySet',
]);

class TsRef implements TypeRef {
  readonly type: Type;
  readonly members?: readonly Type[]; // union members regrouped by the declaration's syntax
  constructor(type: Type, members?: readonly Type[]) { this.type = type; this.members = members; }
  get id() { return this.type.id; }
}

export class Ts71Source implements TypeSource {
  private api: API;
  private snapshot: Snapshot;
  private checker: Checker;
  private root: string;

  constructor(tsconfig: string) {
    const abs = path.resolve(tsconfig);
    if (!fs.existsSync(abs)) throw new Error(`${tsconfig} not found: tbr reads the router's types through a TypeScript project (--project <tsconfig>)`);
    this.root = path.dirname(abs);
    this.api = new API({ cwd: this.root });
    this.snapshot = this.api.createSnapshot({ openProjects: [abs] });
    const project = this.snapshot.getProjects()[0];
    if (!project) throw new Error(`could not load TypeScript project ${abs}`);
    this.checker = project.checker;
  }

  close() {
    this.api.close?.();
  }

  router(file: string, exportName: string): RouterEntry[] {
    const abs = path.resolve(file);
    const mod = this.checker.getSymbolOfSourceFile(abs);
    if (!mod) throw new Error(`${abs} is not part of the TypeScript project`);
    const sym = mod.getExports().get(exportName as never);
    if (!sym) throw new Error(`${abs} has no export named '${exportName}'`);
    const out: RouterEntry[] = [];
    this.walkRouter(this.checker.getTypeOfSymbol(sym), '', out);
    return out;
  }

  private walkRouter(type: Type, prefix: string, out: RouterEntry[]) {
    for (const prop of type.getProperties()) {
      const p = prefix ? `${prefix}.${prop.name}` : prop.name;
      const t = this.checker.getTypeOfSymbol(prop);
      const sigs = t.getCallSignatures();
      const location = this.locate(prop);
      if (sigs.length) {
        const sig = sigs[0];
        const params = sig.getParameters().map((s) => {
          return { type: this.declaredRef(s), optional: (s.flags & SymbolFlags.Optional) !== 0 };
        });
        let ret = sig.getReturnType();
        if (ret.isTypeReference() && ret.getSymbol()?.name === 'Promise') ret = this.checker.getTypeArguments(ret)[0];
        out.push({ path: p, params, returns: new TsRef(ret), overloads: sigs.length, location });
      } else if (t.isObjectType() && !t.isTypeReference()) {
        this.walkRouter(t, p, out);
      } else {
        out.push({ path: p, problem: `router property must be a function or a namespace object, got '${this.checker.typeToString(t)}'`, location });
      }
    }
  }

  text(ref: TypeRef): string {
    return this.checker.typeToString((ref as TsRef).type);
  }

  describe(ref: TypeRef): Desc {
    const t = (ref as TsRef).type;
    const f = t.flags;
    if (f & TypeFlags.Any) return { k: 'any' };
    if (f & TypeFlags.Unknown) return { k: 'unknown' };
    if (f & TypeFlags.Never) return { k: 'never' };
    if (f & TypeFlags.Void) return { k: 'void' };
    if (f & TypeFlags.Undefined) return { k: 'undefined' };
    if (f & TypeFlags.Null) return { k: 'null' };
    if (f & TypeFlags.Boolean) return { k: 'boolean' };
    if (f & TypeFlags.String) return { k: 'string' };
    if (f & TypeFlags.Number) return { k: 'number' };
    if (f & TypeFlags.BigInt) return { k: 'bigint' };
    if (f & (TypeFlags.ESSymbol | TypeFlags.UniqueESSymbol)) return { k: 'symbol' };
    if (f & TypeFlags.NonPrimitive) return { k: 'nonPrimitive' };
    if (t.isStringLiteralType() || t.isNumberLiteralType()) return { k: 'literal', value: t.value as string | number };
    if (t.isBooleanLiteralType()) return { k: 'literal', value: t.value };

    if (t.isIntersectionType()) {
      const brand = this.brandOf(t.getTypes());
      if (brand) return brand;
    }
    if (t.isUnionType()) {
      const members = (ref as TsRef).members ?? t.getTypes();
      return { k: 'union', members: members.map((m) => new TsRef(m)), alias: t.getAliasSymbol()?.name };
    }
    if (t.isTupleType()) return { k: 'tuple' };
    if (t.isTypeReference()) {
      const name = t.getSymbol()?.name;
      if (name === 'Array' || name === 'ReadonlyArray') {
        return { k: 'array', element: new TsRef(this.checker.getTypeArguments(t)[0]) };
      }
    }
    const symName = t.getSymbol()?.name;
    if (symName && BUILTINS.has(symName)) return { k: 'builtin', name: symName };
    if (t.getCallSignatures().length || t.getConstructSignatures().length) return { k: 'function' };
    if (t.isObjectType() || t.isIntersectionType()) return this.describeObject(t);
    return { k: 'other', text: this.checker.typeToString(t) };
  }

  // `number & { readonly [tbr]?: 'u32' }` → brand u32
  private brandOf(parts: readonly Type[]): Desc | undefined {
    const base = parts.find((p) => p.flags & (TypeFlags.Number | TypeFlags.BigInt));
    const tagObj = parts.find((p) => p.isObjectType());
    if (!base || !tagObj) return undefined;
    const prop = tagObj.getProperties().find((p) => p.name.startsWith(BRAND_PREFIX));
    if (!prop) return undefined;
    let lit = this.checker.getTypeOfSymbol(prop);
    if (lit.isUnionType()) lit = lit.getTypes().find((m) => m.isStringLiteralType()) ?? lit;
    if (!lit.isStringLiteralType()) return undefined;
    return { k: 'brand', base: base.flags & TypeFlags.BigInt ? 'bigint' : 'number', tag: lit.value as string };
  }

  private describeObject(t: Type): Desc {
    const sym = t.getSymbol();
    const alias = t.getAliasSymbol();
    let name: string | undefined;
    if (t.isTypeReference() && this.checker.getTypeArguments(t).length) name = this.checker.typeToString(t);
    else if (alias) name = alias.name;
    else if (sym && sym.name !== '__type' && sym.name !== '__object') name = sym.name;
    if (t.isIntersectionType() && !alias) name = undefined;

    const props: PropDesc[] = t.getProperties().map((p) => {
      const tags = this.checker.getJsDocTagsOfSymbol(p);
      const renamed = tags.find((x) => x.name === 'renamedFrom');
      const text = renamed?.text;
      return {
        name: p.name,
        type: this.declaredRef(p),
        optional: (p.flags & SymbolFlags.Optional) !== 0,
        renamedFrom: text?.trim() || undefined,
        location: this.locate(p),
      };
    });
    const indexSignature = this.checker.getIndexInfosOfType(t).length > 0;
    return { k: 'object', name, props, indexSignature, location: sym ? this.locate(sym) : undefined };
  }

  // `role?: Role` has type `"admin" | "user" | undefined`: a fresh union that lost the alias. Regroup its
  // members by the type annotation so `Role` keeps its name. The checker's type stays the source of truth:
  // syntax is used only when its types are exactly members of it (not the case for `T` inside generics).
  private declaredRef(sym: TsSymbol): TsRef {
    const t = this.checker.getTypeOfSymbol(sym);
    if (!t.isUnionType()) return new TsRef(t);
    let node = (sym.declarations?.[0]?.resolve() as { type?: AstTypeNode } | undefined)?.type;
    while (node?.kind === SyntaxKind.ParenthesizedType && node.type) node = node.type;
    if (!node) return new TsRef(t);
    const parts = node.kind === SyntaxKind.UnionType && node.types ? node.types : [node];
    const all = new Map(t.getTypes().map((m) => [m.id, m]));
    const covered = new Set<number>();
    const members: Type[] = [];
    for (const n of parts) {
      const nt = this.checker.getTypeFromTypeNode(n as never);
      const ids = nt.isUnionType() ? nt.getTypes().map((m) => m.id) : [nt.id];
      if (!ids.every((id) => all.has(id))) return new TsRef(t);
      if (ids.every((id) => covered.has(id))) continue;
      ids.forEach((id) => covered.add(id));
      members.push(nt.isUnionType() ? nt : all.get(nt.id)!);
    }
    for (const [id, m] of all) if (!covered.has(id)) members.push(m); // `undefined` added by `?`
    return new TsRef(t, members);
  }

  private locate(sym: TsSymbol): Location | undefined {
    const decl = sym.declarations?.[0];
    if (!decl) return undefined;
    const node = decl.resolve() as { pos: number; parent?: unknown; text?: string; fileName?: string } | undefined;
    if (!node) return undefined;
    let root = node as { parent?: unknown; text?: string; fileName?: string };
    while (root.parent) root = root.parent as typeof root;
    if (typeof root.text !== 'string' || !root.fileName) return undefined;
    const text = root.text;
    let pos = skipTrivia(text, node.pos);
    let line = 1, col = 1;
    for (let i = 0; i < pos; i++) {
      if (text.charCodeAt(i) === 10) { line++; col = 1; } else col++;
    }
    return { file: path.relative(this.root, root.fileName).split(path.sep).join('/'), line, column: col };
  }
}

function skipTrivia(text: string, pos: number): number {
  for (;;) {
    const c = text.charCodeAt(pos);
    if (c === 32 || c === 9 || c === 10 || c === 13) { pos++; continue; }
    if (c === 47 && text.charCodeAt(pos + 1) === 47) { while (pos < text.length && text.charCodeAt(pos) !== 10) pos++; continue; }
    if (c === 47 && text.charCodeAt(pos + 1) === 42) { const end = text.indexOf('*/', pos + 2); pos = end < 0 ? text.length : end + 2; continue; }
    return pos;
  }
}
