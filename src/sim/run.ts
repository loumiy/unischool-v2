import { applyAction, canApply, type Action } from './actions.ts';
import { createNewGame, type GameState } from './state.ts';
import { tick } from './tick.ts';

// A run is the state plus the action log that produced it. The log is the
// half of the save that makes a run reproducible: identical seed + identical
// log replays identically (DD §15), which is what lets a bug report be a
// save file and the Phase 31 harness be a script.

export interface LoggedAction {
  // The absolute week the action was applied in — i.e. the value of
  // state.clock.absoluteWeek at the time, before that week's tick.
  week: number;
  action: Action;
}

export interface Run {
  state: GameState;
  log: LoggedAction[];
}

export function newRun(seed: number): Run {
  return { state: createNewGame(seed), log: [] };
}

// Applies and logs an action. An action the reducer would refuse is not
// logged either — the log holds what happened, never what was attempted —
// and the run comes back unchanged so callers can check by identity.
export function dispatch(run: Run, action: Action): Run {
  if (!canApply(run.state, action).ok) return run;
  return {
    state: applyAction(run.state, action),
    log: [...run.log, { week: run.state.clock.absoluteWeek, action }],
  };
}

export function tickRun(run: Run): Run {
  return { state: tick(run.state), log: run.log };
}

export function tickRunWeeks(run: Run, weeks: number): Run {
  let r = run;
  for (let i = 0; i < weeks; i++) r = tickRun(r);
  return r;
}

// Rebuild the state at `toWeek` from a seed and a log. Actions logged in
// week w are applied before the tick that ends week w, in log order — the
// same order dispatch() and tickRun() interleave them live.
export function replay(seed: number, log: readonly LoggedAction[], toWeek: number): GameState {
  let state = createNewGame(seed);
  let i = 0;
  for (let week = 0; week <= toWeek; week++) {
    while (i < log.length && log[i]!.week === week) {
      state = applyAction(state, log[i]!.action);
      i++;
    }
    if (i < log.length && log[i]!.week < week) {
      throw new Error(`action log is not in week order at index ${i}`);
    }
    if (week < toWeek) state = tick(state);
  }
  return state;
}
