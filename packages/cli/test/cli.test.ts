import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/cli.ts';
import type { Codec } from 'ts-bin-rpc/runtime';

const fixture = (...p: string[]) => path.join(import.meta.dirname, 'fixtures', ...p);

function tbr(...args: string[]) {
  let output = '';
  const code = run(args, (s) => (output += s));
  return { code, output };
}

describe('tbr generate / check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbr-'));
  const lock = path.join(dir, 'tbr.lock.json');
  const gen = path.join(dir, 'tbr.gen.ts');
  const at = (step: string) => ['--project', fixture('evolution', 'tsconfig.json'), '--router', `${step}.ts`, '--lock', lock, '--out', gen];

  it('check fails without a lockfile', () => {
    expect(tbr('check', ...at('v1'))).toMatchObject({ code: 1, output: expect.stringContaining('does not exist') });
  });

  it('dry run prints the schema and the lockfile without writing', () => {
    const r = tbr('generate', '--dry-run', ...at('v1'));
    expect(r.code).toBe(0);
    expect(r.output).toContain('procedure get: object get:input -> object User');
    expect(r.output).toContain('"mail": { "id": 2, "type": "string" }');
    expect(fs.existsSync(lock)).toBe(false);
    expect(fs.existsSync(gen)).toBe(false);
  });

  it('generate creates the lockfile, check accepts it', () => {
    expect(tbr('generate', ...at('v1'))).toMatchObject({ code: 0, output: expect.stringContaining('created') });
    expect(fs.readFileSync(gen, 'utf8')).toContain('from "ts-bin-rpc/runtime"');
    expect(tbr('check', ...at('v1'))).toMatchObject({ code: 0, output: expect.stringContaining('up to date') });
  });

  it('check reports generated code that is out of date, and skips a file that is not there', () => {
    // a rule (`MaxLength<64>`) changes only the generated file
    fs.appendFileSync(gen, '// edited\n');
    expect(tbr('check', ...at('v1'))).toMatchObject({ code: 1, output: expect.stringContaining('tbr.gen.ts is out of date; run tbr generate') });
    fs.rmSync(gen);
    expect(tbr('check', ...at('v1'))).toMatchObject({ code: 0, output: expect.stringContaining('up to date') });
    expect(tbr('generate', ...at('v1')).code).toBe(0);
  });

  it('check reports a stale lockfile with only safe changes', () => {
    const r = tbr('check', ...at('v2'));
    expect(r.code).toBe(1);
    expect(r.output).toContain("User.email: renamed from 'mail', keeps id 2");
    expect(r.output).toContain('run tbr generate');
    expect(tbr('generate', ...at('v2')).code).toBe(0);
  });

  it('breaking changes need --allow-breaking', () => {
    const c = tbr('check', ...at('v3'));
    expect(c.code).toBe(1);
    expect(c.output).toContain('add /** @renamedFrom name */ to keep id 1');
    expect(c.output).toContain('User.age: type changed: u8 -> u16');
    expect(c.output).toContain('the contract has breaking changes');

    const before = fs.readFileSync(lock, 'utf8');
    expect(tbr('generate', ...at('v3'))).toMatchObject({ code: 1, output: expect.stringContaining('--allow-breaking') });
    expect(fs.readFileSync(lock, 'utf8')).toBe(before);
    expect(tbr('generate', '--allow-breaking', ...at('v3')).code).toBe(0);
  });

  it('reusing a removed field name with another type is refused even with --allow-breaking', () => {
    const r = tbr('generate', '--allow-breaking', ...at('v4'));
    expect(r.code).toBe(1);
    expect(r.output).toContain("'nick' was removed earlier");
  });

  it('unsupported types fail generation', () => {
    const r = tbr('generate', '--dry-run', '--project', fixture('rejected', 'tsconfig.json'), '--router', 'router.ts');
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/^39 type\(s\) cannot be sent over the wire/);
  });
});

