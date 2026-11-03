// Client-side checks against a running fixture server; the same module runs in Node and in browsers.
// Returns failures instead of throwing, so one run reports everything that broke.
import { createClient } from 'ts-bin-rpc/client';
import { CONTENT_TYPE, EncodeError, RpcError, toPlain } from 'ts-bin-rpc';
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

  // Protocol, without the client
  const headers = { 'content-type': CONTENT_TYPE };
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
  }

  return report;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function show(v: unknown): string {
  return JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x === undefined ? '<undefined>' : x)) ?? '<undefined>';
}
