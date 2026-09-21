import { advanceClock } from './calendar.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';

// One week of the world (DD §15): `tick(state) → state`, pure, no I/O, no
// timers. The driver decides WHEN a tick happens; nothing in here knows about
// real time or about speed — every speed runs the identical sim, just sooner.
//
// Systems land here phase by phase in a fixed order (treasury, campus,
// academics, people, events, reputation). Each takes the state and the RNG
// and returns the state; the RNG's state is written back at the end so a
// tick is a pure function of (state) including its own randomness.
export function tick(state: GameState): GameState {
  const rng = Rng.fromState(state.rng);
  const next: GameState = { ...state, clock: advanceClock(state.clock) };
  return { ...next, rng: rng.snapshot() };
}

export function tickWeeks(state: GameState, weeks: number): GameState {
  let s = state;
  for (let i = 0; i < weeks; i++) s = tick(s);
  return s;
}
