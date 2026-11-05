// The panel: calls and streams of the inspected page, polled from the hook, and one of them decoded.
// Outside DevTools (a demo, a test) it reads the hook of the page that embeds it, or of its own.
import { HOOK, type BatchInfo, type Json, type ListResult, type Summary } from './protocol.ts';
import { renderTable, renderTree, tableRows } from './tree.ts';

const POLL_MS = 300;
/** Rows the panel keeps; the hook keeps fewer payloads. */
const MAX_ROWS = 2000;

const inDevtools = typeof chrome !== 'undefined' && !!chrome.devtools?.inspectedWindow;

function evalInPage<T>(expression: string): Promise<T> {
  if (inDevtools) {
    return new Promise((resolve, reject) =>
      chrome.devtools.inspectedWindow.eval(expression, (result, error) => {
        if (error && (error.isError || error.isException)) reject(new Error(error.value ?? error.description ?? 'eval failed'));
        else resolve(result as T);
      }),
    );
  }
  try {
    const target = (window.parent !== window ? window.parent : window) as unknown as { eval(s: string): unknown };
    // what `inspectedWindow.eval` would give: JSON
    return Promise.resolve(JSON.parse(JSON.stringify(target.eval(expression) ?? null)) as T);
  } catch (e) {
    return Promise.reject(e);
  }
}

const hookCall = <T>(method: string, ...args: (string | number)[]) =>
  evalInPage<T>(`globalThis.${HOOK} ? globalThis.${HOOK}.${method}(${args.map((a) => JSON.stringify(a)).join(', ')}) : null`);

// ------------------------------------------------------------------------------------------- state

const rows = new Map<number, Summary>();
const elements = new Map<number, HTMLTableRowElement>();
let session = '';
let rev = 0;
let selected: number | null = null;
let tab = '';
let filter = '';
let hooked: boolean | null = null;
/** Decoded parts by `id:part`: calls never change once reported. */
const cache = new Map<string, Json>();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const list = $<HTMLTableSectionElement>('#list tbody');
const scroller = $<HTMLElement>('#list-scroll');
const detail = $<HTMLElement>('#detail');
const empty = $<HTMLElement>('#empty');
const counts = $<HTMLElement>('#counts');

if (inDevtools ? chrome.devtools.panels.themeName === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches) document.body.classList.add('dark');

// ---------------------------------------------------------------------------------------- formatting

const bytes = (n: number | undefined) => (n === undefined ? '' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const ms = (n: number) => (n < 1000 ? `${n < 10 ? n.toFixed(1) : Math.round(n)} ms` : `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`);
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour12: false }) + `.${String(t % 1000 | 0).padStart(3, '0')}`;
const mismatch = (s: Summary) => !!s.serverHash && s.serverHash !== s.hash;

function statusText(s: Summary): { text: string; bad: boolean } {
  if (s.kind === 'stream') {
    const n = `${s.batches} batch${s.batches === 1 ? '' : 'es'}, ${s.rows} row${s.rows === 1 ? '' : 's'}`;
    if (s.state === 'failed') return { text: `${s.error?.code ?? 'failed'} · ${n}`, bad: true };
    return { text: `${s.state} · ${n}`, bad: false };
  }
  return s.error ? { text: `${s.status} ${s.error.code}`, bad: true } : { text: String(s.status), bad: false };
}

function duration(s: Summary): string {
  return s.kind === 'stream' && s.state === 'open' ? ms(Date.now() - s.time) : ms(s.ms);
}

// --------------------------------------------------------------------------------------------- list

function cell(text: string, cls?: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  if (cls) td.className = cls;
  return td;
}

