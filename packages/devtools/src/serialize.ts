// Values as JSON for the panel: dates, bigints, typed arrays and maps keep their kind, long arrays are
// cut, cycles are marked.
import type { Json, Special } from './protocol.ts';

/** Elements of an array, a typed array or a map past which the rest is left out. */
export const MAX_ITEMS = 1000;

export function serialize(value: unknown, max = MAX_ITEMS): Json {
  const seen = new Set<object>();
  const special = (s: Special): Json => s as Json;

  const walk = (v: unknown): Json => {
    switch (typeof v) {
      case 'string':
      case 'boolean':
        return v;
      case 'number':
        return Number.isFinite(v) && !Object.is(v, -0) ? v : special({ $tbr: 'number', v: Object.is(v, -0) ? '-0' : String(v) });
      case 'bigint':
        return special({ $tbr: 'bigint', v: v.toString() });
      case 'undefined':
        return special({ $tbr: 'undefined' });
      case 'object':
        break;
      default:
        return special({ $tbr: 'other', v: String(v) });
    }
    if (v === null) return null;
    if (v instanceof Date) return special({ $tbr: 'date', v: Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString() });
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const a = v as unknown as ArrayLike<number | bigint>;
      const out: (number | string)[] = [];
      for (let i = 0; i < Math.min(a.length, max); i++) {
        const x = a[i];
        out.push(typeof x === 'bigint' ? x.toString() : Number.isFinite(x) ? x : String(x));
      }
      return special({ $tbr: 'typed', type: v.constructor.name, length: a.length, v: out });
    }
    if (seen.has(v)) return special({ $tbr: 'cycle' });
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        const items = v.slice(0, max).map(walk);
        return v.length > max ? special({ $tbr: 'array', length: v.length, v: items }) : items;
      }
      if (v instanceof Map) {
        const entries: [Json, Json][] = [];
        for (const [k, x] of v) {
          if (entries.length === max) break;
          entries.push([walk(k), walk(x)]);
        }
        return special({ $tbr: 'map', size: v.size, v: entries });
      }
      if (v instanceof Set) return special({ $tbr: 'set', size: v.size, v: [...v].slice(0, max).map(walk) });
      const out: { [key: string]: Json } = {};
      for (const k of Object.keys(v)) out[k] = walk((v as Record<string, unknown>)[k]);
      // An object of the caller's with a `$tbr` key must not read as one of ours.
      return Object.hasOwn(out, '$tbr') ? special({ $tbr: 'object', v: out }) : out;
    } finally {
      seen.delete(v);
    }
  };
  return walk(value);
}
