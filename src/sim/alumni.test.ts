import { describe, expect, it } from 'vitest';
import { ALUMNI_WORDS, MEMORY_CLAUSES, MEMORY_CONDITIONS } from '../content/alumni.ts';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  GIVING_MATURITY_YEARS,
  GIVING_PER_ALUM,
  GIVING_YOUNG_SHARE,
  MEMORY_CLAUSE_LIMIT,
  REUNION_COST_PER_HEAD,
  REUNION_WARMTH,
  REUNION_WARMTH_CAP,
} from '../tuning.ts';
import {
  annualGiving,
  arrivalWeekOf,
  classHistory,
  givingOf,
  maturityOf,
  memoryFor,
  memoryLine,
  reunionCost,
  reunionRoom,
  warmthFor,
} from './alumni.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind, lastEntry } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import type { AlumniClass, Cohort } from './people.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION } from './state.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

function opened(seed = 7): Run {
  return dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 44,
    row: 44,
    rotated: false,
  });
}

function years(n: number, seed = 7): Run {
  return tickRunWeeks(opened(seed), WEEKS_PER_YEAR * n, defaultResolution);
}

const cohort = (over: Partial<Cohort> = {}): Cohort => ({
  classYear: 10,
  size: 100,
  quality: 50,
  satisfaction: 60,
  ...over,
});

describe('the content (DD §8.4)', () => {
  it('has one clause per condition, and something to say about a quiet four years', () => {
    for (const c of MEMORY_CLAUSES) expect(MEMORY_CONDITIONS).toContain(c.when);
    expect(new Set(MEMORY_CLAUSES.map((c) => c.when)).size).toBe(MEMORY_CLAUSES.length);
    expect(MEMORY_CLAUSES.some((c) => c.when === 'always')).toBe(true);
    expect(MEMORY_CLAUSES.some((c) => c.warmth > 0)).toBe(true);
    expect(MEMORY_CLAUSES.some((c) => c.warmth < 0)).toBe(true);
  });
});

describe('what the four years held (DD §8.4)', () => {
  it('counts a class’s years from the journal, back to their Convocation', () => {
    expect(arrivalWeekOf(5)).toBe(WEEKS_PER_YEAR);
    expect(arrivalWeekOf(4)).toBe(0);
    const run = years(8);
    const c = run.state.people.cohorts[0]!;
    const h = classHistory(run.state, c);
    expect(h.buildings).toBeGreaterThanOrEqual(0);
    expect(h.bedsLost).toBe(0);
    expect(h.deficitYears).toBeGreaterThanOrEqual(0);
  });

  it('remembers beds going out from under them, which the routine crowding is not', () => {
    let run = years(2);
    // The admissions office fills the beds and the triples allowance
    // every year, so arriving into some crowding earns no clause.
    expect(classHistory(run.state, run.state.people.cohorts[0]!).bedsLost).toBe(0);
    run = dispatch(run, {
      type: 'placeBuilding',
      buildingId: 'residence-hall',
      col: 10,
      row: 10,
      rotated: false,
    });
    run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
    const hall = run.state.campus.placements.find((p) => p.buildingId === 'residence-hall')!;
    run = dispatch(run, { type: 'demolish', placementId: hall.id });
    const c = run.state.people.cohorts[0]!;
    expect(classHistory(run.state, c).bedsLost).toBe(320);
  });
});

describe('the memory and the warmth it sets', () => {
  it('earns every clause it deserves, loudest first, and says the first few', () => {
    const run = years(6);
    const c = cohort({ satisfaction: 30, quality: 20 });
    const memory = memoryFor(run.state, c, { distinguished: 0, placed: 60, adrift: 40 });
    expect(memory.length).toBeGreaterThan(1);
    // Loudest first: no later clause moves warmth more than an earlier one.
    const weights = memory.map((id) => Math.abs(MEMORY_CLAUSES.find((x) => x.id === id)!.warmth));
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(memory).toContain('unhappy');
    expect(memory).toContain('adrift');
    const line = memoryLine({ classYear: 10, memory });
    expect(line.startsWith("The Class of '10: ")).toBe(true);
    expect(line.endsWith('.')).toBe(true);
    expect(line).not.toContain('{');
    // The line is one sentence; the warmth counts everything.
    const named = MEMORY_CLAUSES.filter((x) => line.includes(x.text));
    expect(named.length).toBeLessThanOrEqual(MEMORY_CLAUSE_LIMIT);
  });

  it('gives a quiet four years its own line', () => {
    const run = years(6);
    const c = cohort({ satisfaction: 55, quality: 50 });
    const memory = memoryFor(run.state, c, { distinguished: 5, placed: 90, adrift: 5 });
    expect(memory).toEqual(['quiet']);
    expect(memoryLine({ classYear: 10, memory })).toContain('unremarkable');
  });

  it('sets warmth from how they felt, how they turned out, and what happened', () => {
    const happy = cohort({ satisfaction: 90 });
    const sad = cohort({ satisfaction: 20 });
    const great = { distinguished: 30, placed: 70, adrift: 0 };
    const grim = { distinguished: 0, placed: 40, adrift: 60 };
    expect(warmthFor(happy, great, [])).toBeGreaterThan(warmthFor(sad, great, []));
    expect(warmthFor(happy, great, [])).toBeGreaterThan(warmthFor(happy, grim, []));
    // A clause moves warmth by exactly its own weight.
    const base = warmthFor(happy, great, []);
    expect(warmthFor(happy, great, ['overcrowded'])).toBeCloseTo(
      base + MEMORY_CLAUSES.find((c) => c.id === 'overcrowded')!.warmth,
      1,
    );
    expect(
      warmthFor(
        sad,
        grim,
        MEMORY_CLAUSES.map((c) => c.id),
      ),
    ).toBeGreaterThanOrEqual(0);
    expect(warmthFor(happy, great, ['happy', 'distinguished'])).toBeLessThanOrEqual(100);
  });
});

