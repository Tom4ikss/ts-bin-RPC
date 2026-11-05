// Streaming procedures on the server (DESIGN §14): stream() for a source of your own, channel() to
// fan a topic out to many subscribers. Rows are collected into batches, each batch is one `T[]`
// message in a frame (frames.ts), and a bounded queue per subscriber feeds the response body.
import { EncodeError, encodeError, type Encoder } from './runtime.ts';
import { encodeFrame, FRAME_DATA, FRAME_END, FRAME_ERROR, FRAME_HEARTBEAT } from './frames.ts';
import { RpcError } from './rpc.ts';
import type { Stream } from './router.ts';

export interface BatchOptions {
  /** Milliseconds a batch waits for more rows after its first one. 0: only rows emitted in the same task. Default: 16. */
  window?: number;
  /** A batch is sent as soon as it has this many rows. Default: 512. */
  maxRows?: number;
}

export interface SubscriberOptions {
  /** Bytes of frames queued for a client that reads slower than rows arrive. Default: 4 MB. */
  maxBuffered?: number;
  /**
   * What happens when the queue is full. `'error'`: the stream ends with SLOW_CONSUMER.
   * `'drop-oldest'`: the oldest queued frames are dropped, for data where only the latest matters.
   * Default: `'error'`.
   */
  overflow?: 'error' | 'drop-oldest';
  /** Milliseconds between heartbeat frames on an idle stream, so that proxies keep it open. Default: 15000. */
  heartbeat?: number;
}

export interface StreamOptions extends BatchOptions, SubscriberOptions {}

export interface StreamControl {
  /** Ends the stream; with an error, the client gets it (an RpcError keeps its code, others become INTERNAL). */
  end(error?: unknown): void;
  /** Aborted when the stream ends for any reason. */
  readonly signal: AbortSignal;
}

/** Called once per subscriber; returns the cleanup that runs when the stream ends for any reason. */
export type StreamSetup<T> = (emit: (row: T) => void, control: StreamControl) => void | (() => void) | Promise<void | (() => void)>;

/** Context the handler gives a stream when a request subscribes to it. */
export interface Binding {
  encoder: Encoder<unknown[]>;
  /** Of a live procedure: the encoder of its changes. */
  delta?: Encoder<unknown>;
  sink: Sink;
  /** Reports server bugs (a row that does not match its type, a setup that throws). */
  report: (error: unknown) => void;
}

/** Something a streaming procedure may return: stream(), channel().subscribe(), an async iterable. */
export abstract class StreamSource {
  abstract start(b: Binding): void;
}

const DEFAULTS = { window: 16, maxRows: 512, maxBuffered: 4 << 20, heartbeat: 15_000 };

/**
 * A stream of rows from a source of your own. `setup` runs when a client subscribes and returns the
 * cleanup; `emit` queues a row, which goes out in the next batch.
 *
 * ```ts
 * ticks: (input: { symbol: string }) =>
 *   stream<Tick>((emit) => feed.on(input.symbol, (t) => emit(t))),
 * ```
 */
export function stream<T>(setup: StreamSetup<T>, options: StreamOptions = {}): Stream<T> {
  return new SetupSource(setup as StreamSetup<unknown>, options) as unknown as Stream<T>;
}

class SetupSource extends StreamSource {
  readonly #setup: StreamSetup<unknown>;
  readonly #options: StreamOptions;
  constructor(setup: StreamSetup<unknown>, options: StreamOptions) {
    super();
    this.#setup = setup;
    this.#options = options;
  }

