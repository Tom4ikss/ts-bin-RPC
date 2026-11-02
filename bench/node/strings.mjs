// Per-access cost of materializing a string out of a UTF-8 buffer vs. a string JSON.parse already built.
const te = new TextEncoder(), td = new TextDecoder();
let sink = 0; const now = () => Number(process.hrtime.bigint());
function bench(f, n = 2_000_000) { for (let i = 0; i < n; i++) sink += f(); const r = [];
  for (let s = 0; s < 7; s++) { const t = now(); for (let i = 0; i < n; i++) sink += f(); r.push(Number(now() - t) / n); }
  r.sort((a, b) => a - b); return r[3].toFixed(1).padStart(6) + ' ns'; }
function asciiLoop(u8, off, len) { let s = ''; for (let i = 0; i < len; i++) { const c = u8[off + i]; if (c > 127) return td.decode(u8.subarray(off, off + len)); s += String.fromCharCode(c); } return s; }

const cases = { 'ascii 13B ': 'Alice Johnson', 'cyr 13ch  ': 'Мария Иванова', 'ascii 200B': 'x'.repeat(200), 'ascii 4KB ': 'y'.repeat(4096) };
for (const [k, s] of Object.entries(cases)) {
  const u8 = te.encode(s); const len = u8.length;
  const obj = JSON.parse(JSON.stringify({ s }));
  console.log(k,
    '| plain prop', bench(() => obj.s.length),
    '| TextDecoder', bench(() => td.decode(u8.subarray(0, len)).length, len > 1000 ? 200_000 : 2_000_000),
    '| ascii loop', len <= 200 ? bench(() => asciiLoop(u8, 0, len).length, len > 100 ? 300_000 : 2_000_000) : '   n/a');
}

// Equality check: the typical "filter by city" — decoded string compare vs. byte compare vs. plain prop.
const city = te.encode('Moscow'), target = te.encode('Moscow'), obj = { city: 'Moscow' };
const eqBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
console.log('\nfilter city==\'Moscow\'',
  '| plain prop', bench(() => obj.city === 'Moscow' ? 1 : 0),
  '| decode+cmp', bench(() => asciiLoop(city, 0, city.length) === 'Moscow' ? 1 : 0),
  '| byte cmp', bench(() => eqBytes(city, target) ? 1 : 0));

// Retention: a single lazy view kept alive pins the whole response buffer.
const big = new Uint8Array(50 * 1024 * 1024);
const view = { _u8: big, get name() { return 'x'; } };
globalThis.gc?.();
console.log('\nheld by one tiny view:', (process.memoryUsage().arrayBuffers / 1048576).toFixed(0), 'MB of ArrayBuffers alive', view.name);
