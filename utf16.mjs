// Does shipping UTF-16 on the wire avoid the decode cost? Compare materialization + wire size.
import { brotliCompressSync } from 'node:zlib';
const te = new TextEncoder(), d8 = new TextDecoder(), d16 = new TextDecoder('utf-16le');
let sink = 0; const now = () => Number(process.hrtime.bigint());
function bench(f, n) { for (let i = 0; i < n; i++) sink += f(); const r = [];
  for (let s = 0; s < 7; s++) { const t = now(); for (let i = 0; i < n; i++) sink += f(); r.push(Number(now() - t) / n); }
  r.sort((a, b) => a - b); return r[3].toFixed(0).padStart(5) + ' ns'; }
const enc16 = (s) => { const a = new Uint16Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
for (const [k, s] of Object.entries({ 'ascii 13B ': 'Alice Johnson', 'cyr 13ch  ': 'Мария Иванова', 'ascii 4KB ': 'y'.repeat(4096), 'cyr 4KB   ': 'ж'.repeat(4096) })) {
  const u8 = te.encode(s), u16 = enc16(s), b16 = new Uint8Array(u16.buffer);
  const n = s.length > 1000 ? 200_000 : 2_000_000;
  console.log(k, '| utf8 TextDecoder', bench(() => d8.decode(u8).length, n),
    '| utf16 TextDecoder', bench(() => d16.decode(b16).length, n),
    '| utf16 fromCharCode.apply', bench(() => String.fromCharCode.apply(null, u16).length, n));
}
const json = JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ name: i % 3 ? 'Alice Johnson' : 'Мария Иванова', email: `user${i}@example.com`, city: 'Moscow' })));
const w8 = te.encode(json), w16 = new Uint8Array(enc16(json).buffer);
console.log(`\nwire, 1000 users: utf8 raw ${w8.length} / br ${brotliCompressSync(w8).length}   utf16 raw ${w16.length} / br ${brotliCompressSync(w16).length}`);
