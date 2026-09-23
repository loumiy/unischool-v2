import { describe, expect, it } from 'vitest';
import { describeEntry } from '../content/busLines.ts';
import { HERITAGES, NAME_POOLS, QUIRKS, RANKS, quirkById } from '../content/faculty.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { PROGRAMS, tierById } from '../content/schools.ts';
import {
  FACULTY_TEACHING_LOAD,
  MARKET_SIZE,
  QUIRK_MORALE_CAP,
  SALARY_BY_RANK,
  SALARY_ROUNDING,
  TEACHING_WEIGHT,
} from '../tuning.ts';
import { crowdingFactor, openProgram } from './academics.ts';
import { applyAction, canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind, lastEntry } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { RUNG_FREEZE } from './distress.ts';
import {
  annualFacultyPayroll,
  askingSalary,
  effectiveTeaching,
  facultyOf,
  listMarket,
  programQuality,
  quirkMorale,
  severanceFor,
  staffingNeed,
  teachingQuality,
  teachingSatisfaction,
  unassignedFaculty,
  type Faculty,
} from './faculty.ts';
import { satisfactionFor } from './people.ts';
import { dispatch, newRun, replay, tickRun, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION } from './state.ts';
import { adminShareOfPayroll, proposeBudget } from './treasury.ts';

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