function renderRow(s: Summary): HTMLTableRowElement {
  const tr = elements.get(s.id) ?? document.createElement('tr');
  const st = statusText(s);
  const name = cell(s.path, 'name');
  if (mismatch(s)) {
    const warn = document.createElement('span');
    warn.className = 'warn';
    warn.textContent = '⚠';
    warn.title = 'The server has another version of this procedure: run tbr generate on both sides';
    name.prepend(warn);
  }
  tr.replaceChildren(
    name,
    cell(s.kind === 'stream' ? (s.live ? 'live' : 'stream') : s.method!, 'kind'),
    cell(st.text, st.bad ? 'status bad' : 'status'),
    cell(s.kind === 'stream' ? bytes(s.received) : `${bytes(s.sent)} → ${bytes(s.received)}`, 'size'),
    cell(duration(s), 'time'),
    cell(clock(s.time), 'clock'),
  );
  tr.classList.toggle('bad', st.bad);
  tr.classList.toggle('open', s.kind === 'stream' && s.state === 'open');
  tr.classList.toggle('selected', s.id === selected);
  tr.hidden = !!filter && !s.path.toLowerCase().includes(filter);
  tr.onclick = () => select(s.id);
  return tr;
}

function updateCounts() {
  let calls = 0, streams = 0, errors = 0;
  for (const s of rows.values()) {
    if (s.kind === 'call') calls++;
    else streams++;
    if (s.error) errors++;
  }
  counts.textContent = `${calls} call${calls === 1 ? '' : 's'}, ${streams} stream${streams === 1 ? '' : 's'}${errors ? `, ${errors} failed` : ''}`;
  empty.hidden = rows.size > 0;
  if (!rows.size) {
    empty.textContent =
      hooked === false
        ? 'Reload the page: the extension hooks into a page when it loads.'
        : 'No calls yet. Clients of ts-bin-rpc 0.3.2 or later report here.';
  }
}

function reset() {
  rows.clear();
  elements.clear();
  cache.clear();
  list.replaceChildren();
  selected = null;
  rev = 0;
  renderDetail();
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  let result: ListResult | null;
  try {
    result = await hookCall<ListResult | null>('list', rev);
  } catch {
    result = null;
  } finally {
    polling = false;
  }
  hooked = !!result;
  if (!result) return updateCounts();
  if (result.session !== session) {
    session = result.session;
    reset();
  }
  rev = result.rev;
  const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
  for (const s of result.entries) {
    rows.set(s.id, s);
    const tr = renderRow(s);
    if (!elements.has(s.id)) {
      elements.set(s.id, tr);
      list.append(tr);
    }
  }
  // live durations of open streams
  for (const s of rows.values()) if (s.kind === 'stream' && s.state === 'open') (elements.get(s.id)!.querySelector('.time') as HTMLElement).textContent = duration(s);
  while (rows.size > MAX_ROWS) {
    const id = rows.keys().next().value!;
    rows.delete(id);
    elements.get(id)?.remove();
    elements.delete(id);
  }
  // follow new rows, unless one is open: the row under the pointer would move
  if (atBottom && selected === null) scroller.scrollTop = scroller.scrollHeight;
  updateCounts();
  if (selected !== null && result.entries.some((s) => s.id === selected)) renderDetail(true);
}

// ------------------------------------------------------------------------------------------- detail

function select(id: number | null) {
  if (selected !== null) elements.get(selected)?.classList.remove('selected');
  selected = id;
  batchPinned = false;
  if (id !== null) elements.get(id)?.classList.add('selected');
  document.body.classList.toggle('has-detail', id !== null);
  renderDetail();
}

async function part(id: number, name: 'input' | 'output' | 'batches' | 'batch', index = 0, fresh = false): Promise<Json> {
  const key = `${id}:${name}:${index}`;
  if (!fresh && cache.has(key)) return cache.get(key)!;
  const v = await hookCall<Json>('detail', id, name, index);
  if (name !== 'batches') cache.set(key, v);
  return v;
}

let batchIndex: number | null = null;
/** The user picked a batch; otherwise the latest one is shown as it arrives. */
let batchPinned = false;
let view: 'tree' | 'table' = 'table';
let renderSeq = 0;

