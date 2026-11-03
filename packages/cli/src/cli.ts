#!/usr/bin/env -S node --experimental-strip-types --no-warnings
// tbr generate | check | decode: schema IR, lockfile, generated codecs and a message dump.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeError, FLAG_ERROR, VerifyError, type Codec } from 'ts-bin-rpc/runtime';
import { buildSchema } from './build.ts';
import { emitCodecs } from './emit.ts';
import { emptyLock, parseLock, stringifyLock, updateLock, type Change, type Lock } from './lock.ts';
import { formatLocation } from './ir.ts';
import { printErrors, printSchema } from './print.ts';
import { Ts71Source } from './source.ts';

const USAGE = `usage: tbr generate | check [options]
       tbr decode <file|-> (--proc <path> [--input] | --type <Name>) [options]

  --project <tsconfig>     TypeScript project (default: tsconfig.json)
  --router <file#export>   router to compile (default: src/router.ts#appRouter)
  --lock <file>            lockfile (default: tbr.lock.json next to the tsconfig)
  --out <file>             generated codecs (default: tbr.gen.ts next to the router)
  --dry-run                generate: print the schema and the lockfile instead of writing
  --allow-breaking         generate: accept breaking changes
  --watch, -w              generate: regenerate on every change to the project's files
  --proc <path>            decode: the message is the output of this procedure (with --input: its input)
  --type <Name>            decode: the message is this object type
`;

export interface RunOptions {
  /** Stops `generate --watch`. */
  signal?: AbortSignal;
}

export function run(argv: string[], out: (s: string) => void = (s) => process.stdout.write(s), options: RunOptions = {}): number | Promise<number> {
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
      watch: { type: 'boolean', short: 'w', default: false },
      proc: { type: 'string' },
      type: { type: 'string' },
      input: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const command = positionals[0];
  if (values.help || (command !== 'generate' && command !== 'check' && command !== 'decode')) {
    out(USAGE);
    return values.help ? 0 : 2;
  }

  const project = path.resolve(values.project);
  const root = path.dirname(project);
  const [routerFile, exportName = 'appRouter'] = values.router.split('#');
  const lockPath = path.resolve(values.lock ?? path.join(root, 'tbr.lock.json'));
  const outPath = path.resolve(values.out ?? path.join(path.dirname(path.resolve(root, routerFile)), 'tbr.gen.ts'));

  if (command === 'decode') {
    if (!positionals[1] || !!values.proc === !!values.type) {
      out(USAGE);
      return 2;
    }
    return decode(positionals[1], outPath, values, out);
  }

  const paths: Paths = { root, router: path.resolve(root, routerFile), exportName, lockPath, outPath };
  if (values.watch) {
    if (command !== 'generate') {
      out('--watch works with generate only\n');
      return 2;
    }
    return watch(project, paths, values, out, options.signal);
  }
  const src = new Ts71Source(project);
  try {
    return command === 'check' ? check(src, paths, out) : generate(src, paths, readLock(lockPath), values, out);
  } finally {
    src.close();
  }
}

interface Paths {
  root: string;
  router: string;
  exportName: string;
  lockPath: string;
  outPath: string;
}

interface LockState {
  exists: boolean;
  lock: Lock;
}

function readLock(lockPath: string): LockState {
  const exists = fs.existsSync(lockPath);
  return { exists, lock: exists ? parseLock(fs.readFileSync(lockPath, 'utf8')) : emptyLock() };
}

const rel = (p: string) => path.relative(process.cwd(), p) || p;

/** The schema, or null after printing why it cannot be built. */
function schemaOf(src: Ts71Source, p: Paths, out: (s: string) => void) {
  const built = buildSchema(src, p.router, p.exportName);
  if (!built.errors.length) return built.schema;
  out(`${built.errors.length} type(s) cannot be sent over the wire:\n` + printErrors(built.errors));
  return null;
}

function check(src: Ts71Source, p: Paths, out: (s: string) => void): number {
  const schema = schemaOf(src, p, out);
  if (!schema) return 1;
  const prev = readLock(p.lockPath);
  if (!prev.exists) {
    out(`${rel(p.lockPath)} does not exist; run tbr generate\n`);
    return 1;
  }
  const { lock, changes } = updateLock(prev.lock, schema);
  if (stringifyLock(lock) === fs.readFileSync(p.lockPath, 'utf8')) {
    out(`${rel(p.lockPath)} is up to date\n`);
    return 0;
  }
  out(`${rel(p.lockPath)} is out of date:\n` + printChanges(changes));
  out(changes.some((c) => c.severity !== 'safe') ? 'the contract has breaking changes\n' : 'run tbr generate\n');
  return 1;
}

/**
 * Updates the lockfile from `prev` and writes the codecs. In watch mode `prev` is the lockfile as it was
 * when watching started, so a field that is added and renamed between two saves never reaches it.
 */
function generate(src: Ts71Source, p: Paths, prev: LockState, o: { 'dry-run': boolean; 'allow-breaking': boolean }, out: (s: string) => void): number {
  const schema = schemaOf(src, p, out);
  if (!schema) return 1;
  const { lock, changes } = updateLock(prev.lock, schema);
  const text = stringifyLock(lock);
  const current = fs.existsSync(p.lockPath) ? fs.readFileSync(p.lockPath, 'utf8') : null;

  if (changes.length) out(printChanges(changes));
  const blocking = changes.filter((c) => c.severity === 'error' || (c.severity === 'breaking' && !o['allow-breaking']));
  if (blocking.length) {
    const hint = blocking.some((c) => c.severity === 'error') ? '' : '; rerun with --allow-breaking to accept them';
    out(`${blocking.length} change(s) not applied${hint}\n`);
    return 1;
  }
  if (o['dry-run']) {
    out(printSchema(schema) + `\n// ${rel(p.lockPath)}\n` + text);
    return 0;
  }
  if (text === current) out(`${rel(p.lockPath)} is up to date\n`);
  else {
    fs.writeFileSync(p.lockPath, text);
    out(`${current === null ? 'created' : 'updated'} ${rel(p.lockPath)}\n`);
  }
  let from = path.relative(path.dirname(p.outPath), p.router).split(path.sep).join('/');
  if (!from.startsWith('.')) from = `./${from}`;
  const code = emitCodecs(schema, lock, { router: { from, name: p.exportName } });
  if (fs.existsSync(p.outPath) && fs.readFileSync(p.outPath, 'utf8') === code) out(`${rel(p.outPath)} is up to date\n`);
  else {
    fs.writeFileSync(p.outPath, code);
    out(`wrote ${rel(p.outPath)}\n`);
  }
  return 0;
}

