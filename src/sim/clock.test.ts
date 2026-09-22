import { describe, expect, it } from 'vitest';
import { WEEK_DURATION_MS_AT_1X } from '../tuning.ts';
import { advanceWeekProgress, MAX_SAMPLE_MS, msPerWeek, SPEEDS, speedAllowed } from './clock.ts';
import { seatById } from '../content/seats.ts';
import { DEANS_FOR_FASTEST } from '../tuning.ts';
import type { Seat } from './seats.ts';
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

  it('sells the top two tiers for payroll (DD §3.2)', () => {
    // An undelegated college runs at 1× and 2× and no faster: fast time is
    // only safe when the institution can decide routine things without the
    // player, so the player buys it with seats.
    const bare = createNewGame(1);
    for (const speed of ['paused', 'x1', 'x2'] as const) {
      expect(speedAllowed(bare, speed)).toBe(true);
    }
    expect(speedAllowed(bare, 'x4')).toBe(false);
    expect(speedAllowed(bare, 'x8')).toBe(false);

    const seat = (seatId: string, schoolId: string | null): Seat => ({
      seatId,
      schoolId,
      filledBy: { kind: 'outside' },
      policy: seatById(seatId).defaultPolicy,
      salary: seatById(seatId).outsideSalary,
      appointedYear: 1,
    });
    const withProvost = { ...bare, delegation: { seats: [seat('provost', null)] } };
    expect(speedAllowed(withProvost, 'x4')).toBe(true);
    expect(speedAllowed(withProvost, 'x8')).toBe(false);

    const schools = ['arts-letters', 'science', 'engineering', 'business'];
    const staffed = {
      ...bare,
      delegation: {
        seats: [seat('provost', null), ...schools.map((id) => seat('dean', id))],
      },
    };
    expect(schools).toHaveLength(DEANS_FOR_FASTEST);
    expect(speedAllowed(staffed, 'x8')).toBe(true);
    // One Dean short is still not fast enough.
    const nearly = {
      ...staffed,
      delegation: { seats: staffed.delegation.seats.slice(0, DEANS_FOR_FASTEST) },
    };
    expect(speedAllowed(nearly, 'x8')).toBe(false);
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
