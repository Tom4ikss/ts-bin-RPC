// Phase 0.6: per-frame cost of small realtime messages (server encode + client decode + read every field).
import { encodeEntities, decodeEntities } from '../lib/entities.mjs';
import { makeEntities } from '../lib/data.mjs';

const te = new TextEncoder();
const td = new TextDecoder();

const readJson = (b) => {
  const a = JSON.parse(td.decode(b));
  let s = 0;
  for (const e of a) s += e.id + e.x + e.y + e.vx + e.vy + e.hp;
  return s;
};
const readBin = (b) => {
  const c = decodeEntities(b);
  let s = 0;
  for (let i = 0; i < c.n; i++) s += c.id[i] + c.x[i] + c.y[i] + c.vx[i] + c.vy[i] + c.hp[i];
  return s;
};

export function groups() {
  const out = [];
  for (const n of [1, 10, 100]) {
    const ents = makeEntities(n);
    out.push({
      group: `${n} entities, encode+decode`,
      cases: [
        { label: 'JSON', fn: (e) => readJson(te.encode(JSON.stringify(e))), input: ents },
        { label: 'columns, directory', fn: (e) => readBin(encodeEntities(e, { dir: true })), input: ents },
        { label: 'columns, implied offsets', fn: (e) => readBin(encodeEntities(e)), input: ents },
      ],
    });
    out.push({
      group: `${n} entities, decode only`,
      cases: [
        { label: 'JSON', fn: readJson, input: te.encode(JSON.stringify(ents)) },
        { label: 'columns, implied offsets', fn: readBin, input: encodeEntities(ents) },
      ],
    });
  }
  return out;
}
