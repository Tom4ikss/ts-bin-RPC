// Live subscriptions (DESIGN §18): the state of a live procedure, kept by key. A snapshot frame
// replaces it, a delta frame sets rows, merges changed fields into rows and removes keys. Rows are
// plain objects; a changed row is a new object, so that UI code can tell what changed by identity.
import { devtoolsHook, type ClientEntry, type DevtoolsTap, type RpcError } from './rpc.ts';
import { FrameError, FRAME_DELTA, FRAME_SNAPSHOT } from './frames.ts';
import { pump, safely, type StreamEnv } from './stream-client.ts';
import type { LiveChanges, LiveHandler, LiveOptions, LiveSubscription } from './router.ts';

type Row = Record<string, unknown>;
interface Delta {
  set?: Row[];
  patch?: Row[];
  removed?: unknown[];
}

/**
 * Generated code puts this function into the client table of live procedures, so that other
 * clients do not ship it.
 */
export function subscribeLive(env: StreamEnv, path: string, proc: ClientEntry, args: unknown[]): LiveSubscription<Row, string> {
  const [input, handler, opts = {}] = (proc.input ? args : [undefined, ...args]) as [unknown, LiveHandler<Row, string> | undefined, LiveOptions<unknown> | undefined];
  const h = typeof handler === 'function' ? { change: handler } : (handler ?? {});
  const key = proc.live!;
  const state = new Map<unknown, Row>();
  const order = opts.order;
  const sign = order === 'desc' ? -1 : 1;
  const cmp = typeof order === 'function' ? order : (a: unknown, b: unknown) => ((a as number) < (b as number) ? -sign : (a as number) > (b as number) ? sign : 0);
  const abort = new AbortController();
  let over = false;
  let stopped = false;
  let tap: DevtoolsTap | undefined;
  const read = { verify: env.verify, rules: false, limits: env.limits };

  const finish = (error?: RpcError) => {
    if (over) return;
    over = true;
    abort.abort();
    if (error) {
      if (h.error) safely(() => h.error!(error));
      else console.error(`ts-bin-rpc: live '${path}' failed:`, error);
    } else if (!stopped) h.end && safely(h.end);
    tap?.end(error, stopped);
  };

  // A new key goes to the end of the Map; changed rows keep their place. So only frames that add
  // keys can break the order, and then the keys are two sorted runs, which sort() merges in O(n).
  const sort = () => {
    const keys = [...state.keys()];
    const sorted = keys.slice().sort(cmp);
    if (sorted.every((k, i) => k === keys[i])) return;
    const rows = sorted.map((k) => state.get(k)!);
    state.clear();
    sorted.forEach((k, i) => state.set(k, rows[i]));
  };

  const changed = (changes: LiveChanges<unknown>) => h.change && safely(() => h.change!(state as ReadonlyMap<string, Row>, changes as LiveChanges<string>));

  let snapshot = false;
  const frame = (kind: number, payload: Uint8Array) => {
    // FORMAT §12: the first frame of live state is a snapshot
    if (kind !== FRAME_SNAPSHOT && kind !== FRAME_DELTA) throw new FrameError(`a frame of rows (kind ${kind}) in live state`);
    if (kind === FRAME_DELTA && !snapshot) throw new FrameError('live state that does not start with a snapshot');
    if (kind === FRAME_SNAPSHOT) {
      snapshot = true;
      tap?.batch(payload, kind);
      const rows = proc.output!.decode(payload, read) as Row[];
      const before = new Set(state.keys());
      state.clear();
      for (const r of rows) {
        state.set(r[key], r);
        before.delete(r[key]);
      }
      if (order) sort();
      changed({ snapshot: true, set: [...state.keys()], removed: [...before] });
    } else if (kind === FRAME_DELTA) {
      tap?.batch(payload, kind);
      const d = proc.delta!.decode(payload, read) as Delta;
      const set: unknown[] = [], removed: unknown[] = [];
      let added = false;
      for (const r of d.set ?? []) {
        added ||= !state.has(r[key]);
        state.set(r[key], r);
        set.push(r[key]);
      }
      for (const p of d.patch ?? []) {
        const old = state.get(p[key]);
        if (!old) continue; // removed before this client's snapshot was taken
        const row = { ...old };
        // absent fields stay as they are; a delta never unsets one
        for (const f in p) if (p[f] !== undefined) row[f] = p[f];
        state.set(p[key], row);
        set.push(p[key]);
      }
      for (const k of d.removed ?? []) if (state.delete(k)) removed.push(k);
      if (order && added) sort();
      if (set.length || removed.length) changed({ snapshot: false, set, removed });
    }
  };

  const sub: LiveSubscription<Row, string> = {
    get state() {
      return state as ReadonlyMap<string, Row>;
    },
    stop() {
      stopped = true;
      finish();
    },
  };
  if (opts.signal) {
    if (opts.signal.aborted) sub.stop();
    else opts.signal.addEventListener('abort', () => sub.stop(), { once: true });
  }
  if (!over) {
    tap = devtoolsHook()?.stream(path, input, proc);
    void pump(env, path, proc, input, opts, abort, () => over, frame, finish);
  }
  return sub;
}
