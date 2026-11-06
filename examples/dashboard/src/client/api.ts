// The client: types come from the router, codecs from generated code. Only `import type` reaches the
// server's files, so the bundle holds the runtime, the client and the codecs of this direction.
import { createClient } from 'ts-bin-rpc/client';
import type { AppRouter } from '../server/router.ts';
import { clientProcedures } from '../server/tbr.gen.ts';

export interface CallStats {
  path: string;
  /** Response body size. */
  bytes: number;
  /** Request to the last byte of the response. */
  ms: number;
}

const listeners = new Set<(s: CallStats) => void>();

export function onCall(listener: (s: CallStats) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** fetch that reports the response size and time of calls; the client reads the buffered body as usual. */
const measuredFetch: typeof fetch = async (input, init) => {
  const start = performance.now();
  const res = await fetch(input, init);
  // Streams are read as they arrive; only calls are measured.
  if (res.headers.get('content-type')?.startsWith('application/vnd.tbr.stream')) return res;
  const body = await res.arrayBuffer();
  const stats = { path: new URL(String(input), location.href).pathname.replace(/^\/rpc\//, ''), bytes: body.byteLength, ms: performance.now() - start };
  for (const l of listeners) l(stats);
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
};

export const api = createClient<AppRouter>({ url: '/rpc', procedures: clientProcedures, fetch: measuredFetch });