/** `update`: the selected entry changed (a stream got batches); keep the tab and scroll. */
async function renderDetail(update = false) {
  const s = selected === null ? undefined : rows.get(selected);
  if (!s) {
    detail.replaceChildren();
    document.body.classList.remove('has-detail');
    return;
  }
  const tabs = s.kind === 'stream' ? ['Batches', 'Request', 'Info'] : ['Response', 'Request', 'Info'];
  if (!tabs.includes(tab)) tab = tabs[0];
  // a call does not change; a stream's request and info tabs need no refresh
  if (update && tab !== 'Batches') {
    if (tab === 'Info') renderInfoInto(s);
    return;
  }
  const seq = ++renderSeq;

  const head = document.createElement('div');
  head.className = 'detail-head';
  const close = document.createElement('button');
  close.className = 'close';
  close.title = 'Close';
  close.textContent = '×';
  close.onclick = () => select(null);
  head.append(close);
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = t === tab ? 'tab active' : 'tab';
    b.textContent = t;
    b.onclick = () => {
      tab = t;
      renderDetail();
    };
    head.append(b);
  }
  const body = document.createElement('div');
  body.className = 'detail-body';
  const scroll = update ? detail.querySelector('.detail-body')?.scrollTop ?? 0 : 0;

  if (tab === 'Info') renderInfo(s, body);
  else if (tab === 'Request') {
    if (!s.hasInput) body.append(note('This procedure takes no input.'));
    else body.append(valueView(await part(s.id, 'input')));
  } else if (tab === 'Response') {
    const v = await part(s.id, 'output');
    if (v && typeof v === 'object' && !Array.isArray(v) && 'error' in v && s.error) body.append(errorView(s));
    else if (v === null) body.append(note('This procedure returns nothing.'));
    else body.append(valueView(v));
  } else {
    const batches = (await part(s.id, 'batches', 0, true)) as unknown as BatchInfo[] | { $tbr: 'error'; message: string };
    if (s.error) body.append(errorView(s));
    if (!Array.isArray(batches)) body.append(note(batches.message));
    else body.append(await batchesView(s, batches));
  }
  if (seq !== renderSeq) return; // a newer render started while this one waited
  detail.replaceChildren(head, body);
  body.scrollTop = scroll;
}

function note(text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'note';
  d.textContent = text;
  return d;
}

function errorView(s: Summary): HTMLElement {
  const box = document.createElement('div');
  box.className = 'error-box';
  const title = document.createElement('div');
  title.className = 'error-title';
  title.textContent = `${s.error!.code}: ${s.error!.message}`;
  box.append(title);
  if (s.error!.data && !(typeof s.error!.data === 'object' && '$tbr' in s.error!.data && s.error!.data.$tbr === 'undefined')) box.append(renderTree(s.error!.data));
  return box;
}

/** A value, as a table when it is an array of objects (switchable), as a tree otherwise. */
function valueView(v: Json): HTMLElement {
  const wrap = document.createElement('div');
  const table = tableRows(v);
  if (!table) {
    wrap.append(renderTree(v));
    return wrap;
  }
  const bar = document.createElement('div');
  bar.className = 'view-bar';
  const content = document.createElement('div');
  const show = () => {
    content.replaceChildren(view === 'table' ? renderTable(table.rows, table.length) : renderTree(v));
    for (const b of bar.children) b.classList.toggle('active', (b as HTMLElement).dataset.view === view);
  };
  for (const name of ['table', 'tree'] as const) {
    const b = document.createElement('button');
    b.dataset.view = name;
    b.textContent = name === 'table' ? 'Table' : 'Tree';
    b.onclick = () => {
      view = name;
      show();
    };
    bar.append(b);
  }
  wrap.append(bar, content);
  show();
  return wrap;
}

