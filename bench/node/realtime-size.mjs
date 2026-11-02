// Phase 0.6: bytes per frame for a stream of small realtime messages, as a WebSocket would send them.
// permessage-deflate is approximated with raw deflate: per message (no context takeover)
// and as one stream flushed after each message (context takeover, the browser default).
//   node bench/node/realtime-size.mjs
import { deflateRawSync, createDeflateRaw, constants } from 'node:zlib';
import { encodeEntities } from '../lib/entities.mjs';
import { makeEntities } from '../lib/data.mjs';

const te = new TextEncoder();
const FRAMES = 200;

function frames(n, enc) {
  const ents = makeEntities(n);
  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    for (const e of ents) {
      e.x += e.vx * 0.05; e.y += e.vy * 0.05;
      if (f % 20 === 0) e.hp = Math.max(0, e.hp - 3);
    }
    out.push(enc(ents));
  }
  return out;
}

const rnd3 = (v) => Math.round(v * 1000) / 1000; // what a sane JSON producer would send
const jsonEnc = (ents) => te.encode(JSON.stringify(ents.map((e) => ({ id: e.id, x: rnd3(e.x), y: rnd3(e.y), vx: rnd3(e.vx), vy: rnd3(e.vy), hp: e.hp }))));

async function streamDeflate(msgs) {
  const d = createDeflateRaw({ level: 6 });
  let total = 0;
  for (const m of msgs) {
    total += await new Promise((ok) => {
      const chunks = [];
      const onData = (c) => chunks.push(c);
      d.on('data', onData);
      d.write(m);
      d.flush(constants.Z_SYNC_FLUSH, () => { d.off('data', onData); ok(chunks.reduce((a, c) => a + c.length, 0)); });
    });
  }
  d.end();
  return total / msgs.length;
}

const avg = (msgs, f) => msgs.reduce((a, m) => a + f(m), 0) / msgs.length;

console.log('# Realtime frame size (bytes per frame, average over 200 frames)\n');
console.log('| Entities | Encoding | raw | deflate per message | deflate with context |');
console.log('|---|---|---|---|---|');
for (const n of [1, 10, 100]) {
  for (const [label, enc] of [
    ['JSON (3 decimals)', jsonEnc],
    ['columns, directory', (e) => encodeEntities(e, { dir: true })],
    ['columns, implied offsets', (e) => encodeEntities(e)],
  ]) {
    const msgs = frames(n, enc);
    const raw = avg(msgs, (m) => m.length);
    const per = avg(msgs, (m) => deflateRawSync(m, { level: 6 }).length);
    const ctx = await streamDeflate(msgs);
    console.log(`| ${n} | ${label} | ${raw.toFixed(0)} | ${per.toFixed(0)} | ${ctx.toFixed(0)} |`);
  }
}