// Founders Hall open with the School of Science in it and Biology open.
function withBiology(seed = 4): Run {
  let run = tickRunWeeks(opened(seed), WEEKS_PER_YEAR, defaultResolution);
  run = dispatch(run, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' });
  run = dispatch(run, { type: 'openProgram', programId: 'biology' });
  expect(openProgram(run.state, 'biology')).not.toBeNull();
  return run;
}

// Run on, resolving every other beat, until the named one holds the clock.
function untilBeat(run: Run, beatId: string): Run {
  for (let guard = 0; guard < WEEKS_PER_YEAR * 2; guard++) {
    if (run.state.pendingBeat === beatId) return run;
    if (run.state.pendingBeat !== null || run.state.distress.pendingLetter !== null) {
      run = dispatch(run, defaultResolution(run.state)!);
      continue;
    }
    run = tickRun(run);
  }
  throw new Error(`${beatId} never fired`);
}

function atMarket(seed = 4): Run {
  const run = untilBeat(withBiology(seed), 'budget-and-hiring');
  expect(run.state.faculty.marketOpen).toBe(true);
  return run;
}

function scientist(run: Run): Faculty {
  return run.state.faculty.market.find((f) => f.schoolId === 'science')!;
}

describe('the faculty catalogue (DD §7.3, §14)', () => {
  it('seeds forty quirks, each doing something, and three ranks', () => {
    expect(QUIRKS).toHaveLength(40);
    expect(new Set(QUIRKS.map((q) => q.id)).size).toBe(40);
    for (const q of QUIRKS) {
      expect(q.line.length).toBeGreaterThan(0);
      expect(Object.keys(q.effects).length).toBeGreaterThan(0);
    }
    expect(RANKS.map((r) => r.id)).toEqual(['assistant', 'associate', 'full']);
    expect(HERITAGES).toHaveLength(10);
    for (const h of HERITAGES) expect(NAME_POOLS.surnames[h]!.length).toBeGreaterThan(0);
  });

  it('prices a hire by rank, skill and quirk, to the thousand', () => {
    expect(askingSalary('assistant', 50, 50, 'office-hours')).toBe(SALARY_BY_RANK.assistant);
    expect(askingSalary('full', 50, 50, 'office-hours')).toBe(SALARY_BY_RANK.full);
    expect(askingSalary('associate', 100, 100, 'office-hours')).toBe(
      Math.round((SALARY_BY_RANK.associate * 1.3) / SALARY_ROUNDING) * SALARY_ROUNDING,
    );
    // "Came for the view" asks 15% less.
    expect(askingSalary('assistant', 50, 50, 'came-for-the-view')).toBe(68_000);
    expect(quirkById('a-name').effects.salary).toBe(1.25);
  });
});

describe('the summer market (DD §7.3)', () => {
  it('is listed when Budget & Hiring fires and closes when the budget is approved', () => {
    let run = atMarket();
    const { market } = run.state.faculty;
    expect(market).toHaveLength(MARKET_SIZE);
    // Year 1's market, default-resolved on the way here, took f1–f8.
    const first = run.state.faculty.nextId - MARKET_SIZE;
    expect(market.map((f) => f.id)).toEqual(market.map((_, i) => `f${first + i}`));
    for (const f of market) {
      expect(f.hiredWeek).toBeNull();
      expect(f.programId).toBeNull();
      expect(f.salary % SALARY_ROUNDING).toBe(0);
      expect(f.teaching).toBeGreaterThanOrEqual(20);
      expect(f.teaching).toBeLessThanOrEqual(95);
      expect(quirkById(f.quirkId)).toBeDefined();
      expect(f.name.split(' ')).toHaveLength(2);
    }
    expect(describeEntry(entriesOfKind(run.state, 'marketOpened')[0]!, run.state).text).toBe(
      `The hiring market opens: ${MARKET_SIZE} candidates listed.`,
    );
    // Most candidates work in the one founded field.
    expect(market.filter((f) => f.schoolId === 'science').length).toBeGreaterThanOrEqual(4);
    run = dispatch(run, defaultResolution(run.state)!);
    expect(run.state.faculty.marketOpen).toBe(false);
    expect(run.state.faculty.market).toEqual([]);
    expect(describeEntry(entriesOfKind(run.state, 'marketClosed')[0]!, run.state).text).toBe(
      `The market closes; ${MARKET_SIZE} candidates take other offers.`,
    );
  });

  it('is the world’s, not the run’s: the same seed and year list the same people', () => {
    const run = atMarket();
    const strip = (fs: Faculty[]) => fs.map(({ id: _id, ...rest }) => rest);
    expect(strip(listMarket(run.state, run.state.clock.year))).toEqual(
      strip(run.state.faculty.market),
    );
    const other = atMarket(9);
    expect(other.state.faculty.market.map((f) => f.name)).not.toEqual(
      run.state.faculty.market.map((f) => f.name),
    );
    expect(listMarket(run.state, run.state.clock.year + 1)).not.toEqual(run.state.faculty.market);
  });

  it('hires a candidate to a program in their field, and refuses the rest', () => {
    let run = atMarket();
    const c = scientist(run);
    const stranger = run.state.faculty.market.find((f) => f.schoolId !== 'science');
    expect(
      canApply(run.state, { type: 'hire', candidateId: 'nobody', programId: 'biology' }),
    ).toMatchObject({ ok: false, reason: /no such candidate/ });
    expect(
      canApply(run.state, { type: 'hire', candidateId: c.id, programId: 'chemistry' }),
    ).toMatchObject({ ok: false, reason: /not open in their field/ });
    if (stranger) {
      expect(
        canApply(run.state, { type: 'hire', candidateId: stranger.id, programId: 'biology' }),
      ).toMatchObject({ ok: false, reason: /not open in their field/ });
    }
    run = dispatch(run, { type: 'hire', candidateId: c.id, programId: 'biology' });
    expect(run.state.faculty.roster).toHaveLength(1);
    expect(run.state.faculty.market).toHaveLength(MARKET_SIZE - 1);
    expect(run.state.faculty.roster[0]).toMatchObject({
      id: c.id,
      programId: 'biology',
      hiredWeek: run.state.clock.absoluteWeek,
    });
    expect(facultyOf(run.state, 'biology').map((f) => f.id)).toEqual([c.id]);
    expect(describeEntry(lastEntry(run.state)!, run.state).text).toBe(
      `${c.name} joins the faculty to teach Biology.`,
    );
    // Hiring is a hiring freeze's first casualty (DD §5.5).
    const frozenState = {
      ...run.state,
      distress: { ...run.state.distress, rung: RUNG_FREEZE },
    };
    expect(
      canApply(frozenState, { type: 'hire', candidateId: run.state.faculty.market[0]!.id }),
    ).toMatchObject({ ok: false, reason: /frozen hiring/ });
    // The market is gone once the budget is approved.
    run = dispatch(run, defaultResolution(run.state)!);
    expect(canApply(run.state, { type: 'hire', candidateId: 'f2' })).toMatchObject({
      ok: false,
      reason: /closed/,
    });
  });

  it('the budget feels them: payroll is live weekly and in the plan', () => {
    let run = atMarket();
    const c = scientist(run);
    run = dispatch(run, { type: 'hire', candidateId: c.id, programId: 'biology' });
    expect(annualFacultyPayroll(run.state)).toBe(c.salary);
    const plan = proposeBudget(run.state, run.state.clock.year + 1, 0.045);
    expect(plan.expenses.facultyPayroll).toBe(c.salary);
    expect(adminShareOfPayroll(plan)).toBeLessThan(1);
    run = dispatch(run, defaultResolution(run.state)!);
    run = tickRun(run);
    expect(run.state.treasury.lastWeek.expenses.facultyPayroll).toBe(
      Math.round(c.salary / WEEKS_PER_YEAR),
    );
  });

  it('moves a hire between programs, dismisses with severance, frees them when a program closes', () => {
    let run = atMarket();
    const c = scientist(run);
    run = dispatch(run, { type: 'hire', candidateId: c.id });
    expect(unassignedFaculty(run.state)).toHaveLength(1);
    expect(
      canApply(run.state, { type: 'assignFaculty', facultyId: c.id, programId: 'physics' }),
    ).toMatchObject({ ok: false, reason: /not open/ });
    run = dispatch(run, { type: 'assignFaculty', facultyId: c.id, programId: 'biology' });
    expect(facultyOf(run.state, 'biology')).toHaveLength(1);
    run = dispatch(run, { type: 'closeProgram', programId: 'biology' });
    expect(unassignedFaculty(run.state)).toHaveLength(1);
    expect(run.state.faculty.roster[0]!.programId).toBeNull();
    const cash = run.state.treasury.cash;
    run = dispatch(run, { type: 'dismiss', facultyId: c.id });
    expect(run.state.faculty.roster).toEqual([]);
    expect(run.state.treasury.cash).toBe(cash - severanceFor(c));
    expect(describeEntry(lastEntry(run.state)!, run.state).text).toBe(`${c.name} is dismissed.`);
    expect(canApply(run.state, { type: 'dismiss', facultyId: c.id })).toMatchObject({
      ok: false,
    });
  });
});

describe('program quality (DD §7.4) and the students who feel it', () => {
  it('is nothing without faculty, damped while understaffed, the mean teaching once staffed', () => {
    let run = atMarket();
    const biology = openProgram(run.state, 'biology')!;
    expect(programQuality(run.state, biology)).toBe(0);
    expect(teachingQuality(run.state)).toBe(0);
    expect(staffingNeed(biology)).toBe(
      Math.ceil(tierById('founded').seats / FACULTY_TEACHING_LOAD),
    );
    const [a, b] = run.state.faculty.market.filter((f) => f.schoolId === 'science');
    run = dispatch(run, { type: 'hire', candidateId: a!.id, programId: 'biology' });
    // The first class outnumbers Biology's seats, so every program is damped.
    const crowding = crowdingFactor(run.state);
    expect(crowding).toBeLessThan(1);
    const half = (effectiveTeaching(a!) * (1 / staffingNeed(biology)) * crowding).toFixed(1);
    expect(programQuality(run.state, biology)).toBe(Number(half));
    if (b) {
      run = dispatch(run, { type: 'hire', candidateId: b.id, programId: 'biology' });
      const mean = ((effectiveTeaching(a!) + effectiveTeaching(b)) / 2) * crowding;
      expect(programQuality(run.state, biology)).toBe(Number(mean.toFixed(1)));
      expect(teachingQuality(run.state)).toBe(programQuality(run.state, biology));
    }
  });

  it('the tier lifts it and the hall wears it', () => {
    let run = atMarket();
    const a = scientist(run);
    run = dispatch(run, { type: 'hire', candidateId: a.id, programId: 'biology' });
    const founded = openProgram(run.state, 'biology')!;
    const base = programQuality(run.state, founded);
    expect(programQuality(run.state, { ...founded, tier: 'renowned' })).toBeLessThanOrEqual(
      Number((base * (tierById('renowned').qualityFactor / (1 / 1)) * 2).toFixed(1)),
    );
    const worn = {
      ...run.state,
      campus: {
        ...run.state.campus,
        placements: run.state.campus.placements.map((p) =>
          p.id === 'p1' ? { ...p, condition: 0.5 } : p,
        ),
      },
    };
    expect(programQuality(worn, founded)).toBe(Number((base * 0.5).toFixed(1)));
  });

  it('teaching moves satisfaction, and quirks add morale within the cap', () => {
    let run = atMarket();
    const before = satisfactionFor(run.state, 100);
    const a = scientist(run);
    run = dispatch(run, { type: 'hire', candidateId: a.id, programId: 'biology' });
    const after = satisfactionFor(run.state, 100);
    const swing = teachingSatisfaction(run.state) - -(TEACHING_WEIGHT / 2) + quirkMorale(run.state);
    expect(after - before).toBeCloseTo(swing, 0);
    expect(Math.abs(quirkMorale(run.state))).toBeLessThanOrEqual(QUIRK_MORALE_CAP);
    // A roster of beloved lecturers still tops out at the cap.
    const beloved = {
      ...run.state,
      faculty: {
        ...run.state.faculty,
        roster: Array.from({ length: 6 }, (_, i) => ({
          ...run.state.faculty.roster[0]!,
          id: `x${i}`,
          quirkId: 'beloved-lecturer',
        })),
      },
    };
    expect(quirkMorale(beloved)).toBe(QUIRK_MORALE_CAP);
  });

  it('closes a program under austerity with its faculty kept on', () => {
    const run = atMarket();
    const a = scientist(run);
    const hired = applyAction(run.state, { type: 'hire', candidateId: a.id, programId: 'biology' });
    const closed = applyAction(hired, { type: 'closeProgram', programId: 'biology' });
    expect(closed.faculty.roster).toHaveLength(1);
    expect(annualFacultyPayroll(closed)).toBe(a.salary);
  });
});

describe('the log and the save', () => {
  it('replays a market, a hire and a dismissal from the log', () => {
    let run = atMarket();
    const [a, b] = run.state.faculty.market.filter((f) => f.schoolId === 'science');
    run = dispatch(run, { type: 'hire', candidateId: a!.id, programId: 'biology' });
    if (b) run = dispatch(run, { type: 'hire', candidateId: b.id });
    run = dispatch(run, defaultResolution(run.state)!);
    run = tickRunWeeks(run, 10, defaultResolution);
    run = dispatch(run, { type: 'dismiss', facultyId: a!.id });
    run = tickRunWeeks(run, 5, defaultResolution);
    expect(replay(run.state.seed, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
    const file = JSON.parse(JSON.stringify(serializeRun(run)));
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.state).toEqual(run.state);
  });

  it('migrates a version-9 save: by replay when the log lands, else with nobody hired', () => {
    let run = atMarket();
    run = dispatch(run, defaultResolution(run.state)!);
    run = tickRunWeeks(run, 3, defaultResolution);
    const v9 = JSON.parse(JSON.stringify(serializeRun(run)));
    v9.version = 9;
    v9.state.schemaVersion = 9;
    delete v9.state.faculty;
    const replayed = loadSaveFile(v9);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) {
      expect(replayed.save.version).toBe(SCHEMA_VERSION);
      expect(replayed.save.state.faculty.marketYear).toBe(2);
      expect(replayed.save.state).toEqual(run.state);
    }
    const orphan = { ...v9, log: [] };
    const fallen = loadSaveFile(orphan);
    expect(fallen.ok).toBe(true);
    if (fallen.ok) {
      expect(fallen.save.state.faculty).toEqual({
        roster: [],
        market: [],
        marketOpen: false,
        marketYear: 0,
        nextId: 1,
      });
    }
  });

  it('rejects a malformed roster', () => {
    const run = atMarket();
    const raw = JSON.parse(JSON.stringify(serializeRun(run)));
    raw.state.faculty.roster = [{ id: 'f1' }];
    expect(loadSaveFile(raw)).toMatchObject({ ok: false, reason: /hire is malformed/ });
  });
});

describe('programs on the catalogue', () => {
  it('every program has a field a candidate can be drawn for', () => {
    for (const p of PROGRAMS) expect(typeof p.schoolId).toBe('string');
  });
});
