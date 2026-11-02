// Phase 2.7: generated codecs (packages/cli) against the hand-written columnar codec and JSON.
// Build first: node --experimental-strip-types bench/gen/build.mjs
import { encodeUsers3, readUsers3 } from '../lib/codec3.mjs';
import { makeUsers } from '../lib/data.mjs';
import { procedures } from '../gen/out/codec.mjs';

const te = new TextEncoder();
const td = new TextDecoder();
const K = procedures.users.output;

const all = (u) => u.id + u.score + u.age + (u.isActive ? 1 : 0) + u.name.length + u.email.length + u.city.length;
const two = (u) => u.id + u.name.length;
const nums = (u) => u.id + u.score + u.age;

// A fresh copy of the reading loop per case: a shared one collects type feedback from every case's
// objects, and cases measured later would read through polymorphic inline caches.
const sumOf = (read) =>
  new Function('read', 'return (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += read(arr[i]); return s; };')(
    new Function(`return ${read}`)(),
  );

export function groups() {
  const out = [];
  for (const [group, n, read] of [
    ['10 users, all fields', 10, all],
    ['1000 users, all fields', 1000, all],
    ['1000 users, 2 fields', 1000, two],
    ['1000 users, numbers only', 1000, nums],
  ]) {
    const users = makeUsers(n);
    const [sJson, sHand, sGen, sVerify, sDecode] = Array.from({ length: 5 }, () => sumOf(read));
    const bytes = K.encode(users);
    out.push({
      group,
      cases: [
        { label: 'JSON', fn: (b) => sJson(JSON.parse(td.decode(b))), input: te.encode(JSON.stringify(users)) },
        { label: 'hand-written (codec3)', fn: (b) => sHand(readUsers3(b)), input: encodeUsers3(users) },
        { label: 'generated', fn: (b) => sGen(K.view(b, { verify: false })), input: bytes },
        { label: 'generated + verify', fn: (b) => sVerify(K.view(b)), input: bytes },
        { label: 'generated, decode (plain)', fn: (b) => sDecode(K.decode(b, { verify: false })), input: bytes },
      ],
    });
  }
  const users = makeUsers(1000);
  out.push({
    group: 'encode 1000 users',
    cases: [
      { label: 'JSON', fn: (u) => te.encode(JSON.stringify(u)).length, input: users },
      { label: 'hand-written (codec3)', fn: (u) => encodeUsers3(u).length, input: users },
      { label: 'generated', fn: (u) => K.encode(u).length, input: users },
    ],
  });
  return out;
}
