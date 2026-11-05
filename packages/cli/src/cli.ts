#!/usr/bin/env -S node --experimental-strip-types --no-warnings
// tbr generate | check | decode: schema IR, lockfile, generated codecs and a message dump.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeError, FLAG_ERROR, VerifyError, type Codec } from 'ts-bin-rpc/runtime';
import { codeOf, generate, printChanges, readLock, rel, resolvePaths, schemaOf, watch, type Paths } from './generate.ts';
import { stringifyLock, updateLock } from './lock.ts';
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
  // --lock and --out are relative to the working directory, the router to the tsconfig
  const paths = resolvePaths(project, values.router, values.lock && path.resolve(values.lock), values.out && path.resolve(values.out));

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
  const src = new Ts71Source(project);
  try {
    return command === 'check' ? check(src, paths, out) : generate(src, paths, readLock(paths.lockPath), values, out).code;
  } finally {
    src.close();
  }
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
    // Rules (`MaxLength<64>`) leave the lockfile and the types the client sees as they are, so only
    // the generated file shows that one was added. A project that does not commit the file has none.
    if (fs.existsSync(p.outPath) && fs.readFileSync(p.outPath, 'utf8').replace(/\r\n/g, '\n') !== codeOf(schema, lock, p)) {
      out(`${rel(p.outPath)} is out of date; run tbr generate\n`);
      return 1;
    }
    return 0;
  }
  out(`${rel(p.lockPath)} is out of date:\n` + printChanges(changes));
  out(changes.some((c) => c.severity !== 'safe') ? 'the contract has breaking changes\n' : 'run tbr generate\n');
  return 1;
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

if (process.argv[1] && fs.realpathSync(process.argv[1]) === import.meta.filename) {
  process.stdout.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); // `tbr generate --dry-run | head`
    throw e;
  });
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort()); // --watch: close the TypeScript process, then exit
  Promise.resolve(run(process.argv.slice(2), undefined, { signal: stop.signal })).then((code) => (process.exitCode = code));
}
