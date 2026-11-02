// Generates codecs for bench/gen/router.ts and strips types so Node and browsers load plain JS.
//   node --experimental-strip-types bench/gen/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { Ts71Source } from '../../packages/cli/src/source.ts';
import { buildSchema } from '../../packages/cli/src/build.ts';
import { emptyLock, updateLock } from '../../packages/cli/src/lock.ts';
import { emitCodecs } from '../../packages/cli/src/emit.ts';

const dir = import.meta.dirname;
const out = path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });
const src = new Ts71Source(path.join(dir, 'tsconfig.json'));
try {
  const { schema, errors } = buildSchema(src, path.join(dir, 'router.ts'), 'appRouter');
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'));
  const code = emitCodecs(schema, updateLock(emptyLock(), schema).lock, { runtime: './runtime.mjs' });
  fs.writeFileSync(path.join(out, 'codec.mjs'), stripTypeScriptTypes(code));
  const runtime = fs.readFileSync(path.join(dir, '../../packages/ts-bin-rpc/src/runtime.ts'), 'utf8');
  fs.writeFileSync(path.join(out, 'runtime.mjs'), stripTypeScriptTypes(runtime));
} finally {
  src.close();
}
console.log('bench/gen/out: codec.mjs, runtime.mjs');
