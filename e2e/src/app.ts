// The fixture server as a Fetch handler; runtime-specific startup lives in serve.ts.
import { createHandler } from 'ts-bin-rpc/server';
import { appRouter, type Ctx } from './router.ts';
import { procedures } from './tbr.gen.ts';

/** Set by serve.ts. */
export const serverErrors = { print: false };

/** The user of a request. A WebSocket cannot carry headers from browsers: its URL carries the token. */
export const context = (request: Request): Ctx => ({ user: request.headers.get('authorization')?.replace(/^Bearer /, '') ?? new URL(request.url).searchParams.get('token') });

export const handler = createHandler(appRouter, {
  procedures,
  prefix: '/rpc',
  context,
  // `crash` fails on purpose; the servers of serve.ts print the rest, for a test that hangs
  onError: (e, { path }) => void (serverErrors.print && path !== 'crash' && console.error(`onError ${path}:`, e)),
});
