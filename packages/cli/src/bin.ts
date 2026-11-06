#!/usr/bin/env -S node --experimental-strip-types --no-warnings
// The tbr command.
import { typescriptProblem } from './typescript.ts';

const problem = typescriptProblem();
if (problem) {
  process.stderr.write(problem + '\n');
  process.exit(1);
}
const { main } = await import('./cli.ts');
main();
