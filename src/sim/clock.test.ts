import { describe, expect, it } from 'vitest';
import { WEEK_DURATION_MS_AT_1X } from '../tuning.ts';
import { advanceWeekProgress, MAX_SAMPLE_MS, msPerWeek, SPEEDS, speedAllowed } from './clock.ts';
import { createNewGame } from './state.ts';

describe('speeds', () => {
  it('offers pause and four multipliers (DD §3.2)', () => {
    expect(SPEEDS).toEqual(['paused', 'x1', 'x2', 'x4', 'x8']);
    expect(msPerWeek('paused')).toBe(0);
    expect(msPerWeek('x1')).toBe(WEEK_DURATION_MS_AT_1X);
    expect(msPerWeek('x8')).toBe(WEEK_DURATION_MS_AT_1X / 8);
  });

  it('never drops a tick to the sample cap at the fastest speed', () => {
    expect(msPerWeek('x8')).toBeGreaterThanOrEqual(MAX_SAMPLE_MS);
  });

  it('gates nothing yet (Phase 20 replaces the stub)', () => {
    const s = createNewGame(1);
    for (const speed of SPEEDS) expect(speedAllowed(s, speed)).toBe(true);
  });
});

describe('advanceWeekProgress', () => {
  it('accumulates and carries the remainder across a tick boundary', () => {
    let p = 0;
    let ticks = 0;
    // 250/1000 is exact in binary; 300/1000 is not, and ten of those drift
    // to 2.9999…, which is the accumulator's real behaviour, not a bug.
    for (let i = 0; i < 12; i++) {
      const r = advanceWeekProgress(p, 250, 1000);
      p = r.progress;
      ticks += r.ticks;
    }
    expect(ticks).toBe(3);
    expect(p).toBeCloseTo(0);
  });

  it('survives a pause: progress is unchanged when the clock is stopped', () => {
    expect(advanceWeekProgress(0.4, 500, 0)).toEqual({ progress: 0.4, ticks: 0 });
  });

  it('survives a speed change: the fraction is what carries over', () => {
    const slow = advanceWeekProgress(0, 500, 1000); // half a week at one speed
    const fast = advanceWeekProgress(slow.progress, 250, 500); // half a week at double speed
    expect(fast.ticks).toBe(1);
    expect(fast.progress).toBeCloseTo(0);
  });

  it('can cross more than one week in a single sample', () => {
    expect(advanceWeekProgress(0.5, 2600, 1000)).toEqual({
      progress: expect.closeTo(0.1),
      ticks: 3,
    });
  });

  it('ignores non-positive or backwards samples', () => {
    expect(advanceWeekProgress(0.2, 0, 1000)).toEqual({ progress: 0.2, ticks: 0 });
    expect(advanceWeekProgress(0.2, -50, 1000)).toEqual({ progress: 0.2, ticks: 0 });
  });
});
