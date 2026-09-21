import { beatById, beatsAt, type CalendarBeat } from '../content/calendarBeats.ts';
import type { Action } from './actions.ts';
import type { Clock } from './calendar.ts';
import { clockRuns, type GameState } from './state.ts';

// CALENDAR BEATS IN THE SIM (DD §3.3). A beat fires on the tick that lands
// on its week and HOLDS THE CLOCK: no week passes until the beat is resolved
// by an action. That is the decide/watch rhythm made literal — the four
// moments a year that are the player's, not the world's — and it is
// sim-enforced rather than a UI pause so that a replay, a headless run and
// the live game all wait at the same weeks.

// The beat the clock has just landed on, if any. Content guarantees at most
// one beat per week.
export function beatDue(clock: Clock): CalendarBeat | null {
  return beatsAt(clock.term, clock.week)[0] ?? null;
}

export function pendingBeat(state: GameState): CalendarBeat | null {
  return state.pendingBeat === null ? null : beatById(state.pendingBeat);
}

// A beat, or a letter from the board, is waiting on the player: the clock
// does not move.
export function clockHeld(state: GameState): boolean {
  return state.pendingBeat !== null || state.distress.pendingLetter !== null;
}

// The clock is running AND nothing holds it — the driver's one question.
export function clockAdvances(state: GameState): boolean {
  return clockRuns(state) && !clockHeld(state);
}

// The action that resolves the pending beat by its stated default (DD
// §10.1's "unresolved … time out to a stated default", applied to beats):
// what a headless run, a test, or a future auto-delegated beat dispatches
// when nobody is deciding. In Phase 4 every beat's default is to be
// acknowledged; later phases give each beat real defaults (last year's
// tuition, the proposed budget) and this is where they resolve to.
export function defaultResolution(state: GameState): Action | null {
  if (state.distress.pendingLetter !== null) return { type: 'readLetter' };
  if (state.pendingBeat === null) return null;
  return { type: 'resolveBeat', beatId: state.pendingBeat };
}
