import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  BASE_APPLICANTS,
  BEAUTY_POOL_SWING,
  BEAUTY_WEIGHTS,
  GREENERY_TARGET_SHARE,
  LANDMARK_TARGET,
} from '../tuning.ts';
import { beautyPoolFactor, beautyTerms, campusBeauty } from './beauty.ts';
import { placementSatisfaction } from './placement.ts';
import { defaultResolution } from './beats.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { applicantPool, satisfactionBreakdown } from './people.ts';
import { dispatch, newRun, tickRunWeeks, type Run } from './run.ts';
import { TERRAIN } from './terrain.ts';

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

describe('campus beauty (DD §6.2)', () => {
  it('is greenery, landmarks and upkeep, weighted', () => {
    const run = opened();
    const t = beautyTerms(run.state);
    const woodland = Object.keys(TERRAIN.woodland).length;
    expect(woodland).toBeGreaterThan(50);
    expect(t.greenery).toBe(
      Math.min(1, Object.keys(run.state.campus.trees).length / (woodland * GREENERY_TARGET_SHARE)),
    );
    expect(t.landmarks).toBe(0); // nothing open yet
    expect(t.upkeep).toBe(1);
    expect(t.enclosure).toBe(0); // one building encloses nothing
    expect(t.score).toBe(
      Number((100 * (t.greenery * BEAUTY_WEIGHTS.greenery + BEAUTY_WEIGHTS.upkeep)).toFixed(1)),
    );
    expect(campusBeauty(run.state)).toBe(t.score);
  });

  it('rises when Founders Hall opens and when trees are planted, falls when they are felled', () => {
    let run = opened();
    const before = beautyTerms(run.state);
    run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
    const after = beautyTerms(run.state);
    expect(after.landmarks).toBe(Math.min(1, 3 / LANDMARK_TARGET));
    expect(after.score).toBeGreaterThan(before.score);
    const trees = Object.keys(run.state.campus.trees);
    const felled = dispatch(run, {
      type: 'paint',
      tool: 'fell',
      ...(trees[0]!.split(',').length === 2
        ? { col: Number(trees[0]!.split(',')[0]), row: Number(trees[0]!.split(',')[1]) }
        : { col: 0, row: 0 }),
    });
    if (felled !== run)
      expect(beautyTerms(felled.state).greenery).toBeLessThanOrEqual(after.greenery);
    const worn = {
      ...run.state,
      campus: {
        ...run.state.campus,
        placements: run.state.campus.placements.map((p) => ({ ...p, condition: 0.4 })),
      },
    };
    expect(beautyTerms(worn).upkeep).toBe(0.4);
    expect(campusBeauty(worn)).toBeLessThan(after.score);
  });

  it('moves the applicant pool by at most the cap either way, and the cohorts’ mood', () => {
    expect(beautyPoolFactor(50)).toBe(1);
    expect(beautyPoolFactor(100)).toBeCloseTo(1 + BEAUTY_POOL_SWING, 6);
    expect(beautyPoolFactor(0)).toBeCloseTo(1 - BEAUTY_POOL_SWING, 6);
    expect(BEAUTY_POOL_SWING).toBeLessThanOrEqual(0.12);
    const par = { tuition: 40_000, selectivity: 0.5 };
    expect(applicantPool(par)).toBe(BASE_APPLICANTS);
    expect(applicantPool(par, undefined, 1 + BEAUTY_POOL_SWING)).toBe(
      Math.round(BASE_APPLICANTS * (1 + BEAUTY_POOL_SWING)),
    );
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 2, defaultResolution);
    const b = satisfactionBreakdown(run.state, 100);
    expect(b.placement).toBe(placementSatisfaction(run.state).applied);
  });
});
