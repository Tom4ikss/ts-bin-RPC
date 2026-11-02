import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.ts';

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
