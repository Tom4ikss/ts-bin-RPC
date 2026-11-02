// Small realtime frames: N entities { id u32, x/y/vx/vy f32, hp u16 } as columns.
// Two header variants: with a column directory (u32 offset per column), or with offsets implied by
// count and schema (flag bit 0), which saves 4 bytes per column in tiny frames.
//   header: 'T' 'B' version flags | u32 count | [u32 colOffset x 6]
const COLS = [['id', 4], ['x', 4], ['y', 4], ['vx', 4], ['vy', 4], ['hp', 2]];

function layout(n, dir) {
  let pos = 8 + (dir ? COLS.length * 4 : 0);
  return COLS.map(([, w]) => { pos = (pos + w - 1) & ~(w - 1); const o = pos; pos += w * n; return o; }).concat(pos);
}

export function encodeEntities(ents, { dir = false } = {}) {
  const n = ents.length;
  const offs = layout(n, dir);
  const u8 = new Uint8Array(offs[COLS.length]);
  const dv = new DataView(u8.buffer);
  u8.set([0x54, 0x42, 0, dir ? 0 : 1]);
  dv.setUint32(4, n, true);
  if (dir) offs.slice(0, COLS.length).forEach((o, c) => dv.setUint32(8 + c * 4, o, true));
  const id = new Uint32Array(u8.buffer, offs[0], n);
  const x = new Float32Array(u8.buffer, offs[1], n), y = new Float32Array(u8.buffer, offs[2], n);
  const vx = new Float32Array(u8.buffer, offs[3], n), vy = new Float32Array(u8.buffer, offs[4], n);
  const hp = new Uint16Array(u8.buffer, offs[5], n);
  for (let i = 0; i < n; i++) {
    const e = ents[i];
    id[i] = e.id; x[i] = e.x; y[i] = e.y; vx[i] = e.vx; vy[i] = e.vy; hp[i] = e.hp;
  }
  return u8;
}

export function decodeEntities(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = dv.getUint32(4, true);
  const offs = u8[3] & 1 ? layout(n, false) : COLS.map((_, c) => dv.getUint32(8 + c * 4, true));
  const b = u8.buffer, base = u8.byteOffset;
  return {
    n,
    id: new Uint32Array(b, base + offs[0], n),
    x: new Float32Array(b, base + offs[1], n), y: new Float32Array(b, base + offs[2], n),
    vx: new Float32Array(b, base + offs[3], n), vy: new Float32Array(b, base + offs[4], n),
    hp: new Uint16Array(b, base + offs[5], n),
  };
}