const WATCHED = /\.[mc]?tsx?$|(^|[\\/])tsconfig[^\\/]*\.json$/;
const DEBOUNCE_MS = 30;

/**
 * generate --watch: one TypeScript project kept open, a fresh snapshot per batch of changes (the compiler
 * reuses unchanged files), regeneration on every save. Resolves when `signal` aborts.
 */
function watch(project: string, p: Paths, o: { 'dry-run': boolean; 'allow-breaking': boolean }, out: (s: string) => void, signal?: AbortSignal): Promise<number> {
  const src = new Ts71Source(project);
  let base = readLock(p.lockPath);
  let written = base.exists ? fs.readFileSync(p.lockPath, 'utf8') : null;
  const pending = new Map<string, 'changed' | 'created' | 'deleted'>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const regenerate = (label: string) => {
    const start = performance.now();
    let code: number;
    try {
      code = generate(src, p, base, o, out);
    } catch (e) {
      out(`${e instanceof Error ? e.message : String(e)}\n`);
      code = 1;
    }
    if (fs.existsSync(p.lockPath)) written = fs.readFileSync(p.lockPath, 'utf8');
    out(`${label} in ${(performance.now() - start).toFixed(0)} ms${code ? ', waiting for changes' : ''}\n`);
  };

  const flush = () => {
    timer = undefined;
    const files = { changed: [] as string[], created: [] as string[], deleted: [] as string[] };
    for (const [f, kind] of pending) files[kind].push(f);
    pending.clear();
    const start = performance.now();
    src.update(files);
    const names = [...files.changed, ...files.created, ...files.deleted].map(rel);
    out(`\n${names.join(', ')} changed (snapshot ${(performance.now() - start).toFixed(0)} ms)\n`);
    regenerate('regenerated');
  };

  regenerate('generated');
  out(`watching ${path.relative(process.cwd(), p.root) || '.'} for changes\n`);

  const watcher = fs.watch(p.root, { recursive: true }, (event, name) => {
    if (!name) return;
    const file = path.join(p.root, name);
    if (file === p.lockPath) {
      // Someone else changed the lockfile (git checkout, a teammate's pull): it is the new base.
      const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (now === written) return;
      written = now;
      base = readLock(p.lockPath);
      out(`\n${rel(file)} changed outside of watch; using it as the base\n`);
      regenerate('regenerated');
      return;
    }
    if (file === p.outPath || !WATCHED.test(name) || name.split(/[\\/]/).some((s) => s === 'node_modules' || s.startsWith('.'))) return;
    const kind = event === 'change' ? 'changed' : fs.existsSync(file) ? 'created' : 'deleted';
    pending.set(file, pending.get(file) === 'created' && kind === 'changed' ? 'created' : kind);
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });

  return new Promise((resolve) => {
    const stop = () => {
      clearTimeout(timer);
      watcher.close();
      src.close();
      resolve(0);
    };
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
  });
}

async function decode(file: string, genPath: string, o: { proc?: string; type?: string; input: boolean }, out: (s: string) => void): Promise<number> {
  const bytes = new Uint8Array(fs.readFileSync(file === '-' ? 0 : file));
  try {
    if (bytes.length > 3 && bytes[3] & FLAG_ERROR) {
      const e = decodeError(bytes);
      const data = e.data && JSON.parse(new TextDecoder().decode(e.data));
      out(dump({ error: { code: e.code, message: e.message, data } }));
      return 0;
    }
    const mod = (await import(pathToFileURL(genPath).href)) as {
      procedures: Record<string, { input: Codec<unknown> | null; output: Codec<unknown> | null }>;
      codecs: Record<string, Codec<unknown>>;
    };
    const what = o.type ? `type '${o.type}'` : `${o.input ? 'input' : 'output'} of '${o.proc}'`;
    const proc = o.proc ? mod.procedures[o.proc] : undefined;
    const codec = o.type ? mod.codecs[o.type] : o.input ? proc?.input : proc?.output;
    if (!codec) {
      out(`${path.relative(process.cwd(), genPath)} has no ${what}\n`);
      return 1;
    }
    out(dump(codec.decode(bytes)));
    return 0;
  } catch (e) {
    if (!(e instanceof VerifyError)) throw e;
    out(`invalid message: ${e.message}\n`);
    return 1;
  }
}

/** JSON with bigints as strings and typed arrays as arrays. */
function dump(v: unknown): string {
  const json = JSON.stringify(
    v,
    (_, x) => (typeof x === 'bigint' ? x.toString() : ArrayBuffer.isView(x) && !(x instanceof DataView) ? Array.from(x as unknown as ArrayLike<number>, Number) : x),
    2,
  );
  return json + '\n';
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
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort()); // --watch: close the TypeScript process, then exit
  Promise.resolve(run(process.argv.slice(2), undefined, { signal: stop.signal })).then((code) => (process.exitCode = code));
}
