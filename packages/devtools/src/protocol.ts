// What the panel reads from the hook in the page. Everything here crosses `inspectedWindow.eval`, which
// returns JSON: values go through `serialize`, special ones as `{ $tbr: kind, ... }`.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** One row of the panel's list. */
export interface Summary {
  id: number;
  /** Bumped on every change, so that the panel fetches only rows that changed. */
  rev: number;
  kind: 'call' | 'stream';
  path: string;
  /** `Date.now()` when the call or the subscription started. */
  time: number;
  hasInput: boolean;
  /** Calls: GET for queries. */
  method?: 'GET' | 'POST';
  /** Calls: the HTTP status. */
  status?: number;
  /** Encoded input, bytes. */
  sent?: number;
  /** Calls: response body, bytes. Streams: data frames, bytes so far. */
  received: number;
  /** Calls: total time. Streams: open for this long, or until the end. */
  ms: number;
  error?: { code: string; message: string; data: Json };
  hash: string;
  /** Calls: the server's hash of the procedure, when the server sent it. */
  serverHash?: string | null;
  /** Streams. */
  state?: 'open' | 'ended' | 'stopped' | 'failed';
  batches?: number;
  rows?: number;
  /** Live state: the key of its rows. Its batches are snapshots and deltas. */
  live?: string;
}

export interface ListResult {
  /** Changes when the page reloads: the panel then starts over. */
  session: string;
  rev: number;
  entries: Summary[];
}

export interface BatchInfo {
  index: number;
  /** Since the subscription started. */
  ms: number;
  /** Rows; of a delta, rows set, patched and removed. */
  rows: number;
  bytes: number;
  /** Live state: what the frame is. */
  frame?: 'snapshot' | 'delta';
}

/** `$tbr` kinds of `serialize`. */
export type Special =
  | { $tbr: 'undefined' }
  | { $tbr: 'number'; v: string }
  | { $tbr: 'bigint'; v: string }
  | { $tbr: 'date'; v: string }
  | { $tbr: 'typed'; type: string; length: number; v: (number | string)[] }
  | { $tbr: 'array'; length: number; v: Json[] }
  | { $tbr: 'map'; size: number; v: [Json, Json][] }
  | { $tbr: 'set'; size: number; v: Json[] }
  | { $tbr: 'object'; v: { [key: string]: Json } }
  | { $tbr: 'cycle' }
  | { $tbr: 'other'; v: string }
  | { $tbr: 'error'; message: string };

export const HOOK = '__TBR_DEVTOOLS__';
