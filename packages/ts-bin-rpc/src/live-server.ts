// Live state on the server (DESIGN §18): rows by key that subscribers keep in sync. A subscriber gets a
// snapshot of every row, then a delta per window with the rows set, the fields changed and the keys
// removed. A delta is encoded once per encoder, usually once, and its bytes go to every subscriber.
import { EncodeError, type Encoder } from './runtime.ts';
import { encodeFrame, FRAME_DELTA, FRAME_SNAPSHOT } from './frames.ts';
import { RpcError } from './rpc.ts';
import type { LiveStream } from './router.ts';
import { StreamSource, toRpcError, type Binding, type SubscriberOptions } from './stream-server.ts';

export interface LiveStateOptions {
  /** Milliseconds changes wait to go out together after the first one. 0: changes of the same task. Default: 16. */
  window?: number;
}

/**
 * Rows by key, kept in sync with every subscriber. Changes made within a window go out as one
 * delta: whole rows for `set`, the changed fields for `update`, keys for `delete`.
 */
export interface Live<T, K extends keyof T> {
  readonly size: number;
  get(key: T[K]): Readonly<T> | undefined;
  has(key: T[K]): boolean;
  keys(): IterableIterator<T[K]>;
  values(): IterableIterator<Readonly<T>>;
  entries(): IterableIterator<[T[K], Readonly<T>]>;
  [Symbol.iterator](): IterableIterator<[T[K], Readonly<T>]>;
  /**
   * Adds or replaces the row with this key. The row is copied. Of a row that was there, only the
   * fields that changed go out: values compared with `Object.is`, dates by time, and objects and
   * arrays by identity, so a new array counts as a change.
   */
  set(row: T): this;
  /** Changes some fields of the row with this key; throws when there is none. */
  update(key: T[K], fields: Partial<Omit<T, K>>): this;
  /** Removes the row with this key; false when there was none. */
  delete(key: T[K]): boolean;
  /** Removes every row. */
  clear(): void;
  /** The rows and their changes from now on; return it from a procedure. */
  subscribe(options?: SubscriberOptions): LiveStream<T, K>;
  /** Sends pending changes and ends every subscription (with an error, the subscribers get it). The rows stay. */
  end(error?: unknown): void;
  /** Subscribers right now; a method, as `Channel.subscribers(topic)`. */
  subscribers(): number;
}

type Row = Record<string, unknown>;
type Pending = 'set' | 'delete' | Set<string>;

const same = (a: unknown, b: unknown) => Object.is(a, b) || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());

/**
 * Live state: `live<Unit>().by('id')`. Subscribers get every row, then the changes.
 *
 * ```ts
 * const units = live<Unit>().by('id');
 * units.set({ id: 1, x: 0, y: 0, hp: 100 });
 * units.update(1, { x: 5 }); // subscribers get { id: 1, x: 5 }
 * export const appRouter = { units: () => units.subscribe() };
 * ```
 */
export function live<T>(): { by<K extends keyof T & string>(key: K, options?: LiveStateOptions): Live<T, K> } {
  return { by: (key, options = {}) => new LiveState(key, options.window ?? 16) as unknown as Live<T, never> };
}

interface Group {
  delta: Encoder<unknown>;
  subs: Set<Binding>;
  /** The snapshot as of `version`, shared by subscribers that join before the next change. */
  snapshot?: { version: number; frame: Uint8Array };
}

