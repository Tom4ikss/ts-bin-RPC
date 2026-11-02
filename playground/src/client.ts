// `pnpm client`: calls the running `pnpm serve` from Node. Edit freely.
import { createClient } from 'ts-bin-rpc/client';
import { RpcError } from 'ts-bin-rpc';
import type { appRouter } from './router.ts';
import { procedures } from './tbr.gen.ts';

const api = createClient<typeof appRouter>({
  url: 'http://localhost:3000/rpc',
  procedures,
  headers: { authorization: 'Bearer me' },
});

const ada = await api.user.get({ id: 1 });
console.log(ada.name, ada.createdAt, ada); // a lazy view; console.log prints it as a plain object

console.log(await api.user.list({ role: 'user' }));
console.log(await api.shapes());

const t = await api.telemetry();
console.log(t.values.length, 'samples,', t.values.subarray(0, 3)); // Float32Array over the response bytes

try {
  await api.user.get({ id: 99 });
} catch (e) {
  if (e instanceof RpcError) console.log(e.code, e.status, e.message, e.data);
}
