import { describe, expect, it } from 'vitest';
import { Rng, seedToState } from './rng.ts';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = Rng.fromSeed(42);
    const b = Rng.fromSeed(42);
    const xs = Array.from({ length: 100 }, () => a.nextU32());
    const ys = Array.from({ length: 100 }, () => b.nextU32());
    expect(xs).toEqual(ys);
  });

  it('differs between adjacent seeds', () => {
    const a = Rng.fromSeed(1);
    const b = Rng.fromSeed(2);
    expect(a.nextU32()).not.toBe(b.nextU32());
    expect(seedToState(1)).not.toEqual(seedToState(2));
  });

  it('resumes exactly from a snapshot', () => {
    const live = Rng.fromSeed(7);
    for (let i = 0; i < 10; i++) live.next();
    const snap = live.snapshot();
    const resumed = Rng.fromState(snap);
    for (let i = 0; i < 50; i++) expect(resumed.nextU32()).toBe(live.nextU32());
  });

  it('snapshots survive JSON', () => {
    const rng = Rng.fromSeed(99);
    const snap = JSON.parse(JSON.stringify(rng.snapshot()));
    expect(Rng.fromState(snap).nextU32()).toBe(rng.nextU32());
  });

  it('keeps next() in [0, 1) and int() inclusive', () => {
    const rng = Rng.fromSeed(3);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      seen.add(rng.int(1, 6));
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('is roughly uniform', () => {
    const rng = Rng.fromSeed(2024);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng.next() * 10)]!++;
    for (const b of buckets) expect(Math.abs(b / n - 0.1)).toBeLessThan(0.01);
  });
});
