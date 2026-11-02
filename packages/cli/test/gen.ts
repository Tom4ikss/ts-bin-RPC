// Dev helper: node test/gen.ts <fixture> → test/.gen/<fixture>.ts
import fs from 'node:fs';
import path from 'node:path';
import { Ts71Source } from '../src/source.ts';
import { buildSchema } from '../src/build.ts';
import { emptyLock, updateLock } from '../src/lock.ts';
import { emitCodecs } from '../src/emit.ts';
const name = process.argv[2] ?? 'supported';
const dir = path.join(import.meta.dirname, 'fixtures', name);
const src = new Ts71Source(path.join(dir, 'tsconfig.json'));
try {
  const { schema, errors } = buildSchema(src, path.join(dir, 'router.ts'), 'appRouter');
  if (errors.length) throw new Error(JSON.stringify(errors));
  const { lock } = updateLock(emptyLock(), schema);
  fs.writeFileSync(path.join(import.meta.dirname, '.gen', `${name}.ts`), emitCodecs(schema, lock));
} finally { src.close(); }
