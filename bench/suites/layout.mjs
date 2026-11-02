// Phase 0.3: cost of vtable indirection, and the effect of string blocks, against JSON and the old codec.
import { encodeUsers, UsersView } from '../lib/codec.mjs';
import { encodeUsers2, readUsers2 } from '../lib/codec2.mjs';
import { encodeUsers3, readUsers3 } from '../lib/codec3.mjs';
import { makeUsers } from '../lib/data.mjs';

const te = new TextEncoder();
const td = new TextDecoder();

const all = (u) => u.id + u.score + u.age + (u.isActive ? 1 : 0) + u.name.length + u.email.length + u.city.length;
const two = (u) => u.id + u.name.length;
const nums = (u) => u.id + u.score + u.age;

export function groups() {
  const out = [];
  for (const [group, n, read] of [
    ['10 users, all fields', 10, all],
    ['1000 users, all fields', 1000, all],
    ['1000 users, 2 fields', 1000, two],
    ['1000 users, numbers only', 1000, nums],
  ]) {
    const users = makeUsers(n);
    const sum = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += read(arr[i]); return s; };
    out.push({
      group,
      cases: [
        { label: 'JSON', fn: (b) => sum(JSON.parse(td.decode(b))), input: te.encode(JSON.stringify(users)) },
        { label: 'old: fixed, utf-8 per field', fn: (b) => { const v = new UsersView(b); let s = 0; for (let i = 0; i < v.length; i++) s += read(v.get(i)); return s; }, input: encodeUsers(users) },
        { label: 'fixed + string blocks', fn: (b) => sum(readUsers2(b)), input: encodeUsers2(users, { vtable: false }) },
        { label: 'vtable + string blocks', fn: (b) => sum(readUsers2(b)), input: encodeUsers2(users, { vtable: true }) },
        { label: 'columnar (L)', fn: (b) => sum(readUsers3(b)), input: encodeUsers3(users) },
      ],
    });
  }
  const users = makeUsers(1000);
  out.push({
    group: 'encode 1000 users',
    cases: [
      { label: 'JSON', fn: (u) => te.encode(JSON.stringify(u)).length, input: users },
      { label: 'old: fixed, utf-8', fn: (u) => encodeUsers(u).length, input: users },
      { label: 'vtable + string blocks', fn: (u) => encodeUsers2(u, { vtable: true }).length, input: users },
      { label: 'columnar (L)', fn: (u) => encodeUsers3(u).length, input: users },
    ],
  });
  return out;
}
