// Batches (FORMAT §14): several calls in one HTTP request, shared by the server and the client. The
// body of a batch, either way, is the messages of the WebSocket transport (FORMAT §13), each after an
// 8-byte header (u32 length, u32 0) and padded with zeros to a multiple of 8, so that inputs and
// responses keep their alignment. The server answers each call as it ends, in a streamed response.

export const BATCH_CONTENT_TYPE = 'application/vnd.tbr.batch';

/** The body of a batch: `messages` one after another. */
export function encodeBatch(messages: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(messages.reduce((n, m) => n + 8 + ((m.length + 7) & ~7), 0));
  const dv = new DataView(out.buffer);
  let at = 0;
  for (const m of messages) {
    dv.setUint32(at, m.length, true);
    out.set(m, at + 8);
    at += 8 + ((m.length + 7) & ~7);
  }
  return out;
}

/** One framed message: what the server writes for each call it answers. */
export function batchFrame(message: Uint8Array): Uint8Array<ArrayBuffer> {
  return encodeBatch([message]);
}

/**
 * Reads the messages of a batch body as they arrive: `push` a chunk, get the messages it completed.
 * Undefined for a malformed body.
 */
export class BatchReader {
  #buf: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  #at = 0;
  #end = 0;

  push(chunk: Uint8Array): Uint8Array<ArrayBuffer>[] | undefined {
    if (this.#end + chunk.length > this.#buf.length) {
      // keep what is not read yet, at an aligned start, in a buffer large enough for the chunk
      const left = this.#buf.subarray(this.#at, this.#end);
      const next = new Uint8Array(Math.max(left.length + chunk.length, this.#buf.length * 2));
      next.set(left);
      this.#buf = next;
      this.#end = left.length;
      this.#at = 0;
    }
    this.#buf.set(chunk, this.#end);
    this.#end += chunk.length;
    const out: Uint8Array<ArrayBuffer>[] = [];
    const dv = new DataView(this.#buf.buffer, this.#buf.byteOffset, this.#buf.byteLength);
    while (this.#end - this.#at >= 8) {
      const n = dv.getUint32(this.#at, true);
      if (dv.getUint32(this.#at + 4, true) !== 0) return undefined;
      const size = 8 + ((n + 7) & ~7);
      if (this.#end - this.#at < size) break;
      // a copy: the buffer is reused for the next chunks
      out.push(this.#buf.slice(this.#at + 8, this.#at + 8 + n));
      this.#at += size;
    }
    return out;
  }

  /** Whether everything pushed was read: a body that ends inside a message is cut off. */
  get done(): boolean {
    return this.#at === this.#end;
  }
}

/** The messages of a whole batch body, or undefined when it is malformed. */
export function readBatch(body: Uint8Array): Uint8Array[] | undefined {
  const out: Uint8Array[] = [];
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let at = 0;
  while (at < body.length) {
    if (body.length - at < 8 || dv.getUint32(at + 4, true) !== 0) return undefined;
    const n = dv.getUint32(at, true);
    if (body.length - at - 8 < n) return undefined;
    out.push(body.subarray(at + 8, at + 8 + n));
    at += 8 + ((n + 7) & ~7);
  }
  return at === body.length ? out : undefined;
}
