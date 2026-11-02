// Portable version of the original Node benchmark: JSON vs lazy/eager binary reads and encodes.
import {
  encodeUsers, UsersView, decodeUsersEager,
  encodePointsAoS, PointsAoSView, encodePointsSoA, pointsSoAView,
} from '../lib/codec.mjs';
import { makeUsers, makePoints } from '../lib/data.mjs';

const te = new TextEncoder();
const td = new TextDecoder();

const sumAll = (len, get) => {
  let s = 0;
  for (let i = 0; i < len; i++) {
    const u = get(i);
    s += u.id + u.score + u.age + (u.isActive ? 1 : 0) + u.name.length + u.email.length + u.city.length;
  }
  return s;
};
const sumTwo = (len, get) => {
  let s = 0;
  for (let i = 0; i < len; i++) { const u = get(i); s += u.id + u.name.length; }
  return s;
};
const reread = (len, get) => {
  let s = 0;
  for (let r = 0; r < 5; r++) for (let i = 0; i < len; i++) s += get(i).name.length;
  return s;
};
const sortByName = (len, get) => {
  const a = Array.from({ length: len }, (_, i) => get(i));
  a.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  return a[0].id;
};

export function groups({ quick }) {
  const out = [];
  for (const [group, n, read] of [
    ['10 users, all fields', 10, sumAll],
    ['1000 users, 2 fields', 1000, sumTwo],
    ['1000 users, all fields', 1000, sumAll],
    ['1000 users, name x5', 1000, reread],
    ['1000 users, sort by name', 1000, sortByName],
  ]) {
    const users = makeUsers(n);
    const jb = te.encode(JSON.stringify(users));
    const bb = encodeUsers(users);
    out.push({
      group,
      cases: [
        { label: 'JSON', fn: (b) => { const a = JSON.parse(td.decode(b)); return read(a.length, (i) => a[i]); }, input: jb },
        { label: 'lazy+memo', fn: (b) => { const v = new UsersView(b); return read(v.length, (i) => v.get(i)); }, input: bb },
        { label: 'eager', fn: (b) => { const a = decodeUsersEager(b); return read(a.length, (i) => a[i]); }, input: bb },
      ],
    });
  }

  const pts = makePoints(quick ? 20_000 : 100_000);
  const jp = te.encode(JSON.stringify(pts));
  out.push({
    group: `${pts.length / 1000}k points, sum+max`,
    cases: [
      { label: 'JSON', fn: (b) => { const a = JSON.parse(td.decode(b)); let s = 0, m = -Infinity; for (const p of a) { s += p.v; if (p.x > m) m = p.x; } return s + m; }, input: jp },
      { label: 'AoS getters', fn: (b) => { const v = new PointsAoSView(b); let s = 0, m = -Infinity; for (let i = 0; i < v.length; i++) { const p = v.get(i); s += p.v; const x = p.x; if (x > m) m = x; } return s + m; }, input: encodePointsAoS(pts) },
      { label: 'SoA TypedArray', fn: (b) => { const c = pointsSoAView(b); let s = 0, m = -Infinity; for (let i = 0; i < c.length; i++) { s += c.v[i]; const x = c.x[i]; if (x > m) m = x; } return s + m; }, input: encodePointsSoA(pts) },
    ],
  });

  const users = makeUsers(1000);
  out.push({
    group: 'encode 1000 users',
    cases: [
      { label: 'JSON', fn: (u) => te.encode(JSON.stringify(u)).length, input: users },
      { label: 'binary', fn: (u) => encodeUsers(u).length, input: users },
    ],
  });
  out.push({
    group: `encode ${pts.length / 1000}k points`,
    cases: [
      { label: 'JSON', fn: (p) => te.encode(JSON.stringify(p)).length, input: pts },
      { label: 'SoA', fn: (p) => encodePointsSoA(p).length, input: pts },
    ],
  });
  return out;
}
