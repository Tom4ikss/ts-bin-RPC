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
    expect(r.output).toMatch(/^21 type\(s\) cannot be sent over the wire/);
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
