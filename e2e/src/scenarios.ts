// Client-side checks against a running fixture server; the same module runs in Node and in browsers.
// Returns failures instead of throwing, so one run reports everything that broke.
import { createClient, webSocket } from 'ts-bin-rpc/client';
import { CONTENT_TYPE, EncodeError, RpcError, toPlain } from 'ts-bin-rpc';
import type { LiveChanges, u32 } from 'ts-bin-rpc';
import { decodeError } from 'ts-bin-rpc/runtime';
import type { appRouter } from './router.ts';
import { procedures } from './tbr.gen.ts';

export interface Report {
  passed: number;
  failures: string[];
}

export async function scenarios(origin: string, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Report> {
  const url = `${origin}/rpc`;
  const api = createClient<typeof appRouter>({ url, procedures, fetch: fetchFn });
  const signedIn = createClient<typeof appRouter>({ url, procedures, fetch: fetchFn, headers: () => ({ authorization: 'Bearer ann' }) });
  const report: Report = { passed: 0, failures: [] };

  const check = (name: string, ok: unknown, got?: unknown) => {
    if (ok) report.passed++;
    else report.failures.push(got === undefined ? name : `${name}: got ${show(got)}`);
  };
  const same = (name: string, got: unknown, want: unknown) => check(name, show(got) === show(want), got);
  const rejects = async (name: string, p: Promise<unknown>, test: (e: unknown) => boolean) => {
    try {
      await p;
      check(`${name}: resolved`, false);
    } catch (e) {
      check(name, test(e), e instanceof Error ? `${e.name} ${(e as RpcError).code ?? ''} ${e.message}` : e);
    }
  };
  const rpcError = (code: string, status: number) => (e: unknown) => e instanceof RpcError && e.code === code && e.status === status;
  const raw = (path: string, init: RequestInit = {}) => fetchFn(`${url}/${path}`, { method: 'POST', ...init });
  const headers = { 'content-type': CONTENT_TYPE };
  const rawError = async (res: Response) => ({ status: res.status, ...decodeError(new Uint8Array(await res.arrayBuffer())), data: undefined });

  // Views over the response
  const bob = await api.user.get({ id: 2 });
  same('user.get name', bob.name, 'Bob');
  check('user.get u64 is a bigint', typeof bob.balance === 'bigint');
  check('user.get Date', bob.createdAt instanceof Date && bob.createdAt.getTime() === Date.UTC(2021, 5, 1));
  same('user.get nested object', bob.manager?.name, 'Ада');
  same('user.get nested u64', bob.manager?.balance, 2n ** 60n);
  same('user.get toPlain', toPlain(bob).tags, []);
  same('user.get JSON', JSON.parse(JSON.stringify(bob, (_, x) => (typeof x === 'bigint' ? `${x}` : x))).manager, {
    id: 1,
    name: 'Ада',
    role: 'admin',
    balance: '1152921504606846976',
    createdAt: '2020-01-01T00:00:00.000Z',
    tags: ['founder'],
    manager: null,
  });

  // Optional input
  same('user.list without input', (await api.user.list()).map((u) => u.name), ['Ада', 'Bob', 'Chloé']);
  same('user.list with input', (await api.user.list({ role: 'user', limit: 1 })).map((u) => u.id), [2]);
  same('user.list optional nullable', (await api.user.list()).map((u) => u.manager?.name ?? u.manager), [null, 'Ада', undefined]);

  // Errors and ctx
  await rejects('RpcError with data', api.user.get({ id: 99 }), (e) => rpcError('NOT_FOUND', 404)(e) && (e as RpcError).message === 'no user 99' && show((e as RpcError).data) === show({ id: 99 }));
  await rejects('ctx: unauthorized', api.user.rename({ id: 1, name: 'x' }), rpcError('UNAUTHORIZED', 401));
  same('ctx: void output', await signedIn.user.rename({ id: 1, name: 'x' }), undefined);
  same('ctx without input', await signedIn.whoami(), { user: 'ann' });
  same('per-call headers', await api.whoami({ headers: { authorization: 'Bearer bob' } }), { user: 'bob' });
  same('ctx from no headers', (await api.whoami()).user, null);

  // Middleware
  await api.audit();
  await rejects('middleware: authed refuses', api.account.me(), rpcError('UNAUTHORIZED', 401));
  same('middleware: derived ctx', await signedIn.account.me(), { name: 'ann' });
  same('middleware: input reaches the procedure', toPlain(await signedIn.account.deposit({ amount: 5 })), { user: 'ann', amount: 5 });
  await rejects('middleware: procedure errors pass through', signedIn.account.deposit({ amount: 0 }), rpcError('BAD_INPUT', 400));
  same('middleware: nested use, next(ctx)', await signedIn.account.trace.get(), { trace: 'ann@account.trace.get' });
  const venues: string[] = [];
  await new Promise<void>((end, error) => signedIn.account.ticks.subscribe({ n: 3 }, { row: (t) => venues.push(t.venue!), end, error }));
  same('middleware: streams', venues, ['ann', 'ann', 'ann']);
  same('middleware: around sees every outcome', (await api.audit()).calls, [
    'account.me UNAUTHORIZED',
    'account.me ok',
    'account.deposit ok',
    'account.deposit BAD_INPUT',
    'account.trace.get ok',
    'account.ticks ok',
  ]);
  await rejects('internal errors stay on the server', api.crash(), (e) => rpcError('INTERNAL', 500)(e) && !(e as Error).message.includes('secret'));
  await rejects('encoder checks ranges before sending', api.user.get({ id: -1 }), (e) => e instanceof EncodeError);
  const aborted = new AbortController();
  aborted.abort();
  await rejects('abort signal', api.whoami({ signal: aborted.signal }), (e) => (e as Error).name === 'AbortError');

  // Columns and unions
  const s = await api.series({ n: 1000 });
  check('typed arrays', s.t instanceof Float64Array && s.v instanceof Float32Array && s.t.length === 1000);
  check('typed arrays are views over the response', s.t.buffer === s.v.buffer);
  same('typed array values', [s.t[1], s.v[10]], [1_700_000_001_000, Math.fround(Math.sin(1))]);
  const events = await api.events();
  same('union vector', events.map((e) => (e.type === 'login' ? `${e.user} ${e.at.toISOString()}` : `${e.code} ${e.message}`)), [
    'Ада 2024-01-01T00:00:00.000Z',
    '503 upstream 🔥',
  ]);
  const echo = await api.echo({ text: 'naïve 日本 \u{1F600}', bytes: new Uint8Array([0, 255, 7]) });
  same('strings and bytes round trip', [echo.text, [...echo.bytes]], ['naïve 日本 \u{1F600}', [0, 255, 7]]);

  // Queries: GET, the input in the URL, cacheable
  {
    same('query: GET with input', (await api.catalog.user({ id: 2 })).name, 'Bob');
    await rejects('query: errors', api.catalog.user({ id: 99 }), rpcError('NOT_FOUND', 404));
    await rejects('query behind middleware: authed refuses', api.account.profile(), rpcError('UNAUTHORIZED', 401));
    same('query behind middleware', await signedIn.account.profile(), { name: 'ann', trace: false });
    same('query: public', await api.version(), { version: '1.0' });
    const long = 'x'.repeat(3000);
    same('query: a long input goes by POST', (await api.catalog.echo({ text: long })).text.length, 3000);
    // Browsers keep the response for max-age=60: the second call does not reach the server.
    const before = (await api.queryHits()).count;
    await api.catalog.size();
    await api.catalog.size();
    const hits = (await api.queryHits()).count - before;
    same('query: HTTP cache', hits, typeof document === 'undefined' ? 2 : 1);

    const get = (path: string, init: RequestInit = {}) => fetchFn(`${url}/${path}?h=${procedures[path as 'version'].hash}`, init);
    const first = await get('version');
    const etag = first.headers.get('etag');
    same('query: Cache-Control', first.headers.get('cache-control'), 'public, max-age=300');
    check('query: ETag', etag && /^"[\w-]{11}"$/.test(etag), etag);
    same('query: 304 Not Modified', (await get('version', { headers: { 'if-none-match': etag!, 'cache-control': 'no-cache' } })).status, 304);
    const bad = await fetchFn(`${url}/catalog.user?i=***`, { cache: 'no-store' });
    same('query: bad base64', [bad.status, bad.headers.get('cache-control')], [400, 'no-store']);
    same('query: POST still works', (await raw('version', { headers })).status, 200);
  }

  // Protocol, without the client
  same('garbage input', await rawError(await raw('user.get', { headers, body: new Uint8Array([1, 2, 3]) })), { status: 400, code: 'BAD_INPUT', message: 'not a ts-bin-rpc message', data: undefined });
  same('missing input', (await rawError(await raw('user.get', { headers }))).code, 'BAD_INPUT');
  same('unknown procedure', (await raw('user.nope', { headers })).status, 404);
  same('GET', (await raw('whoami', { method: 'GET' })).status, 405);
  same('form posts are refused', (await raw('whoami', { headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415);
  const res = await raw('whoami', { headers: { ...headers, 'x-tbr-schema': 'other' } });
  same('schema mismatch only warns by default', [res.status, res.headers.get('x-tbr-schema')], [200, procedures.whoami.hash]);

  // Streams
  {
    const rows: number[] = [];
    let batches = 0;
    let columnsOk = true;
    await new Promise<void>((resolve, reject) => {
      api.stream.ticks.subscribe({ n: 200 }, {
        row: (t) => rows.push(t.seq),
        batch: (b) => {
          batches++;
          const c = b.columns;
          columnsOk &&= c.price instanceof Float32Array && c.seq instanceof Uint32Array && c.price.length === b.length && c.seq[0] === b[0].seq && !('side' in c);
        },
        end: resolve,
        error: reject,
      });
    });
    same('stream: every row in order', rows, Array.from({ length: 200 }, (_, i) => i));
    check('stream: rows come in several batches', batches > 1 && batches < 200, batches);
    check('stream: batch columns are typed arrays', columnsOk);

    const seen: number[] = [];
    for await (const t of api.stream.ticks.subscribe({ n: 30, burst: 30 })) seen.push(t.seq);
    same('stream: for await', seen.length, 30);

    const left: number[] = [];
    for await (const x of api.stream.countdown.subscribe({ from: 3 })) left.push(x.left);
    same('stream: async generator', left, [3, 2, 1]);

    const failed = await new Promise<unknown>((resolve) => {
      const got: number[] = [];
      api.stream.failing.subscribe({ row: (t) => got.push(t.seq), error: (e) => resolve([got, e.code, e.message, e.data]), end: () => resolve('ended') });
    });
    same('stream: error after rows', failed, [[0], 'UPSTREAM', 'feed lost', { retryIn: 5 }]);

    const early = await new Promise<unknown>((resolve) => api.stream.ticks.subscribe({ n: 200_000 }, { error: (e) => resolve([e.code, e.status]), end: () => resolve('ended') }));
    same('stream: error before the first frame', early, ['BAD_INPUT', 400]);

    // Stopping reaches the server: the source's cleanup runs.
    const before = (await api.stream.stats()).cleaned;
    let got = 0;
    const sub = api.stream.forever.subscribe(() => got++);
    while (got < 5) await sleep(5);
    sub.stop();
    let cleaned = before;
    for (let i = 0; i < 200 && cleaned === before; i++) {
      await sleep(10);
      cleaned = (await api.stream.stats()).cleaned;
    }
    check('stream: stop() runs the server cleanup', cleaned > before, cleaned);
    let after = 0;
    for await (const _ of api.stream.forever.subscribe()) if (++after === 3) break;
    for (let i = 0; i < 200 && (await api.stream.stats()).running > 0; i++) await sleep(10);
    same('stream: break in for await stops it', (await api.stream.stats()).running, 0);

    // A channel: one encode per batch, every subscriber of the topic gets it.
    const a: string[] = [], b: string[] = [], c: string[] = [];
    const subs = [
      api.stream.quotes.subscribe({ symbol: 'BTC' }, (t) => a.push(`${t.venue}${t.seq}`)),
      api.stream.quotes.subscribe({ symbol: 'BTC' }, (t) => b.push(`${t.venue}${t.seq}`)),
      api.stream.quotes.subscribe({ symbol: 'ETH' }, (t) => c.push(`${t.venue}${t.seq}`)),
    ];
    for (let i = 0; i < 200 && (await api.stream.publish({ symbol: 'BTC', n: 0 })).subscribers < 2; i++) await sleep(10);
    same('channel: subscribers', (await api.stream.publish({ symbol: 'BTC', n: 40 })).subscribers, 2);
    for (let i = 0; i < 200 && (a.length < 40 || b.length < 40); i++) await sleep(10);
    same('channel: every subscriber gets the topic', [a.length, b.length, a[39], b[0]], [40, 40, 'BTC39', 'BTC0']);
    same('channel: other topics stay quiet', c.length, 0);
    subs.forEach((s) => s.stop());

    // Live state: a snapshot, then the changes, applied to a Map by id.
    const id = (1000 + Math.floor(Math.random() * 1e6)) as u32;
    const changes: LiveChanges<u32>[] = [];
    const live = api.stream.units.subscribe((_, c) => changes.push(c));
    const wait = async (ok: () => boolean) => {
      for (let i = 0; i < 200 && !ok(); i++) await sleep(10);
    };
    await wait(() => changes.length > 0);
    same('live: a snapshot first', [changes[0]?.snapshot, live.state.size >= 3], [true, true]);
    await api.stream.move({ id, x: 1.5, y: 2 });
    await wait(() => live.state.has(id));
    same('live: a row added', live.state.get(id), { id, name: `u${id}`, x: 1.5, y: 2, hp: 100, kind: 'unit' });
    const added = live.state.get(id);
    await api.stream.move({ id, x: 7, y: 2 });
    await wait(() => live.state.get(id)?.x === 7);
    same('live: a patch makes a new row', [live.state.get(id), live.state.get(id) === added], [{ ...added, x: 7 }, false]);
    await api.stream.kill({ id });
    await wait(() => !live.state.has(id));
    same('live: a row removed', [live.state.has(id), changes.at(-1)?.removed], [false, [id]]);
    live.stop();
  }

  return report;
}

/** The client over a WebSocket (DESIGN §19): calls, subscriptions and live state on one socket. */
export async function socketScenarios(origin: string): Promise<Report> {
  const url = `${origin}/rpc`;
  const ws = `${origin.replace(/^http/, 'ws')}/rpc`;
  const api = createClient<typeof appRouter>({ url, procedures, socket: webSocket(ws, { calls: true }) });
  const signedIn = createClient<typeof appRouter>({ url, procedures, socket: webSocket(`${ws}?token=ann`, { calls: true }) });
  const streamsOnly = createClient<typeof appRouter>({ url, procedures, socket: webSocket(ws) });
  const report: Report = { passed: 0, failures: [] };
  const check = (name: string, ok: unknown, got?: unknown) => {
    if (ok) report.passed++;
    else report.failures.push(got === undefined ? `socket: ${name}` : `socket: ${name}: got ${show(got)}`);
  };
  const same = (name: string, got: unknown, want: unknown) => check(name, show(got) === show(want), got);
  const rejects = async (name: string, p: Promise<unknown>, test: (e: unknown) => boolean) => {
    try {
      await p;
      check(`${name}: resolved`, false);
    } catch (e) {
      check(name, test(e), e instanceof Error ? `${e.name} ${(e as RpcError).code ?? ''} ${e.message}` : e);
    }
  };
  const rpcError = (code: string, status: number) => (e: unknown) => e instanceof RpcError && e.code === code && e.status === status;

  // Calls
  same('call', (await api.user.get({ id: 2 })).name, 'Bob');
  same('call without input', (await api.user.list()).length, 3);
  same('typed arrays', (await api.series({ n: 4 })).t.length, 4);
  await rejects('error with data', api.user.get({ id: 99 }), (e) => rpcError('NOT_FOUND', 404)(e) && show((e as RpcError).data) === show({ id: 99 }));
  await rejects('internal errors stay on the server', api.crash(), (e) => rpcError('INTERNAL', 500)(e) && !(e as Error).message.includes('secret'));
  await rejects('server-side rules', api.rename({ name: '', nick: [], age: 1 }), rpcError('BAD_INPUT', 400));
  const aborted = new AbortController();
  aborted.abort();
  await rejects('abort signal', api.whoami({ signal: aborted.signal }), (e) => (e as Error).name === 'AbortError');
  same('ctx from the socket URL', await signedIn.whoami(), { user: 'ann' });
  await rejects('middleware refuses without it', api.account.me(), rpcError('UNAUTHORIZED', 401));
  same('middleware passes with it', await signedIn.account.me(), { name: 'ann' });
  same('queries keep GET over HTTP', await api.version(), { version: '1.0' });
  same('calls at once', (await Promise.all([1, 2, 3, 1, 2, 3].map((id) => api.user.get({ id })))).map((u) => u.id), [1, 2, 3, 1, 2, 3]);

  // Streams
  const ticks = await new Promise<{ n: number; last?: number; error?: string }>((resolve) => {
    let n = 0, last: number | undefined;
    streamsOnly.stream.ticks.subscribe({ n: 300, burst: 5 }, { row: (t) => (n++, (last = t.seq)), end: () => resolve({ n, last }), error: (e) => resolve({ n, error: e.code }) });
  });
  same('stream to its end', ticks, { n: 300, last: 299 });
  const left: number[] = [];
  for await (const x of streamsOnly.stream.countdown.subscribe({ from: 3 })) left.push(x.left);
  same('async generator', left, [3, 2, 1]);
  same(
    'stream error with data',
    await new Promise((resolve) => streamsOnly.stream.failing.subscribe({ error: (e) => resolve([e.code, e.data]), end: () => resolve('ended') })),
    ['UPSTREAM', { retryIn: 5 }],
  );
  same('error before the first frame', await new Promise((resolve) => streamsOnly.stream.ticks.subscribe({ n: 200_000 }, { error: (e) => resolve([e.code, e.status]), end: () => resolve('ended') })), ['BAD_INPUT', 400]);
  same('stream behind middleware', await new Promise((resolve) => {
    const seen: string[] = [];
    signedIn.account.ticks.subscribe({ n: 2 }, { row: (t) => seen.push(`${t.venue}${t.seq}`), end: () => resolve(seen) });
  }), ['ann0', 'ann1']);
  const before = (await api.stream.stats()).cleaned;
  let got = 0;
  const forever = streamsOnly.stream.forever.subscribe(() => got++);
  for (let i = 0; i < 200 && got < 3; i++) await sleep(10);
  forever.stop();
  let cleaned = before;
  for (let i = 0; i < 200 && cleaned === before; i++) {
    await sleep(10);
    cleaned = (await api.stream.stats()).cleaned;
  }
  same('stop() reaches the server', cleaned, before + 1);

  // Live state
  const id = (2000 + Math.floor(Math.random() * 1e6)) as u32;
  const changes: LiveChanges<u32>[] = [];
  const live = streamsOnly.stream.units.subscribe((_, c) => changes.push(c));
  for (let i = 0; i < 200 && !changes.length; i++) await sleep(10);
  same('live: a snapshot first', changes[0]?.snapshot, true);
  await api.stream.move({ id, x: 4, y: 5 });
  for (let i = 0; i < 200 && live.state.get(id)?.x !== 4; i++) await sleep(10);
  same('live: a change', live.state.get(id), { id, name: `u${id}`, x: 4, y: 5, hp: 100, kind: 'unit' });
  await api.stream.kill({ id });
  for (let i = 0; i < 200 && live.state.has(id); i++) await sleep(10);
  same('live: a removal', live.state.has(id), false);
  live.stop();

  return report;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function show(v: unknown): string {
  return JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x === undefined ? '<undefined>' : x)) ?? '<undefined>';
}
