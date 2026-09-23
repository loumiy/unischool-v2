import type { Clock } from './calendar.ts';

// WINTER (Phase 21E). The year has three terms and no cold, so winter
// arrives as weather rather than as a term: nothing that counts terms has
// to be re-cut. It comes at the end of the fall and leaves in the middle of
// the spring, which is what winter does to an academic year — the first
// snow before finals, the deepest of it when the spring term starts in the
// dark, the thaw by the sixth week.
//
// It lives in the sim, not the map, because events read it (the `when`
// vocabulary's `winterAtLeast`), so a replay, a headless run and the live
// game agree on which weeks are cold. It is a pure function of the clock:
// no state, no dice.

// How deep the winter is, 0–1, by week. Fall weeks 12–14, spring 1–6.
const FALL_SNOW = [0.35, 0.6, 0.8] as const; // weeks 12, 13, 14
const SPRING_SNOW = [1, 1, 0.9, 0.7, 0.45, 0.2] as const; // weeks 1–6

export const FIRST_WINTER_FALL_WEEK = 12;
export const LAST_WINTER_SPRING_WEEK = SPRING_SNOW.length;

export function winterDepth(clock: Clock): number {
  if (clock.term === 'fall' && clock.week >= FIRST_WINTER_FALL_WEEK) {
    return FALL_SNOW[clock.week - FIRST_WINTER_FALL_WEEK] ?? 0;
  }
  if (clock.term === 'spring' && clock.week <= LAST_WINTER_SPRING_WEEK) {
    return SPRING_SNOW[clock.week - 1] ?? 0;
  }
  return 0;
}