describe('the annual fund (DD §5.1, §8.4)', () => {
  const alum = (over: Partial<AlumniClass> = {}): AlumniClass => ({
    classYear: 10,
    size: 100,
    quality: 50,
    satisfaction: 60,
    outcomes: { distinguished: 10, placed: 80, adrift: 10 },
    memory: ['quiet'],
    warmth: 50,
    nudged: 0,
    lastReunion: null,
    ...over,
  });

  it('ramps with the years since they left', () => {
    expect(maturityOf(0)).toBe(GIVING_YOUNG_SHARE);
    expect(maturityOf(GIVING_MATURITY_YEARS)).toBe(1);
    expect(maturityOf(50)).toBe(1);
    expect(maturityOf(10)).toBeGreaterThan(maturityOf(2));
  });

  it('is warmth times means times maturity, a head at a time', () => {
    const neutral = alum();
    expect(givingOf(neutral, 30)).toBe(100 * GIVING_PER_ALUM * 1 * 1 * 1);
    expect(givingOf(alum({ warmth: 100 }), 30)).toBe(2 * givingOf(neutral, 30));
    expect(givingOf(alum({ warmth: 0 }), 30)).toBe(0);
    expect(givingOf(alum({ quality: 100 }), 30)).toBeGreaterThan(givingOf(neutral, 30));
    expect(givingOf(neutral, 12)).toBeLessThan(givingOf(neutral, 30));
  });

  it('reaches the treasury weekly and in the budget', () => {
    const run = years(8);
    expect(run.state.people.alumni.length).toBeGreaterThan(0);
    const fund = annualGiving(run.state);
    expect(fund).toBeGreaterThan(0);
    expect(run.state.treasury.lastWeek.revenue.donations).toBe(Math.round(fund / WEEKS_PER_YEAR));
    expect(run.state.treasury.actual.revenue.donations).toBeGreaterThan(0);
  });
});

describe('reunions nudge and never rewrite (DD §8.4)', () => {
  function withAlumni(): Run {
    return years(8);
  }

  it('costs a head, warms a little, and only so far', () => {
    let run = withAlumni();
    const first = run.state.people.alumni[0]!;
    const before = first.warmth;
    expect(reunionCost(first)).toBe(first.size * REUNION_COST_PER_HEAD);
    expect(reunionRoom(first)).toBe(REUNION_WARMTH_CAP);
    run = dispatch(run, { type: 'holdReunion', classYear: first.classYear });
    const after = run.state.people.alumni.find((a) => a.classYear === first.classYear)!;
    expect(after.warmth).toBeCloseTo(before + REUNION_WARMTH, 1);
    expect(after.nudged).toBe(REUNION_WARMTH);
    expect(after.lastReunion).toBe(run.state.clock.year);
    expect(describeEntry(lastEntry(run.state)!, run.state).text).toContain('reunion');
    // Not twice in a year.
    expect(canApply(run.state, { type: 'holdReunion', classYear: first.classYear })).toMatchObject({
      ok: false,
      reason: /this year/,
    });
    expect(canApply(run.state, { type: 'holdReunion', classYear: 999 })).toMatchObject({
      ok: false,
      reason: /no such class/,
    });
  });

  it('stops at the cap: the four years they had are not up for revision', () => {
    let run = withAlumni();
    const target = run.state.people.alumni[0]!.classYear;
    const warmthOf = (r: Run) => r.state.people.alumni.find((a) => a.classYear === target)!.warmth;
    for (let i = 0; i < 8; i++) {
      if (canApply(run.state, { type: 'holdReunion', classYear: target }).ok) {
        // Measure the reunion's own contribution across the dispatch, which
        // turns no weeks: over eight years the world moves warmth too.
        const before = warmthOf(run);
        const next = dispatch(run, { type: 'holdReunion', classYear: target });
        expect(warmthOf(next)).toBeGreaterThan(before);
        run = next;
      }
      run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
    }
    const after = run.state.people.alumni.find((a) => a.classYear === target)!;
    // What the reunions added, and only that, stops at the cap.
    expect(after.nudged).toBe(REUNION_WARMTH_CAP);
    expect(reunionRoom(after)).toBe(0);
    expect(canApply(run.state, { type: 'holdReunion', classYear: target })).toMatchObject({
      ok: false,
      reason: /as warm as/,
    });
    expect(ALUMNI_WORDS.warmthNote.length).toBeGreaterThan(0);
  });
});

