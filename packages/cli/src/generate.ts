// tbr generate and generate --watch, shared by the command and the Vite plugin: schema, lockfile,
// generated codecs.
import fs from 'node:fs';
import path from 'node:path';
import { buildSchema } from './build.ts';
import { emitCodecs } from './emit.ts';
import { emptyLock, parseLock, stringifyLock, updateLock, type Change, type Lock } from './lock.ts';
import { formatLocation, type Schema } from './ir.ts';
import { printErrors, printSchema } from './print.ts';
import { Ts71Source } from './source.ts';

export interface Paths {
  root: string;
  router: string;
  exportName: string;
  lockPath: string;
  outPath: string;
}

export interface GenerateOptions {
  'dry-run': boolean;
  'allow-breaking': boolean;
  /** Ends the message about breaking changes that were not applied. */
  allowHint?: string;
}

/** `router` is `file#export`, relative to the tsconfig's directory like `lock` and `out`. */
export function resolvePaths(project: string, router: string, lock?: string, out?: string): Paths {
  const root = path.dirname(project);
  const [routerFile, exportName = 'appRouter'] = router.split('#');
  const routerPath = path.resolve(root, routerFile);
  return {
    root,
    router: routerPath,
    exportName,
    lockPath: path.resolve(root, lock ?? 'tbr.lock.json'),
    outPath: path.resolve(root, out ?? path.join(path.dirname(routerPath), 'tbr.gen.ts')),
  };
}

export interface LockState {
  exists: boolean;
  lock: Lock;
}

export function readLock(lockPath: string): LockState {
  const exists = fs.existsSync(lockPath);
  return { exists, lock: exists ? parseLock(fs.readFileSync(lockPath, 'utf8'), rel(lockPath)) : emptyLock() };
}

export const rel = (p: string) => path.relative(process.cwd(), p) || p;

/** The schema, or null after printing why it cannot be built. */
export function schemaOf(src: Ts71Source, p: Paths, out: (s: string) => void) {
  const built = buildSchema(src, p.router, p.exportName);
  if (!built.errors.length) return built.schema;
  out(`${built.errors.length} type(s) cannot be sent over the wire:\n` + printErrors(built.errors));
  return null;
}

export function codeOf(schema: Schema, lock: Lock, p: Paths): string {
  let from = path.relative(path.dirname(p.outPath), p.router).split(path.sep).join('/');
  if (!from.startsWith('.')) from = `./${from}`;
  return emitCodecs(schema, lock, { router: { from, name: p.exportName } });
}

export interface Generated {
  code: number;
  /** The generated codecs changed on disk. */
  wrote: boolean;
}

/**
 * Updates the lockfile from `prev` and writes the codecs. In watch mode `prev` is the lockfile as it was
 * when watching started, so a field that is added and renamed between two saves never reaches it.
 */
export function generate(src: Ts71Source, p: Paths, prev: LockState, o: GenerateOptions, out: (s: string) => void): Generated {
  const schema = schemaOf(src, p, out);
  if (!schema) return { code: 1, wrote: false };
  const { lock, changes } = updateLock(prev.lock, schema);
  const text = stringifyLock(lock);
  const current = fs.existsSync(p.lockPath) ? fs.readFileSync(p.lockPath, 'utf8') : null;

  if (changes.length) out(printChanges(changes));
  const blocking = changes.filter((c) => c.severity === 'error' || (c.severity === 'breaking' && !o['allow-breaking']));
  if (blocking.length) {
    const hint = blocking.some((c) => c.severity === 'error') ? '' : `; ${o.allowHint ?? 'rerun with --allow-breaking to accept them'}`;
    out(`${blocking.length} change(s) not applied${hint}\n`);
    return { code: 1, wrote: false };
  }
  if (o['dry-run']) {
    out(printSchema(schema) + `\n// ${rel(p.lockPath)}\n` + text);
    return { code: 0, wrote: false };
  }
  if (text === current) out(`${rel(p.lockPath)} is up to date\n`);
  else {
    fs.writeFileSync(p.lockPath, text);
    out(`${current === null ? 'created' : 'updated'} ${rel(p.lockPath)}\n`);
  }
  const code = codeOf(schema, lock, p);
  if (fs.existsSync(p.outPath) && fs.readFileSync(p.outPath, 'utf8') === code) {
    out(`${rel(p.outPath)} is up to date\n`);
    return { code: 0, wrote: false };
  }
  fs.mkdirSync(path.dirname(p.outPath), { recursive: true });
  fs.writeFileSync(p.outPath, code);
  out(`wrote ${rel(p.outPath)}\n`);
  return { code: 0, wrote: true };
}

const WATCHED = /\.[mc]?tsx?$|(^|[\\/])tsconfig[^\\/]*\.json$/;
const DEBOUNCE_MS = 30;

export interface WatchHooks {
  out: (s: string) => void;
  /** After each generation, with what it printed. */
  generated?: (result: Generated, log: string) => void;
}

/**
 * generate --watch: one TypeScript project kept open, a fresh snapshot per batch of changes (the compiler
 * reuses unchanged files), regeneration on every save. The first generation runs before this returns.
 * Resolves when `signal` aborts.
 */
export function watch(project: string, p: Paths, o: GenerateOptions, hooks: WatchHooks, signal?: AbortSignal): Promise<number> {
  const { out } = hooks;
  const src = new Ts71Source(project);
  let base = readLock(p.lockPath);
  let written = base.exists ? fs.readFileSync(p.lockPath, 'utf8') : null;
  const pending = new Map<string, 'changed' | 'created' | 'deleted'>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const regenerate = (label: string) => {
    const start = performance.now();
    let log = '';
    const capture = (s: string) => ((log += s), out(s));
    let result: Generated;
    try {
      result = generate(src, p, base, o, capture);
    } catch (e) {
      capture(`${e instanceof Error ? e.message : String(e)}\n`);
      result = { code: 1, wrote: false };
    }
    if (fs.existsSync(p.lockPath)) written = fs.readFileSync(p.lockPath, 'utf8');
    out(`${label} in ${(performance.now() - start).toFixed(0)} ms${result.code ? ', waiting for changes' : ''}\n`);
    hooks.generated?.(result, log);
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

export function printChanges(changes: Change[]): string {
  const order = { error: 0, breaking: 1, safe: 2 };
  return [...changes]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map((c) => `  ${c.severity.padEnd(8)} ${c.path}: ${c.message}${c.location ? `  (${formatLocation(c.location)})` : ''}\n`)
    .join('');
}