describe('streams', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbr-'));
  const lock = path.join(dir, 'tbr.lock.json');
  const gen = path.join(dir, 'tbr.gen.ts');
  const at = (step: string) => ['--project', fixture('streams', 'tsconfig.json'), '--router', `${step}.ts`, '--lock', lock, '--out', gen];

  it('finds Stream<T>, async generators, async iterables and ReadableStream, with or without a promise', () => {
    const r = tbr('generate', ...at('s1'));
    expect(r.code).toBe(0);
    const locked = JSON.parse(fs.readFileSync(lock, 'utf8')).procedures;
    expect(locked).toMatchObject({
      feed: { input: 'object feed:input', output: 'stream object Tick' },
      plain: { output: 'stream object Tick' },
      generator: { output: 'stream object generator:row' },
      iterable: { output: 'stream string' },
      web: { output: 'stream object Tick' },
      last: { output: 'object Tick' },
    });
    const code = fs.readFileSync(gen, 'utf8');
    expect(code).toMatch(/"feed": \{[^}]*stream: true/);
    expect(code).toContain('StreamItemOf');
    expect(tbr('generate', '--dry-run', ...at('s1')).output).toContain('procedure feed: object feed:input -> stream object Tick');
  });

  it('refuses a stream marked as a query', () => {
    const r = tbr('generate', '--dry-run', '--project', fixture('streams', 'tsconfig.json'), '--router', 's3.ts');
    expect(r.code).toBe(1);
    expect(r.output).toContain('feed: a stream cannot be a query: streams are not cached; remove query()');
  });

  it('turning a stream into a call, or a call into a stream, is breaking', () => {
    const r = tbr('check', ...at('s2'));
    expect(r.code).toBe(1);
    expect(r.output).toContain('output changed: stream object Tick -> object Tick[]');
    expect(r.output).toContain('output changed: object Tick -> stream object Tick');
    expect(r.output).toContain('the contract has breaking changes');
  });
});

describe('stale generated code', () => {
  // A project inside the package, so that the generated file resolves ts-bin-rpc.
  const dir = path.join(import.meta.dirname, '.gen', 'stale');
  const routerFile = path.join(dir, 'router.ts');
  const v1 = fs.readFileSync(fixture('evolution', 'v1.ts'), 'utf8');
  const tsc = () => {
    try {
      execFileSync(path.join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsc'), ['-p', dir], { stdio: 'pipe' });
      return '';
    } catch (e) {
      return String((e as { stdout: Buffer }).stdout);
    }
  };
  const generate = () => tbr('generate', '--allow-breaking', '--project', path.join(dir, 'tsconfig.json'), '--router', 'router.ts');

  beforeAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const options = { target: 'es2024', module: 'nodenext', strict: true, noEmit: true, allowImportingTsExtensions: true, skipLibCheck: true };
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: options, include: ['*.ts'] }));
    fs.writeFileSync(routerFile, v1);
    expect(generate().code).toBe(0);
  });

  it.each([
    ['a field type', v1.replace('age: u8;', 'age: string;'), '"get output"'],
    ['a numeric brand', v1.replace('age: u8;', 'age: u16;').replace('import type { u8, u32 }', 'import type { u16, u32 }'), '"get output"'],
    ['an optional field', v1.replace('name: string;\n  mail', 'name?: string;\n  mail'), '"get output"'],
    ['an input', v1.replace('input: { id: u32 }', 'input: { id: u32; full: boolean }'), '"get input"'],
    ['a procedure', v1.replace('  shapes:', '  count: async (): Promise<u32> => 0,\n  shapes:'), '"procedure list"'],
    ['a ctx parameter', v1.replace('get: async (input: { id: u32 })', 'get: async (input: { id: u32 }, ctx: { user: string })'), '"get ctx"'],
    ['query()', `import { query } from 'ts-bin-rpc/server';\n${v1.replace('get: async (input: { id: u32 }): Promise<User> => null!,', 'get: query(async (input: { id: u32 }): Promise<User> => null!),')}`, '"get query"'],
  ])('changing %s without tbr generate fails to compile', (_, router, where) => {
    expect(tsc()).toBe('');
    fs.writeFileSync(routerFile, router);
    try {
      const errors = tsc();
      expect(errors).toContain('StaleCodegen_RunTbrGenerate');
      expect(errors).toContain(where);
      expect(generate().code).toBe(0);
      expect(tsc()).toBe('');
    } finally {
      fs.writeFileSync(routerFile, v1);
      generate();
    }
  }, 60_000);
});

