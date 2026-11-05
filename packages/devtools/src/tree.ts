// Values from `serialize` as an expandable tree, the way the Console shows objects, and arrays of
// objects as a table.
import type { Json, Special } from './protocol.ts';

/** Children shown at once; more go into ranges of this size, as in the Console. */
const CHUNK = 100;

type Obj = { [key: string]: Json };

const isSpecial = (v: Json): v is Special & Obj => typeof v === 'object' && v !== null && !Array.isArray(v) && typeof v.$tbr === 'string';
const isPlainObject = (v: Json): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v) && (!isSpecial(v) || v.$tbr === 'object');
const fields = (v: Obj): Obj => (isSpecial(v) ? (v as { v: Obj }).v : v);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Items of an array, `Array` or `$tbr: 'array'` (cut), and the full length. */
function itemsOf(v: Json): { items: Json[]; length: number } | null {
  if (Array.isArray(v)) return { items: v, length: v.length };
  if (isSpecial(v) && v.$tbr === 'array') return { items: v.v, length: v.length };
  return null;
}

/** One line: what the Console prints next to the triangle. */
export function preview(v: Json, depth = 0): HTMLElement {
  const span = (cls: string, text: string) => el('span', cls, text);
  if (v === null) return span('v-null', 'null');
  if (typeof v === 'string') return span('v-string', JSON.stringify(depth ? short(v, 40) : short(v, 500)));
  if (typeof v === 'number') return span('v-number', String(v));
  if (typeof v === 'boolean') return span('v-bool', String(v));
  if (isSpecial(v)) {
    switch (v.$tbr) {
      case 'undefined':
        return span('v-null', 'undefined');
      case 'number':
        return span('v-number', v.v);
      case 'bigint':
        return span('v-number', `${v.v}n`);
      case 'date':
        return span('v-date', depth ? v.v : `Date ${v.v}`);
      case 'cycle':
        return span('v-null', '[Circular]');
      case 'other':
        return span('v-null', v.v);
      case 'error':
        return span('v-error', v.message);
      case 'typed': {
        const s = span('v-typed', `${v.type}(${v.length})`);
        if (depth < 1) s.append(' ', span('v-dim', `[${v.v.slice(0, 8).join(', ')}${v.length > 8 ? ', …' : ''}]`));
        return s;
      }
      case 'map':
        return span('v-dim', `Map(${v.size})`);
      case 'set':
        return span('v-dim', `Set(${v.size})`);
    }
  }
  const list = itemsOf(v);
  if (list) {
    const s = el('span');
    s.append(span('v-dim', `Array(${list.length})`));
    if (depth < 1 && list.length) {
      const parts = list.items.slice(0, 5).map((x) => preview(x, depth + 1));
      s.append(' [', ...join(parts), list.length > 5 ? ', …]' : ']');
    }
    return s;
  }
  const obj = fields(v as Obj);
  const keys = Object.keys(obj);
  if (depth >= 1) return span('v-dim', keys.length ? '{…}' : '{}');
  const s = el('span');
  const parts = keys.slice(0, 6).map((k) => {
    const p = el('span');
    p.append(span('v-key', k), ': ', preview(obj[k], depth + 1));
    return p;
  });
  s.append('{', ...join(parts), keys.length > 6 ? ', …}' : '}');
  return s;
}

