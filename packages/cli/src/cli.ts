// tbr generate | check | decode: schema IR, lockfile, generated codecs and a message dump.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeError, FLAG_ERROR, VerifyError, type Codec } from 'ts-bin-rpc/runtime';
import { codeOf, generate, printChanges, readLock, rel, resolvePaths, schemaOf, watch, type Paths } from './generate.ts';
import { LockError, parseLock, stringifyLock, updateLock, type Change } from './lock.ts';
import { Ts71Source } from './source.ts';

const USAGE = `usage: tbr generate | check [options]
       tbr decode <file|-> (--proc <path> [--input] | --type <Name>) [options]

  --project <tsconfig>     TypeScript project (default: tsconfig.json)
  --router <file#export>   router to compile (default: src/router.ts#appRouter)
  --lock <file>            lockfile (default: tbr.lock.json next to the tsconfig)
  --out <file>             generated codecs (default: tbr.gen.ts next to the router)
                           --router, --lock and --out are relative to the tsconfig's directory
  --dry-run                generate: print the schema and the lockfile instead of writing
  --allow-breaking         generate: accept breaking changes
  --watch, -w              generate: regenerate on every change to the project's files
  --base <ref|file>        check: also compare with the lockfile of a git ref (origin/main) or a file
  --json                   check: print the result as JSON

check exits with 0 when everything is up to date, 1 when the lockfile or the codecs are out of
date or cannot be generated, 3 when the contract has breaking changes, 2 on bad arguments.
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
      base: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const command = positionals[0];
  if (values.help || (command !== 'generate' && command !== 'check' && command !== 'decode')) {
    out(USAGE);
    return values.help ? 0 : 2;
  }

  const project = path.resolve(values.project);
  const paths = resolvePaths(project, values.router, values.lock, values.out);

  if (command === 'decode') {
    if (!positionals[1] || !!values.proc === !!values.type) {
      out(USAGE);
      return 2;
    }
    return decode(positionals[1], paths.outPath, values, out);
  }

  if (values.watch) {
    if (command !== 'generate') {
      out('--watch works with generate only\n');
      return 2;
    }
    return watch(project, paths, values, { out }, options.signal);
  }
  try {
    const src = new Ts71Source(project);
    try {
      return command === 'check' ? check(src, paths, values, out) : generate(src, paths, readLock(paths.lockPath), values, out).code;
    } finally {
      src.close();
    }
  } catch (e) {
    if (!(e instanceof LockError)) throw e;
    out(`${e.message}\n`);
    return 1;
  }
}

const lf = (s: string) => s.replace(/\r\n/g, '\n');

type CheckStatus = 'ok' | 'stale' | 'breaking' | 'error';

/**
 * Compares the router with the lockfile and the generated codecs, and with `--base`, with the
 * lockfile of another commit: the one in a pull request is up to date with its own changes, breaking
 * or not, so only the base shows what it breaks.
 */
function check(src: Ts71Source, p: Paths, o: { base?: string; json: boolean }, print: (s: string) => void): number {
  const out = o.json ? () => {} : print;
  const done = (status: CheckStatus, changes: Change[] = [], message?: string) => {
    if (o.json) print(JSON.stringify({ status, ...(message && { message }), changes }, null, 2) + '\n');
    else if (message) print(message + '\n');
    return status === 'ok' ? 0 : status === 'breaking' ? 3 : 1;
  };
  const schema = schemaOf(src, p, out);
  if (!schema) return done('error', [], 'the router has types that cannot be sent over the wire');
  const prev = readLock(p.lockPath);
  if (!prev.exists) return done('stale', [], `${rel(p.lockPath)} does not exist; run tbr generate`);
  const { lock, changes } = updateLock(prev.lock, schema);
  const errors = changes.filter((c) => c.severity === 'error');
  if (errors.length) {
    out(printChanges(errors));
    return done('error', errors, `${errors.length} change(s) cannot be applied`);
  }

  let base: Change[] = [];
  if (o.base) {
    base = updateLock(baseLock(o.base, p), schema).changes.filter((c) => c.severity !== 'safe');
    if (base.length) out(`breaking changes since ${o.base}:\n` + printChanges(base));
  }

  const stale = stringifyLock(lock) !== lf(fs.readFileSync(p.lockPath, 'utf8'));
  if (stale) {
    out(`${rel(p.lockPath)} is out of date:\n` + printChanges(changes));
    const breaking = [...base, ...changes.filter((c) => c.severity !== 'safe')];
    return breaking.length ? done('breaking', breaking, 'the contract has breaking changes') : done('stale', changes, 'run tbr generate');
  }
  if (base.length) return done('breaking', base, 'the contract has breaking changes');
  // Rules (`MaxLength<64>`) leave the lockfile and the types the client sees as they are, so only
  // the generated file shows that one was added. A project that does not commit the file has none.
  if (fs.existsSync(p.outPath) && lf(fs.readFileSync(p.outPath, 'utf8')) !== codeOf(schema, lock, p)) {
    return done('stale', [], `${rel(p.lockPath)} is up to date\n${rel(p.outPath)} is out of date; run tbr generate`);
  }
  return done('ok', [], `${rel(p.lockPath)} is up to date`);
}

/** The lockfile at `ref`: a file, or the lockfile's path in a git commit. */
function baseLock(ref: string, p: Paths) {
  if (fs.existsSync(ref) && fs.statSync(ref).isFile()) return parseLock(fs.readFileSync(ref, 'utf8'), ref);
  const dir = path.dirname(p.lockPath);
  let text: string;
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).trim();
    const file = path.relative(top, p.lockPath).split(path.sep).join('/');
    text = execFileSync('git', ['show', `${ref}:${file}`], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '').trim();
    // a lockfile that does not exist at the base: everything in it is new
    if (/does not exist|exists on disk, but not in/.test(stderr)) return parseLock('{ "format": 1 }');
    throw new LockError(`--base ${ref}: ${stderr || (e as Error).message}`);
  }
  return parseLock(text, `${ref}:${rel(p.lockPath)}`);
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

/** Runs the command line of the process: bin.ts calls it once TypeScript is known to be there. */
export function main() {
  process.stdout.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); // `tbr generate --dry-run | head`
    throw e;
  });
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort()); // --watch: close the TypeScript process, then exit
  Promise.resolve(run(process.argv.slice(2), undefined, { signal: stop.signal })).then((code) => (process.exitCode = code));
}