describe('tbr generate --watch', () => {
  const dir = path.join(import.meta.dirname, '.gen', 'watch');
  const routerFile = path.join(dir, 'router.ts');
  const lockFile = path.join(dir, 'tbr.lock.json');
  const v1 = fs.readFileSync(fixture('evolution', 'v1.ts'), 'utf8');
  const withField = (field: string) => v1.replace('  nick?: string;\n', `  nick?: string;\n  ${field}\n`);

  it('regenerates on save, against the lockfile it started with', async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, module: 'nodenext', noEmit: true }, include: ['*.ts'] }));
    fs.writeFileSync(routerFile, v1);
    expect(tbr('generate', '--project', path.join(dir, 'tsconfig.json'), '--router', 'router.ts').code).toBe(0);
    let output = '';
    const stop = new AbortController();
    const done = run(['generate', '--watch', '--project', path.join(dir, 'tsconfig.json'), '--router', 'router.ts'], (s) => (output += s), { signal: stop.signal });
    /** Waits for a regeneration whose output contains `text`; returns the output since the previous wait. */
    let mark = 0;
    const regenerated = async (text: string) => {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const chunk = output.slice(mark);
        const at = chunk.indexOf(text);
        const end = at < 0 ? -1 : chunk.slice(at).search(/^regenerated in \d+ ms.*\n/m);
        if (end >= 0) {
          const line = chunk.slice(at + end).indexOf('\n') + at + end + 1;
          mark += line;
          return chunk.slice(0, line);
        }
        if (Date.now() > deadline) throw new Error(`no regeneration with '${text}' after:\n${chunk}`);
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    const lockField = (name: string) => (JSON.parse(fs.readFileSync(lockFile, 'utf8')).objects.User.fields as Record<string, { id: number; retired?: true }>)[name];
    try {
      while (!output.includes('watching')) await new Promise((r) => setTimeout(r, 10));
      expect(output).toMatch(/tbr\.lock\.json is up to date/);

      // A field added, then renamed before anything was committed: the first name leaves no trace.
      fs.writeFileSync(routerFile, withField('nam: string;'));
      await regenerated('User.nam: field added');
      fs.writeFileSync(routerFile, withField('nickname: string;'));
      await regenerated('User.nickname: field added');
      expect(lockField('nam')).toBeUndefined();
      expect(fs.readFileSync(path.join(dir, 'tbr.gen.ts'), 'utf8')).toContain('nickname');

      // A type that cannot be sent: reported, and watching goes on.
      fs.writeFileSync(routerFile, withField('nickname: Set<string>;'));
      expect(await regenerated("'Set' is not supported")).toMatch(/waiting for changes\n$/);

      // A lockfile changed elsewhere (a checkout) becomes the base.
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      lock.objects.User.fields.nickname = { id: 42, type: 'string' };
      fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
      await regenerated('changed outside of watch');
      fs.writeFileSync(routerFile, withField('nickname: string;'));
      await regenerated('wrote');
      expect(lockField('nickname').id).toBe(42);
    } finally {
      stop.abort();
    }
    expect(await done).toBe(0);
  }, 60_000);
});

describe('tbr decode', () => {
  const dir = path.join(import.meta.dirname, '.gen', 'decode');
  const project = ['--project', path.join(dir, 'tsconfig.json'), '--router', 'router.ts'];
  const write = (name: string, bytes: Uint8Array) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, bytes);
    return file;
  };
  const decode = async (...args: string[]) => {
    let output = '';
    const code = await run(['decode', ...args, ...project], (s) => (output += s));
    return { code, output };
  };
  let mod: { procedures: Record<string, { input: Codec<any>; output: Codec<any> }> };

  beforeAll(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] }));
    fs.copyFileSync(fixture('evolution', 'v1.ts'), path.join(dir, 'router.ts'));
    expect(tbr('generate', ...project).code).toBe(0);
    mod = await import(path.join(dir, 'tbr.gen.ts'));
  });

  it('prints an output, an input and an object type as JSON', async () => {
    const user = { id: 7, name: 'Ада', mail: 'a@example.com', age: 30, role: 'admin' as const };
    const out = write('user.bin', mod.procedures.get.output.encode(user));
    expect(JSON.parse((await decode(out, '--proc', 'get')).output)).toEqual(user);
    expect(JSON.parse((await decode(out, '--type', 'User')).output)).toEqual(user);
    const input = write('input.bin', mod.procedures.get.input.encode({ id: 7 }));
    expect(JSON.parse((await decode(input, '--proc', 'get', '--input')).output)).toEqual({ id: 7 });
  });

  it('prints error envelopes and rejects broken messages', async () => {
    const { encodeError } = await import('ts-bin-rpc/runtime');
    const err = write('error.bin', encodeError({ code: 'FORBIDDEN', message: 'no', data: new TextEncoder().encode('{"x":1}') }));
    expect(JSON.parse((await decode(err, '--proc', 'get')).output)).toEqual({ error: { code: 'FORBIDDEN', message: 'no', data: { x: 1 } } });
    const junk = write('junk.bin', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(await decode(junk, '--proc', 'get')).toEqual({ code: 1, output: 'invalid message: not a ts-bin-rpc message\n' });
    expect((await decode(junk, '--proc', 'nope')).code).toBe(1);
  });
});
