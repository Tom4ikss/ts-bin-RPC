// Type checks only (tsc, not vitest): an input schema is a Standard Schema of the procedure's input,
// as form libraries read it.
import type { InputOf } from 'ts-bin-rpc';
import { inputSchema } from 'ts-bin-rpc/validate';
import type { appRouter } from '../src/router.ts';
import { inputRules } from '../src/tbr.gen.ts';

/** Standard Schema v1 as its spec writes it (standardschema.dev). */
interface StandardSchemaV1<I = unknown, O = I> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<O> | Promise<Result<O>>;
    readonly types?: { readonly input: I; readonly output: O } | undefined;
  };
}
type Result<O> = { readonly value: O; readonly issues?: undefined } | { readonly issues: ReadonlyArray<{ readonly message: string; readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined }> };
type Output<S> = S extends StandardSchemaV1<unknown, infer O> ? O : never;
type Is<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export function types() {
  const rename = inputSchema(inputRules.rename);
  const spec: StandardSchemaV1<InputOf<typeof appRouter, 'rename'>> = rename;
  const out: Is<Output<typeof spec>, InputOf<typeof appRouter, 'rename'>> = true;
  // @ts-expect-error: a procedure without input has no rules
  inputRules.version;
  return [spec, out];
}
