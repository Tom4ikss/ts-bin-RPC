// Builds a fixture, writes its generated codecs to test/.gen and imports them.
import fs from 'node:fs';
import path from 'node:path';
import { buildSchema } from '../src/build.ts';
import { emitCodecs } from '../src/emit.ts';
import { emptyLock, updateLock, type Lock } from '../src/lock.ts';
import type { Schema } from '../src/ir.ts';
import { Ts71Source } from '../src/source.ts';
import type { Codec } from 'ts-bin-rpc/runtime';

export interface Generated {
  schema: Schema;
  lock: Lock;
  file: string;
  mod: {
    procedures: Record<string, { input: Codec<any> | null; inputOptional: boolean; output: Codec<any> | null }>;
    codecs: Record<string, Codec<any>>;
  };
}

export async function generate(fixture: string, router = 'router.ts', lock = emptyLock(), out = fixture): Promise<Generated> {
  const dir = path.join(import.meta.dirname, 'fixtures', fixture);
  const src = new Ts71Source(path.join(dir, 'tsconfig.json'));
  try {
    const { schema, errors } = buildSchema(src, path.join(dir, router), 'appRouter');
    if (errors.length) throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
    const next = updateLock(lock, schema).lock;
    const file = path.join(import.meta.dirname, '.gen', `${out}.ts`);
    const from = path.relative(path.dirname(file), path.join(dir, router)).split(path.sep).join('/');
    fs.writeFileSync(file, emitCodecs(schema, next, { router: { from, name: 'appRouter' } }));
    return { schema, lock: next, file, mod: await import(file) };
  } finally {
    src.close();
  }
}
