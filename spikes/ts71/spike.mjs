import { API, TypeFlags, SymbolFlags } from 'typescript/sync';
import path from 'node:path';

const t0 = performance.now();
const api = new API({ cwd: path.resolve('fixture') });
const cfg = path.resolve('fixture/tsconfig.json');
const snap = api.createSnapshot({ openProjects: [cfg] });
const project = snap.getProjects()[0];
const checker = project.checker;
const file = path.resolve('fixture/api.ts');
const mod = checker.getSymbolOfSourceFile(file);
const exportsMap = mod.getExports();
const userSym = exportsMap.get('User');
const userType = checker.getDeclaredTypeOfSymbol(userSym);

const flagNames = (f) => Object.entries(TypeFlags).filter(([k, v]) => typeof v === 'number' && v && (f & v) === v && (v & (v - 1)) === 0).map(([k]) => k).join('|');

function describe(type, depth = 0) {
  if (depth > 4) return '…';
  if (type.isIntersectionType()) {
    const parts = type.getTypes();
    const prim = parts.find((p) => p.flags & (TypeFlags.Number | TypeFlags.BigInt));
    const tagObj = parts.find((p) => p.isObjectType());
    if (prim && tagObj) {
      const props = tagObj.getProperties();
      const tag = props.length === 1 ? checker.getTypeOfSymbol(props[0]) : undefined;
      // optional prop → type is 'u32' | undefined
      const lit = tag?.isUnionType() ? tag.getTypes().find((t) => t.isStringLiteralType()) : tag;
      return `BRAND(${flagNames(prim.flags)}:${lit?.value}, key=${props[0]?.name})`;
    }
    return 'intersection(' + parts.map((p) => describe(p, depth + 1)).join(' & ') + ')';
  }
  if (type.isUnionType()) return 'union(' + type.getTypes().map((p) => describe(p, depth + 1)).join(' | ') + ')';
  if (type.isStringLiteralType()) return JSON.stringify(type.value);
  if (type.isTypeReference()) {
    const args = checker.getTypeArguments(type);
    const sym = type.getSymbol();
    return `${sym?.name}<${args.map((a) => describe(a, depth + 1)).join(', ')}>`;
  }
  if (type.isObjectType()) {
    const sym = type.getSymbol();
    const props = type.getProperties();
    return `${sym?.name ?? 'obj'}{ ` + props.map((p) => `${p.name}${p.flags & SymbolFlags.Optional ? '?' : ''}: ${describe(checker.getTypeOfSymbol(p), depth + 1)}`).join('; ') + ' }';
  }
  return flagNames(type.flags) || `flags=${type.flags}`;
}

for (const p of userType.getProperties()) {
  const t = checker.getTypeOfSymbol(p);
  const alias = t.getAliasSymbol?.()?.name;
  console.log(`${p.name.padEnd(6)} alias=${String(alias).padEnd(9)} ${describe(t)}`);
}
console.log(`\ntotal ${(performance.now() - t0).toFixed(0)} ms`);
snap.dispose?.(); api.close?.(); process.exit(0);
