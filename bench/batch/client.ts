// The page side of the batching bench: `n` calls at once over one client, timed until the last one.
import { batch, createClient, webSocket } from 'ts-bin-rpc/client';
import { clientProcedures } from '../gen/out/batch.gen.ts';
import type { appRouter } from './router.ts';

const url = `${location.origin}/rpc`;
const clients = {
  plain: createClient<typeof appRouter>({ url, procedures: clientProcedures }),
  batch: createClient<typeof appRouter>({ url, procedures: clientProcedures, batch: batch() }),
  socket: createClient<typeof appRouter>({ url, procedures: clientProcedures, socket: webSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rpc`, { calls: true, idle: 600_000 }) }),
};

async function run(kind: keyof typeof clients, n: number, delay: number): Promise<number> {
  const api = clients[kind];
  const t0 = performance.now();
  const quotes = await Promise.all(Array.from({ length: n }, (_, i) => api.quote({ symbol: `S${i}`, delay })));
  const ms = performance.now() - t0;
  if (quotes.some((q, i) => q.symbol !== `S${i}` || !(q.ask > q.bid))) throw new Error('wrong quotes');
  return ms;
}

(globalThis as { run?: typeof run }).run = run;
