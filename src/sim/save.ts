import { beatDue } from './beats.ts';
import { BUS_KINDS } from './bus.ts';
import { clockFromAbsoluteWeek, TERMS, WEEKS_IN_TERM } from './calendar.ts';
import { FOUNDERS_HALL_ID } from './campus.ts';
import { MOTIFS } from './identity.ts';
import { replay, type LoggedAction, type Run } from './run.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';
import { foundingWoodland, tileKey } from './terrain.ts';
import { foundingAcademics } from './academics.ts';
import { foundingDistress } from './distress.ts';
import { foundingFaculty } from './faculty.ts';
import { foundingPeople, outcomesFor } from './people.ts';
import { foundingTreasury } from './treasury.ts';

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
// A migration's replay check compares the campus as the version being
// migrated FROM knew it — the placements, the paving and the trees — so a
// field added to Campus later never changes which branch an old save takes.
function sameCampus(rebuilt: unknown, saved: unknown): boolean {
  const strip = (c: unknown) => {
    const campus = (c ?? {}) as Record<string, unknown>;
    return JSON.stringify([campus.placements, campus.paths, campus.trees]);
  };
  return strip(rebuilt) === strip(saved);
}

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
        sameCampus(rebuilt.campus, state.campus) &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 4, state: migrated, log };
  },
  // v4 → v5 (Phase 5): the treasury. A v4 log is complete (every beat
  // resolved), so the run is rebuilt by replay and its money history is
  // real; the fallback is the founding treasury as it stands, with the
  // clock wherever it was. The saved campus is kept either way: the trees
  // planted in the old run keep the seeds the player saw.
  4: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const log = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    let migrated: Record<string, unknown> = {
      ...state,
      schemaVersion: 5,
      treasury: foundingTreasury(Number(raw.seed)),
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === state.pendingBeat &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock) &&
        sameCampus(rebuilt.campus, state.campus);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 5, state: migrated };
  },
  // v5 → v6 (Phase 6): buildings as economic objects. Replay is tried
  // first, but a v5 run placed its buildings for free, so the reducer will
  // usually refuse the same placements now and the fallback is the common
  // case: every standing building is open, paid for, in good repair, its
  // age counted from the founding; the treasury funds maintenance in full.
  5: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const log = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    const campus = (state.campus ?? {}) as Record<string, unknown>;
    const placements = (Array.isArray(campus.placements) ? campus.placements : []) as Record<
      string,
      unknown
    >[];
    const treasury = (state.treasury ?? {}) as Record<string, unknown>;
    const withFunding = (b: unknown) =>
      typeof b === 'object' && b !== null ? { ...b, maintenanceFunding: 1 } : b;
    const history = Array.isArray(treasury.history) ? treasury.history : [];
    let migrated: Record<string, unknown> = {
      ...state,
      schemaVersion: 6,
      campus: {
        ...campus,
        placements: placements.map((p) => ({
          ...p,
          status: 'open',
          completesWeek: null,
          openedWeek: 0,
          backlog: 0,
          condition: 1,
        })),
      },
      treasury: {
        ...treasury,
        maintenanceFunding: 1,
        debtRepayment: 0,
        budget: withFunding(treasury.budget),
        pendingBudget: treasury.pendingBudget ? withFunding(treasury.pendingBudget) : null,
        capitalThisYear: { spent: 0, borrowed: 0 },
        history: history.map((y: unknown) =>
          typeof y === 'object' && y !== null ? { capital: { spent: 0, borrowed: 0 }, ...y } : y,
        ),
      },
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const strip = (ps: Record<string, unknown>[]) =>
        JSON.stringify(
          ps.map(({ id, buildingId, col, row, w, h }) => [id, buildingId, col, row, w, h]),
        );
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === state.pendingBeat &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock) &&
        strip(rebuilt.campus.placements as unknown as Record<string, unknown>[]) ===
          strip(placements) &&
        JSON.stringify(rebuilt.campus.paths) === JSON.stringify(campus.paths) &&
        JSON.stringify(rebuilt.campus.trees) === JSON.stringify(campus.trees);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 6, state: migrated };
  },
  // v6 → v7 (Phase 7): students. Replay first; else the school has taken
  // no class yet and the standing terms are the defaults.
  6: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const log = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    let migrated: Record<string, unknown> = {
      ...state,
      schemaVersion: 7,
      people: foundingPeople(),
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === state.pendingBeat &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock) &&
        sameCampus(rebuilt.campus, state.campus);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 7, state: migrated };
  },
  // v7 → v8 (Phase 8): the distress ladder, and aid as state. Replay first;
  // else the ladder starts sound and the aid discount at its default.
  7: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const log = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    const people = (state.people ?? {}) as Record<string, unknown>;
    let migrated: Record<string, unknown> = {
      ...state,
      schemaVersion: 8,
      people: { ...people, aidRate: foundingPeople().aidRate },
      distress: foundingDistress(),
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === state.pendingBeat &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock) &&
        sameCampus(rebuilt.campus, state.campus);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 8, state: migrated };
  },
  // v8 → v9 (Phase 9): schools and programs. Replay first; else none founded.
  8: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const log = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    let migrated: Record<string, unknown> = {
      ...state,
      schemaVersion: 9,
      academics: foundingAcademics(),
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === state.pendingBeat &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock) &&
        sameCampus(rebuilt.campus, state.campus);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 9, state: migrated };
  },
  // v9 → v10 (Phase 10): the faculty roster and the summer market. Replay
  // first; else nobody is hired and the market is closed.
  9: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const log = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    let migrated: Record<string, unknown> = {
      ...state,
      schemaVersion: 10,
      faculty: foundingFaculty(),
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === state.pendingBeat &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock) &&
        sameCampus(rebuilt.campus, state.campus);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 10, state: migrated };
  },
  // v10 → v11 (Phase 11): advancement, signatures and neglect on each open
  // program. Replay first; else every program stands still, unsigned.
  10: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const log = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    const academics = (state.academics ?? {}) as Record<string, unknown>;
    const programs = (Array.isArray(academics.programs) ? academics.programs : []) as Record<
      string,
      unknown
    >[];
    let migrated: Record<string, unknown> = {
      ...state,
      schemaVersion: 11,
      academics: {
        ...academics,
        programs: programs.map((p) => ({
          ...p,
          advancing: null,
          signature: false,
          neglectYears: 0,
        })),
      },
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === state.pendingBeat &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock) &&
        sameCampus(rebuilt.campus, state.campus);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 11, state: migrated };
  },
  // v11 → v12 (Phase 12): outcomes on every alumni class. Replay first;
  // else each class is scored from the quality and satisfaction it left with.
  11: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const clock = (state.clock ?? {}) as Record<string, unknown>;
    const savedWeek = Number(clock.absoluteWeek ?? 0);
    const log = Array.isArray(raw.log) ? (raw.log as LoggedAction[]) : [];
    const people = (state.people ?? {}) as Record<string, unknown>;
    const alumni = (Array.isArray(people.alumni) ? people.alumni : []) as Record<string, unknown>[];
    let migrated: Record<string, unknown> = {
      ...state,
      schemaVersion: 12,
      people: {
        ...people,
        alumni: alumni.map((a) => ({
          ...a,
          outcomes: outcomesFor(Number(a.quality), Number(a.satisfaction), Number(a.size)),
        })),
      },
    };
    try {
      const rebuilt = replay(Number(raw.seed), log, savedWeek);
      const same =
        rebuilt.phase === state.phase &&
        rebuilt.pendingBeat === state.pendingBeat &&
        JSON.stringify(rebuilt.clock) === JSON.stringify(state.clock) &&
        sameCampus(rebuilt.campus, state.campus);
      if (same) migrated = rebuilt as unknown as Record<string, unknown>;
    } catch {
      // Fall through with the in-place migration.
    }
    return { ...raw, version: 12, state: migrated };
  },
  // v12 → v13 (Phase 14): the names the player has given the quads their
  // buildings enclose. An old run has named none, and the game names every
  // quad it detects, so nothing else changes. Like every step that only
  // ADDS a field, it fills the gap and leaves anything already there —
  // an earlier step's replay rebuilds the state at the current shape, and
  // clobbering it here would undo what that replay got right.
  12: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const campus = (state.campus ?? {}) as Record<string, unknown>;
    return {
      ...raw,
      version: 13,
      state: {
        ...state,
        schemaVersion: 13,
        campus: { quadNames: {}, ...campus },
      },
    };
  },
  // v13 → v14 (Phase 15): the named students. An old run followed nobody;
  // the classes already on the books stay anonymous, and the next class to
  // arrive is the first the game names.
  13: (raw) => {
    const state = (raw.state ?? {}) as Record<string, unknown>;
    const people = (state.people ?? {}) as Record<string, unknown>;
    return {
      ...raw,
      version: 14,
      state: {
        ...state,
        schemaVersion: 14,
        people: { named: [], nextStudentId: 1, ...people },
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
  const treasury = s.treasury as Record<string, unknown> | undefined;
  if (typeof treasury !== 'object' || treasury === null) return 'state.treasury is invalid';
  for (const k of [
    'cash',
    'endowment',
    'drawRate',
    'maintenanceFunding',
    'marketReturn',
    'endowmentBasis',
    'debt',
    'debtRepayment',
  ]) {
    if (typeof treasury[k] !== 'number' || !Number.isFinite(treasury[k]))
      return `state.treasury.${k} is invalid`;
  }
  for (const k of ['budget', 'actual', 'lastWeek']) {
    const f = treasury[k] as Record<string, unknown> | undefined;
    if (typeof f !== 'object' || f === null || !f.revenue || !f.expenses)
      return `state.treasury.${k} is invalid`;
  }
  if (!Array.isArray(treasury.history)) return 'state.treasury.history is invalid';
  const capital = treasury.capitalThisYear as Record<string, unknown> | undefined;
  if (typeof capital?.spent !== 'number' || typeof capital?.borrowed !== 'number')
    return 'state.treasury.capitalThisYear is invalid';
  const people = s.people as Record<string, unknown> | undefined;
  if (typeof people !== 'object' || people === null) return 'state.people is invalid';
  const terms = people.terms as Record<string, unknown> | undefined;
  if (typeof terms?.tuition !== 'number' || typeof terms?.selectivity !== 'number')
    return 'state.people.terms is invalid';
  for (const k of ['cohorts', 'alumni']) {
    if (!Array.isArray(people[k])) return `state.people.${k} is invalid`;
  }
  for (const c of people.cohorts as Record<string, unknown>[]) {
    for (const k of ['classYear', 'size', 'quality', 'satisfaction'])
      if (typeof c[k] !== 'number') return 'a cohort is malformed';
  }
  for (const a of people.alumni as Record<string, unknown>[]) {
    const o = a.outcomes as Record<string, unknown> | undefined;
    if (
      typeof o?.distinguished !== 'number' ||
      typeof o?.placed !== 'number' ||
      typeof o?.adrift !== 'number'
    )
      return 'an alumni class is malformed';
  }
  if (typeof people.aidRate !== 'number') return 'state.people.aidRate is invalid';
  if (!Array.isArray(people.named)) return 'state.people.named is invalid';
  if (typeof people.nextStudentId !== 'number') return 'state.people.nextStudentId is invalid';
  for (const n of people.named as Record<string, unknown>[]) {
    if (typeof n !== 'object' || n === null) return 'a named student is malformed';
    for (const k of ['id', 'name', 'gender', 'heritage', 'status'])
      if (typeof n[k] !== 'string') return 'a named student is malformed';
    if (typeof n.classYear !== 'number') return 'a named student is malformed';
    if (n.programId !== null && typeof n.programId !== 'string')
      return 'a named student is malformed';
    if (!Array.isArray(n.beats)) return 'a named student is malformed';
  }
  const distress = s.distress as Record<string, unknown> | undefined;
  if (typeof distress !== 'object' || distress === null) return 'state.distress is invalid';
  for (const k of [
    'rung',
    'termsAtRung',
    'confidence',
    'surplusRun',
    'deficitRun',
    'receivershipTermsLeft',
  ]) {
    if (typeof distress[k] !== 'number') return `state.distress.${k} is invalid`;
  }
  if (
    !Array.isArray(distress.terms) ||
    !Array.isArray(distress.scars) ||
    !Array.isArray(distress.cutsTaken)
  )
    return 'state.distress lists are invalid';
  if (distress.pendingLetter !== null && typeof distress.pendingLetter !== 'string')
    return 'state.distress.pendingLetter is invalid';
  const academics = s.academics as Record<string, unknown> | undefined;
  if (typeof academics !== 'object' || academics === null) return 'state.academics is invalid';
  if (!Array.isArray(academics.schools) || !Array.isArray(academics.programs))
    return 'state.academics lists are invalid';
  for (const sc of academics.schools as Record<string, unknown>[]) {
    if (typeof sc.schoolId !== 'string' || typeof sc.placementId !== 'string')
      return 'a founded school is malformed';
  }
  for (const pr of academics.programs as Record<string, unknown>[]) {
    if (typeof pr.programId !== 'string' || typeof pr.tier !== 'string')
      return 'an open program is malformed';
    if (typeof pr.signature !== 'boolean' || typeof pr.neglectYears !== 'number')
      return 'an open program is malformed';
    if (pr.advancing !== null) {
      const a = pr.advancing as Record<string, unknown> | undefined;
      if (typeof a?.to !== 'string' || typeof a?.completesWeek !== 'number')
        return 'an advancement is malformed';
    }
  }
  const faculty = s.faculty as Record<string, unknown> | undefined;
  if (typeof faculty !== 'object' || faculty === null) return 'state.faculty is invalid';
  if (!Array.isArray(faculty.roster) || !Array.isArray(faculty.market))
    return 'state.faculty lists are invalid';
  if (typeof faculty.marketOpen !== 'boolean') return 'state.faculty.marketOpen is invalid';
  if (typeof faculty.marketYear !== 'number' || typeof faculty.nextId !== 'number')
    return 'state.faculty counters are invalid';
  for (const f of [...faculty.roster, ...faculty.market] as Record<string, unknown>[]) {
    if (typeof f !== 'object' || f === null) return 'a hire is malformed';
    for (const k of ['id', 'name', 'rank', 'quirkId', 'schoolId'])
      if (typeof f[k] !== 'string') return 'a hire is malformed';
    for (const k of ['teaching', 'research', 'salary'])
      if (typeof f[k] !== 'number') return 'a hire is malformed';
    if (f.programId !== null && typeof f.programId !== 'string') return 'a hire is malformed';
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
  if (typeof campus.quadNames !== 'object' || campus.quadNames === null)
    return 'state.campus.quadNames is invalid';
  for (const name of Object.values(campus.quadNames as Record<string, unknown>)) {
    if (typeof name !== 'string') return 'a quad name is invalid';
  }
  if (typeof campus.nextPlacementId !== 'number') return 'state.campus.nextPlacementId is invalid';
  for (const p of campus.placements as Record<string, unknown>[]) {
    if (typeof p.id !== 'string' || typeof p.buildingId !== 'string')
      return 'a placement is malformed';
    for (const k of ['col', 'row', 'w', 'h', 'backlog', 'condition'])
      if (typeof p[k] !== 'number') return 'a placement is malformed';
    if (p.status !== 'building' && p.status !== 'open' && p.status !== 'renovating')
      return 'a placement has an invalid status';
    for (const k of ['completesWeek', 'openedWeek'])
      if (p[k] !== null && typeof p[k] !== 'number') return 'a placement is malformed';
  }
  return null;
}
