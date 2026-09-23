import { describe, expect, it } from 'vitest';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { courseListings, PROGRAMS, SCHOOLS, TIERS } from '../content/schools.ts';
import {
  PROGRAM_ANNUAL_COST,
  PROGRAM_OPENING_COST,
  SCHOOL_FOUNDING_COST,
  STUDENT_LIFE_PER_STUDENT,
} from '../tuning.ts';
import {
  annualProgramCosts,
  foundedSchool,
  hallsAvailable,
  newestProgram,
  programSeats,
} from './academics.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind, lastEntry } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { applyCut, availableCuts, RUNG_FREEZE } from './distress.ts';
import { enrolled } from './people.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';

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

// Founders Hall open, and an Academic Hall beside it: two halls, no school.
function withHalls(seed = 4): Run {
  let run = opened(seed);
  run = dispatch(run, {
    type: 'placeBuilding',
    buildingId: 'academic-hall',
    col: 2,
    row: 2,
    rotated: false,
  });
  run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
  expect(run.state.campus.placements.every((p) => p.status === 'open')).toBe(true);
  return run;
}

describe('the catalogue (DD §7.2, §14)', () => {
  it('has six schools, thirty programs, three tiers', () => {
    expect(SCHOOLS).toHaveLength(6);
    expect(SCHOOLS.map((s) => s.name)).toEqual([
      'Arts & Letters',
      'Science',
      'Engineering',
      'Business',
      'Health',
      'Law',
    ]);
    expect(PROGRAMS).toHaveLength(30);
    expect(TIERS.map((t) => t.id)).toEqual(['founded', 'established', 'renowned']);
    for (const s of SCHOOLS) expect(s.programs).toHaveLength(5);
  });

  it('generates a program’s courses from its code, two a level', () => {
    const english = PROGRAMS.find((p) => p.id === 'english')!;
    const listings = courseListings(english);
    expect(listings.map((c) => c.code)).toEqual([
      'ENGL 101',
      'ENGL 102',
      'ENGL 201',
      'ENGL 202',
      'ENGL 301',
      'ENGL 302',
    ]);
    expect(listings[0]).toMatchObject({ title: 'Introduction to Literature', level: 1 });
    expect(listings[5]!.level).toBe(3);
  });
});

