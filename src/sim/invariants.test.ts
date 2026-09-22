import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { defaultResolution } from './beats.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, MIGRATIONS, serializeRun } from './save.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';

// PHASE 21 CHECKPOINT AUDIT. Two invariants the project has always claimed
// and never asserted end to end: that a save from ANY shipped schema
// version still opens, and that a seed plus a log is the whole run.
//
// These are audit tests: they assert existing behaviour, and change none.

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

function opened(seed = 4): Run {
  return dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
}

// A stable fingerprint of everything the sim keeps, with the journal's
// wording left out (it is derived) and key order normalised so the hash is
// about the state, not about how an object literal was spelled.
export function stateHash(state: GameState): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
      );
    }
    return value;
  };
  const json = JSON.stringify(stable(state));
  // FNV-1a, 32-bit: enough to catch a divergence, cheap enough to run often.
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, '0')}:${json.length}`;
}

describe('every schema version since v1 still opens (DD §15)', () => {
  it('has a migration for every version below the current one', () => {
    const steps = Object.keys(MIGRATIONS)
      .map(Number)
      .sort((a, b) => a - b);
    expect(steps[0]).toBe(1);
    expect(steps.at(-1)).toBe(SCHEMA_VERSION - 1);
    // No gaps: a ladder with a rung missing strands every save below it.
    for (let v = 1; v < SCHEMA_VERSION; v++) {
      expect(MIGRATIONS[v], `no migration from v${v}`).toBeTypeOf('function');
    }
  });

  it('migrates a save from each version up to current and loads it', () => {
    // A real run, written back down to each older version by stripping the
    // schemaVersion and letting the ladder rebuild what it needs. This is
    // the claim the project has made since Phase 2 and never tested whole.
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 6, defaultResolution);
    const current = JSON.parse(JSON.stringify(serializeRun(run))) as Record<string, unknown>;

    const failures: string[] = [];
    for (let version = 1; version < SCHEMA_VERSION; version++) {
      const file = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
      file.version = version;
      (file.state as Record<string, unknown>).schemaVersion = version;
      const loaded = loadSaveFile(file);
      if (!loaded.ok) {
        failures.push(`v${version}: ${loaded.reason}`);
        continue;
      }
      if (loaded.save.state.schemaVersion !== SCHEMA_VERSION) {
        failures.push(`v${version}: arrived at ${loaded.save.state.schemaVersion}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('opens the oldest save the game ever wrote', () => {
    // A v1 file exactly as Phase 1 wrote one (commit 51aca06): a seed, the
    // run's dice, a clock, and the debug marks that were its only action.
    const v1 = {
      version: 1,
      savedAt: new Date(0).toISOString(),
      seed: 7,
      state: {
        schemaVersion: 1,
        seed: 7,
        rng: [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x0f1bbcdc],
        clock: { absoluteWeek: 3, year: 1, term: 'fall', week: 4 },
        marks: [],
      },
      log: [],
    };
    const loaded = loadSaveFile(v1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.state.schemaVersion).toBe(SCHEMA_VERSION);
    // It resumes at the founding screen, which is what a nameless save is.
    expect(loaded.save.state.phase).toBe('founding');
  });

  it('refuses a save from the future rather than guessing', () => {
    const run = opened();
    const file = JSON.parse(JSON.stringify(serializeRun(run))) as Record<string, unknown>;
    file.version = SCHEMA_VERSION + 1;
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(false);
  });
});

describe('a seed and a log are the whole run (DD §15)', () => {
  it('replays to an identical state hash after ten years', () => {
    const run = tickRunWeeks(opened(9), WEEKS_PER_YEAR * 10, defaultResolution);
    expect(run.state.clock.year).toBeGreaterThanOrEqual(10);
    const again = replay(run.state.seed, run.log, run.state.clock.absoluteWeek);
    expect(stateHash(again)).toBe(stateHash(run.state));
  });

  it('replays identically on three seeds, and the seeds differ from each other', () => {
    const hashes = new Set<string>();
    for (const seed of [1, 4, 21]) {
      const run = tickRunWeeks(opened(seed), WEEKS_PER_YEAR * 10, defaultResolution);
      const again = replay(run.state.seed, run.log, run.state.clock.absoluteWeek);
      expect(stateHash(again), `seed ${seed} diverged on replay`).toBe(stateHash(run.state));
      hashes.add(stateHash(run.state));
    }
    // If every seed produced the same run, the seed would not be doing
    // anything, and the replay check above would be vacuous.
    expect(hashes.size).toBe(3);
  });

  it('a save round-trip is the same run', () => {
    const run = tickRunWeeks(opened(4), WEEKS_PER_YEAR * 10, defaultResolution);
    const file = JSON.parse(JSON.stringify(serializeRun(run))) as unknown;
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(stateHash(loaded.save.state)).toBe(stateHash(run.state));
  });
});