class LiveState {
  readonly #key: string;
  readonly #window: number;
  readonly #rows = new Map<unknown, Row>();
  readonly #pending = new Map<unknown, Pending>();
  /** Subscribers by snapshot encoder: one per version of the generated code, usually one. */
  readonly #groups = new Map<Encoder<unknown[]>, Group>();
  #version = 0;
  #scheduled = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(key: string, window: number) {
    this.#key = key;
    this.#window = window;
  }

  get size() {
    return this.#rows.size;
  }
  subscribers() {
    let n = 0;
    for (const g of this.#groups.values()) n += g.subs.size;
    return n;
  }
  get(key: unknown) {
    return this.#rows.get(key);
  }
  has(key: unknown) {
    return this.#rows.has(key);
  }
  keys() {
    return this.#rows.keys();
  }
  values() {
    return this.#rows.values();
  }
  entries() {
    return this.#rows.entries();
  }
  [Symbol.iterator]() {
    return this.#rows.entries();
  }

  set(row: Row): this {
    const key = row?.[this.#key];
    if (key === undefined || key === null) throw new TypeError(`live: the row has no ${this.#key}`);
    const next = { ...row };
    const old = this.#rows.get(key);
    this.#rows.set(key, next);
    this.#version++;
    if (!old) return this.#mark(key, 'set');
    const changed = new Set<string>();
    for (const f of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (same(old[f], next[f])) continue;
      // a delta never unsets a field: a row that loses one goes out whole
      if (next[f] === undefined) return this.#mark(key, 'set');
      changed.add(f);
    }
    return changed.size ? this.#mark(key, changed) : this;
  }

  update(key: unknown, fields: Row): this {
    const old = this.#rows.get(key);
    if (!old) throw new RangeError(`live: no row with ${this.#key} ${String(key)}`);
    const next = { ...old };
    const changed = new Set<string>();
    let whole = false;
    for (const f of Object.keys(fields)) {
      const v = fields[f];
      if (f === this.#key) {
        if (!same(v, key)) throw new TypeError(`live: update cannot change ${this.#key}; delete the row and set a new one`);
        continue;
      }
      if (same(old[f], v)) continue;
      next[f] = v;
      if (v === undefined) whole = true;
      else changed.add(f);
    }
    if (!whole && !changed.size) return this;
    this.#rows.set(key, next);
    this.#version++;
    return this.#mark(key, whole ? 'set' : changed);
  }

  delete(key: unknown): boolean {
    if (!this.#rows.delete(key)) return false;
    this.#version++;
    this.#mark(key, 'delete');
    return true;
  }

  clear(): void {
    for (const key of [...this.#rows.keys()]) this.delete(key);
  }

  subscribe(o: SubscriberOptions = {}): LiveStream<never, never> {
    return new LiveSource(this, o) as unknown as LiveStream<never, never>;
  }

  end(error?: unknown): void {
    this.#flush();
    for (const g of [...this.#groups.values()]) {
      for (const b of [...g.subs]) {
        if (error === undefined) b.sink.end();
        else b.sink.fail(toRpcError(error, b.report));
      }
    }
  }

  #mark(key: unknown, change: Pending): this {
    // Without subscribers nothing is pending: whoever subscribes next gets a snapshot.
    if (!this.#groups.size) return this;
    const p = this.#pending.get(key);
    if (change instanceof Set && p !== undefined) {
      if (p instanceof Set) for (const f of change) p.add(f);
      // a row set whole (or set again after a delete) stays whole
    } else this.#pending.set(key, change);
    if (!this.#scheduled) {
      this.#scheduled = true;
      if (this.#window > 0) this.#timer = setTimeout(() => this.#flush(), this.#window);
      else queueMicrotask(() => this.#flush());
    }
    return this;
  }

  #flush(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#scheduled = false;
    if (!this.#pending.size) return;
    const set: Row[] = [], patch: Row[] = [], removed: unknown[] = [];
    for (const [key, p] of this.#pending) {
      if (p === 'delete') removed.push(key);
      else if (p === 'set') set.push(this.#rows.get(key)!);
      else {
        const row = this.#rows.get(key)!;
        const fields: Row = { [this.#key]: key };
        for (const f of p) fields[f] = row[f];
        patch.push(fields);
      }
    }
    this.#pending.clear();
    const delta = { ...(set.length && { set }), ...(patch.length && { patch }), ...(removed.length && { removed }) };
    for (const g of this.#groups.values()) {
      const first = g.subs.values().next().value;
      if (!first) continue;
      let frame: Uint8Array;
      try {
        frame = encodeFrame(FRAME_DELTA, g.delta.encode(delta));
      } catch (e) {
        if (!(e instanceof EncodeError)) throw e;
        first.report(e);
        for (const b of [...g.subs]) b.sink.fail(new RpcError('BAD_OUTPUT', 'the live state holds a value that does not match its declared type'));
        continue;
      }
      for (const b of g.subs) b.sink.push(frame);
    }
  }

  /** A snapshot frame for `b`, or undefined after failing it. */
  snapshot(b: Binding, g: Group): Uint8Array | undefined {
    if (g.snapshot?.version === this.#version) return g.snapshot.frame;
    try {
      const frame = encodeFrame(FRAME_SNAPSHOT, b.encoder.encode([...this.#rows.values()]));
      g.snapshot = { version: this.#version, frame };
      return frame;
    } catch (e) {
      if (!(e instanceof EncodeError)) throw e;
      b.report(e);
      b.sink.fail(new RpcError('BAD_OUTPUT', 'the live state holds a value that does not match its declared type'));
      return undefined;
    }
  }

  join(b: Binding, o: SubscriberOptions): void {
    if (!b.delta) throw new TypeError('live: the procedure has no delta codec; run tbr generate');
    b.sink.configure(o);
    let g = this.#groups.get(b.encoder);
    if (!g) this.#groups.set(b.encoder, (g = { delta: b.delta, subs: new Set() }));
    const group = g;
    b.sink.resync(() => this.snapshot(b, group));
    const frame = this.snapshot(b, g);
    if (!frame) return;
    b.sink.push(frame);
    g.subs.add(b);
    b.sink.onClose(() => {
      group.subs.delete(b);
      if (!group.subs.size && this.#groups.get(b.encoder) === group) this.#groups.delete(b.encoder);
      if (!this.#groups.size) this.#pending.clear();
    });
  }
}

export class LiveSource extends StreamSource {
  readonly #state: LiveState;
  readonly #options: SubscriberOptions;
  constructor(state: LiveState, o: SubscriberOptions) {
    super();
    this.#state = state;
    this.#options = o;
  }
  start(b: Binding): void {
    this.#state.join(b, this.#options);
  }
}
