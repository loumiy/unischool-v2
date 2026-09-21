import { WEEK_DURATION_MS_AT_1X } from '../tuning.ts';
import type { GameState } from './state.ts';

// The real-time side of the weekly tick, kept pure so it is testable by
// feeding it (delta, speed) pairs. It decides how many whole weeks a sample
// of elapsed real time is worth; the UI's driver decides when to sample and
// the sim's tick() decides what a week means.
//
// Ported from v1's weekClock.ts (reference/v1 does not carry the engine, but
// the design is v1's): what survives a pause or a speed change is the elapsed
// FRACTION of the week, not a timer. Pausing on day 5 of week 3 and resuming
// stays on day 5; changing speed changes only the rate the fraction accrues.

export type Speed = 'paused' | 'x1' | 'x2' | 'x4' | 'x8';

export const SPEEDS: readonly Speed[] = ['paused', 'x1', 'x2', 'x4', 'x8'];

export const SPEED_MULTIPLIER: Readonly<Record<Speed, number>> = {
  paused: 0,
  x1: 1,
  x2: 2,
  x4: 4,
  x8: 8,
};

// Milliseconds per sim week at a speed; 0 means the clock does not run.
export function msPerWeek(speed: Speed): number {
  const m = SPEED_MULTIPLIER[speed];
  return m === 0 ? 0 : WEEK_DURATION_MS_AT_1X / m;
}

// DD §3.2: 4× needs a Provost, 8× a Provost plus four Deans. Delegation is
// Phase 20; until then every speed is open. This is the typed no-op the
// placeholder policy allows: the gate exists, it just says yes.
export function speedAllowed(_state: GameState, _speed: Speed): boolean {
  return true;
}

export interface WeekAdvance {
  // How far through the current week we now are, 0..1.
  progress: number;
  // Whole weeks crossed by this sample. Normally 0 or 1; more only when one
  // sample covered more than a week, which 8× or a delayed timer can do.
  ticks: number;
}

export function advanceWeekProgress(
  progress: number,
  elapsedMs: number,
  msPerWeekAtSpeed: number,
): WeekAdvance {
  if (!(msPerWeekAtSpeed > 0) || !(elapsedMs > 0)) return { progress, ticks: 0 };
  const total = progress + elapsedMs / msPerWeekAtSpeed;
  const ticks = Math.floor(total);
  return { progress: total - ticks, ticks };
}

// The longest stretch of real time one sample may be worth. Browsers throttle
// background tabs, so a tab left for ten minutes would otherwise hand the
// accumulator one enormous delta and lurch the sim through months in a frame.
// Capping the sample makes an unattended tab effectively pause. At 8× a week
// is 1000 ms, so the cap never drops a tick during ordinary play.
export const MAX_SAMPLE_MS = 1000;
