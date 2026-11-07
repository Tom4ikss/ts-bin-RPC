// ts-bin-rpc against other binary formats on their home ground: Apache Arrow JS and Flechette for
// tables and numeric series, Colyseus schema for the state of a game and its patches. Every case
// goes from what the app has (row objects, typed arrays, changed fields) to what the other side
// reads, each library its own idiomatic way: Arrow and Flechette read columns, ts-bin-rpc reads
// views of rows, Colyseus decodes into its state objects.
// Build first: pnpm -C bench gen && node bench/gen/libs.mjs
import { makeEntities, makePoints, makeUsers } from '../lib/data.mjs';
import { procedures } from '../gen/out/codec.mjs';
import { columnsOf } from '../gen/out/runtime.mjs';
import { arrow as A, flechette as F, schema, t, Encoder, Decoder } from '../gen/out/libs.mjs';

const te = new TextEncoder();
const td = new TextDecoder();
const KU = procedures.users.output;
const KS = procedures.series.output;
const KE = procedures.entities.output;
const KD = procedures.entities.delta;

// The default buffer (8 KB) is too small for 1000 entities: Colyseus warns and grows it on every
// full encode. A buffer that fits is how one would run it.
Encoder.BUFFER_SIZE = 256 * 1024;

// A loop of its own per case, so that cases do not share type feedback (see generated.mjs).
const fresh = (body, ...params) => new Function(...params, body);
const sumRows = () =>
  fresh('let s = 0; for (let i = 0; i < a.length; i++) { const u = a[i]; s += u.id + u.score + u.age + (u.isActive ? 1 : 0) + u.name.length + u.email.length + u.city.length; } return s;', 'a');
const sumCols = () =>
  fresh(
    'let s = 0; for (let i = 0; i < id.length; i++) s += id[i] + score[i] + age[i] + (act[i] ? 1 : 0) + name[i].length + email[i].length + city[i].length; return s;',
    'id', 'score', 'age', 'act', 'name', 'email', 'city',
  );
const sumNums = () => fresh('let s = 0; for (let i = 0; i < id.length; i++) s += id[i] + score[i] + age[i]; return s;', 'id', 'score', 'age');
const sumSeries = () => fresh('let a = 0; for (let i = 0; i < t.length; i++) a += t[i] + x[i] + y[i] + v[i]; return a;', 't', 'x', 'y', 'v');

// ------------------------------------------------------------------------------------- tables

const USER_COLUMNS = ['id', 'score', 'age', 'isActive', 'name', 'email', 'city'];

/** Rows to the columns Arrow and Flechette build tables from. */
function userColumns(users) {
  const n = users.length;
  const c = { id: new Uint32Array(n), score: new Float64Array(n), age: new Uint8Array(n), isActive: new Array(n), name: new Array(n), email: new Array(n), city: new Array(n) };
  for (let i = 0; i < n; i++) {
    const u = users[i];
    c.id[i] = u.id;
    c.score[i] = u.score;
    c.age[i] = u.age;
    c.isActive[i] = u.isActive;
    c.name[i] = u.name;
    c.email[i] = u.email;
    c.city[i] = u.city;
  }
  return c;
}

// Arrow makes string arrays dictionaries by default; plain Utf8 is the shape the others send.
const arrowUsers = (users) => {
  const c = userColumns(users);
  const utf8 = (xs) => A.vectorFromArray(xs, new A.Utf8());
  return A.tableToIPC(A.tableFromArrays({ ...c, isActive: A.vectorFromArray(c.isActive, new A.Bool()), name: utf8(c.name), email: utf8(c.email), city: utf8(c.city) }), 'stream');
};
const FLECHETTE_USER_TYPES = { id: F.uint32(), score: F.float64(), age: F.uint8(), isActive: F.bool(), name: F.utf8(), email: F.utf8(), city: F.utf8() };
const flechetteUsers = (users) => F.tableToIPC(F.tableFromArrays(userColumns(users), { types: FLECHETTE_USER_TYPES }), { format: 'stream' });

