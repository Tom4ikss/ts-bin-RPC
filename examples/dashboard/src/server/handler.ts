// The RPC handler, shared by the Vite dev server (vite.config.ts) and the production server (main.ts).
import { createHandler } from 'ts-bin-rpc/server';
import { toNodeListener } from 'ts-bin-rpc/node';
import { appRouter } from './router.ts';
import { serverProcedures } from './tbr.gen.ts';

export const handler = createHandler(appRouter, { procedures: serverProcedures, prefix: '/rpc' });
export const listener = toNodeListener(handler);
