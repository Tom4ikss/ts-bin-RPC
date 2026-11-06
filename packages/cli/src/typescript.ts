// Whether the TypeScript this package compiles routers with is installed: checked before loading it, so
// that a missing or other TypeScript is one line to act on instead of a stack trace.
import { createRequire } from 'node:module';

/** The versions source.ts is written against: the API of `typescript/sync` changes between minors. */
export const TYPESCRIPT_RANGE = /^7\.1\./;

export function typescriptProblem(): string | undefined {
  let version: string | undefined;
  try {
    version = (createRequire(import.meta.url)('typescript/package.json') as { version: string }).version;
  } catch {
    // not installed
  }
  if (version && TYPESCRIPT_RANGE.test(version)) return undefined;
  return `tbr compiles the router with TypeScript 7.1, ${version ? `found ${version}` : 'which is not installed'}: npm install -D typescript@7.1.0-beta`;
}
