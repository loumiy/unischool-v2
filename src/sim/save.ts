import { beatDue } from './beats.ts';
import { BUS_KINDS } from './bus.ts';
import { clockFromAbsoluteWeek, TERMS, WEEKS_IN_TERM } from './calendar.ts';
import { FOUNDERS_HALL_ID } from './campus.ts';
import { MOTIFS } from './identity.ts';
import { replay, type LoggedAction, type Run } from './run.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';
import { foundingWoodland, tileKey } from './terrain.ts';

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
  // v2 → v3 (Phase 3): paths and trees on the campus, placement ids, and the
  // generic placeBuilding action in place of placeFoundersHall — in the log
  // too, so a v2 run still replays. The founding woodland is seeded under
  // whatever already stands, minus the tiles it stands on.
  2: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const campus = (state.campus ?? {}) as Record<string, unknown>;
    const oldPlacements = Array.isArray(campus.placements)
      ? (campus.placements as Record<string, unknown>[])
      : [];
    const placements: Record<string, unknown>[] = oldPlacements.map((p, i) => ({
      ...p,
      id: `p${i + 1}`,
    }));
    const trees = foundingWoodland();
    for (const p of placements) {
      const col = Number(p.col);
      const row = Number(p.row);
      const w = Number(p.w);
      const h = Number(p.h);
      for (let r = row; r < row + h; r++)
        for (let c = col; c < col + w; c++) delete trees[tileKey(c, r)];
    }
    const log = Array.isArray(raw.log) ? (raw.log as Record<string, unknown>[]) : [];
    return {
      ...raw,
      version: 3,
      state: {
        ...state,
        schemaVersion: 3,
        campus: { placements, paths: [], trees, nextPlacementId: placements.length + 1 },
      },
      log: log.map((entry) => {
        const action = entry.action as Record<string, unknown> | undefined;
        if (action?.type !== 'placeFoundersHall') return entry;
        return {
          ...entry,
          action: {
            type: 'placeBuilding',
            buildingId: 'founders-hall',
            col: action.col,
            row: action.row,
            rotated: false,
          },
        };
      }),
    };
  },
  // v3 → v4 (Phase 4): the journal and the calendar beats. A v3 run never
  // sat a board meeting, so its log gets a default resolution inserted at
  // every beat week the doors were open for, and the whole state is then
  // REBUILT BY REPLAY — which is the only way the journal can hold the
  // run's real history rather than start blank at the migration. If the
  // replay does not land on the saved state (it should; this is belt and
  // braces), the state is migrated in place and the journal starts here.
  3: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const oldLog = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    const opened = oldLog.find(
      (e) => e.action.type === 'placeBuilding' && e.action.buildingId === FOUNDERS_HALL_ID,
    );
    const resolutions: LoggedAction[] = [];
    let pendingBeat: string | null = null;
    if (opened) {
      for (let week = opened.week + 1; week <= savedWeek; week++) {
        const beat = beatDue(clockFromAbsoluteWeek(week));
        if (!beat) continue;
        if (week === savedWeek) pendingBeat = beat.id;
        else resolutions.push({ week, action: { type: 'resolveBeat', beatId: beat.id } });
      }
    }
    // Stable by week, a week's resolution ahead of its other actions: the
    // beat fired on the tick that landed there, before anything the player
    // did that week.
    const log = [...resolutions, ...oldLog].sort((a, b) => a.week - b.week);
    const marks = Array.isArray(state.marks) ? (state.marks as Record<string, unknown>[]) : [];
    const rest = { ...state };
    delete rest.marks;
    let migrated: Record<string, unknown> = {
      ...rest,
      schemaVersion: 4,
      bus: marks.map((m, i) => ({ seq: i + 1, week: m.week, kind: 'mark', label: m.label })),
      pendingBeat,
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === pendingBeat &&
        JSON.stringify(rebuilt.campus) === JSON.stringify(state.campus) &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 4, state: migrated, log };
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
  if (!Array.isArray(s.bus)) return 'state.bus is not an array';
  for (const e of s.bus as Record<string, unknown>[]) {
    if (typeof e !== 'object' || e === null) return 'a journal entry is malformed';
    if (typeof e.seq !== 'number' || typeof e.week !== 'number')
      return 'a journal entry is malformed';
    if (!BUS_KINDS.includes(e.kind as never)) return `unknown journal entry kind ${String(e.kind)}`;
  }
  if (s.pendingBeat !== null && typeof s.pendingBeat !== 'string') {
    return 'state.pendingBeat is invalid';
  }
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
  if (!Array.isArray(campus.paths) || !campus.paths.every((k) => typeof k === 'string')) {
    return 'state.campus.paths is invalid';
  }
  if (typeof campus.trees !== 'object' || campus.trees === null)
    return 'state.campus.trees is invalid';
  if (typeof campus.nextPlacementId !== 'number') return 'state.campus.nextPlacementId is invalid';
  for (const p of campus.placements as Record<string, unknown>[]) {
    if (typeof p.id !== 'string' || typeof p.buildingId !== 'string')
      return 'a placement is malformed';
    for (const k of ['col', 'row', 'w', 'h'])
      if (typeof p[k] !== 'number') return 'a placement is malformed';
  }
  return null;
}