const arrowCols = (table, names) => names.map((n) => table.getChild(n).toArray());
const flechetteCols = (table, names) => names.map((n) => table.getChild(n).toArray());

function tables(n) {
  const users = makeUsers(n);
  const json = te.encode(JSON.stringify(users));
  const tbr = KU.encode(users);
  const arrow = arrowUsers(users);
  const flechette = flechetteUsers(users);
  const [jsonSum, tbrSum, tbrVerifySum, flechetteRowSum] = Array.from({ length: 4 }, sumRows);
  const [arrowCol, flechetteCol] = [sumCols(), sumCols()];
  const [tbrNums, arrowNums, flechetteNums] = [sumNums(), sumNums(), sumNums()];
  return [
    {
      group: `${n} users, encode from rows`,
      cases: [
        { label: 'JSON', fn: (u) => te.encode(JSON.stringify(u)).length, input: users },
        { label: 'ts-bin-rpc', fn: (u) => KU.encode(u).length, input: users },
        { label: 'Arrow JS', fn: (u) => arrowUsers(u).length, input: users },
        { label: 'Flechette', fn: (u) => flechetteUsers(u).length, input: users },
      ],
    },
    {
      group: `${n} users, decode and read every field`,
      cases: [
        { label: 'JSON', fn: (b) => jsonSum(JSON.parse(td.decode(b))), input: json },
        { label: 'ts-bin-rpc, views', fn: (b) => tbrSum(KU.view(b, { verify: false })), input: tbr },
        { label: 'ts-bin-rpc, views + verify', fn: (b) => tbrVerifySum(KU.view(b)), input: tbr },
        { label: 'Arrow JS, columns', fn: (b) => arrowCol(...arrowCols(A.tableFromIPC(b), USER_COLUMNS)), input: arrow },
        { label: 'Flechette, columns', fn: (b) => flechetteCol(...flechetteCols(F.tableFromIPC(b), USER_COLUMNS)), input: flechette },
        { label: 'Flechette, row objects', fn: (b) => flechetteRowSum(F.tableFromIPC(b).toArray()), input: flechette },
      ],
    },
    {
      group: `${n} users, decode and read the numbers`,
      cases: [
        { label: 'JSON', fn: (b) => { const a = JSON.parse(td.decode(b)); let s = 0; for (const u of a) s += u.id + u.score + u.age; return s; }, input: json },
        { label: 'ts-bin-rpc, columns', fn: (b) => { const c = columnsOf(KU.view(b, { verify: false })); return tbrNums(c.id, c.score, c.age); }, input: tbr },
        { label: 'Arrow JS, columns', fn: (b) => arrowNums(...arrowCols(A.tableFromIPC(b), ['id', 'score', 'age'])), input: arrow },
        { label: 'Flechette, columns', fn: (b) => flechetteNums(...flechetteCols(F.tableFromIPC(b), ['id', 'score', 'age'])), input: flechette },
      ],
    },
  ];
}