  start(b: Binding): void {
    const { sink } = b;
    sink.configure(this.#options);
    const batcher = new Batcher(this.#options, (rows) => {
      const frame = encodeRows(b, rows);
      if (frame) sink.push(frame);
    });
    const control: StreamControl = {
      end: (error) => {
        if (sink.closed) return;
        batcher.flush();
        if (error === undefined) sink.end();
        else sink.fail(toRpcError(error, b.report));
      },
      signal: sink.signal,
    };
    sink.onClose(() => batcher.cancel());
    const emit = (row: unknown) => {
      if (!sink.closed) batcher.add(row);
    };
    let cleanup: void | (() => void) | Promise<void | (() => void)>;
    try {
      cleanup = this.#setup(emit, control);
    } catch (e) {
      sink.fail(toRpcError(e, b.report));
      return;
    }
    const register = (fn: void | (() => void)) => {
      if (typeof fn === 'function') sink.onClose(fn);
    };
    if (cleanup instanceof Promise) cleanup.then(register, (e) => sink.fail(toRpcError(e, b.report)));
    else register(cleanup);
  }
}

/** Async iterables and ReadableStreams returned by a streaming procedure. */
export class IterableSource extends StreamSource {
  readonly #it: AsyncIterable<unknown>;
  constructor(it: AsyncIterable<unknown>) {
    super();
    this.#it = it;
  }

  start(b: Binding): void {
    const { sink } = b;
    const batcher = new Batcher({}, (rows) => {
      const frame = encodeRows(b, rows);
      if (frame) sink.push(frame);
    });
    const iterator = this.#it[Symbol.asyncIterator]();
    sink.onClose(() => {
      batcher.cancel();
      void Promise.resolve(iterator.return?.()).catch(() => {});
    });
    void (async () => {
      try {
        for (;;) {
          // Pull no faster than the client reads: wait while its queue is over the limit.
          while (sink.full && !sink.closed) await sink.drained();
          if (sink.closed) return;
          const r = await iterator.next();
          if (sink.closed) return;
          if (r.done) break;
          batcher.add(r.value);
        }
        batcher.flush();
        sink.end();
      } catch (e) {
        if (!sink.closed) sink.fail(toRpcError(e, b.report));
      }
    })();
  }
}

export function toSource(value: unknown): StreamSource | undefined {
  if (value instanceof StreamSource) return value;
  if (value instanceof ReadableStream) return new IterableSource(readableIterable(value));
  if (value !== null && typeof value === 'object' && Symbol.asyncIterator in value) return new IterableSource(value as AsyncIterable<unknown>);
  return undefined;
}

async function* readableIterable(rs: ReadableStream<unknown>): AsyncGenerator<unknown> {
  const reader = rs.getReader();
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) return;
      yield r.value;
    }
  } finally {
    reader.releaseLock();
  }
}

// ------------------------------------------------------------------------------------------ channel

export interface Channel<T> {
  /** Queues a row for every subscriber of the topic; dropped when the topic has none. */
  publish(topic: string, row: T): void;
  /** A stream of the topic's rows from now on; return it from a procedure. */
  subscribe(topic: string, options?: SubscriberOptions): Stream<T>;
  /** Ends the topic's streams (with an error, the subscribers get it). */
  end(topic: string, error?: unknown): void;
  /** Subscribers of a topic right now. */
  subscribers(topic: string): number;
}

interface Topic {
  /** Subscribers grouped by encoder: a batch is encoded once per group, usually once. */
  groups: Map<Encoder<unknown[]>, Set<Binding>>;
  batcher: Batcher;
}

/**
 * Fan-out of rows to many subscribers. A topic's batch is encoded once, and the same bytes go to
 * every subscriber of the topic.
 *
 * ```ts
 * const prices = channel<Tick>();
 * feed.on('tick', (t) => prices.publish(t.symbol, t));
 * export const appRouter = { prices: (input: { symbol: string }) => prices.subscribe(input.symbol) };
 * ```
 */
