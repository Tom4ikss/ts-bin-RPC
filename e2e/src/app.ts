// The fixture server as a Fetch handler; runtime-specific startup lives in serve.ts.
import { createHandler } from 'ts-bin-rpc/server';
import { appRouter } from './router.ts';
import { procedures } from './tbr.gen.ts';

/** Set by serve.ts. */
export const serverErrors = { print: false };

export const handler = createHandler(appRouter, {
  procedures,
  prefix: '/rpc',
  // A WebSocket cannot carry headers from browsers: its URL carries the token.
  context: (request) => ({ user: request.headers.get('authorization')?.replace(/^Bearer /, '') ?? new URL(request.url).searchParams.get('token') }),
  // `crash` fails on purpose; the servers of serve.ts print the rest, for a test that hangs
  onError: (e, { path }) => void (serverErrors.print && path !== 'crash' && console.error(`onError ${path}:`, e)),
});
