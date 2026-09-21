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

// Advance up to `weeks` weeks. When a beat holds the clock, `onHold` is
// asked for the action that releases it (beats.ts's defaultResolution is
// the usual answer); with no answer, or one that does not release the
// clock, the run stops there — held, exactly as the live game would be.
export function tickRunWeeks(
  run: Run,
  weeks: number,
  onHold: ((state: GameState) => Action | null) | null = null,
): Run {
  let r = run;
  for (let i = 0; i < weeks; i++) {
    let next = tickRun(r);
    // A week can be held by more than one thing at once (a letter from
    // the board and a beat, at a term turn): release them in turn.
    for (let guard = 0; next.state === r.state && guard < 4; guard++) {
      const release = onHold?.(r.state) ?? null;
      if (!release) return r;
      const released = dispatch(r, release);
      if (released === r) return r;
      r = released;
      next = tickRun(r);
    }
    if (next.state === r.state) return r;
    r = next;
  }
  return r;
}

// Rebuild the state at `toWeek` from a seed and a log. Actions logged in
// week w are applied before the tick that ends week w, in log order — the
// same order dispatch() and tickRun() interleave them live. A log that
// leaves a beat unresolved and then carries on is not a run that happened,
// and is refused rather than replayed at the wrong weeks.
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
    if (week < toWeek) {
      const next = tick(state);
      if (next === state) {
        throw new Error(`replay stalled at week ${week}: beat ${state.pendingBeat} never resolved`);
      }
      state = next;
    }
  }
  return state;
}
