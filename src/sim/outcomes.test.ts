import { describe, expect, it } from 'vitest';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  ATTRITION_BASE,
  OUTCOME_ADRIFT_BASE,
  QUALITY_DRIFT,
  RUNG_SATISFACTION_PENALTY,
  SATISFACTION_BASE,
} from '../tuning.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { RUNG_AUSTERITY, RUNG_SOUND } from './distress.ts';
import { teachingQuality } from './faculty.ts';
import {
  attritionRate,
  driftedQuality,
  enrolled,
  outcomeScore,
  outcomesFor,
  satisfactionBreakdown,
  satisfactionFor,
} from './people.ts';
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

function opened(seed = 4): Run {
  return dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
}

describe('satisfaction as a sum of terms (DD §8.3)', () => {
  it('adds up, and the ladder costs every cohort', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 2, defaultResolution);
    const total = enrolled(run.state);
    expect(total).toBeGreaterThan(0);
    const b = satisfactionBreakdown(run.state, total);
    const sum =
      b.base +
      b.housing +
      b.dining +
      b.seats +
      b.condition +
      b.teaching +
      b.morale +
      b.beauty +
      b.conditions;
    expect(b.total).toBe(Number(Math.min(100, Math.max(0, sum)).toFixed(1)));
    expect(b.base).toBe(SATISFACTION_BASE);
    expect(b.beauty).toBe(0); // the stub sits at the middle
    expect(b.conditions).toBe(-RUNG_SATISFACTION_PENALTY[RUNG_SOUND]);
    expect(satisfactionFor(run.state, total)).toBe(b.total);
    const austere = { ...run.state, distress: { ...run.state.distress, rung: RUNG_AUSTERITY } };
    expect(satisfactionBreakdown(austere, total).conditions).toBe(
      -RUNG_SATISFACTION_PENALTY[RUNG_AUSTERITY],
    );
    expect(satisfactionFor(austere, total)).toBeCloseTo(
      b.total - RUNG_SATISFACTION_PENALTY[RUNG_AUSTERITY],
      1,
    );
  });

  it('attrition rises with unhappiness and again with weakness', () => {
    expect(attritionRate(80)).toBe(ATTRITION_BASE);
    expect(attritionRate(80, 80)).toBe(ATTRITION_BASE);
    expect(attritionRate(80, 20)).toBeGreaterThan(attritionRate(80, 40));
    expect(attritionRate(40, 20)).toBeGreaterThan(attritionRate(40, 60));
    expect(attritionRate(0, 0)).toBeLessThanOrEqual(0.35);
  });
});

describe('quality drifts toward the teaching (DD §8.3)', () => {
  it('closes part of the gap each year', () => {
    expect(driftedQuality(60, 20)).toBe(60 + (20 - 60) * QUALITY_DRIFT);
    expect(driftedQuality(40, 80)).toBe(40 + (80 - 40) * QUALITY_DRIFT);
    expect(driftedQuality(50, 50)).toBe(50);
  });

  it('a class taught by nobody loses quality at its second Convocation', () => {
    let run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 2, defaultResolution);
    const first = run.state.people.cohorts[0]!;
    expect(teachingQuality(run.state)).toBe(0);
    run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
    const later = run.state.people.cohorts.find((c) => c.classYear === first.classYear)!;
    expect(later.quality).toBe(driftedQuality(first.quality, 0));
    expect(later.quality).toBeLessThan(first.quality);
  });
});

describe('outcomes (DD §8.3)', () => {
  it('scores a class and splits it into counts that sum to the class', () => {
    expect(outcomeScore(100, 0)).toBe(70);
    for (const [q, s, n] of [
      [90, 90, 120],
      [50, 50, 77],
      [10, 10, 33],
      [0, 0, 0],
    ] as const) {
      const o = outcomesFor(q, s, n);
      expect(o.distinguished + o.placed + o.adrift).toBe(n);
      expect(o.distinguished).toBeGreaterThanOrEqual(0);
      expect(o.adrift).toBeGreaterThanOrEqual(0);
    }
    expect(outcomesFor(90, 90, 100).distinguished).toBeGreaterThan(
      outcomesFor(60, 60, 100).distinguished,
    );
    expect(outcomesFor(20, 20, 100).adrift).toBeGreaterThan(outcomesFor(60, 60, 100).adrift);
    expect(outcomesFor(50, 50, 100)).toEqual({
      distinguished: 0,
      placed: 100 - Math.round(100 * OUTCOME_ADRIFT_BASE),
      adrift: Math.round(100 * OUTCOME_ADRIFT_BASE),
    });
  });

  it('stamps the ledger at Commencement, and the journal counts them', () => {
    let run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 6, defaultResolution);
    const alumni = run.state.people.alumni;
    expect(alumni.length).toBeGreaterThan(0);
    for (const a of alumni) {
      expect(a.outcomes).toEqual(outcomesFor(a.quality, a.satisfaction, a.size));
      expect(a.outcomes.distinguished + a.outcomes.placed + a.outcomes.adrift).toBe(a.size);
    }
    const graduated = entriesOfKind(run.state, 'classGraduated')[0]!;
    expect(graduated.distinguished + graduated.adrift).toBeLessThanOrEqual(graduated.size);
    const text = describeEntry(graduated, run.state).text;
    expect(text).toMatch(/^The Class of .* graduates, \d+ strong/);
    if (graduated.adrift > 0) expect(text).toContain(`${graduated.adrift} adrift`);
    expect(replay(run.state.seed, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
    run = tickRunWeeks(run, 3, defaultResolution);
    const file = JSON.parse(JSON.stringify(serializeRun(run)));
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
  });

  it('migrates a version-11 save, scoring old classes from what they left with', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 6, defaultResolution);
    const v11 = JSON.parse(JSON.stringify(serializeRun(run)));
    v11.version = 11;
    v11.state.schemaVersion = 11;
    for (const a of v11.state.people.alumni) delete a.outcomes;
    const replayed = loadSaveFile(v11);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) {
      expect(replayed.save.version).toBe(SCHEMA_VERSION);
      expect(replayed.save.state).toEqual(run.state);
    }
    const fallen = loadSaveFile({ ...v11, log: [] });
    expect(fallen.ok).toBe(true);
    if (fallen.ok) {
      const a = fallen.save.state.people.alumni[0]!;
      expect(a.outcomes).toEqual(outcomesFor(a.quality, a.satisfaction, a.size));
    }
    const bad = JSON.parse(JSON.stringify(serializeRun(run)));
    bad.state.people.alumni[0].outcomes = { distinguished: 1 };
    expect(loadSaveFile(bad)).toMatchObject({ ok: false, reason: /alumni class/ });
  });
});