function join(parts: HTMLElement[]): (HTMLElement | string)[] {
  return parts.flatMap((p, i) => (i ? [', ', p] : [p]));
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Children of an expandable value, as `[label, value]`; null for a leaf. */
function children(v: Json): [string, Json][] | null {
  const list = itemsOf(v);
  if (list) return list.items.map((x, i) => [String(i), x]);
  if (isSpecial(v)) {
    if (v.$tbr === 'typed') return v.v.map((x, i) => [String(i), x]);
    if (v.$tbr === 'map') return v.v.map(([k, x]) => [keyText(k), x]);
    if (v.$tbr === 'set') return v.v.map((x, i) => [String(i), x]);
    if (v.$tbr !== 'object') return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  return Object.entries(fields(v as Obj));
}

const keyText = (k: Json) => (typeof k === 'string' ? JSON.stringify(k) : typeof k === 'number' || typeof k === 'boolean' || k === null ? String(k) : isSpecial(k) && 'v' in k ? String(k.v) : '{…}');

/** Notes under the children of a value that was cut. */
function cutNote(v: Json): string | null {
  if (isSpecial(v)) {
    if (v.$tbr === 'array' && v.length > v.v.length) return `${v.length - v.v.length} more not shown`;
    if (v.$tbr === 'typed' && v.length > v.v.length) return `${v.length - v.v.length} more not shown`;
    if (v.$tbr === 'map' && v.size > v.v.length) return `${v.size - v.v.length} more not shown`;
  }
  return null;
}

/** A tree of `value`, its first level open. */
export function renderTree(value: Json, open = 1): HTMLElement {
  const root = el('div', 'tree');
  root.append(node(null, value, open));
  return root;
}

function node(label: string | null, value: Json, open: number): HTMLElement {
  const kids = children(value);
  const row = el('div', 'node');
  const line = el('div', 'line');
  const toggle = el('span', kids?.length ? 'toggle' : 'toggle leaf');
  line.append(toggle);
  if (label !== null) line.append(el('span', 'v-key', label), ': ');
  line.append(preview(value));
  row.append(line);
  if (!kids?.length) return row;

  let body: HTMLElement | null = null;
  const expand = (on: boolean) => {
    toggle.classList.toggle('open', on);
    if (on && !body) {
      body = el('div', 'kids');
      fill(body, kids, 0, kids.length, open - 1);
      const note = cutNote(value);
      if (note) body.append(el('div', 'note', note));
      row.append(body);
    }
    if (body) body.hidden = !on;
  };
  line.addEventListener('click', () => expand(!toggle.classList.contains('open')));
  if (open > 0) expand(true);
  return row;
}

/** Children `from` to `to`, in ranges of CHUNK when there are more. */
function fill(into: HTMLElement, kids: [string, Json][], from: number, to: number, open: number) {
  const n = to - from;
  if (n <= CHUNK) {
    for (let i = from; i < to; i++) into.append(node(kids[i][0], kids[i][1], open));
    return;
  }
  // ranges of CHUNK, CHUNK², … so that no level has more than CHUNK lines
  let size = CHUNK;
  while (n / size > CHUNK) size *= CHUNK;
  for (let a = from; a < to; a += size) {
    const b = Math.min(to, a + size);
    const row = el('div', 'node');
    const line = el('div', 'line');
    const toggle = el('span', 'toggle');
    line.append(toggle, el('span', 'v-dim', `[${a} … ${b - 1}]`));
    row.append(line);
    let body: HTMLElement | null = null;
    line.addEventListener('click', () => {
      const on = !toggle.classList.contains('open');
      toggle.classList.toggle('open', on);
      if (on && !body) {
        body = el('div', 'kids');
        fill(body, kids, a, b, 0);
        row.append(body);
      }
      if (body) body.hidden = !on;
    });
    into.append(row);
  }
}

/** Rows for a table: an array whose items are all objects. */
export function tableRows(v: Json): { rows: Obj[]; length: number } | null {
  const list = itemsOf(v);
  if (!list || !list.items.length || !list.items.every(isPlainObject)) return null;
  return { rows: (list.items as Obj[]).map(fields), length: list.length };
}

export function renderTable(rows: Obj[], length: number): HTMLElement {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) (seen.add(k), cols.push(k));
  const wrap = el('div', 'table-wrap');
  const table = el('table', 'data');
  const head = el('tr');
  head.append(el('th', 'index', '#'), ...cols.map((c) => el('th', undefined, c)));
  table.createTHead().append(head);
  const body = table.createTBody();
  rows.forEach((r, i) => {
    const tr = el('tr');
    tr.append(el('td', 'index', String(i)));
    for (const c of cols) {
      const td = el('td');
      if (c in r) td.append(preview(r[c], 1));
      tr.append(td);
    }
    body.append(tr);
  });
  wrap.append(table);
  if (length > rows.length) wrap.append(el('div', 'note', `${length - rows.length} more rows not shown`));
  return wrap;
}
