// Frames of streaming responses (FORMAT §12): the reader takes any split of the byte stream.
import { describe, expect, it } from 'vitest';
import { encodeFrame, FrameReader, FRAME_DATA, FRAME_END, FRAME_ERROR, FRAME_HEARTBEAT } from '../../ts-bin-rpc/src/frames.ts';

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};
const payload = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);

const sent = [
  { kind: FRAME_DATA, payload: payload(1, 1) },
  { kind: FRAME_HEARTBEAT, payload: new Uint8Array(0) },
  { kind: FRAME_DATA, payload: payload(8, 2) },
  { kind: FRAME_DATA, payload: payload(13, 3) },
  { kind: FRAME_ERROR, payload: payload(40, 4) },
  { kind: FRAME_END, payload: new Uint8Array(0) },
];
const wire = concat(sent.map((f) => encodeFrame(f.kind, f.payload.length ? f.payload : undefined)));

function read(chunks: Uint8Array[]) {
  const fr = new FrameReader(1024);
  const got: { kind: number; payload: Uint8Array; offset: number }[] = [];
  for (const c of chunks) {
    fr.push(c);
    for (let f = fr.next(); f; f = fr.next()) got.push({ ...f, offset: f.payload.byteOffset });
  }
  return { got, pending: fr.pending };
}
const plain = (got: { kind: number; payload: Uint8Array }[]) => got.map((f) => ({ kind: f.kind, payload: Array.from(f.payload) }));
const expected = plain(sent);

describe('frames', () => {
  it('pads payloads to 8 bytes after an 8-byte header', () => {
    expect(Array.from(encodeFrame(FRAME_DATA, Uint8Array.of(7, 7, 7)))).toEqual([3, 0, 0, 0, 1, 0, 0, 0, 7, 7, 7, 0, 0, 0, 0, 0]);
    expect(encodeFrame(FRAME_END).length).toBe(8);
    expect(wire.length % 8).toBe(0);
  });

  it('reads the stream in one chunk, byte by byte and split at every offset', () => {
    expect(plain(read([wire]).got)).toEqual(expected);
    expect(plain(read(Array.from(wire, (b) => Uint8Array.of(b))).got)).toEqual(expected);
    for (let i = 1; i < wire.length; i++) {
      for (const j of [i + 1, i + 7, wire.length]) {
        const r = read([wire.subarray(0, i), wire.subarray(i, j), wire.subarray(j)]);
        expect(plain(r.got)).toEqual(expected);
        expect(r.pending).toBe(0);
      }
    }
  });

  it('keeps payloads 8-aligned and valid after more bytes arrive', () => {
    const { got } = read(Array.from(wire, (b) => Uint8Array.of(b)));
    expect(got.every((f) => f.offset % 8 === 0)).toBe(true);
    // Handed-out payloads still hold their bytes after the buffer grew and compacted.
    expect(plain(got)).toEqual(expected);
  });

  it('waits for the rest of a frame', () => {
    const r = read([wire.subarray(0, 12)]);
    expect(r.got.length).toBe(0);
    expect(r.pending).toBe(12);
  });

  it('rejects unknown kinds, reserved bytes and frames over the limit', () => {
    const bad = (bytes: number[]) => () => read([Uint8Array.from(bytes)]);
    expect(bad([0, 0, 0, 0, 9, 0, 0, 0])).toThrow('unknown stream frame kind 9: update ts-bin-rpc');
    expect(bad([0, 0, 0, 0, 0, 0, 0, 0])).toThrow('unknown stream frame kind 0');
    expect(bad([0, 0, 0, 0, 3, 0, 1, 0])).toThrow('malformed stream frame');
    expect(bad([1, 4, 0, 0, 1, 0, 0, 0])).toThrow('stream frame of 1025 bytes is over the limit of 1024');
  });

  it('skips frames of kinds from 128 up', () => {
    const skipped = [...encodeFrame(200, Uint8Array.of(1, 2, 3)), ...encodeFrame(FRAME_END)];
    expect(read([Uint8Array.from(skipped)]).got.map((f) => f.kind)).toEqual([FRAME_END]);
  });
});
