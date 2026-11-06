// Messages of the WebSocket transport (FORMAT §13), shared by the server and the client. One
// connection carries any number of calls and subscriptions, each under an ID the client picks.
//
// Client → server: an 8-byte header (u32 id, u8 op, u8 path length, u8 hash length, u8 0), the
// path and the contract hash in ASCII, zeros to a multiple of 8, then the input message.
// Server → client: an 8-byte header (u32 id, u8 type, u8 0, u16 status), then the body: the
// response of a call, or stream frames (FORMAT §12) of a subscription.

/** Calls the procedure or subscribes to it. */
export const OP_START = 1;
/** Stops the subscription with this ID. */
export const OP_STOP = 2;

/** The whole response of a call, or the error of a subscription that did not start; `status` as over HTTP. */
export const MSG_RESPONSE = 1;
/** Stream frames of a subscription. */
export const MSG_FRAMES = 2;

const ascii = new TextEncoder();
const text = new TextDecoder();

export function encodeStart(id: number, path: string, hash: string, input: Uint8Array): Uint8Array<ArrayBuffer> {
  const p = ascii.encode(path), h = ascii.encode(hash);
  if (p.length > 255 || h.length > 255) throw new RangeError(`procedure path '${path}' is too long for a WebSocket message`);
  const at = (8 + p.length + h.length + 7) & ~7;
  const out = new Uint8Array(at + input.length);
  new DataView(out.buffer).setUint32(0, id, true);
  out[4] = OP_START;
  out[5] = p.length;
  out[6] = h.length;
  out.set(p, 8);
  out.set(h, 8 + p.length);
  out.set(input, at);
  return out;
}

export function encodeStop(id: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setUint32(0, id, true);
  out[4] = OP_STOP;
  return out;
}

export interface SocketRequest {
  id: number;
  op: number;
  path: string;
  hash: string;
  input: Uint8Array;
}

/** A client message, or undefined when it is malformed. */
export function readRequest(b: Uint8Array): SocketRequest | undefined {
  if (b.length < 8 || b[7] !== 0) return undefined;
  const id = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  const op = b[4];
  if (op === OP_STOP) return { id, op, path: '', hash: '', input: b.subarray(8) };
  if (op !== OP_START) return undefined;
  const p = b[5], h = b[6], at = (8 + p + h + 7) & ~7;
  if (b.length < at) return undefined;
  return { id, op, path: text.decode(b.subarray(8, 8 + p)), hash: text.decode(b.subarray(8 + p, 8 + p + h)), input: b.subarray(at) };
}

export function encodeReply(id: number, type: number, status: number, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, id, true);
  out[4] = type;
  dv.setUint16(6, status, true);
  out.set(body, 8);
  return out;
}
