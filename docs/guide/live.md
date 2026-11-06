---
title: Live state
description: Rows by key that every subscriber keeps in sync, from a snapshot and deltas of the fields that changed.
---

# Live state

Live state is a set of rows by key that the server changes and every subscriber keeps a copy of:
units on a map, orders in a book, devices on a dashboard. A new subscriber gets a snapshot of every
row, then, once per window, a delta with the rows added, the fields that changed and the keys
removed. The client applies them to a `Map` for you.

```ts
// server
import { live } from 'ts-bin-rpc/server';
import type { f32, u16, u32 } from 'ts-bin-rpc';

export interface Unit {
  id: u32;
  name: string;
  x: f32;
  y: f32;
  hp: u16;
}

const units = live<Unit>().by('id');

units.set({ id: 1, name: 'scout', x: 0, y: 0, hp: 100 });
units.update(1, { x: 5 }); // subscribers get { id: 1, x: 5 }
units.delete(1);

export const appRouter = {
  units: () => units.subscribe(),
};
```

```ts
// client
const sub = api.units.subscribe((state, changes) => {
  for (const id of changes.set) draw(state.get(id)!);
  for (const id of changes.removed) erase(id);
});
sub.state; // ReadonlyMap<u32, Unit>, the same Map the handler gets
sub.stop();
```

## Server

### `live<T>().by(key, options?)`

Creates the state. `key` names a required field of `T` that is a string, a string literal union,
a number or a bigint. Rows are kept by its value.

- **`window`**: milliseconds changes wait to go out together after the first one. Default: 16.
  `0` sends the changes made in the same task together.

The state reads like a `Map`: `get`, `has`, `keys`, `values`, `entries`, `size`, and `for...of`.

### Changing rows

- **`set(row)`** adds a row or replaces the one with its key. The row is copied, so changing the
  object you passed afterwards changes nothing. Of a row that was there, only the fields that
  changed go out.
- **`update(key, fields)`** changes some fields. It throws when there is no row with this key, or
  when `fields` changes the key.
- **`delete(key)`** removes a row; it returns `false` when there was none.
- **`clear()`** removes every row.

A field changed when its new value is not `Object.is` the old one. Dates compare by their time.
Objects and arrays compare by identity: a new array is a change even with the same elements.

A delta never unsets a field. A row whose field became `undefined` goes out whole instead, and the
client replaces its row. `null` is a value like any other and goes out in the delta.

Changes to the same row within a window merge: `update(1, { x: 1 })` then `update(1, { y: 2 })`
sends `{ id: 1, x: 1, y: 2 }`, and a row added and then changed goes out once, whole.

Without subscribers, changes cost nothing but the copy: whoever subscribes next gets a snapshot.

### `subscribe(options?)`

Returns what a procedure returns: `LiveStream<T, K>`. The procedure takes an input and `ctx` like
any other, and every subscriber of one state gets every row of it. For a state per room or per
user, keep one `live()` per room in a `Map` and pick it in the procedure.

```ts
const rooms = new Map<string, Live<Unit, 'id'>>();
export const appRouter = {
  room: (input: { room: string }) => rooms.get(input.room)!.subscribe(),
};
```

`options` are those of a [stream subscriber](streams.md#options): `maxBuffered` and `heartbeat`.
`overflow` does not apply: see slow clients below.

### Ending

**`end(error?)`** sends the pending changes and ends every subscription; with an error, subscribers
get it, as with `stream()`. The rows stay, and later subscribers get them.

`subscribers` counts the subscriptions open right now.

## Client

`api.x.subscribe(input?, handler?, options?)`, like a stream. `handler` is either a function
`(state, changes)` or an object:

```ts
api.units.subscribe({
  change(state, changes) {},
  error(e) {}, // RpcError; without it the error goes to console.error
  end() {}, // the server ended the state; stop() does not call it
});
```

`changes` says what the last frame did:

- **`snapshot`**: `true` for a snapshot, which replaced every row. The first change is always one.
- **`set`**: keys of the rows added or changed.
- **`removed`**: keys of the rows removed. For a snapshot, the rows that were there and are not now.

`state` is a `Map` that the subscription changes in place. A changed row is a new object, and an
unchanged one is the same object as before, so `React.memo` and selectors skip what did not
change. Rows are plain objects, not [views](views.md): a delta changes a few fields of a row, and a
view would keep the whole message alive.

`options` takes `signal` and `headers`, like any call, and `order`.

### Order

Without `order`, `state` iterates in the order rows arrived: a snapshot in the server's order, new
rows at the end. With `order`, it iterates by key: `'asc'`, `'desc'` (by `<`, strings by code unit),
or a comparator of keys. An order book is the case it is for:

```ts
const bids = api.book.bids.subscribe({ symbol: 'BTC' }, draw, { order: 'desc' });
const asks = api.book.asks.subscribe({ symbol: 'BTC' }, draw, { order: 'asc' });

function draw(levels: ReadonlyMap<number, Level>) {
  let n = 0;
  for (const level of levels.values()) {
    if (n++ === 20) break; // the best 20 levels
    row(level);
  }
}
```

A changed row keeps its place, since its key does not change, so only frames that add keys reorder
the `Map`: the new keys are merged into the sorted ones, in time linear in the size of the state.

Over a [WebSocket](websocket.md), a live subscription outlives a dropped connection: it starts
again on a new socket, and its first frame there is a snapshot.

## Slow clients

When a client reads slower than the deltas come, its queue grows. At `maxBuffered` (4 MB by
default), the queued deltas are dropped and replaced by one snapshot of the state as it is: the
client catches up with a single frame instead of failing, and sees `snapshot: true`. Only a state
larger than `maxBuffered` itself ends the subscription with `SLOW_CONSUMER`.

## Errors

A row that does not match `T` (a string in a number field, say) cannot be encoded. Every subscriber
gets `BAD_OUTPUT` and the server's `onError` gets the `EncodeError` with the path of the bad value.

## On the wire

A snapshot frame carries `T[]`, the same columns as a stream batch. A delta frame carries:

```ts
{ set?: T[]; patch?: Patch<T>[]; removed?: K[] }
```

`Patch<T>` is `T` with every field but the key optional. Each delta is encoded once and its bytes go to every subscriber. The lockfile records the delta
type, `LiveDelta<Unit, "id">`, and the procedure as `live object Unit by id`; a patch has the field
IDs of its row, so [evolution](evolution.md) rules for `T` cover it.

What it saves, for 100 entities where 5% move each frame
([bench](https://github.com/Tom4ikss/ts-bin-RPC/blob/main/bench/results/deltas.md)):

| Each frame | raw | deflate, one context |
|---|---|---|
| JSON, the whole state | 14 285 B | 289 B |
| ts-bin-rpc, the whole state | 3 498 B | 114 B |
| ts-bin-rpc, a delta | 345 B | 87 B |

Without compression a delta is ten times smaller than the state. Stream compression with a shared
context finds unchanged rows by itself, so there the gain is about a quarter, and the rest is on
the client: it decodes five rows instead of a hundred and redraws only those.

## Limits

- A row has at most 30 fields besides the key: a patch marks the fields it carries in a bitmask.
- Fields that are literal types (`kind: 'unit'`) are not on the wire and never change.
- `T` is an object type with named fields: not a union, a map or a tuple.
