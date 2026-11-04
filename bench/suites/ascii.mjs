// Pool item: classify the strings of a column as ASCII or not without a regex per string. The writer
// keeps ASCII strings in one Latin-1 block and the rest in a UTF-16 block, so every string of a
// column needs one bit. Variants:
//   per string    ASCII.test(s) for each string, what Writer.strCol does now
//   joined, skip  join the column, one global search for a non-ASCII char; after a match, the
//                 search resumes at the end of the string it hit, so there are at most as many
//                 matches as non-ASCII strings (the attempt in the report matched every word)
//   joined, test  join the column, one anchored test; if it fails, fall back to per string
// The writer joins the ASCII strings anyway when it finishes the message, so the second set of
// variants counts that join too: "+ join" is what classifying costs inside Writer, and an all-ASCII
// column found by one test hands its joined text over as is.
import { makeProducts, makeUsers } from '../lib/data.mjs';

const ASCII = /^[\x00-\x7f]*$/;
const NON_ASCII = /[^\x00-\x7f]/g;

function perString(col, flags) {
  for (let i = 0; i < col.length; i++) flags[i] = ASCII.test(col[i]) ? 0 : 1;
  return flags;
}

function joinedSkip(col, flags, ends) {
  const text = col.join('');
  let end = 0;
  for (let i = 0; i < col.length; i++) ends[i] = end += col[i].length;
  flags.fill(0);
  NON_ASCII.lastIndex = 0;
  let k = 0;
  for (let m; (m = NON_ASCII.exec(text)) !== null; ) {
    const at = m.index;
    while (ends[k] <= at) k++;
    flags[k] = 1;
    NON_ASCII.lastIndex = ends[k];
  }
  return flags;
}

function joinedTest(col, flags) {
  if (ASCII.test(col.join(''))) return flags.fill(0);
  return perString(col, flags);
}

function perStringJoin(col) {
  const ascii = [];
  for (let i = 0; i < col.length; i++) if (ASCII.test(col[i])) ascii.push(col[i]);
  return ascii.join('').length;
}

function joinedTestJoin(col) {
  const text = col.join('');
  if (ASCII.test(text)) return text.length;
  return perStringJoin(col);
}

export function groups() {
  const users = (ruShare) => makeUsers(1000, { ruShare });
  const columns = [
    ['1000 names, ASCII', users(0).map((u) => u.name)],
    ['1000 names, 30% Cyrillic', users(0.3).map((u) => u.name)],
    ['1000 cities, 15% Cyrillic', users(0.3).map((u) => u.city)],
    ['1000 emails, ASCII', users(0.3).map((u) => u.email)],
    ['1000 names, 3% Cyrillic', users(0.03).map((u) => u.name)],
    ['500 descriptions, ASCII', makeProducts(500).map((p) => p.description)],
    ['10 names, 30% Cyrillic', users(0.3).slice(0, 10).map((u) => u.name)],
  ];
  return columns.map(([group, col]) => {
    const flags = new Uint8Array(col.length);
    const ends = new Uint32Array(col.length);
    const want = perString(col, new Uint8Array(col.length)).join('');
    for (const f of [joinedSkip, joinedTest])
      if (f(col, new Uint8Array(col.length), new Uint32Array(col.length)).join('') !== want) throw new Error(`${f.name} disagrees on ${group}`);
    return {
      group,
      cases: [
        { label: 'per string', fn: (c) => perString(c, flags)[0], input: col },
        { label: 'joined, skip', fn: (c) => joinedSkip(c, flags, ends)[0], input: col },
        { label: 'joined, test', fn: (c) => joinedTest(c, flags)[0], input: col },
        { label: 'per string + join', fn: perStringJoin, input: col },
        { label: 'joined, test + join', fn: joinedTestJoin, input: col },
      ],
    };
  });
}
