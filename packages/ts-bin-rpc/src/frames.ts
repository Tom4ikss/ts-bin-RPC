// Frames of a streaming response (FORMAT §12), shared by the server and the client. A frame is an
// 8-byte header (u32 payload length, u8 kind, 3 reserved zero bytes) and the payload padded to a
// multiple of 8, so every payload starts 8-aligned from the start of the stream.

export const STREAM_CONTENT_TYPE = 'application/vnd.tbr-stream';

/** Payload: a message of the procedure's batch type, `T[]`. */
export const FRAME_DATA = 1;
/** Payload: an error envelope; the stream ends. */
export const FRAME_ERROR = 2;
/** No payload; the server ended the stream. */
export const FRAME_END = 3;
/** No payload; keeps proxies from closing an idle connection. */
export const FRAME_HEARTBEAT = 4;

export function encodeFrame(kind: number, payload?: Uint8Array): Uint8Array<ArrayBuffer> {
  const n = payload ? payload.length : 0;
  const out = new Uint8Array(8 + ((n + 7) & ~7));
  new DataView(out.buffer).setUint32(0, n, true);
  out[4] = kind;
  if (payload) out.set(payload, 8);
  return out;
}

export interface Frame {
  kind: number;
  payload: Uint8Array;
}

/**
 * Splits a byte stream into frames. Payloads are handed out as subarrays and stay valid: bytes are
 * only ever appended after what was handed out, and compaction copies into a new buffer.
 */
export class FrameReader {
  #buf = new Uint8Array(0);
  #start = 0;
  #end = 0;
  readonly #maxPayload: number;

  constructor(maxPayload: number) {
    this.#maxPayload = maxPayload;
  }

  push(chunk: Uint8Array): void {
    if (this.#end + chunk.length > this.#buf.length) {
      const live = this.#end - this.#start;
      const next = new Uint8Array(Math.max(64 * 1024, 2 * (live + chunk.length)));
      next.set(this.#buf.subarray(this.#start, this.#end));
      this.#buf = next;
      this.#start = 0;
      this.#end = live;
    }
    this.#buf.set(chunk, this.#end);
    this.#end += chunk.length;
  }

  /** The next complete frame, or undefined until more bytes arrive. Throws on a malformed header. */
  next(): Frame | undefined {
    const live = this.#end - this.#start;
    if (live < 8) return undefined;
    const b = this.#buf, at = this.#start;
    const n = (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
    const kind = b[at + 4];
    if (kind < FRAME_DATA || kind > FRAME_HEARTBEAT || b[at + 5] | b[at + 6] | b[at + 7]) throw new Error(`malformed stream frame (kind ${kind})`);
    if (n > this.#maxPayload) throw new Error(`stream frame of ${n} bytes is over the limit of ${this.#maxPayload}`);
    const size = 8 + ((n + 7) & ~7);
    if (live < size) return undefined;
    this.#start += size;
    return { kind, payload: b.subarray(at + 8, at + 8 + n) };
  }

  /** Bytes received but not yet returned as a frame. */
  get pending(): number {
    return this.#end - this.#start;
  }
}
