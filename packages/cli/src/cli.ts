#!/usr/bin/env -S node --experimental-strip-types --no-warnings
// tbr generate | check: schema IR, lockfile and generated codecs.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildSchema } from './build.ts';
import { emitCodecs } from './emit.ts';
import { emptyLock, parseLock, stringifyLock, updateLock, type Change } from './lock.ts';
import { formatLocation } from './ir.ts';
import { printErrors, printSchema } from './print.ts';
import { Ts71Source } from './source.ts';

const USAGE = `usage: tbr <generate|check> [options]

  --project <tsconfig>     TypeScript project (default: tsconfig.json)
  --router <file#export>   router to compile (default: src/router.ts#appRouter)
  --lock <file>            lockfile (default: tbr.lock.json next to the tsconfig)
  --out <file>             generated codecs (default: tbr.gen.ts next to the router)
  --dry-run                generate: print the schema and the lockfile instead of writing
  --allow-breaking         generate: accept breaking changes
`;

export function run(argv: string[], out: (s: string) => void = (s) => process.stdout.write(s)): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: 'string', default: 'tsconfig.json' },
      router: { type: 'string', default: 'src/router.ts#appRouter' },
      lock: { type: 'string' },
      out: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'allow-breaking': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const command = positionals[0];
  if (values.help || (command !== 'generate' && command !== 'check')) {
    out(USAGE);
    return values.help ? 0 : 2;
  }

  const project = path.resolve(values.project);
  const root = path.dirname(project);
  const [routerFile, exportName = 'appRouter'] = values.router.split('#');
  const lockPath = path.resolve(values.lock ?? path.join(root, 'tbr.lock.json'));
  const outPath = path.resolve(values.out ?? path.join(path.dirname(path.resolve(root, routerFile)), 'tbr.gen.ts'));

  const src = new Ts71Source(project);
  let built;
  try {
    built = buildSchema(src, path.resolve(root, routerFile), exportName);
  } finally {
    src.close();
  }
  if (built.errors.length) {
    out(`${built.errors.length} type(s) cannot be sent over the wire:\n` + printErrors(built.errors));
    return 1;
  }

  const hadLock = fs.existsSync(lockPath);
  const prev = hadLock ? parseLock(fs.readFileSync(lockPath, 'utf8')) : emptyLock();
  const { lock, changes } = updateLock(prev, built.schema);
  const text = stringifyLock(lock);
  const upToDate = hadLock && text === fs.readFileSync(lockPath, 'utf8');
  const rel = path.relative(process.cwd(), lockPath) || lockPath;

  if (command === 'check') {
    if (!hadLock) {
      out(`${rel} does not exist; run tbr generate\n`);
      return 1;
    }
    if (upToDate) {
      out(`${rel} is up to date\n`);
      return 0;
    }
    out(`${rel} is out of date:\n` + printChanges(changes));
    out(changes.some((c) => c.severity !== 'safe') ? 'the contract has breaking changes\n' : 'run tbr generate\n');
    return 1;
  }

  if (changes.length) out(printChanges(changes));
  const blocking = changes.filter((c) => c.severity === 'error' || (c.severity === 'breaking' && !values['allow-breaking']));
  if (blocking.length) {
    const hint = blocking.some((c) => c.severity === 'error') ? '' : '; rerun with --allow-breaking to accept them';
    out(`${blocking.length} change(s) not applied${hint}\n`);
    return 1;
  }
  if (values['dry-run']) {
    out(printSchema(built.schema) + `\n// ${rel}\n` + text);
    return 0;
  }
  if (!upToDate) fs.writeFileSync(lockPath, text);
  out(upToDate ? `${rel} is up to date\n` : `${hadLock ? 'updated' : 'created'} ${rel}\n`);
  const code = emitCodecs(built.schema, lock);
  const relOut = path.relative(process.cwd(), outPath) || outPath;
  if (fs.existsSync(outPath) && fs.readFileSync(outPath, 'utf8') === code) out(`${relOut} is up to date\n`);
  else {
    fs.writeFileSync(outPath, code);
    out(`wrote ${relOut}\n`);
  }
  return 0;
}

function printChanges(changes: Change[]): string {
  const order = { error: 0, breaking: 1, safe: 2 };
  return [...changes]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map((c) => `  ${c.severity.padEnd(8)} ${c.path}: ${c.message}${c.location ? `  (${formatLocation(c.location)})` : ''}\n`)
    .join('');
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === import.meta.filename) {
  process.stdout.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); // `tbr generate --dry-run | head`
    throw e;
  });
  process.exitCode = run(process.argv.slice(2));
}
