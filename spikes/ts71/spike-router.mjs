// Walk `appRouter` (plain object of async functions) and extract every procedure's input/output types.
import { API, TypeFlags } from 'typescript/sync';
import path from 'node:path';

const t0 = performance.now();
const api = new API({ cwd: path.resolve('fixture') });
const snap = api.createSnapshot({ openProjects: [path.resolve('fixture/tsconfig.json')] });
const checker = snap.getProjects()[0].checker;
const mod = checker.getSymbolOfSourceFile(path.resolve('fixture/router.ts'));
const routerSym = mod.getExports().get('appRouter');

const short = (t) => {
  if (t.isIntersectionType()) {
    const tag = t.getTypes().find((p) => p.isObjectType())?.getProperties()[0];
    const lit = tag && checker.getTypeOfSymbol(tag);
    const v = lit?.isUnionType() ? lit.getTypes().find((x) => x.isStringLiteralType())?.value : lit?.value;
    return v ?? 'intersection';
  }
  if (t.isUnionType()) return t.getTypes().map(short).join('|');
  if (t.isTypeReference()) return `${t.getSymbol()?.name}<${checker.getTypeArguments(t).map(short).join(',')}>`;
  if (t.isObjectType()) {
    const s = t.getSymbol()?.name;
    if (s && s !== '__type' && s !== '__object') return s;
    return '{' + t.getProperties().map((p) => `${p.name}:${short(checker.getTypeOfSymbol(p))}`).join(', ') + '}';
  }
  return Object.entries(TypeFlags).find(([, v]) => v === t.flags)?.[0] ?? `flags=${t.flags}`;
};

function walk(type, prefix) {
  for (const prop of type.getProperties()) {
    const t = checker.getTypeOfSymbol(prop);
    const sigs = t.getCallSignatures();
    const name = prefix ? `${prefix}.${prop.name}` : prop.name;
    if (sigs.length) {
      const sig = sigs[0];
      const params = sig.getParameters();
      const input = params.length ? short(checker.getTypeOfSymbol(params[0])) : 'void';
      let ret = sig.getReturnType();
      if (ret.isTypeReference() && ret.getSymbol()?.name === 'Promise') ret = checker.getTypeArguments(ret)[0];
      console.log(`${name.padEnd(12)} in=${input.padEnd(34)} out=${short(ret)}`);
    } else {
      walk(t, name);
    }
  }
}
walk(checker.getTypeOfSymbol(routerSym), '');
console.log(`\ntotal ${(performance.now() - t0).toFixed(0)} ms`);
process.exit(0);
