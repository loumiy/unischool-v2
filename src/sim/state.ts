import type { BusEntry } from './bus.ts';
import { FOUNDING_CLOCK, type Clock } from './calendar.ts';
import type { Campus } from './campus.ts';
import type { Identity } from './identity.ts';
import { Rng, type RngState } from './rng.ts';
import { foundingWoodland } from './terrain.ts';
import { foundingAcademics, type Academics } from './academics.ts';
import { foundingDistress, type Distress } from './distress.ts';
import { foundingFaculty, type FacultyState } from './faculty.ts';
import { foundingPeople, type People } from './people.ts';
import { foundingTreasury, type Treasury } from './treasury.ts';

// The one serialisable state tree (DD §15). Everything the sim knows lives
// here; nothing here is a class, a function, or a reference into the UI.
//
// Bump SCHEMA_VERSION whenever the shape changes, and add a migration in
// save.ts (CLAUDE.md, definition of done).
export const SCHEMA_VERSION = 14;

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
  // The journal (bus.ts): everything notable, in the order it happened.
  bus: BusEntry[];
  // The calendar beat awaiting the player (beats.ts), by id. While one is
  // pending the clock holds.
  pendingBeat: string | null;
  // Money (treasury.ts). The founding gift is in hand from the start; it
  // moves only once the doors are open.
  treasury: Treasury;
  // Students, the admissions terms and the alumni ledger (people.ts).
  people: People;
  // The distress ladder and the board (distress.ts).
  distress: Distress;
  // Schools founded and programs open (academics.ts).
  academics: Academics;
  // The roster and the summer market (faculty.ts).
  faculty: FacultyState;
}

export function createNewGame(seed: number): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`seed must be a 32-bit unsigned integer, got ${seed}`);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    phase: 'founding',
    identity: null,
    campus: {
      placements: [],
      paths: [],
      trees: foundingWoodland(),
      quadNames: {},
      nextPlacementId: 1,
    },
    seed,
    rng: Rng.fromSeed(seed).snapshot(),
    clock: { ...FOUNDING_CLOCK },
    bus: [],
    pendingBeat: null,
    treasury: foundingTreasury(seed),
    people: foundingPeople(),
    distress: foundingDistress(),
    academics: foundingAcademics(),
    faculty: foundingFaculty(),
  };
}

// The run is under way: the doors are open and weeks pass (unless a beat
// holds them — beats.ts's clockAdvances is the driver's whole question).
export function clockRuns(state: GameState): boolean {
  return state.phase === 'running';
}
