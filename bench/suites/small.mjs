// Pool item: why 10 users read slower than JSON in Firefox on Linux runners (9.4 µs with
// verification against 6.3 µs) while on an M3 they read 1.5 times faster. Splits one read of a small
// response into its parts, so that the part that grows on Linux shows up.
// Build first: node --experimental-strip-types bench/gen/build.mjs
import { readUsers3, encodeUsers3 } from '../lib/codec3.mjs';
import { makeUsers } from '../lib/data.mjs';
import { procedures } from '../gen/out/codec.mjs';
import { Reader } from '../gen/out/runtime.mjs';

const te = new TextEncoder();
const td = new TextDecoder();
const ascii = new TextDecoder('utf-8');
const utf16 = new TextDecoder('utf-16le');
const K = procedures.users.output;

const all = (u) => u.id + u.score + u.age + (u.isActive ? 1 : 0) + u.name.length + u.email.length + u.city.length;
const nums = (u) => u.id + u.score + u.age;
const sumOf = (read) =>
  new Function('read', 'return (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += read(arr[i]); return s; };')(
    new Function(`return ${read}`)(),
  );

export function groups() {
  const out = [];
  for (const n of [10, 100]) {
    const users = makeUsers(n);
    const bytes = K.encode(users);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const [aOff, aLen, uOff, uLen] = [8, 12, 16, 20].map((at) => dv.getUint32(at, true));
    const [sJson, sHand, sGen, sVerify, sNums, sNums2] = Array.from({ length: 6 }, (_, i) => sumOf(i >= 4 ? nums : all));
    const wm = new WeakMap();
    const tag = {};
    out.push({
      group: `${n} users`,
      cases: [
        { label: 'JSON, all fields', fn: (b) => sJson(JSON.parse(td.decode(b))), input: te.encode(JSON.stringify(users)) },
        { label: 'hand-written (codec3), all fields', fn: (b) => sHand(readUsers3(b)), input: encodeUsers3(users) },
        { label: 'generated, all fields', fn: (b) => sGen(K.view(b, { verify: false })), input: bytes },
        { label: 'generated + verify, all fields', fn: (b) => sVerify(K.view(b)), input: bytes },
        { label: 'verify only', fn: (b) => (K.verify(b), 1), input: bytes },
        { label: 'new Reader', fn: (b) => new Reader(b).root, input: bytes },
        { label: 'view, no field read', fn: (b) => K.view(b, { verify: false }).length, input: bytes },
        { label: 'verify + view, no field read', fn: (b) => K.view(b).length, input: bytes },
        { label: 'verify + view, numbers only', fn: (b) => sNums2(K.view(b)), input: bytes },
        { label: 'view, numbers only', fn: (b) => sNums(K.view(b, { verify: false })), input: bytes },
        { label: 'TextDecoder, ASCII block', fn: (b) => ascii.decode(b.subarray(aOff, aOff + aLen)).length, input: bytes },
        { label: 'TextDecoder, UTF-16 block', fn: (b) => utf16.decode(b.subarray(uOff, uOff + uLen * 2)).length, input: bytes },
        { label: 'WeakMap.set on a fresh array', fn: (k) => (wm.set(new Array(k), tag), 1), input: n },
      ],
    });
  }
  {
    // One user is a table, not columns: no typed arrays, but the same Check, Reader and two
    // TextDecoder calls on blocks of a few dozen bytes.
    const [user] = makeUsers(4).filter((u) => /[^\x00-\x7f]/.test(u.name));
    const K1 = procedures.user.output;
    const bytes = K1.encode(user);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const [aOff, aLen, uOff, uLen] = [8, 12, 16, 20].map((at) => dv.getUint32(at, true));
    const u16 = new Uint16Array(bytes.buffer, bytes.byteOffset + uOff, uLen);
    const one = (s) => (u) => s([u]);
    const [rJson, rGen, rVerify] = Array.from({ length: 3 }, () => one(sumOf(all)));
    out.push({
      group: `1 user (${aLen} ASCII bytes, ${uLen} UTF-16 units)`,
      cases: [
        { label: 'JSON, all fields', fn: (b) => rJson(JSON.parse(td.decode(b))), input: te.encode(JSON.stringify(user)) },
        { label: 'generated, all fields', fn: (b) => rGen(K1.view(b, { verify: false })), input: bytes },
        { label: 'generated + verify, all fields', fn: (b) => rVerify(K1.view(b)), input: bytes },
        { label: 'verify only', fn: (b) => (K1.verify(b), 1), input: bytes },
        { label: 'new Reader', fn: (b) => new Reader(b).root, input: bytes },
        { label: 'new DataView', fn: (b) => new DataView(b.buffer, b.byteOffset, b.byteLength).byteLength, input: bytes },
        { label: 'TextDecoder, ASCII block', fn: (b) => ascii.decode(b.subarray(aOff, aOff + aLen)).length, input: bytes },
        { label: 'fromCharCode.apply, ASCII block', fn: (b) => String.fromCharCode.apply(null, b.subarray(aOff, aOff + aLen)).length, input: bytes },
        { label: 'TextDecoder, UTF-16 block', fn: (b) => utf16.decode(b.subarray(uOff, uOff + uLen * 2)).length, input: bytes },
        { label: 'fromCharCode.apply, UTF-16 block', fn: (u) => String.fromCharCode.apply(null, u).length, input: u16 },
      ],
    });
  }
  // Every column of a view is a typed array over the message's buffer, and so are the DataView and
  // the blocks handed to TextDecoder: about ten views per read of 10 users.
  const shared = new ArrayBuffer(4096);
  out.push({
    group: '8 typed array views',
    cases: [
      { label: 'own buffers, new Uint8Array(10)', fn: () => { let s = 0; for (let i = 0; i < 8; i++) s += new Uint8Array(10).length; return s; }, input: 0 },
      { label: 'views over one buffer', fn: (b) => { let s = 0; for (let i = 0; i < 8; i++) s += new Uint8Array(b, 8 * i, 10).length; return s; }, input: shared },
      { label: 'DataViews over one buffer', fn: (b) => { let s = 0; for (let i = 0; i < 8; i++) s += new DataView(b, 8 * i, 10).byteLength; return s; }, input: shared },
    ],
  });
  return out;
}