describe('founding schools and opening programs (DD §7.2)', () => {
  it('needs an open hall of its own', () => {
    const early = opened();
    expect(hallsAvailable(early.state)).toEqual([]);
    expect(
      canApply(early.state, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' }),
    ).toMatchObject({ ok: false, reason: /not open/ });
    const run = withHalls();
    expect(hallsAvailable(run.state).map((p) => p.buildingId)).toEqual([
      'founders-hall',
      'academic-hall',
    ]);
    expect(
      canApply(run.state, { type: 'foundSchool', schoolId: 'science', placementId: 'p9' }),
    ).toMatchObject({ ok: false, reason: /no such/ });
  });

  it('founds a school in a hall for the founding cost, one school a hall', () => {
    let run = withHalls();
    const cash = run.state.treasury.cash;
    run = dispatch(run, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' });
    expect(run.state.treasury.cash).toBe(cash - SCHOOL_FOUNDING_COST);
    expect(foundedSchool(run.state, 'science')).toMatchObject({ placementId: 'p1', dean: null });
    expect(hallsAvailable(run.state).map((p) => p.id)).toEqual(['p2']);
    expect(describeEntry(lastEntry(run.state)!, run.state).text).toBe(
      'The School of Science is founded in Founders Hall.',
    );
    expect(
      canApply(run.state, { type: 'foundSchool', schoolId: 'business', placementId: 'p1' }),
    ).toMatchObject({ ok: false, reason: /already houses/ });
    expect(
      canApply(run.state, { type: 'foundSchool', schoolId: 'science', placementId: 'p2' }),
    ).toMatchObject({ ok: false, reason: /already founded/ });
    run = dispatch(run, { type: 'foundSchool', schoolId: 'business', placementId: 'p2' });
    expect(run.state.academics.schools).toHaveLength(2);
  });

  it('opens programs only in a founded school, and they cost every year', () => {
    let run = withHalls();
    expect(canApply(run.state, { type: 'openProgram', programId: 'biology' })).toMatchObject({
      ok: false,
      reason: /not founded/,
    });
    run = dispatch(run, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' });
    const cash = run.state.treasury.cash;
    run = dispatch(run, { type: 'openProgram', programId: 'biology' });
    run = dispatch(run, { type: 'openProgram', programId: 'chemistry' });
    expect(run.state.treasury.cash).toBe(cash - 2 * PROGRAM_OPENING_COST);
    expect(run.state.academics.programs.map((p) => p.programId)).toEqual(['biology', 'chemistry']);
    expect(run.state.academics.programs[0]!.tier).toBe('founded');
    expect(canApply(run.state, { type: 'openProgram', programId: 'biology' })).toMatchObject({
      ok: false,
      reason: /already open/,
    });
    expect(annualProgramCosts(run.state)).toBe(2 * PROGRAM_ANNUAL_COST);
    expect(programSeats(run.state)).toBe(240);
    run = tickRunWeeks(run, 1, defaultResolution);
    // The line is the programs and the students they look after.
    expect(run.state.treasury.lastWeek.expenses.programs).toBe(
      Math.round(
        (2 * PROGRAM_ANNUAL_COST + STUDENT_LIFE_PER_STUDENT * enrolled(run.state)) / WEEKS_PER_YEAR,
      ),
    );
    expect(entriesOfKind(run.state, 'programOpened')).toHaveLength(2);
  });

  it('closes a program', () => {
    let run = withHalls();
    run = dispatch(run, { type: 'foundSchool', schoolId: 'law', placementId: 'p2' });
    run = dispatch(run, { type: 'openProgram', programId: 'torts' as string });
    expect(run.state.academics.programs).toHaveLength(0); // no such program
    run = dispatch(run, { type: 'openProgram', programId: 'legal-studies' });
    run = dispatch(run, { type: 'closeProgram', programId: 'legal-studies' });
    expect(run.state.academics.programs).toHaveLength(0);
    expect(describeEntry(lastEntry(run.state)!, run.state).text).toBe('Legal Studies closes.');
    expect(canApply(run.state, { type: 'closeProgram', programId: 'legal-studies' })).toMatchObject(
      {
        ok: false,
      },
    );
  });

  it('is frozen with the rest under a freeze (DD §5.5)', () => {
    const run = withHalls();
    const frozen = {
      ...run.state,
      distress: { ...run.state.distress, rung: RUNG_FREEZE as 3 },
    };
    expect(
      canApply(frozen, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' }),
    ).toMatchObject({ ok: false, reason: /frozen/ });
  });

  it('the board’s cut closes the newest program', () => {
    let run = withHalls();
    run = dispatch(run, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' });
    run = dispatch(run, { type: 'openProgram', programId: 'biology' });
    run = tickRunWeeks(run, 2, defaultResolution);
    run = dispatch(run, { type: 'openProgram', programId: 'physics' });
    expect(newestProgram(run.state)?.programId).toBe('physics');
    expect(availableCuts(run.state)).toContain('closeProgram');
    const cut = applyCut(run.state, 'closeProgram');
    expect(cut.academics.programs.map((p) => p.programId)).toEqual(['biology']);
  });

  it('replays identically', () => {
    let run = withHalls(77);
    run = dispatch(run, { type: 'foundSchool', schoolId: 'engineering', placementId: 'p2' });
    run = dispatch(run, { type: 'openProgram', programId: 'civil-engineering' });
    run = tickRunWeeks(run, 50, defaultResolution);
    run = dispatch(run, { type: 'closeProgram', programId: 'civil-engineering' });
    run = tickRunWeeks(run, 10, defaultResolution);
    expect(replay(77, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });
});

describe('save migration v8 → v9', () => {
  it('gives an old run no schools when the replay disagrees', () => {
    const run = tickRunWeeks(opened(12), 40, defaultResolution);
    const file = JSON.parse(JSON.stringify(serializeRun(run)));
    file.version = 8;
    file.state.schemaVersion = 8;
    delete file.state.academics;
    file.state.campus.placements.push({
      id: 'p9',
      buildingId: 'lab',
      col: 40,
      row: 40,
      w: 5,
      h: 3,
      status: 'open',
      completesWeek: null,
      openedWeek: 0,
      backlog: 0,
      condition: 1,
    });
    const result = loadSaveFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state.academics).toEqual({ schools: [], programs: [] });
  });
});
