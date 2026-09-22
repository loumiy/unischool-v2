import { DEANS_FOR_FASTEST, WEEK_DURATION_MS_AT_1X } from '../tuning.ts';
import { deansAppointed, fastestTimeAllowed, fastTimeAllowed, provostAppointed } from './seats.ts';
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

// DD §3.2: 4× needs a Provost, 8× a Provost plus four Deans. Fast time is
// only safe when the institution can make routine decisions without the
// player, so the player literally buys fast-forward with payroll — which
// is the same payroll the administrative ratchet is made of (§5.4).
export function speedAllowed(state: GameState, speed: Speed): boolean {
  if (speed === 'x4') return fastTimeAllowed(state);
  if (speed === 'x8') return fastestTimeAllowed(state);
  return true;
}

// WHAT A CLOSED SPEED IS WAITING FOR (DD §3.2). The gate is the bargain at
// the centre of the pacing budget — fast time is bought with payroll — and a
// control that is simply dead teaches nobody that. The rule lives here with
// the gate it explains; the words the seats are called by are the UI's.
export interface SpeedGate {
  provost: boolean; // still to appoint
  deans: number; // still to appoint
}

export function speedGate(state: GameState, speed: Speed): SpeedGate | null {
  if (speedAllowed(state, speed)) return null;
  const provost = !provostAppointed(state);
  const deans = speed === 'x8' ? Math.max(0, DEANS_FOR_FASTEST - deansAppointed(state)) : 0;
  return { provost, deans };
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
