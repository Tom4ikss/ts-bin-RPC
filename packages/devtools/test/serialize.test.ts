import { describe, expect, it } from 'vitest';
import { serialize } from '../src/serialize.ts';

describe('serialize', () => {
  it('keeps JSON values as they are', () => {
    const v = { a: 1, b: 'x', c: [true, null], d: { e: -2.5 } };
    expect(serialize(v)).toEqual(v);
  });

  it('marks values that JSON loses', () => {
    expect(serialize([undefined, 10n, NaN, -Infinity, -0, new Date(0), new Date(NaN), Symbol('s')])).toEqual([
      { $tbr: 'undefined' },
      { $tbr: 'bigint', v: '10' },
      { $tbr: 'number', v: 'NaN' },
      { $tbr: 'number', v: '-Infinity' },
      { $tbr: 'number', v: '-0' },
      { $tbr: 'date', v: '1970-01-01T00:00:00.000Z' },
      { $tbr: 'date', v: 'Invalid Date' },
      { $tbr: 'other', v: 'Symbol(s)' },
    ]);
  });

  it('shows typed arrays, maps and sets with their sizes, cut past the limit', () => {
    expect(serialize(new Float32Array([0.5, NaN, 2]), 2)).toEqual({ $tbr: 'typed', type: 'Float32Array', length: 3, v: [0.5, 'NaN'] });
    expect(serialize(new BigInt64Array([-1n]))).toEqual({ $tbr: 'typed', type: 'BigInt64Array', length: 1, v: ['-1'] });
    expect(serialize(new Map<unknown, unknown>([['a', 1], [2n, new Date(0)], ['c', 3]]), 2)).toEqual({
      $tbr: 'map',
      size: 3,
      v: [['a', 1], [{ $tbr: 'bigint', v: '2' }, { $tbr: 'date', v: '1970-01-01T00:00:00.000Z' }]],
    });
    expect(serialize(new Set([1, 2]))).toEqual({ $tbr: 'set', size: 2, v: [1, 2] });
    expect(serialize([1, 2, 3], 2)).toEqual({ $tbr: 'array', length: 3, v: [1, 2] });
  });

  it('marks cycles, not shared references', () => {
    const shared = { x: 1 };
    const a: Record<string, unknown> = { left: shared, right: shared };
    a.self = a;
    expect(serialize(a)).toEqual({ left: { x: 1 }, right: { x: 1 }, self: { $tbr: 'cycle' } });
  });

  it('wraps an object with a key of its own named $tbr', () => {
    expect(serialize({ $tbr: 'bigint', v: '1' })).toEqual({ $tbr: 'object', v: { $tbr: 'bigint', v: '1' } });
  });
});