// The phase's own done condition, run headless: a housing crunch in year
// 12 is still costing the college money in year 30.
describe('the long memory (plan Phase 16)', () => {
  function thirtyYears(crunch: boolean): Run {
    let r = opened();
    for (const row of [10, 20]) {
      r = dispatch(r, {
        type: 'placeBuilding',
        buildingId: 'residence-hall',
        col: 10,
        row,
        rotated: false,
      });
    }
    r = tickRunWeeks(r, WEEKS_PER_YEAR * 11, defaultResolution);
    const hall = r.state.campus.placements.find(
      (p) => p.buildingId === 'residence-hall' && p.row === 20,
    )!;
    // Year 12: the beds go out from under the students already here.
    if (crunch) r = dispatch(r, { type: 'demolish', placementId: hall.id });
    r = tickRunWeeks(r, WEEKS_PER_YEAR * 5, defaultResolution);
    // Year 17: rebuilt. Only the classes who lived through it remember.
    if (crunch) {
      r = dispatch(r, {
        type: 'placeBuilding',
        buildingId: 'residence-hall',
        col: 10,
        row: 20,
        rotated: false,
      });
    }
    return tickRunWeeks(r, WEEKS_PER_YEAR * 14, defaultResolution);
  }

  it('a housing crunch in year 12 dents the annual fund in year 30', () => {
    const control = thirtyYears(false).state;
    const crunched = thirtyYears(true).state;
    expect(control.clock.year).toBeGreaterThanOrEqual(30);
    expect(crunched.clock.year).toBe(control.clock.year);

    const lived = (s: typeof control) =>
      s.people.alumni.filter((a) => a.classYear >= 13 && a.classYear <= 16);
    expect(lived(control).every((a) => !a.memory.includes('overcrowded'))).toBe(true);
    const marked = lived(crunched).filter((a) => a.memory.includes('overcrowded'));
    expect(marked.length).toBeGreaterThanOrEqual(3);

    // Those classes are colder, and still giving less two decades later.
    const warmth = (as: typeof control.people.alumni) =>
      as.reduce((t, a) => t + a.warmth, 0) / Math.max(1, as.length);
    // Colder by a margin the world's weather can move (Phase 24 widened
    // the gap between the two runs' events); the claim is the sign, and
    // the giving below is the size of it.
    expect(warmth(marked)).toBeLessThan(warmth(lived(control)) - 1);
    const gave = (s: typeof control, a: (typeof control.people.alumni)[number]) =>
      givingOf(a, s.clock.year);
    for (const a of marked) {
      const twin = lived(control).find((b) => b.classYear === a.classYear);
      if (!twin) continue;
      expect(gave(crunched, a)).toBeLessThan(gave(control, twin));
    }
    // And the fund is down where the crunch was lived. The WHOLE ledger is
    // no longer a fair comparison: since the world arrived (Phase 24) the
    // two runs' admissions differ, so do their events, and every other
    // class's warmth wanders with them. The measurable claim is about the
    // classes that lived through it.
    const fromMarked = marked.reduce((t, a) => t + gave(crunched, a), 0);
    const fromTwins = marked.reduce((t, a) => {
      const twin = lived(control).find((b) => b.classYear === a.classYear);
      return t + (twin ? gave(control, twin) : 0);
    }, 0);
    expect(fromMarked).toBeLessThan(fromTwins * 0.9);
    expect(entriesOfKind(crunched, 'classRemembered').length).toBeGreaterThan(10);
  });
});

describe('the log and the save', () => {
  it('replays a ledger exactly, reunions and all', () => {
    let run = years(9);
    run = dispatch(run, { type: 'holdReunion', classYear: run.state.people.alumni[0]!.classYear });
    run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
    expect(replay(run.state.seed, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
    const loaded = loadSaveFile(JSON.parse(JSON.stringify(serializeRun(run))));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.state.people.alumni).toEqual(run.state.people.alumni);
  });

  it('migrates a version-14 save: old classes are remembered by what they left with', () => {
    const run = years(8);
    const v14 = JSON.parse(JSON.stringify(serializeRun(run)));
    v14.version = 14;
    v14.state.schemaVersion = 14;
    for (const a of v14.state.people.alumni) {
      delete a.memory;
      delete a.warmth;
      delete a.nudged;
      delete a.lastReunion;
    }
    const loaded = loadSaveFile({ ...v14, log: [] });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.version).toBe(SCHEMA_VERSION);
      for (const a of loaded.save.state.people.alumni) {
        expect(a.memory.length).toBeGreaterThan(0);
        expect(a.warmth).toBeGreaterThanOrEqual(0);
        expect(a.nudged).toBe(0);
        expect(a.lastReunion).toBeNull();
      }
    }
    const bad = JSON.parse(JSON.stringify(serializeRun(run)));
    bad.state.people.alumni[0].warmth = 'warm';
    expect(loadSaveFile(bad)).toMatchObject({ ok: false, reason: /alumni class/ });
  });
});
