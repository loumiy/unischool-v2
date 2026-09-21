import { TERMS, WEEKS_IN_TERM } from './calendar.ts';
import { MOTIFS } from './identity.ts';
import type { LoggedAction, Run } from './run.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';

// The save file: state + version + action log (DD §15). Storage (IndexedDB,
// file export) is the UI's business; the FORMAT is the sim's, because the
// sim owns the state shape and therefore owns migrating old shapes forward.

export interface SaveFile {
  version: number;
  savedAt: string; // ISO-8601, informational only
  seed: number;
  state: GameState;
  // The whole log for now. "Tail" (DD §15) becomes a size concern once runs
  // carry thousands of actions; capping it is a later phase's call.
  log: LoggedAction[];
}

export function serializeRun(run: Run, savedAt: Date = new Date()): SaveFile {
  return {
    version: SCHEMA_VERSION,
    savedAt: savedAt.toISOString(),
    seed: run.state.seed,
    state: run.state,
    log: run.log,
  };
}

// Migrations from each older version to the next. Empty at version 1; the
// framework exists from day one so the first shape change has somewhere to
// go. Each step receives the raw (already-parsed) file at version N and
// returns it at version N + 1, bumping `version` itself.
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 → v2 (Phase 2): the run phase, the identity, and the campus. A v1
  // save was a blank, nameless campus, so it resumes at the founding screen
  // with its clock wherever it was.
  1: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    return {
      ...raw,
      version: 2,
      state: {
        ...state,
        schemaVersion: 2,
        phase: 'founding',
        identity: null,
        campus: { placements: [] },
      },
    };
  },
};

export type LoadResult = { ok: true; save: SaveFile } | { ok: false; reason: string };

// Parse-and-migrate. Everything that can be wrong with a save — not an
// object, unknown version, missing or malformed fields — collapses into a
// reason string, so a bad save can never stop the game booting.
export function loadSaveFile(raw: unknown): LoadResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'save is not an object' };
  }
  let file = raw as Record<string, unknown>;
  if (typeof file.version !== 'number' || !Number.isInteger(file.version)) {
    return { ok: false, reason: 'save has no integer version' };
  }
  if (file.version > SCHEMA_VERSION) {
    return { ok: false, reason: `save is from a newer version (${file.version})` };
  }
  while ((file.version as number) < SCHEMA_VERSION) {
    const step = MIGRATIONS[file.version as number];
    if (!step) return { ok: false, reason: `no migration from version ${file.version}` };
    file = step(file);
  }
  const problem = validateCurrent(file);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, save: file as unknown as SaveFile };
}

// Structural check of a file at the current version. Deliberately plain
// (no schema library: the sim core is dependency-free) and deliberately
// shallow where the shape is still moving; it exists to reject garbage, not
// to prove correctness.
function validateCurrent(file: Record<string, unknown>): string | null {
  if (typeof file.seed !== 'number') return 'seed is not a number';
  if (typeof file.savedAt !== 'string') return 'savedAt is not a string';
  if (!Array.isArray(file.log)) return 'log is not an array';
  const state = file.state;
  if (typeof state !== 'object' || state === null) return 'state is not an object';
  const s = state as Record<string, unknown>;
  if (s.schemaVersion !== SCHEMA_VERSION) return 'state.schemaVersion mismatch';
  if (s.seed !== file.seed) return 'state.seed disagrees with file seed';
  if (!Array.isArray(s.rng) || s.rng.length !== 4 || !s.rng.every((n) => typeof n === 'number')) {
    return 'state.rng is not four numbers';
  }
  const clock = s.clock as Record<string, unknown> | undefined;
  if (typeof clock !== 'object' || clock === null) return 'state.clock is not an object';
  if (typeof clock.year !== 'number' || clock.year < 1) return 'state.clock.year is invalid';
  if (typeof clock.term !== 'string' || !TERMS.includes(clock.term as never)) {
    return 'state.clock.term is invalid';
  }
  const weeksInTerm = WEEKS_IN_TERM[clock.term as keyof typeof WEEKS_IN_TERM];
  if (typeof clock.week !== 'number' || clock.week < 1 || clock.week > weeksInTerm) {
    return 'state.clock.week is invalid';
  }
  if (typeof clock.absoluteWeek !== 'number' || clock.absoluteWeek < 0) {
    return 'state.clock.absoluteWeek is invalid';
  }
  if (!Array.isArray(s.marks)) return 'state.marks is not an array';
  if (s.phase !== 'founding' && s.phase !== 'siting' && s.phase !== 'running') {
    return 'state.phase is invalid';
  }
  if (s.identity !== null) {
    const id = s.identity as Record<string, unknown> | undefined;
    if (typeof id !== 'object' || id === null) return 'state.identity is invalid';
    if (typeof id.name !== 'string') return 'state.identity.name is invalid';
    if (!MOTIFS.includes(id.motif as never)) return 'state.identity.motif is invalid';
    const colors = id.colors as Record<string, unknown> | undefined;
    if (typeof colors?.primary !== 'string' || typeof colors?.secondary !== 'string') {
      return 'state.identity.colors is invalid';
    }
  }
  if (s.phase !== 'founding' && s.identity === null) return 'state has a phase but no identity';
  const campus = s.campus as Record<string, unknown> | undefined;
  if (typeof campus !== 'object' || campus === null || !Array.isArray(campus.placements)) {
    return 'state.campus is invalid';
  }
  return null;
}
