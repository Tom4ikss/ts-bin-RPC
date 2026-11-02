// The fixture server as a Fetch handler; runtime-specific startup lives in serve.ts.
import { createHandler } from 'ts-bin-rpc/server';
import { appRouter } from './router.ts';
import { procedures } from './tbr.gen.ts';

export const handler = createHandler(appRouter, {
  procedures,
  prefix: '/rpc',
  context: (request) => ({ user: request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null }),
  onError: () => {}, // `crash` fails on purpose
});
