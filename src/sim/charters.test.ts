import { describe, expect, it } from 'vitest';
import { buildingById } from '../content/buildings.ts';
import type { CharterId } from '../content/charters.ts';
import { tagById } from '../content/identityTags.ts';
import {
  CHARTER_LEAN_FLOOR,
  CHARTER_PROJECT_SHARE,
  CHARTER_SCHOOL_SHARE,
  SCHOOL_FOUNDING_COST,
} from '../tuning.ts';
import { canApply } from './actions.ts';
import { annualGiving } from './alumni.ts';
import { buildCost, charterFade, charterLean, schoolFoundingCostFor } from './charter.ts';
import { played } from './colleges.ts';
import { institutionName } from './identity.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';
import { tagTeeth } from './tags.ts';

// BUILDS THAT DIVERGE (Phase 43): the founding charter, tags with teeth,
// and one grand landmark to a college.

const base = played(4, 12).state;

function chartered(state: GameState, charter: CharterId | null): GameState {
  return { ...state, identity: { ...state.identity!, charter } };
}

describe('the founding charter', () => {
  it('names the college and is carved on the facade', () => {
    expect(institutionName({ ...base.identity!, charter: null })).toBe('Blackmoor College');
    expect(institutionName({ ...base.identity!, charter: 'research-university' })).toBe(
      'Blackmoor University',
    );
    expect(institutionName({ ...base.identity!, charter: 'polytechnic' })).toBe(
      'Blackmoor Polytechnic',
    );
  });

  it('makes its school cheaper to found, and its project and landmark cheaper to build', () => {
    const s = chartered(base, 'polytechnic');
    expect(schoolFoundingCostFor(s, 'engineering')).toBe(
      SCHOOL_FOUNDING_COST * CHARTER_SCHOOL_SHARE,
    );
    expect(schoolFoundingCostFor(s, 'science')).toBe(SCHOOL_FOUNDING_COST);
    const park = buildingById('research-park');
    expect(buildCost(s, park)).toBe(Math.round(park.cost * CHARTER_PROJECT_SHARE));
    expect(buildCost(chartered(base, null), park)).toBe(park.cost);
    expect(buildCost(s, buildingById('great-dome'))).toBeLessThan(buildingById('great-dome').cost);
  });

  it('leans the standings its way, fading to a floor, never to nothing', () => {
    const s = chartered(base, 'research-university');
    const early = charterLean({ ...s, clock: { ...s.clock, year: 1 } }).research!;
    const late = charterLean({ ...s, clock: { ...s.clock, year: 45 } }).research!;
    expect(charterFade({ ...s, clock: { ...s.clock, year: 45 } })).toBe(0);
    expect(late).toBeCloseTo(early * CHARTER_LEAN_FLOOR);
    expect(charterLean(chartered(base, null))).toEqual({});
  });

  it('refuses a charter nobody wrote', () => {
    const fresh = { ...base, phase: 'founding' as const };
    expect(
      canApply(fresh, {
        type: 'found',
        name: 'X',
        motif: 'georgian',
        paletteId: 'p',
        colors: { primary: '#000', secondary: '#fff' },
        charter: 'seminary' as never,
      }).ok,
    ).toBe(false);
  });
});

describe('one grand landmark to a college', () => {
  it('refuses a second once the first stands', () => {
    const def = buildingById('campanile');
    const withOne: GameState = {
      ...base,
      campus: {
        ...base.campus,
        placements: [
          ...base.campus.placements,
          { ...base.campus.placements[0]!, id: 'g1', buildingId: 'campanile', w: 2, h: 2 },
        ],
      },
    };
    expect(def.group).toBe('grand');
    const verdict = canApply(withOne, {
      type: 'placeBuilding',
      buildingId: 'great-dome',
      col: 2,
      row: 2,
      rotated: false,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/grand landmark/);
  });
});

describe('tags with teeth', () => {
  it('each tag does one thing beyond the pool, and says what', () => {
    expect(tagById('research-powerhouse').teeth.lever).toBe('giving');
    const known: GameState = {
      ...base,
      perception: { ...base.perception, tags: ['research-powerhouse'] },
    };
    const plain: GameState = { ...base, perception: { ...base.perception, tags: [] } };
    expect(tagTeeth(known, 'giving')).toBeCloseTo(0.1);
    if (annualGiving(plain) > 0) expect(annualGiving(known)).toBeGreaterThan(annualGiving(plain));
  });
});

describe('the save', () => {
  it('migrates a version-31 save to a college without a charter', () => {
    const run = played(4, 2);
    const v31 = JSON.parse(JSON.stringify(serializeRun(run)));
    v31.version = 31;
    v31.state.schemaVersion = 31;
    delete v31.state.identity.charter;
    const loaded = loadSaveFile(v31);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.version).toBe(SCHEMA_VERSION);
      expect(loaded.save.state.identity?.charter).toBeNull();
    }
  });
});
