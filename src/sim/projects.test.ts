import { describe, expect, it } from 'vitest';
import { buildingById } from '../content/buildings.ts';
import { ENDOWMENT_PROJECT_SHARE } from '../tuning.ts';
import { canApply } from './actions.ts';
import { dealDecade, decadeTurn } from './ambitions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import type { Placement } from './campus.ts';
import { played } from './colleges.ts';
import { canPay } from './estate.ts';
import { axisReadings, projectBoosts } from './prestige.ts';
import { dispatch, tickRunWeeks } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';

// PROJECTS AND PROMISES FOR THE MIDDLE YEARS (Phase 42).

const mid = played(4, 16).state;

function withOpen(state: GameState, buildingId: string, condition = 1): GameState {
  const def = buildingById(buildingId);
  const p: Placement = {
    ...state.campus.placements[0]!,
    id: `p-${buildingId}`,
    buildingId,
    col: 0,
    row: 0,
    w: def.footprint.w,
    h: def.footprint.h,
    status: 'open',
    condition,
    backlog: 0,
  };
  return { ...state, campus: { ...state.campus, placements: [...state.campus.placements, p] } };
}

describe('capital projects', () => {
  it('wait for their year', () => {
    const early = played(4, 5).state;
    const verdict = canApply(early, {
      type: 'placeBuilding',
      buildingId: 'research-park',
      col: 2,
      row: 2,
      rotated: false,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/not before Year 12/);
  });

  it('can be paid for out of the endowment, up to a share of it, and nothing else can', () => {
    const rich: GameState = { ...mid, treasury: { ...mid.treasury, endowment: 200_000_000 } };
    expect(canPay(rich, 200_000_000 * ENDOWMENT_PROJECT_SHARE, 'endowment')).toBe(true);
    expect(canPay(rich, 200_000_000 * ENDOWMENT_PROJECT_SHARE + 1, 'endowment')).toBe(false);
    const verdict = canApply(rich, {
      type: 'placeBuilding',
      buildingId: 'library',
      col: 2,
      row: 2,
      rotated: false,
      financing: 'endowment',
    });
    expect(verdict.ok).toBe(false);
  });

  it('lift the standings they are about once they open, by their condition', () => {
    const base = axisReadings(mid);
    const park = withOpen(mid, 'research-park');
    expect(projectBoosts(park).research).toBe(
      buildingById('research-park').project!.boosts.research,
    );
    expect(axisReadings(park).research).toBeGreaterThan(base.research);
    expect(projectBoosts(withOpen(mid, 'research-park', 0.5)).research).toBeCloseTo(
      buildingById('research-park').project!.boosts.research! / 2,
    );
  });

  it('keeps Medicine for the medical school, and the medical school for Medicine', () => {
    const s = withOpen(mid, 'medical-school');
    const hall = s.campus.placements.at(-1)!;
    const other = s.campus.placements.find(
      (p) =>
        p.buildingId === 'academic-hall' &&
        !s.academics.schools.some((x) => x.placementId === p.id),
    );
    const cash: GameState = { ...s, treasury: { ...s.treasury, cash: 50_000_000 } };
    expect(
      canApply(cash, { type: 'foundSchool', schoolId: 'medicine', placementId: hall.id }).ok,
    ).toBe(true);
    const law = s.academics.schools.some((x) => x.schoolId === 'law') ? 'business' : 'law';
    expect(canApply(cash, { type: 'foundSchool', schoolId: law, placementId: hall.id }).ok).toBe(
      false,
    );
    if (other)
      expect(
        canApply(cash, { type: 'foundSchool', schoolId: 'medicine', placementId: other.id }).ok,
      ).toBe(false);
  });
});

describe('the decade ahead', () => {
  it('turns at Years 11, 21, 31 and 41', () => {
    expect([1, 10, 11, 20, 21, 31, 41, 51].map(decadeTurn)).toEqual([
      false,
      false,
      true,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it('deals a list at the first Board Meeting of a decade, and stops for it', () => {
    let run = played(4, 10);
    // To the Board Meeting of Year 11, answering anything else by default.
    for (let i = 0; i < WEEKS_PER_YEAR * 2; i++) {
      if (run.state.pendingBeat === 'board-meeting' && run.state.clock.year === 11) break;
      const held = defaultResolution(run.state);
      run = held ? dispatch(run, held) : tickRunWeeks(run, 1);
    }
    expect(run.state.clock.year).toBe(11);
    expect(run.state.pendingBeat).toBe('board-meeting');
    expect(run.state.ambitions.decadeOffer?.length ?? 0).toBeGreaterThan(0);
  });

  it('takes up to two from the list, and taking none is free', () => {
    const at11: GameState = {
      ...mid,
      clock: { ...mid.clock, year: 11 },
      ambitions: { ...mid.ambitions, active: [] },
    };
    const dealt = dealDecade(at11);
    const list = dealt.ambitions.decadeOffer!;
    expect(list.length).toBeGreaterThan(1);
    const pending: GameState = { ...dealt, pendingBeat: 'board-meeting' };
    const run = { state: pending, log: [] };
    const took = dispatch(run, {
      type: 'resolveBeat',
      beatId: 'board-meeting',
      pickAmbitions: list,
    });
    expect(took.state.ambitions.active).toHaveLength(Math.min(2, list.length));
    expect(took.state.ambitions.decadeOffer).toBeNull();
    expect(entriesOfKind(took.state, 'ambitionAccepted').length).toBeGreaterThan(0);
    const none = dispatch(run, { type: 'resolveBeat', beatId: 'board-meeting' });
    expect(none.state.ambitions.active).toHaveLength(0);
    expect(none.state.distress.confidence).toBe(pending.distress.confidence);
  });

  it('migrates a version-30 save', () => {
    const run = played(4, 2);
    const v30 = JSON.parse(JSON.stringify(serializeRun(run)));
    v30.version = 30;
    v30.state.schemaVersion = 30;
    delete v30.state.ambitions.decadeOffer;
    const loaded = loadSaveFile(v30);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.version).toBe(SCHEMA_VERSION);
      expect(loaded.save.state.ambitions.decadeOffer).toBeNull();
    }
  });
});
