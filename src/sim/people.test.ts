import { describe, expect, it } from 'vitest';
import { buildingById } from '../content/buildings.ts';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  AID_DISCOUNT_RATE,
  APPLICANT_QUALITY_MEAN,
  BASE_APPLICANTS,
  TRIPLES_OVERFLOW_SHARE,
  TUITION_DEFAULT,
} from '../tuning.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import {
  admitRate,
  admittedQuality,
  applicantPool,
  attritionRate,
  campusCapacity,
  capacityAt,
  clampSelectivity,
  clampTuition,
  enrolled,
  intakeCap,
  inTriples,
  inverseNormal,
  nextConvocationWeek,
  runAdmissions,
  satisfactionFor,
  yieldRate,
} from './people.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { tuitionDependence } from './treasury.ts';

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

// A campus with room: Founders Hall plus two residence halls and a dining
// hall, all open by the first Admissions Day.
function housed(seed = 4): Run {
  let run = opened(seed);
  run = dispatch(run, {
    type: 'placeBuilding',
    buildingId: 'residence-hall',
    col: 2,
    row: 2,
    rotated: false,
  });
  run = dispatch(run, {
    type: 'placeBuilding',
    buildingId: 'residence-hall',
    col: 2,
    row: 8,
    rotated: false,
  });
  run = dispatch(run, {
    type: 'placeBuilding',
    buildingId: 'dining-hall',
    col: 14,
    row: 2,
    rotated: false,
  });
  return run;
}

const ADMISSIONS_WEEK = 23; // Spring Week 10 of Year 1

describe('the funnel (DD §8.2)', () => {
  it('shrinks the pool and the yield as the sticker rises', () => {
    const cheap = { tuition: 20_000, selectivity: 0.5 };
    const dear = { tuition: 80_000, selectivity: 0.5 };
    const par = { tuition: TUITION_DEFAULT, selectivity: 0.5 };
    expect(applicantPool(par)).toBe(BASE_APPLICANTS);
    expect(applicantPool(cheap)).toBeGreaterThan(applicantPool(par));
    expect(applicantPool(dear)).toBeLessThan(applicantPool(par));
    expect(yieldRate(cheap)).toBeGreaterThan(yieldRate(dear));
  });

  it('turns selectivity into quality, at the cost of numbers', () => {
    expect(admitRate(0)).toBe(0.95);
    expect(admitRate(1)).toBe(0.1);
    expect(Math.abs(admittedQuality(0.95) - APPLICANT_QUALITY_MEAN)).toBeLessThan(2);
    expect(admittedQuality(0.5)).toBeGreaterThan(admittedQuality(0.95));
    expect(admittedQuality(0.1)).toBeGreaterThan(admittedQuality(0.5));
    expect(admittedQuality(0.1)).toBeLessThanOrEqual(100);
    expect(inverseNormal(0.5)).toBeCloseTo(0, 6);
    expect(inverseNormal(0.975)).toBeCloseTo(1.96, 2);
    expect(inverseNormal(0.025)).toBeCloseTo(-1.96, 2);
  });

  it('clamps the terms to their steps and ranges', () => {
    expect(clampTuition(1_000)).toBe(15_000);
    expect(clampTuition(200_000)).toBe(90_000);
    expect(clampTuition(40_499)).toBe(40_000);
    expect(clampSelectivity(0.52)).toBe(0.5);
    expect(clampSelectivity(2)).toBe(1);
  });

  it('counts the beds that will be there at Convocation, sites included', () => {
    const halfBuilt = buildingById('residence-hall');
    const coming = halfBuilt.capacity!.beds!;
    const standing = buildingById('founders-hall').capacity!.beds!;
    // Broken ground on in the founding autumn, it is a week off finishing
    // when the file closes — so it houses nobody yet and is counted anyway.
    let run = dispatch(opened(), {
      type: 'placeBuilding',
      buildingId: halfBuilt.id,
      col: 8,
      row: 40,
      rotated: false,
      financing: 'debt',
    });
    run = tickRunWeeks(run, ADMISSIONS_WEEK, defaultResolution);
    expect(run.state.pendingBeat).toBe('admissions-day');
    expect(campusCapacity(run.state).beds).toBe(standing);
    expect(capacityAt(run.state, nextConvocationWeek(run.state)).beds).toBe(standing + coming);
    expect(intakeCap(run.state)).toBe(
      Math.floor((standing + coming) * (1 + TRIPLES_OVERFLOW_SHARE)),
    );
  });

  it('is capped by the beds, with a triples allowance', () => {
    let run = tickRunWeeks(opened(), ADMISSIONS_WEEK, defaultResolution);
    expect(run.state.pendingBeat).toBe('admissions-day');
    // Founders Hall stands by Admissions Day since Phase 21B shortened its
    // build, so the only beds the college has are its own.
    const beds = buildingById('founders-hall').capacity!.beds!;
    expect(campusCapacity(run.state).beds).toBe(beds);
    expect(intakeCap(run.state)).toBe(Math.floor(beds * (1 + TRIPLES_OVERFLOW_SHARE)));
    const preview = runAdmissions(run.state, run.state.people.terms);
    expect(preview.capped).toBe(true);
    expect(preview.size).toBe(intakeCap(run.state));
    run = dispatch(run, defaultResolution(run.state)!);
    expect(run.state.people.incoming?.size).toBe(preview.size);
    const closed = entriesOfKind(run.state, 'admissionsClosed')[0]!;
    expect(describeEntry(closed, run.state).text).toMatch(/the beds being what they are/);
  });
});

