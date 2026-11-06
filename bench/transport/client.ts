// The page side of the transport bench: subscribes over one transport, reads every field of every
// tick and measures the delay from the server's send time.
import { createClient, webSocket } from 'ts-bin-rpc/client';
import { clientProcedures } from '../gen/out/transport.gen.ts';
import type { appRouter, Feed } from './router.ts';

export interface Result {
  rows: number;
  ms: number;
  /** Delay of each tick, ms; sorted. */
  delays: number[];
  checksum: number;
}

const api = createClient<typeof appRouter>({ url: `${location.origin}/rpc`, procedures: clientProcedures });
const overSocket = createClient<typeof appRouter>({ url: `${location.origin}/rpc`, procedures: clientProcedures, socket: webSocket(`ws://${location.host}/rpc`, { idle: 600_000 }) });
const now = () => performance.timeOrigin + performance.now();

type Row = { t: number; price: number; size: number; side: string };

function run(kind: string, feed: Feed): Promise<Result> {
  const delays: number[] = [];
  let checksum = 0;
  const t0 = performance.now();
  const read = (r: Row) => {
    delays.push(now() - r.t);
    checksum += r.price * r.size + (r.side === 'buy' ? 1 : 2);
  };
  const done = (resolve: (r: Result) => void) => () => resolve({ rows: delays.length, ms: performance.now() - t0, delays: delays.sort((a, b) => a - b), checksum });
  const query = `n=${feed.n}&rate=${feed.rate}`;

  return new Promise((resolve, reject) => {
    if (kind === 'tbr' || kind === 'tbr-ws') {
      (kind === 'tbr' ? api : overSocket).feed.subscribe(feed, { row: read, end: done(resolve), error: reject });
    } else if (kind === 'json-ws') {
      const ws = new WebSocket(`ws://${location.host}/json`);
      ws.onopen = () => ws.send(JSON.stringify({ n: feed.n, rate: feed.rate }));
      ws.onmessage = (e) => {
        const v = JSON.parse(e.data as string) as Row[] | 'end';
        if (v === 'end') {
          ws.close();
          return done(resolve)();
        }
        for (const r of v) read(r);
      };
      ws.onerror = () => reject(new Error('WebSocket failed'));
    } else if (kind === 'ndjson') {
      void (async () => {
        const res = await fetch(`/ndjson?${query}`);
        const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
        let rest = '';
        for (;;) {
          const { value, done: eof } = await reader.read();
          if (eof) break;
          const lines = (rest + value).split('\n');
          rest = lines.pop()!;
          for (const line of lines) read(JSON.parse(line));
        }
        done(resolve)();
      })().catch(reject);
    } else {
      const es = new EventSource(`/sse?${query}`);
      es.onmessage = (e) => read(JSON.parse(e.data));
      es.addEventListener('end', () => {
        es.close();
        done(resolve)();
      });
      es.onerror = () => {
        es.close();
        reject(new Error('EventSource failed'));
      };
    }
  });
}

(globalThis as { run?: typeof run }).run = run;
