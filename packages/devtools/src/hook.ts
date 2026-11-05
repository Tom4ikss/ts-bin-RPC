// The hook that clients of ts-bin-rpc report to (`DevtoolsHook` in ts-bin-rpc). It keeps calls and
// streams with their bytes and codecs; the panel lists them and asks for one decoded when it is
// opened, so nothing is decoded until someone looks.
import type { ClientEntry, DevtoolsHook, DevtoolsTap, RpcError } from 'ts-bin-rpc';
import type { BatchInfo, Json, ListResult, Summary } from './protocol.ts';
import { serialize } from './serialize.ts';

export interface Limits {
  /** Calls and streams kept; the oldest go first. */
  entries: number;
  /** Bytes of responses and batches kept over all entries. */
  bytes: number;
  /** Batches kept per stream; counts go on past it. */
  batches: number;
}

const LIMITS: Limits = { entries: 500, bytes: 64 * 1024 * 1024, batches: 200 };

export interface Hook extends DevtoolsHook {
  list(since: number): ListResult;
  /** `input`, `output` of a call, `batches` of a stream, or `batch` `index` of it. */
  detail(id: number, part: 'input' | 'output' | 'batches' | 'batch', index?: number): Json;
  clear(): void;
}

interface Batch {
  ms: number;
  rows: number;
  bytes: number;
  payload: Uint8Array;
}

interface Entry {
  summary: Summary;
  input: unknown;
  proc: ClientEntry;
  start: number;
  received?: Uint8Array;
  batches?: Batch[];
  /** Index of `batches[0]` among all batches of the stream. */
  first?: number;
  kept: number;
}

const failure = (message: string): Json => ({ $tbr: 'error', message });

function errorOf(e: RpcError): Summary['error'] {
  return { code: e.code, message: e.message, data: serialize(e.data) };
}

export function createHook(limits: Partial<Limits> = {}): Hook {
  const max = { ...LIMITS, ...limits };
  const session = Math.random().toString(36).slice(2);
  const entries = new Map<number, Entry>();
  let nextId = 1;
  let rev = 0;
  let kept = 0;

  const add = (e: Entry) => {
    entries.set(e.summary.id, e);
    kept += e.kept;
    trim();
  };
  // The oldest entries go first, open streams too: their counts stay with the panel.
  const trim = () => {
    for (const [id, e] of entries) {
      if (entries.size <= max.entries && kept <= max.bytes) break;
      entries.delete(id);
      kept -= e.kept;
    }
  };
  const touch = (s: Summary) => (s.rev = ++rev);

  const decode = (proc: ClientEntry, bytes: Uint8Array): Json => {
    try {
      return serialize(proc.output!.decode(bytes, { verify: true, rules: false }));
    } catch (e) {
      return failure(`cannot decode: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return {
    call(path, get, input, sent, res, received, proc, error, start) {
      const summary: Summary = {
        id: nextId++,
        rev: 0,
        kind: 'call',
        path,
        time: Date.now() - (performance.now() - start),
        hasInput: !!proc.input,
        method: get ? 'GET' : 'POST',
        status: res.status,
        sent: sent.length,
        received: received.length,
        ms: performance.now() - start,
        error: error && errorOf(error),
        hash: proc.hash,
        serverHash: res.headers.get('x-tbr-schema'),
      };
      touch(summary);
      add({ summary, input, proc, start, received: error ? undefined : received, kept: received.length });
    },

    stream(path, input, proc): DevtoolsTap {
      const start = performance.now();
      const summary: Summary = {
        id: nextId++,
        rev: 0,
        kind: 'stream',
        path,
        time: Date.now(),
        hasInput: !!proc.input,
        received: 0,
        ms: 0,
        hash: proc.hash,
        state: 'open',
        batches: 0,
        rows: 0,
      };
      touch(summary);
      const entry: Entry = { summary, input, proc, start, batches: [], first: 0, kept: 0 };
      add(entry);
      return {
        batch(payload) {
          let rows = 0;
          try {
            rows = (proc.output!.view(payload, { verify: true, rules: false }) as unknown[]).length;
          } catch {
            // the client reports it as an error
          }
          summary.batches!++;
          summary.rows! += rows;
          summary.received += payload.length;
          touch(summary);
          if (!entries.has(summary.id)) return;
          const b = entry.batches!;
          // a copy: the payload is a window into the reader's buffer, which would stay alive with it
          b.push({ ms: performance.now() - start, rows, bytes: payload.length, payload: payload.slice() });
          entry.kept += payload.length;
          kept += payload.length;
          if (b.length > max.batches) {
            const old = b.shift()!;
            entry.first!++;
            entry.kept -= old.bytes;
            kept -= old.bytes;
          }
          trim();
        },
        end(error, stopped) {
          summary.state = error ? 'failed' : stopped ? 'stopped' : 'ended';
          summary.ms = performance.now() - start;
          if (error) summary.error = errorOf(error);
          touch(summary);
        },
      };
    },

    list(since) {
      const out: Summary[] = [];
      for (const e of entries.values()) if (e.summary.rev > since) out.push(e.summary);
      return { session, rev, entries: out };
    },

    detail(id, part, index = 0) {
      const e = entries.get(id);
      if (!e) return failure('no longer kept: the page keeps the last calls only');
      if (part === 'input') return serialize(e.input);
      if (part === 'output') {
        if (e.summary.error) return { error: e.summary.error };
        if (!e.proc.output || !e.received) return null;
        return decode(e.proc, e.received);
      }
      if (part === 'batches') {
        const first = e.first ?? 0;
        return (e.batches ?? []).map((b, i): BatchInfo => ({ index: first + i, ms: b.ms, rows: b.rows, bytes: b.bytes })) as unknown as Json;
      }
      const b = e.batches?.[index - (e.first ?? 0)];
      return b ? decode(e.proc, b.payload) : failure(`batch ${index} is no longer kept`);
    },

    clear() {
      entries.clear();
      kept = 0;
    },
  };
}