async function batchesView(s: Summary, batches: BatchInfo[]): Promise<HTMLElement> {
  const wrap = document.createElement('div');
  wrap.className = 'batches';
  const side = document.createElement('div');
  side.className = 'batch-list';
  const main = document.createElement('div');
  main.className = 'batch-main';
  if (!batches.length) side.append(note(s.state === 'open' ? 'No batches yet.' : 'No batches kept.'));
  if (!batchPinned || !batches.some((b) => b.index === batchIndex)) batchIndex = batches.at(-1)?.index ?? null;
  if (s.batches! > batches.length) side.append(note(`last ${batches.length} of ${s.batches} kept`));
  for (const b of batches) {
    const row = document.createElement('div');
    row.className = b.index === batchIndex ? 'batch selected' : 'batch';
    row.textContent = `#${b.index}  +${ms(b.ms)}  ${b.frame ? `${b.frame} ` : ''}${b.rows} row${b.rows === 1 ? '' : 's'}  ${bytes(b.bytes)}`;
    row.onclick = () => {
      batchIndex = b.index;
      // the latest batch again goes back to following
      batchPinned = b.index !== batches.at(-1)?.index;
      renderDetail();
    };
    side.append(row);
  }
  if (batchIndex !== null) main.append(valueView(await part(s.id, 'batch', batchIndex)));
  wrap.append(side, main);
  requestAnimationFrame(() => side.querySelector('.selected')?.scrollIntoView({ block: 'nearest' }));
  return wrap;
}

function renderInfo(s: Summary, into: HTMLElement) {
  const dl = document.createElement('dl');
  dl.className = 'info';
  const add = (k: string, v: string, cls?: string) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    if (cls) dd.className = cls;
    dl.append(dt, dd);
  };
  add('Procedure', s.path);
  add('Kind', s.kind === 'stream' ? (s.live ? `live state by ${s.live}` : 'stream') : s.method === 'GET' ? 'query (GET)' : 'call (POST)');
  add('Started', `${new Date(s.time).toLocaleDateString()} ${clock(s.time)}`);
  if (s.kind === 'call') {
    add('Status', String(s.status));
    add('Time', ms(s.ms));
    add('Input', bytes(s.sent));
    add('Response', bytes(s.received));
  } else {
    add('State', s.state!);
    add(s.state === 'open' ? 'Open for' : 'Lasted', duration(s));
    add('Batches', String(s.batches));
    add('Rows', String(s.rows));
    add('Received', bytes(s.received));
  }
  if (s.error) add('Error', `${s.error.code}: ${s.error.message}`, 'bad');
  add('Contract hash', s.hash);
  if (s.serverHash) add('Server hash', mismatch(s) ? `${s.serverHash} (differs: run tbr generate on both sides)` : s.serverHash, mismatch(s) ? 'bad' : undefined);
  into.append(dl);
}

function renderInfoInto(s: Summary) {
  const body = detail.querySelector('.detail-body');
  if (!body) return;
  body.replaceChildren();
  renderInfo(s, body as HTMLElement);
}

// ------------------------------------------------------------------------------------------ toolbar

$<HTMLButtonElement>('#clear').onclick = () => {
  void hookCall('clear');
  reset();
  updateCounts();
};
$<HTMLInputElement>('#filter').oninput = (e) => {
  filter = (e.target as HTMLInputElement).value.trim().toLowerCase();
  for (const s of rows.values()) elements.get(s.id)!.hidden = !!filter && !s.path.toLowerCase().includes(filter);
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return select(null);
  if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || (e.target as HTMLElement).tagName === 'INPUT') return;
  const visible = [...rows.keys()].filter((id) => !elements.get(id)!.hidden);
  if (!visible.length) return;
  const at = selected === null ? -1 : visible.indexOf(selected);
  const next = visible[Math.max(0, Math.min(visible.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
  select(next);
  elements.get(next)!.scrollIntoView({ block: 'nearest' });
  e.preventDefault();
});
if (inDevtools) chrome.devtools.network.onNavigated.addListener(() => setTimeout(poll, 50));

updateCounts();
void poll();
setInterval(poll, POLL_MS);
