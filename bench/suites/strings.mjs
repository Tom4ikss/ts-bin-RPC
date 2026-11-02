// How to turn bytes into JS strings, per runtime. Each operation materializes 1000 strings
// of the same length/alphabet; JSON.parse of the same strings (from bytes, as they arrive) is the reference.
import { rng } from '../lib/data.mjs';

const te = new TextEncoder();
const td8 = new TextDecoder();
const td16 = new TextDecoder('utf-16le');
const N = 1000;

const ASCII = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-_@';
const CYR = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ ';

function makeStrings(len, alphabet, seed) {
  const r = rng(seed);
  return Array.from({ length: N }, () => {
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(r() * alphabet.length)];
    return s;
  });
}

// UTF-8 heap with byte offsets, plus UTF-16 char offsets for the decode-whole-heap variant.
function packUtf8(strs) {
  const parts = strs.map((s) => te.encode(s));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const buf = new Uint8Array(total);
  const off = new Uint32Array(N), len = new Uint32Array(N), coff = new Uint32Array(N), clen = new Uint32Array(N);
  let o = 0, c = 0;
  parts.forEach((p, i) => {
    buf.set(p, o); off[i] = o; len[i] = p.length; o += p.length;
    coff[i] = c; clen[i] = strs[i].length; c += strs[i].length;
  });
  return { buf, off, len, coff, clen };
}

function packUtf16(strs) {
  const total = strs.reduce((a, s) => a + s.length, 0);
  const u16 = new Uint16Array(total);
  const off = new Uint32Array(N), len = new Uint32Array(N);
  let o = 0;
  strs.forEach((s, i) => {
    for (let k = 0; k < s.length; k++) u16[o + k] = s.charCodeAt(k);
    off[i] = o; len[i] = s.length; o += s.length;
  });
  return { u16, bytes: new Uint8Array(u16.buffer), off, len };
}

function loopAscii(u8, o, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(u8[o + i]);
  return s;
}

const viaJSON = (bytes) => { const a = JSON.parse(td8.decode(bytes)); let t = 0; for (let i = 0; i < N; i++) t += a[i].length; return t; };
const viaTD8 = (p) => { let t = 0; for (let i = 0; i < N; i++) t += td8.decode(p.buf.subarray(p.off[i], p.off[i] + p.len[i])).length; return t; };
const viaLoop = (p) => { let t = 0; for (let i = 0; i < N; i++) t += loopAscii(p.buf, p.off[i], p.len[i]).length; return t; };
const viaApply8 = (p) => { let t = 0; for (let i = 0; i < N; i++) t += String.fromCharCode.apply(null, p.buf.subarray(p.off[i], p.off[i] + p.len[i])).length; return t; };
const viaBulk8 = (p) => { const all = td8.decode(p.buf); let t = 0; for (let i = 0; i < N; i++) t += all.substring(p.coff[i], p.coff[i] + p.clen[i]).length; return t; };
const viaTD16 = (p) => { let t = 0; for (let i = 0; i < N; i++) t += td16.decode(p.bytes.subarray(p.off[i] * 2, (p.off[i] + p.len[i]) * 2)).length; return t; };
const viaBulk16 = (p) => { const all = td16.decode(p.bytes); let t = 0; for (let i = 0; i < N; i++) t += all.substring(p.off[i], p.off[i] + p.len[i]).length; return t; };
const viaApply16 = (p) => { let t = 0; for (let i = 0; i < N; i++) t += String.fromCharCode.apply(null, p.u16.subarray(p.off[i], p.off[i] + p.len[i])).length; return t; };

export function groups() {
  const out = [];
  for (const len of [4, 8, 16, 24, 32, 64, 256]) {
    const strs = makeStrings(len, ASCII, len);
    const p = packUtf8(strs);
    out.push({
      group: `ascii ${len}B x${N}`,
      cases: [
        { label: 'JSON.parse(bytes)', fn: viaJSON, input: te.encode(JSON.stringify(strs)) },
        { label: 'TextDecoder', fn: viaTD8, input: p },
        { label: 'char loop', fn: viaLoop, input: p },
        { label: 'fromCharCode.apply', fn: viaApply8, input: p },
        { label: 'bulk decode+substring', fn: viaBulk8, input: p },
      ],
    });
  }
  for (const len of [8, 32, 128]) {
    const strs = makeStrings(len, CYR, 100 + len);
    const p8 = packUtf8(strs);
    const p16 = packUtf16(strs);
    out.push({
      group: `cyrillic ${len}ch x${N}`,
      cases: [
        { label: 'JSON.parse(bytes)', fn: viaJSON, input: te.encode(JSON.stringify(strs)) },
        { label: 'TextDecoder utf-8', fn: viaTD8, input: p8 },
        { label: 'TextDecoder utf-16le', fn: viaTD16, input: p16 },
        { label: 'fromCharCode.apply u16', fn: viaApply16, input: p16 },
        { label: 'bulk utf-8+substring', fn: viaBulk8, input: p8 },
        { label: 'bulk utf-16le+substring', fn: viaBulk16, input: p16 },
      ],
    });
  }
  return out;
}
