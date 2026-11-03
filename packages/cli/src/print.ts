// Human-readable dump of the IR and of schema errors; also the format of golden snapshots.
import { fieldSignature, formatLocation, signature, type Schema } from './ir.ts';
import type { SchemaError } from './build.ts';

export function printSchema(s: Schema): string {
  const out: string[] = [];
  for (const p of s.procedures) {
    const input = p.input ? `${signature(p.input)}${p.inputOptional ? '?' : ''}` : '()';
    out.push(`procedure ${p.path}: ${input} -> ${p.stream ? 'stream ' : ''}${p.output ? signature(p.output) : 'void'}`);
  }
  for (const name of Object.keys(s.objects).sort()) {
    out.push('', `object ${name} {`);
    for (const f of s.objects[name].fields) {
      const renamed = f.renamedFrom ? ` (renamed from ${f.renamedFrom})` : '';
      out.push(`  ${f.name}: ${fieldSignature(f)}${renamed}`);
    }
    out.push('}');
  }
  for (const name of Object.keys(s.enums).sort()) {
    out.push('', `enum ${name} = ${s.enums[name].values.map((v) => JSON.stringify(v)).join(' | ')}`);
  }
  for (const name of Object.keys(s.unions).sort()) {
    const u = s.unions[name];
    out.push('', `union ${name} by ${u.discriminant} {`);
    for (const v of u.variants) out.push(`  ${JSON.stringify(v.tag)}: object ${v.object}`);
    out.push('}');
  }
  return out.join('\n') + '\n';
}

export function printErrors(errors: SchemaError[]): string {
  return errors.map((e) => `${formatLocation(e.location)}  ${e.path}: ${e.message}`).join('\n') + '\n';
}