describe('four years and out (DD §8.3)', () => {
  it('takes the terms at Admissions Day and lands the class at Convocation', () => {
    let run = tickRunWeeks(housed(), ADMISSIONS_WEEK, defaultResolution);
    run = dispatch(run, {
      type: 'resolveBeat',
      beatId: 'admissions-day',
      tuition: 45_000,
      selectivity: 0.6,
    });
    expect(run.state.people.terms).toEqual({ tuition: 45_000, selectivity: 0.6 });
    const incoming = run.state.people.incoming!;
    expect(incoming.year).toBe(2);
    expect(incoming.capped).toBe(false);
    expect(incoming.size).toBeGreaterThan(100);
    expect(enrolled(run.state)).toBe(0);
    // Convocation of Year 2 is week 36.
    run = tickRunWeeks(run, WEEKS_PER_YEAR - ADMISSIONS_WEEK, defaultResolution);
    expect(run.state.clock).toMatchObject({ year: 2, term: 'fall', week: 1 });
    expect(run.state.people.cohorts).toHaveLength(1);
    expect(run.state.people.cohorts[0]).toMatchObject({
      classYear: 5,
      size: incoming.size,
      quality: incoming.quality,
    });
    expect(run.state.people.incoming).toBeNull();
    const arrived = entriesOfKind(run.state, 'classArrived')[0]!;
    expect(describeEntry(arrived, run.state).text).toBe(
      `The Class of '05 arrives: ${incoming.size} students.`,
    );
  });

  it('moves tuition, aid and auxiliaries once students are enrolled', () => {
    let run = tickRunWeeks(housed(), WEEKS_PER_YEAR, defaultResolution);
    run = dispatch(run, defaultResolution(run.state)!); // Convocation
    run = tickRunWeeks(run, 1, defaultResolution);
    const t = run.state.treasury;
    const n = enrolled(run.state);
    expect(n).toBeGreaterThan(0);
    expect(t.lastWeek.revenue.tuition).toBe(Math.round((n * TUITION_DEFAULT) / WEEKS_PER_YEAR));
    expect(t.lastWeek.expenses.financialAid).toBe(
      Math.round((n * TUITION_DEFAULT * AID_DISCOUNT_RATE) / WEEKS_PER_YEAR),
    );
    expect(t.lastWeek.revenue.auxiliaries).toBeGreaterThan(0);
    expect(tuitionDependence(t.lastWeek)).toBeGreaterThan(0.5);
  });

  it('puts the overflow in triples and it shows in satisfaction', () => {
    let run = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    run = dispatch(run, defaultResolution(run.state)!);
    const beds = campusCapacity(run.state).beds;
    expect(enrolled(run.state)).toBeGreaterThan(beds);
    expect(inTriples(run.state)).toBe(enrolled(run.state) - beds);
    const crowded = satisfactionFor(run.state, enrolled(run.state));
    const roomy = satisfactionFor(run.state, beds);
    expect(crowded).toBeLessThan(roomy);
    const arrived = entriesOfKind(run.state, 'classArrived')[0]!;
    expect(describeEntry(arrived, run.state)).toMatchObject({ tone: 'bad' });
    expect(describeEntry(arrived, run.state).text).toMatch(/in triples/);
  });

  it('thins unhappy cohorts faster', () => {
    expect(attritionRate(80)).toBe(0.04);
    expect(attritionRate(40)).toBeGreaterThan(attritionRate(60));
    expect(attritionRate(0)).toBeLessThanOrEqual(0.35);
  });

  it('flows a decade of classes through: four standing, the rest alumni', () => {
    const run = tickRunWeeks(housed(9), WEEKS_PER_YEAR * 11, defaultResolution);
    expect(run.state.clock.year).toBe(12);
    const { cohorts, alumni } = run.state.people;
    expect(cohorts.map((c) => c.classYear).sort()).toEqual(
      [12, 13, 14, 15].map(String).sort().map(Number),
    );
    expect(alumni.map((a) => a.classYear)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    for (const a of alumni) expect(a.size).toBeGreaterThan(0);
    const graduated = entriesOfKind(run.state, 'classGraduated');
    expect(graduated).toHaveLength(7);
    expect(describeEntry(graduated[0]!, run.state).text).toMatch(/Class of '05 graduates/);
    expect(entriesOfKind(run.state, 'studentsLeft').length).toBeGreaterThan(0);
    // Tuition dependence is a real number on the Treasury screen.
    const y = run.state.treasury.history.at(-1)!;
    expect(tuitionDependence(y)).toBeGreaterThan(0.5);
    expect(tuitionDependence(y)).toBeLessThan(1);
  });

  it('graduates at Commencement, the first week of summer', () => {
    let run = tickRunWeeks(housed(9), WEEKS_PER_YEAR * 4, defaultResolution);
    expect(run.state.people.cohorts.map((c) => c.classYear)).toEqual([5, 6, 7, 8]);
    // Year 5, Summer Week 1 is absolute week 4*36 + 28.
    run = tickRunWeeks(run, 28, defaultResolution);
    expect(run.state.clock).toMatchObject({ year: 5, term: 'summer', week: 1 });
    expect(run.state.people.cohorts.map((c) => c.classYear)).toEqual([6, 7, 8]);
    expect(run.state.people.alumni).toHaveLength(1);
  });

  it('refuses an admissions decision outside Admissions Day', () => {
    const run = tickRunWeeks(housed(), 5, defaultResolution);
    expect(
      canApply(run.state, { type: 'resolveBeat', beatId: 'admissions-day', tuition: 50_000 }),
    ).toMatchObject({ ok: false });
  });

  it('replays identically, classes and all', () => {
    let run = tickRunWeeks(housed(77), ADMISSIONS_WEEK, defaultResolution);
    run = dispatch(run, {
      type: 'resolveBeat',
      beatId: 'admissions-day',
      tuition: 30_000,
      selectivity: 0.3,
    });
    run = tickRunWeeks(run, WEEKS_PER_YEAR * 5, defaultResolution);
    expect(replay(77, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });
});

describe('save migration v6 → v7', () => {
  it('gives an old run the founding people when the replay disagrees', () => {
    const run = tickRunWeeks(housed(12), 40, defaultResolution);
    const file = JSON.parse(JSON.stringify(serializeRun(run)));
    file.version = 6;
    file.state.schemaVersion = 6;
    delete file.state.people;
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
    expect(result.save.state.people.terms).toEqual({ tuition: TUITION_DEFAULT, selectivity: 0.5 });
    expect(result.save.state.people.cohorts).toEqual([]);
    expect(result.save.state.campus.placements).toHaveLength(5);
  });
});

describe('student life (DD §8.3, §8.5; Phase 21I)', () => {
  it('is worth its full term when it reaches everyone, and a share when it reaches a share', async () => {
    const { studentLifeTerm } = await import('./people.ts');
    const { STUDENT_LIFE_POINTS } = await import('../tuning.ts');
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 3, defaultResolution);
    const s = run.state;
    const total = s.people.cohorts.reduce((t, c) => t + c.size, 0);
    expect(total).toBeGreaterThan(0);
    // No student-life building yet: nothing.
    expect(studentLifeTerm(s, total)).toBe(0);
    const centre = {
      id: 'lifetest',
      buildingId: 'student-center',
      col: 50,
      row: 50,
      w: 5,
      h: 4,
      status: 'open' as const,
      completesWeek: null,
      openedWeek: 0,
      backlog: 0,
      condition: 1,
    };
    const withCentre = {
      ...s,
      campus: { ...s.campus, placements: [...s.campus.placements, centre] },
    };
    const reach = Math.min(1, 700 / total);
    expect(studentLifeTerm(withCentre, total)).toBeCloseTo(STUDENT_LIFE_POINTS * reach, 6);
  });
});