function series(n) {
  const points = makePoints(n);
  const s = {
    t: Float64Array.from(points, (p) => p.t),
    x: Float32Array.from(points, (p) => p.x),
    y: Float32Array.from(points, (p) => p.y),
    v: Float32Array.from(points, (p) => p.v),
  };
  const columns = { t: [...s.t], x: [...s.x], y: [...s.y], v: [...s.v] };
  const arrowSeries = (x) => A.tableToIPC(A.tableFromArrays(x), 'stream');
  // typed arrays carry their types; passing them again makes Flechette copy every value
  const flechetteSeries = (x) => F.tableToIPC(F.tableFromArrays(x), { format: 'stream' });
  const [jsonSum, tbrSum, arrowSum, flechetteSum] = Array.from({ length: 4 }, sumSeries);
  const k = `${n / 1000}k points`;
  return [
    {
      group: `${k}, encode`,
      cases: [
        { label: 'JSON, number arrays', fn: (c) => te.encode(JSON.stringify(c)).length, input: columns },
        { label: 'ts-bin-rpc', fn: (x) => KS.encode(x).length, input: s },
        { label: 'Arrow JS', fn: (x) => arrowSeries(x).length, input: s },
        { label: 'Flechette', fn: (x) => flechetteSeries(x).length, input: s },
      ],
    },
    {
      group: `${k}, decode and read every value`,
      cases: [
        { label: 'JSON, number arrays', fn: (b) => { const c = JSON.parse(td.decode(b)); return jsonSum(c.t, c.x, c.y, c.v); }, input: te.encode(JSON.stringify(columns)) },
        { label: 'ts-bin-rpc + verify', fn: (b) => { const c = KS.view(b); return tbrSum(c.t, c.x, c.y, c.v); }, input: KS.encode(s) },
        { label: 'Arrow JS', fn: (b) => arrowSum(...arrowCols(A.tableFromIPC(b), ['t', 'x', 'y', 'v'])), input: arrowSeries(s) },
        { label: 'Flechette', fn: (b) => flechetteSum(...flechetteCols(F.tableFromIPC(b), ['t', 'x', 'y', 'v'])), input: flechetteSeries(s) },
      ],
    },
  ];
}

// ------------------------------------------------------------------------------- game state

const CEntity = schema({ id: t.uint32(), x: t.float32(), y: t.float32(), vx: t.float32(), vy: t.float32(), hp: t.uint16(), status: t.uint8(), name: t.string() }, 'Entity');
const CState = schema({ entities: t.map(CEntity) }, 'State');

const entities = (n) => makeEntities(n).map((e, i) => ({ ...e, status: i % 4, name: `unit ${e.id}` }));

/** The server's state in Colyseus: an Encoder whose changes are discarded, as after a sent patch. */
function colyseusServer(rows) {
  const state = new CState();
  for (const r of rows) {
    const e = new CEntity();
    Object.assign(e, r);
    state.entities.set(String(r.id), e);
  }
  const encoder = new Encoder(state);
  encoder.encodeAll();
  encoder.discardChanges();
  return { state, encoder };
}

/**
 * Each tick moves `moved` entities, in turn through the whole state: their x, y and hp change.
 * `apply(e, x, y, hp)` makes the change on the server's side.
 */
function ticker(rows, moved) {
  let next = 0, tick = 0;
  return (apply) => {
    tick++;
    for (let k = 0; k < moved; k++) {
      const r = rows[next];
      next = (next + 1) % rows.length;
      apply(r, r.x + 1, r.y - 1, (r.hp + tick) & 0x3ff);
    }
  };
}