export function channel<T>(options: BatchOptions = {}): Channel<T> {
  const topics = new Map<string, Topic>();

  const flush = (topic: Topic, rows: unknown[]) => {
    for (const [encoder, subs] of topic.groups) {
      const first = subs.values().next().value;
      if (!first) continue;
      const frame = encodeRows({ ...first, encoder }, rows);
      if (!frame) {
        for (const s of [...subs]) s.sink.fail(new RpcError('BAD_OUTPUT', 'the stream emitted a value that does not match its declared type'));
        continue;
      }
      for (const s of subs) s.sink.push(frame);
    }
  };

  const remove = (name: string, topic: Topic, b: Binding) => {
    const subs = topic.groups.get(b.encoder);
    subs?.delete(b);
    if (subs && !subs.size) topic.groups.delete(b.encoder);
    if (!topic.groups.size && topics.get(name) === topic) {
      topic.batcher.cancel();
      topics.delete(name);
    }
  };

  class ChannelSource extends StreamSource {
    readonly #topic: string;
    readonly #options: SubscriberOptions;
    constructor(topic: string, o: SubscriberOptions) {
      super();
      this.#topic = topic;
      this.#options = o;
    }
    start(b: Binding): void {
      b.sink.configure(this.#options);
      let topic = topics.get(this.#topic);
      if (!topic) {
        const t: Topic = { groups: new Map(), batcher: new Batcher(options, (rows) => flush(t, rows)) };
        topics.set(this.#topic, (topic = t));
      }
      let subs = topic.groups.get(b.encoder);
      if (!subs) topic.groups.set(b.encoder, (subs = new Set()));
      subs.add(b);
      const t = topic;
      b.sink.onClose(() => remove(this.#topic, t, b));
    }
  }

  return {
    publish(topic, row) {
      topics.get(topic)?.batcher.add(row);
    },
    subscribe(topic, o = {}) {
      return new ChannelSource(topic, o) as unknown as Stream<T>;
    },
    end(name, error) {
      const topic = topics.get(name);
      if (!topic) return;
      topic.batcher.flush();
      for (const subs of [...topic.groups.values()]) {
        for (const s of [...subs]) {
          if (error === undefined) s.sink.end();
          else s.sink.fail(toRpcError(error, s.report));
        }
      }
    },
    subscribers(name) {
      let n = 0;
      for (const subs of topics.get(name)?.groups.values() ?? []) n += subs.size;
      return n;
    },
  };
}

// ------------------------------------------------------------------------------------------ batching

class Batcher {
  #rows: unknown[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #scheduled = false;
  readonly #window: number;
  readonly #maxRows: number;
  readonly #send: (rows: unknown[]) => void;

  constructor(o: BatchOptions, send: (rows: unknown[]) => void) {
    this.#window = o.window ?? DEFAULTS.window;
    this.#maxRows = o.maxRows ?? DEFAULTS.maxRows;
    this.#send = send;
  }

  add(row: unknown): void {
    this.#rows.push(row);
    if (this.#rows.length >= this.#maxRows) this.flush();
    else if (!this.#scheduled) {
      this.#scheduled = true;
      if (this.#window > 0) this.#timer = setTimeout(() => this.flush(), this.#window);
      else queueMicrotask(() => this.flush());
    }
  }

  flush(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#scheduled = false;
    if (!this.#rows.length) return;
    const rows = this.#rows;
    this.#rows = [];
    this.#send(rows);
  }

  cancel(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#rows = [];
    // A pending microtask flush finds no rows.
  }
}

/** A frame of the batch, or undefined after reporting a row that breaks its declared type. */
function encodeRows(b: Pick<Binding, 'encoder' | 'report' | 'sink'>, rows: unknown[]): Uint8Array | undefined {
  try {
    return encodeFrame(FRAME_DATA, b.encoder.encode(rows));
  } catch (e) {
    if (!(e instanceof EncodeError)) throw e;
    b.report(e);
    b.sink.fail(new RpcError('BAD_OUTPUT', 'the stream emitted a value that does not match its declared type'));
    return undefined;
  }
}

export function toRpcError(e: unknown, report: (e: unknown) => void): RpcError {
  if (e instanceof RpcError) return e;
  report(e);
  return new RpcError('INTERNAL', 'internal error');
}

// ------------------------------------------------------------------------------------------ the sink

const encoder = new TextEncoder();

/** Where a sink writes frames without its ReadableStream: Node's ServerResponse. */
export interface DirectOut {
  /** false when the socket's buffer is full; the sink then queues frames until 'drain'. */
  write(chunk: Uint8Array): boolean;
  end(): void;
  once(event: 'drain', listener: () => void): unknown;
}

/** The sink behind each stream response, for adapters that write frames directly (node.ts). */
export const SINKS: WeakMap<Response, Sink> = new WeakMap();

/**
 * Frames queued for one subscriber, read by the response body or written to a DirectOut. Bounded:
 * `overflow` decides what happens to a client that reads slower than rows arrive.
 */
export class Sink {
  #queue: Uint8Array[] = [];
  #bytes = 0;
  #closed = false;
  #done = false; // the final frame is queued; close after the queue drains
  #maxBuffered = DEFAULTS.maxBuffered;
  #overflow: 'error' | 'drop-oldest' = 'error';
  #resync: (() => Uint8Array | undefined) | undefined;
  #wake: (() => void) | undefined;
  #drain: (() => void)[] = [];
  #cleanups: (() => void)[] = [];
  #cleaned = false;
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #sent = false; // since the last heartbeat tick
  readonly #abort = new AbortController();
  #readable: ReadableStream<Uint8Array> | undefined;
  #out: DirectOut | undefined;
  #blocked = false; // the DirectOut asked to wait for 'drain'
  #ended = false; // the DirectOut is ended

  constructor(signal?: AbortSignal) {
    if (signal) {
      if (signal.aborted) queueMicrotask(() => this.#close());
      else signal.addEventListener('abort', () => this.#close(), { once: true });
    }
    this.configure({});
  }

  /** The frames as a response body. Use either this or `direct()`. */
  get readable(): ReadableStream<Uint8Array> {
    return (this.#readable ??= new ReadableStream<Uint8Array>(
      {
        pull: (ctrl) => this.#pull(ctrl),
        cancel: () => this.#close(),
      },
      { highWaterMark: 0 },
    ));
  }

  /**
   * Writes frames to `out` as they are pushed, without the ReadableStream and the promises of its
   * reads, and ends `out` with the stream. Closing on a client that went away is up to the caller,
   * through the signal given to the constructor.
   */
  direct(out: DirectOut): void {
    this.#out = out;
    this.#send();
  }

  configure(o: SubscriberOptions): void {
    if (o.maxBuffered !== undefined) this.#maxBuffered = o.maxBuffered;
    if (o.overflow !== undefined) this.#overflow = o.overflow;
    if (this.#heartbeat !== undefined) clearInterval(this.#heartbeat);
    const ms = o.heartbeat ?? DEFAULTS.heartbeat;
    this.#heartbeat = ms > 0 ? setInterval(() => this.#beat(), ms) : undefined;
    (this.#heartbeat as { unref?: () => void } | undefined)?.unref?.();
  }

  /**
   * Live state: when the queue overflows, it is replaced by a snapshot from `fn`, so that a client
   * that fell behind catches up instead of failing. `fn` returns undefined after failing the sink.
   */
  resync(fn: () => Uint8Array | undefined): void {
    this.#resync = fn;
  }

  get closed(): boolean {
    return this.#closed || this.#done;
  }

  get full(): boolean {
    return this.#bytes >= this.#maxBuffered;
  }

  get signal(): AbortSignal {
    return this.#abort.signal;
  }

  /** Resolves when the queue drops below the limit or the sink closes. */
  drained(): Promise<void> {
    return new Promise((r) => this.#drain.push(r));
  }

  /** Runs `fn` once the stream ends for any reason; at once if it already has. */
  onClose(fn: () => void): void {
    if (this.#cleaned) fn();
    else this.#cleanups.push(fn);
  }

  push(frame: Uint8Array): void {
    if (this.closed) return;
    this.#sent = true;
    this.#queue.push(frame);
    this.#bytes += frame.length;
    if (this.#bytes > this.#maxBuffered) {
      if (this.#resync) {
        // the snapshot holds everything the queued deltas did
        this.#queue = [];
        this.#bytes = 0;
        const snapshot = this.#resync();
        if (!snapshot || this.closed) return; // failed: the error frame is queued
        if (snapshot.length > this.#maxBuffered) return this.fail(new RpcError('SLOW_CONSUMER', `the state is larger than maxBuffered (${this.#maxBuffered} bytes)`));
        this.#queue.push(snapshot);
        this.#bytes = snapshot.length;
      } else if (this.#overflow === 'drop-oldest') {
        while (this.#bytes > this.#maxBuffered && this.#queue.length > 1) this.#bytes -= this.#queue.shift()!.length;
      } else {
        this.#queue = [];
        this.#bytes = 0;
        this.fail(new RpcError('SLOW_CONSUMER', `the client read slower than the stream produced; over ${this.#maxBuffered} bytes queued`));
        return;
      }
    }
    this.#notify();
  }

  end(): void {
    this.#finish(encodeFrame(FRAME_END));
  }

  fail(e: RpcError): void {
    const data = e.data === undefined ? undefined : encoder.encode(JSON.stringify(e.data));
    this.#finish(encodeFrame(FRAME_ERROR, encodeError({ code: e.code, message: e.message, data })));
  }

  #finish(frame: Uint8Array): void {
    if (this.closed) return;
    this.#queue.push(frame);
    this.#bytes += frame.length;
    this.#done = true;
    this.#runCleanups();
    this.#notify();
  }

  #notify(): void {
    if (this.#out) this.#send();
    else this.#wake?.();
  }

  /** Everything queued as one chunk: fewer writes on a busy stream. */
  #take(): Uint8Array {
    const chunk = this.#queue.length === 1 ? this.#queue[0] : concat(this.#queue, this.#bytes);
    this.#queue = [];
    this.#bytes = 0;
    for (const r of this.#drain.splice(0)) r();
    return chunk;
  }

  #send(): void {
    const out = this.#out!;
    if (this.#blocked || this.#ended) return;
    if (this.#queue.length && !out.write(this.#take()) && !this.#done && !this.#closed) {
      this.#blocked = true;
      out.once('drain', () => {
        this.#blocked = false;
        this.#send();
      });
      return;
    }
    if (this.#done || this.#closed) {
      this.#ended = true;
      if (!this.#closed) this.#close();
      out.end();
    }
  }

  #beat(): void {
    if (!this.#sent && !this.closed) this.push(encodeFrame(FRAME_HEARTBEAT));
    this.#sent = false;
  }

  async #pull(ctrl: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    while (!this.#queue.length && !this.#closed && !this.#done) await new Promise<void>((r) => (this.#wake = r));
    this.#wake = undefined;
    if (this.#queue.length) ctrl.enqueue(this.#take());
    if (this.#done || this.#closed) {
      if (!this.#closed) this.#close();
      try {
        ctrl.close();
      } catch {
        // already closed or cancelled
      }
    }
  }

  #runCleanups(): void {
    this.#cleaned = true;
    if (this.#heartbeat !== undefined) clearInterval(this.#heartbeat);
    this.#heartbeat = undefined;
    if (!this.#abort.signal.aborted) this.#abort.abort();
    for (const fn of this.#cleanups.splice(0)) {
      try {
        fn();
      } catch (e) {
        console.error('ts-bin-rpc: stream cleanup failed:', e);
      }
    }
    for (const r of this.#drain.splice(0)) r();
  }

  #close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#runCleanups();
    this.#wake?.();
  }
}

function concat(parts: Uint8Array[], n: number): Uint8Array {
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
