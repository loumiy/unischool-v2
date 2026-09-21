import { FOUNDING_CLOCK, type Clock } from './calendar.ts';
import type { Campus } from './campus.ts';
import type { Identity } from './identity.ts';
import { Rng, type RngState } from './rng.ts';
import { foundingWoodland } from './terrain.ts';

// The one serialisable state tree (DD §15). Everything the sim knows lives
// here; nothing here is a class, a function, or a reference into the UI.
//
// Bump SCHEMA_VERSION whenever the shape changes, and add a migration in
// save.ts (CLAUDE.md, definition of done).
export const SCHEMA_VERSION = 3;

export interface Mark {
  week: number;
  label: string;
}

// Where the run is in its opening (DD §2.4). The clock runs only in
// 'running': founding is the startup screen, siting is the player's first
// act — placing Founders Hall — and nothing ticks until it stands.
export type RunPhase = 'founding' | 'siting' | 'running';

export interface GameState {
  schemaVersion: typeof SCHEMA_VERSION;
  phase: RunPhase;
  identity: Identity | null; // null until the `found` action
  campus: Campus;
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
    phase: 'founding',
    identity: null,
    campus: { placements: [], paths: [], trees: foundingWoodland(), nextPlacementId: 1 },
    seed,
    rng: Rng.fromSeed(seed).snapshot(),
    clock: { ...FOUNDING_CLOCK },
    marks: [],
  };
}

export function clockRuns(state: GameState): boolean {
  return state.phase === 'running';
}