function game(n, moved) {
  const rows = entities(n);
  const snapshotGroup = {
    group: `${n} entities, full state: encode and decode`,
    cases: [
      { label: 'JSON', fn: (r) => { const a = JSON.parse(td.decode(te.encode(JSON.stringify(r)))); let s = 0; for (const e of a) s += e.x; return s; }, input: rows },
      {
        label: 'ts-bin-rpc',
        fn: (r) => {
          // as a live client takes a snapshot: rows by key
          const state = new Map();
          for (const e of KE.decode(KE.encode(r))) state.set(e.id, e);
          return state.size;
        },
        input: rows,
      },
      {
        label: 'Colyseus schema',
        fn: (server) => {
          const client = new CState();
          new Decoder(client).decode(server.encoder.encodeAll());
          return client.entities.size;
        },
        input: colyseusServer(rows),
      },
    ],
  };

  // A tick: the server changes `moved` entities and sends a patch, the client applies it.
  const tbrServer = rows.map((r) => ({ ...r }));
  const tbrClient = new Map(tbrServer.map((r) => [r.id, { ...r }]));
  const tbrTick = ticker(tbrServer, moved);
  const patch = [];
  const ctick = ticker(rows.map((r) => ({ ...r })), moved);
  const cserver = colyseusServer(rows);
  const cclient = new CState();
  const cdecoder = new Decoder(cclient);
  cdecoder.decode(cserver.encoder.encodeAll());
  cserver.encoder.discardChanges();

  const deltaGroup = {
    group: `${n} entities, ${moved} move: patch encode, decode and apply`,
    cases: [
      {
        label: 'JSON',
        fn: (state) => {
          patch.length = 0;
          tbrTick((r, x, y, hp) => { r.x = x; r.y = y; r.hp = hp; patch.push({ id: r.id, x, y, hp }); });
          const d = JSON.parse(td.decode(te.encode(JSON.stringify({ patch }))));
          let s = 0;
          for (const p of d.patch) { const e = state.get(p.id); e.x = p.x; e.y = p.y; e.hp = p.hp; s += e.x; }
          return s;
        },
        input: new Map(tbrServer.map((r) => [r.id, { ...r }])),
      },
      {
        label: 'ts-bin-rpc',
        fn: (state) => {
          patch.length = 0;
          tbrTick((r, x, y, hp) => { r.x = x; r.y = y; r.hp = hp; patch.push({ id: r.id, x, y, hp }); });
          const d = KD.decode(KD.encode({ patch }));
          let s = 0;
          for (const p of d.patch) { const e = state.get(p.id); e.x = p.x; e.y = p.y; e.hp = p.hp; s += e.x; }
          return s;
        },
        input: tbrClient,
      },
      {
        label: 'Colyseus schema',
        fn: ({ server, decoder, client }) => {
          ctick((r, x, y, hp) => {
            r.x = x; r.y = y; r.hp = hp;
            const e = server.state.entities.get(String(r.id));
            e.x = x; e.y = y; e.hp = hp;
          });
          decoder.decode(server.encoder.encode());
          server.encoder.discardChanges();
          return client.entities.size;
        },
        input: { server: cserver, decoder: cdecoder, client: cclient },
      },
    ],
  };
  return [snapshotGroup, deltaGroup];
}

export function groups({ quick = false } = {}) {
  return [...tables(1000), ...series(quick ? 10_000 : 100_000), ...game(100, 5), ...game(1000, 50)];
}

/** Bytes per message, for bench/node/libs-size.mjs. */
export function sizes() {
  const users = makeUsers(1000);
  const out = [
    ['1000 users', { JSON: te.encode(JSON.stringify(users)), 'ts-bin-rpc': KU.encode(users), 'Arrow JS': arrowUsers(users), Flechette: flechetteUsers(users) }],
  ];
  const points = makePoints(100_000);
  const s = { t: Float64Array.from(points, (p) => p.t), x: Float32Array.from(points, (p) => p.x), y: Float32Array.from(points, (p) => p.y), v: Float32Array.from(points, (p) => p.v) };
  out.push(['100k points', {
    JSON: te.encode(JSON.stringify({ t: [...s.t], x: [...s.x], y: [...s.y], v: [...s.v] })),
    'ts-bin-rpc': KS.encode(s),
    'Arrow JS': A.tableToIPC(A.tableFromArrays(s), 'stream'),
    Flechette: F.tableToIPC(F.tableFromArrays(s), { format: 'stream' }),
  }]);
  for (const [n, moved] of [[100, 5], [1000, 50]]) {
    const rows = entities(n);
    const server = colyseusServer(rows);
    out.push([`${n} entities, full state`, { JSON: te.encode(JSON.stringify(rows)), 'ts-bin-rpc': KE.encode(rows), 'Colyseus schema': server.encoder.encodeAll() }]);
    const patch = rows.slice(0, moved).map((r) => ({ id: r.id, x: r.x + 1, y: r.y - 1, hp: (r.hp + 1) & 0x3ff }));
    for (const p of patch) Object.assign(server.state.entities.get(String(p.id)), p);
    out.push([`${n} entities, ${moved} move: patch`, { JSON: te.encode(JSON.stringify({ patch })), 'ts-bin-rpc': KD.encode({ patch }), 'Colyseus schema': server.encoder.encode().slice() }]);
  }
  return out;
}
