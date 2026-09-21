import { describe, expect, it } from 'vitest';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { ARCS, ARC_CONDITIONS, STUDENT_NAMES } from '../content/students.ts';
import {
  ARC_BEATS_PER_STUDENT,
  ARC_BEATS_PER_YEAR,
  NAMED_PER_CLASS_MAX,
  NAMED_PER_CLASS_MIN,
} from '../tuning.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { RUNG_AUSTERITY } from './distress.ts';
import { dispatch, newRun, replay, tickRun, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';
import {
  conditionHolds,
  eligibleArcs,
  enrolledNamed,
  namedOf,
  pickOutcome,
  studentById,
  yearOfStudy,
} from './students.ts';
import { Rng } from './rng.ts';

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

// A run far enough in that classes have arrived, been taught and left.
function years(n: number, seed = 4): Run {
  return tickRunWeeks(opened(seed), WEEKS_PER_YEAR * n, defaultResolution);
}

describe('the content (DD §8.1, §14)', () => {
  it('carries a portrait pool and arc templates, every condition used is known', () => {
    expect(STUDENT_NAMES.male.length + STUDENT_NAMES.female.length).toBe(80);
    expect(ARCS.length).toBeGreaterThanOrEqual(30);
    for (const a of ARCS) {
      expect(ARC_CONDITIONS).toContain(a.when);
      expect(a.line.length).toBeGreaterThan(20);
    }
    // Every stage can always say something, whatever the campus is doing.
    for (const stage of ['year', 'leaving', 'distinguished', 'placed', 'adrift'] as const) {
      expect(ARCS.some((a) => a.stage === stage && a.when === 'always')).toBe(true);
    }
  });
});

describe('who the game follows (DD §8.1)', () => {
  it('names three to five of each arriving class, with a face and a class', () => {
    const run = years(2);
    const first = run.state.people.cohorts[0]!;
    const named = namedOf(run.state, first.classYear);
    expect(named.length).toBeGreaterThanOrEqual(NAMED_PER_CLASS_MIN);
    expect(named.length).toBeLessThanOrEqual(NAMED_PER_CLASS_MAX);
    for (const s of named) {
      expect(s.name.split(' ').length).toBeGreaterThanOrEqual(2);
      expect(['male', 'female']).toContain(s.gender);
      expect(s.heritage.length).toBeGreaterThan(0);
      expect(s.status).toBe('enrolled');
      expect(s.classYear).toBe(first.classYear);
      expect(studentById(run.state, s.id)).toBe(s);
    }
    expect(new Set(named.map((s) => s.id)).size).toBe(named.length);
    const intro = entriesOfKind(run.state, 'studentsNamed')[0]!;
    expect(describeEntry(intro, run.state).text).toContain(named[0]!.name);
  });

  it('gives them a program to read when there is one', () => {
    let run = years(1);
    const firstClass = run.state.people.cohorts[0]!.classYear;
    // Beds for a second class, then something to read.
    run = dispatch(run, {
      type: 'placeBuilding',
      buildingId: 'residence-hall',
      col: 10,
      row: 10,
      rotated: false,
    });
    run = dispatch(run, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' });
    run = dispatch(run, { type: 'openProgram', programId: 'biology' });
    run = tickRunWeeks(run, WEEKS_PER_YEAR * 2, defaultResolution);
    const later = run.state.people.cohorts.map((c) => c.classYear).filter((y) => y > firstClass);
    expect(later.length).toBeGreaterThan(0);
    const fresh = later.flatMap((y) => namedOf(run.state, y));
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((s) => s.programId === 'biology')).toBe(true);
    // The first class, named before any program existed, has none.
    expect(namedOf(run.state, firstClass).every((s) => s.programId === null)).toBe(true);
  });

  it('counts their year of study from the class they belong to', () => {
    expect(yearOfStudy({ classYear: 10 } as never, 7)).toBe(1);
    expect(yearOfStudy({ classYear: 10 } as never, 8)).toBe(2);
    expect(yearOfStudy({ classYear: 10 } as never, 10)).toBe(4);
  });
});

describe('a lens, not a simulation (guardrail §17.4)', () => {
  it('lifts off a run without moving anything underneath it', () => {
    const run = years(6);
    expect(run.state.people.named.length).toBeGreaterThan(4);
    // The same week, ticked with the lens and without it.
    const blind: GameState = {
      ...run.state,
      people: { ...run.state.people, named: [], nextStudentId: 1 },
    };
    const withLens = tickRun(run).state;
    const without = tickRun({ ...run, state: blind }).state;
    const strip = (s: GameState) => ({
      ...s,
      people: { ...s.people, named: [], nextStudentId: 1 },
      bus: s.bus.filter((e) => e.kind !== 'studentBeat' && e.kind !== 'studentsNamed'),
    });
    // Every number the sim keeps — money, cohorts, faculty, the ladder,
    // the dice themselves — is identical with the students and without.
    expect(strip(without)).toEqual(strip(withLens));
    expect(without.rng).toEqual(withLens.rng);
    expect(without.treasury).toEqual(withLens.treasury);
    expect(without.people.cohorts).toEqual(withLens.people.cohorts);
  });

  it('spends none of the run’s own dice on them', () => {
    // A whole year of naming and beats leaves the stream where the sim's
    // other systems left it: nothing in this phase draws from it.
    const before = years(1);
    const after = tickRunWeeks(before, WEEKS_PER_YEAR, defaultResolution);
    expect(after.state.people.named.length).toBeGreaterThan(0);
    expect(after.state.rng).toEqual(before.state.rng);
    expect(Rng.fromState(after.state.rng).snapshot()).toEqual(before.state.rng);
  });
});

describe('beats are selected from cohort truth (DD §8.1)', () => {
  it('only offers a beat whose condition holds now', () => {
    const run = years(2);
    // Somebody the game is following, with nothing said about them yet, so
    // the eligible set is the conditions and nothing else.
    const student = { ...enrolledNamed(run.state)[0]!, beats: [] };
    // With no programs open the college is teaching nobody, and says so.
    expect(conditionHolds('noTeaching', { state: run.state, cohort: null, student })).toBe(true);
    expect(eligibleArcs(run.state, student, 'year').some((a) => a.when === 'noTeaching')).toBe(
      true,
    );
    expect(eligibleArcs(run.state, student, 'year').some((a) => a.when === 'receivership')).toBe(
      false,
    );
    // Put the college in austerity and the beat becomes available.
    const austere: GameState = {
      ...run.state,
      distress: { ...run.state.distress, rung: RUNG_AUSTERITY },
    };
    expect(eligibleArcs(austere, student, 'year').some((a) => a.when === 'austerity')).toBe(true);
  });

  it('never repeats a beat to the same student, and stops at a handful', () => {
    const run = years(12);
    for (const s of run.state.people.named) {
      const ids = s.beats.map((b) => b.arcId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(s.beats.length).toBeLessThanOrEqual(ARC_BEATS_PER_STUDENT + 1);
      for (const b of s.beats) expect(ARCS.some((a) => a.id === b.arcId)).toBe(true);
    }
  });

  it('keeps the ticker a ticker: a couple of beats a Convocation', () => {
    const run = years(10);
    const byWeek = new Map<number, number>();
    for (const e of entriesOfKind(run.state, 'studentBeat')) {
      byWeek.set(e.week, (byWeek.get(e.week) ?? 0) + 1);
    }
    expect(byWeek.size).toBeGreaterThan(3);
    for (const [week, count] of byWeek) {
      // Convocation carries the year's news; Commencement carries a
      // class's farewells, which is at most the class the game followed.
      expect(count).toBeLessThanOrEqual(Math.max(ARC_BEATS_PER_YEAR, NAMED_PER_CLASS_MAX));
      expect(week).toBeGreaterThan(0);
    }
  });

  it('reads as prose, with their program and class in it', () => {
    let run = years(1);
    run = dispatch(run, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' });
    run = dispatch(run, { type: 'openProgram', programId: 'biology' });
    run = tickRunWeeks(run, WEEKS_PER_YEAR * 3, defaultResolution);
    const beats = entriesOfKind(run.state, 'studentBeat');
    expect(beats.length).toBeGreaterThan(2);
    const withProgram = beats
      .map((e) => describeEntry(e, run.state).text)
      .filter((t) => t.includes('BIOL'));
    expect(withProgram.length).toBeGreaterThan(0);
    for (const t of beats.map((e) => describeEntry(e, run.state).text)) {
      expect(t).not.toContain('{');
      expect(t.endsWith('.')).toBe(true);
    }
  });
});

describe('four years and out', () => {
  it('graduates them with one of their class’s own outcomes', () => {
    const run = years(7);
    const done = run.state.people.named.filter((s) => s.status === 'graduated');
    expect(done.length).toBeGreaterThan(0);
    for (const s of done) {
      expect(['distinguished', 'placed', 'adrift']).toContain(s.outcome);
      const last = s.beats[s.beats.length - 1]!;
      expect(ARCS.find((a) => a.id === last.arcId)!.stage).toBe(s.outcome);
    }
    // The draw follows the class's distribution: all-adrift graduates adrift.
    const rng = Rng.fromSeed(1);
    expect(pickOutcome(rng, { distinguished: 0, placed: 0, adrift: 10 })).toBe('adrift');
    expect(pickOutcome(rng, { distinguished: 0, placed: 0, adrift: 0 })).toBe('placed');
  });

  it('loses one of them when their class is losing people', () => {
    // A long run with nothing to study: attrition is steady, so somebody
    // the game was following goes home.
    const run = years(20);
    const gone = run.state.people.named.filter((s) => s.status === 'left');
    expect(gone.length).toBeGreaterThan(0);
    for (const s of gone) {
      expect(ARCS.find((a) => a.id === s.beats[s.beats.length - 1]!.arcId)!.stage).toBe('leaving');
      expect(s.outcome).toBeNull();
    }
  });
});

describe('the log and the save', () => {
  it('replays a run of named students exactly', () => {
    const run = years(9);
    expect(replay(run.state.seed, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
    const loaded = loadSaveFile(JSON.parse(JSON.stringify(serializeRun(run))));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.state.people.named).toEqual(run.state.people.named);
  });

  it('migrates a version-13 save: an old run followed nobody', () => {
    const run = years(5);
    const v13 = JSON.parse(JSON.stringify(serializeRun(run)));
    v13.version = 13;
    v13.state.schemaVersion = 13;
    delete v13.state.people.named;
    delete v13.state.people.nextStudentId;
    const loaded = loadSaveFile({ ...v13, log: [] });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.version).toBe(SCHEMA_VERSION);
      expect(loaded.save.state.people.named).toEqual([]);
      expect(loaded.save.state.people.nextStudentId).toBe(1);
    }
    const bad = JSON.parse(JSON.stringify(serializeRun(run)));
    bad.state.people.named[0].beats = 'no';
    expect(loadSaveFile(bad)).toMatchObject({ ok: false, reason: /named student/ });
  });
});
