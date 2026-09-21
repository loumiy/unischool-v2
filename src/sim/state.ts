import { FOUNDING_CLOCK, type Clock } from './calendar.ts';
import { Rng, type RngState } from './rng.ts';

// The one serialisable state tree (DD §15). Everything the sim knows lives
// here; nothing here is a class, a function, or a reference into the UI.
//
// Bump SCHEMA_VERSION whenever the shape changes, and add a migration in
// save.ts (CLAUDE.md, definition of done).
export const SCHEMA_VERSION = 1;

export interface Mark {
  week: number;
  label: string;
}

export interface GameState {
  schemaVersion: typeof SCHEMA_VERSION;
  // Captured at new-game (DD §15). Varies per run for event and market
  // variety; the map and the starting conditions do not.
  seed: number;
  rng: RngState;
  clock: Clock;
  // Debug markers written by the `debug/mark` action. Phase 1's only
  // state-changing action, kept so that replay determinism (run.ts) is
  // exercised by something real. Phase 4's event bus is the proper journal.
  marks: Mark[];
}

export function createNewGame(seed: number): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`seed must be a 32-bit unsigned integer, got ${seed}`);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    rng: Rng.fromSeed(seed).snapshot(),
    clock: { ...FOUNDING_CLOCK },
    marks: [],
  };
}
