import type { AppRouter } from './router.ts';
import type { u32 } from './api.ts';

type Client<R> = {
  [K in keyof R]: R[K] extends (...args: infer A) => Promise<infer O> ? (...args: A) => Promise<O> : Client<R[K]>;
};
declare function createClient<R>(url: string): Client<R>;

const api = createClient<AppRouter>('/rpc');

const u = await api.user.get({ id: 1 });          // plain literal into a branded u32
const n: string = u.name;                         // output typed
const ok = (await api.health()).ok;
const lst = await api.user.list({ limit: 10 });

// Expected errors below:
await api.user.get({ id: 'x' });                  // wrong input type
await api.user.nope();                            // unknown procedure
const bad: u32 = 1n;                              // bigint into u32
