import { describe, expect, it } from 'vitest';
import { PAIRINGS, QUAD_NAMES } from '../content/placement.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  PAIRING_RADIUS,
  PLACEMENT_CAP,
  QUAD_MAX_AREA,
  QUAD_MIN_AREA,
  QUAD_MIN_ENCLOSURE,
  QUAD_PATH_WEIGHT,
} from '../tuning.ts';
import { canApply } from './actions.ts';
import { beautyTerms } from './beauty.ts';
import { defaultResolution } from './beats.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import type { Campus, Placement } from './campus.ts';
import {
  gapBetween,
  pairingResults,
  placementPoolEffect,
  placementSatisfaction,
} from './placement.ts';
import { detectQuads, quadAt } from './quads.ts';
import { foundingWoodland } from './terrain.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';

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
    col: 44,
    row: 44,
    rotated: false,
  });
}

let nextId = 100;
function at(buildingId: string, col: number, row: number, w: number, h: number): Placement {
  return {
    id: `q${nextId++}`,
    buildingId,
    col,
    row,
    w,
    h,
    status: 'open',
    completesWeek: null,
    openedWeek: 0,
    backlog: 0,
    condition: 1,
  };
}

function campusOf(
  placements: Placement[],
  paths: string[] = [],
  trees: Record<string, number> = {},
): Campus {
  return { placements, paths, trees, quadNames: {}, nextPlacementId: 1 };
}

// Four buildings around an open six-by-six: cols 22–27, rows 22–27.
const COURT: Placement[] = [
  at('library', 21, 17, 7, 5), // north, covering row 21 across the gap
  at('library', 22, 28, 7, 5), // south
  at('academic-hall', 17, 22, 5, 7), // west, turned
  at('academic-hall', 28, 21, 5, 7), // east, turned
];

function withCampus(state: GameState, campus: Campus): GameState {
  return { ...state, campus };
}

describe('quad detection (DD §6.2)', () => {
  it('finds the space four buildings enclose, and names it', () => {
    const quads = detectQuads(campusOf(COURT));
    expect(quads).toHaveLength(1);
    const q = quads[0]!;
    expect(q.area).toBe(36);
    expect(q.enclosure).toBe(1);
    expect(q.green).toBe(1);
    expect(q.quality).toBe(1);
    expect(q.key).toBe('22,22'); // the anchor: its first tile, row-major
    expect(QUAD_NAMES).toContain(q.name);
    expect(q.centre).toEqual({ col: 25, row: 25 });
    expect(quadAt(campusOf(COURT), '22,22')?.name).toBe(q.name);
    expect(quadAt(campusOf(COURT), '0,0')).toBeNull();
  });

  it('is not fooled by open ground, a gap in the wall, or the whole campus', () => {
    expect(detectQuads(campusOf([]))).toEqual([]);
    expect(detectQuads(campusOf([at('library', 21, 17, 7, 5)]))).toEqual([]);
    // Slide the east hall away and the space drains out to the parcel edge.
    const leaky = [...COURT.slice(0, 3), at('academic-hall', 34, 21, 5, 7)];
    expect(detectQuads(campusOf(leaky))).toEqual([]);
    // A yard smaller than the minimum is a gap between buildings, not a quad.
    const tight = [
      at('library', 21, 17, 7, 5),
      at('library', 21, 23, 7, 5),
      at('academic-hall', 17, 22, 5, 1),
      at('academic-hall', 28, 22, 5, 1),
    ];
    const small = detectQuads(campusOf(tight));
    expect(small.every((q) => q.area >= QUAD_MIN_AREA)).toBe(true);
    expect(QUAD_MIN_AREA).toBeGreaterThan(1);
    expect(QUAD_MAX_AREA).toBeGreaterThan(QUAD_MIN_AREA);
    expect(QUAD_MIN_ENCLOSURE).toBeGreaterThan(0.5);
  });

  // PHASE 21C. A court with a way into it is still a court, paving encloses
  // ground as well as walls do, and neither change may cut a green in two.
  // A ring of wall one tile thick around cols 22–27, rows 22–27, with a gap
  // of `gap` tiles in the middle of its north side.
  function ring(gap: number): Placement[] {
    const north =
      gap === 0
        ? [at('library', 21, 21, 8, 1)]
        : [at('library', 21, 21, 3, 1), at('library', 24 + gap, 21, 5 - gap, 1)];
    return [
      ...north,
      at('library', 21, 28, 8, 1),
      at('academic-hall', 21, 22, 1, 6),
      at('academic-hall', 28, 22, 1, 6),
    ];
  }

  it('lets a court keep its doorway, and counts the doorway against it', () => {
    const closed = detectQuads(campusOf(ring(0)))[0]!;
    expect(closed.area).toBe(36);
    expect(closed.enclosure).toBe(1);
    // A gap a player leaves to walk through does not drain the court into
    // the rest of the campus any more — it is a doorway, and the court is
    // still a court, one short of a closed one.
    const oneWide = detectQuads(campusOf(ring(1)))[0]!;
    expect(oneWide.area).toBe(36);
    expect(oneWide.enclosure).toBeLessThan(1);
    expect(oneWide.enclosure).toBeGreaterThan(QUAD_MIN_ENCLOSURE);
    const twoWide = detectQuads(campusOf(ring(2)))[0]!;
    expect(twoWide.area).toBe(36);
    expect(twoWide.enclosure).toBeLessThan(oneWide.enclosure);
    // Past the doorway width it is a missing wall, not a door, and the
    // ground runs out into the campus as it always did.
    expect(detectQuads(campusOf(ring(3)))).toEqual([]);
  });

  it('seals holes in walls, not narrow ground', () => {
    // A light well: two tiles wide, eight deep, walled all round. Narrow,
    // but it is not a hole in anything, so it survives.
    const well = [
      at('library', 21, 21, 4, 1),
      at('library', 21, 30, 4, 1),
      at('academic-hall', 21, 22, 1, 8),
      at('academic-hall', 24, 22, 1, 8),
    ];
    expect(detectQuads(campusOf(well))[0]!.area).toBe(16);
    // An alley between two halls, open at both ends, is a way through and
    // not an enclosed space; sealing it would have invented walls.
    expect(
      detectQuads(campusOf([at('library', 20, 20, 8, 2), at('library', 20, 24, 8, 2)])),
    ).toEqual([]);
  });

  it('lets paving enclose ground, at less than a wall’s weight', () => {
    const paths: string[] = [];
    for (let c = 20; c <= 26; c++) paths.push(`${c},20`, `${c},26`);
    for (let r = 21; r <= 25; r++) paths.push(`20,${r}`, `26,${r}`);
    const drawn = detectQuads(campusOf([], paths));
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.area).toBe(25);
    expect(drawn[0]!.enclosure).toBeCloseTo(QUAD_PATH_WEIGHT, 3);
    expect(QUAD_PATH_WEIGHT).toBeLessThan(1);
    expect(QUAD_PATH_WEIGHT).toBeGreaterThanOrEqual(QUAD_MIN_ENCLOSURE);
    // A walk laid across a court is floor, not edge: the court stays one
    // court, and is worth less for being paved.
    const walked = detectQuads(
      campusOf(ring(0), ['22,25', '23,25', '24,25', '25,25', '26,25', '27,25']),
    );
    expect(walked).toHaveLength(1);
    expect(walked[0]!.area).toBe(36);
    expect(walked[0]!.green).toBeLessThan(1);
    expect(walked[0]!.quality).toBeLessThan(1);
  });

  it('is worth less when it is paved over, and feeds beauty’s enclosure', () => {
    const green = campusOf(COURT);
    const paved = campusOf(COURT, detectQuads(green)[0]!.tiles.slice(0, 18));
    const a = detectQuads(green)[0]!;
    const b = detectQuads(paved)[0]!;
    expect(b.green).toBe(0.5);
    expect(b.quality).toBeLessThan(a.quality);
    const run = opened();
    expect(beautyTerms(withCampus(run.state, campusOf([]))).enclosure).toBe(0);
    const scored = beautyTerms(withCampus(run.state, green));
    expect(scored.enclosure).toBeGreaterThan(0);
    expect(scored.score).toBeGreaterThan(beautyTerms(withCampus(run.state, campusOf([]))).score);
  });

  it('keeps the name the player gives it, and gives it back', () => {
    let run = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    run = { ...run, state: withCampus(run.state, campusOf(COURT)) };
    const auto = detectQuads(run.state.campus)[0]!.name;
    expect(canApply(run.state, { type: 'nameQuad', key: 'nowhere', name: 'X' })).toMatchObject({
      ok: false,
      reason: /no quad/,
    });
    expect(
      canApply(run.state, { type: 'nameQuad', key: '22,22', name: 'x'.repeat(60) }),
    ).toMatchObject({ ok: false, reason: /too long/ });
    run = dispatch(run, { type: 'nameQuad', key: '22,22', name: '  The Sundial  ' });
    expect(run.state.campus.quadNames).toEqual({ '22,22': 'The Sundial' });
    expect(detectQuads(run.state.campus)[0]!.name).toBe('The Sundial');
    run = dispatch(run, { type: 'nameQuad', key: '22,22', name: '   ' });
    expect(run.state.campus.quadNames).toEqual({});
    expect(detectQuads(run.state.campus)[0]!.name).toBe(auto);
  });
});

describe('pairings (DD §6.2)', () => {
  it('measures the gap between footprints, edge to edge', () => {
    const a = at('library', 10, 10, 7, 5);
    expect(gapBetween(a, at('dining-hall', 17, 10, 5, 4))).toBe(0); // touching
    expect(gapBetween(a, at('dining-hall', 20, 10, 5, 4))).toBe(3);
    expect(gapBetween(a, at('dining-hall', 10, 20, 5, 4))).toBe(5);
    expect(gapBetween(a, at('dining-hall', 11, 11, 5, 4))).toBe(0); // overlapping
  });

  it('pays the share of each kind that has its partner within a short walk', () => {
    const run = opened();
    const none = pairingResults(withCampus(run.state, campusOf([])));
    expect(none.every((r) => r.total === 0 && r.points === 0)).toBe(true);
    const near = campusOf([
      at('residence-hall', 10, 10, 9, 4),
      at('dining-hall', 10, 16, 5, 4),
      at('residence-hall', 40, 40, 9, 4),
    ]);
    const dorms = pairingResults(withCampus(run.state, near)).find(
      (r) => r.def.id === 'dorm-dining',
    )!;
    expect(dorms.total).toBe(2);
    expect(dorms.paired).toBe(1); // the far hall is a long walk from breakfast
    expect(dorms.points).toBeCloseTo(dorms.def.points / 2, 3);
    const together = campusOf([
      at('residence-hall', 10, 10, 9, 4),
      at('residence-hall', 10, 20, 9, 4),
      at('dining-hall', 10, 16, 5, 4),
    ]);
    const both = pairingResults(withCampus(run.state, together)).find(
      (r) => r.def.id === 'dorm-dining',
    )!;
    expect(both.paired).toBe(2);
    expect(both.points).toBe(both.def.points);
    expect(PAIRING_RADIUS).toBeGreaterThan(0);
  });

  it('every rule names a side the catalogue has', () => {
    for (const p of PAIRINGS) expect(p.points).toBeGreaterThan(0);
    const run = opened();
    const all = campusOf([
      at('residence-hall', 10, 10, 9, 4),
      at('dining-hall', 10, 16, 5, 4),
      at('lab', 22, 10, 5, 3),
      at('academic-hall', 22, 14, 7, 5),
      at('recreation-center', 36, 10, 5, 4),
      at('playing-field', 36, 16, 12, 7),
      at('health-center', 5, 10, 3, 3),
      at('library', 30, 14, 7, 5),
      at('student-center', 5, 14, 5, 4),
    ]);
    const results = pairingResults(withCampus(run.state, all));
    expect(results.every((r) => r.total > 0)).toBe(true);
    expect(results.every((r) => r.paired === r.total)).toBe(true);
  });
});

describe('the cap (DD §6.2, guardrail §17.2)', () => {
  it('aggregates every placement effect once and clamps the total', () => {
    const run = opened();
    // A campus that does everything right: four quads, every pairing made,
    // and the buildings in good order.
    const lavish = campusOf(
      [
        ...COURT,
        at('residence-hall', 40, 10, 9, 4),
        at('dining-hall', 40, 16, 5, 4),
        at('student-center', 50, 10, 5, 4),
        at('health-center', 40, 5, 3, 3),
        at('lab', 52, 20, 5, 3),
        at('academic-hall', 52, 24, 7, 5),
        at('recreation-center', 5, 40, 5, 4),
        at('playing-field', 5, 46, 12, 7),
      ],
      [],
      foundingWoodland(),
    );
    const state = withCampus(run.state, lavish);
    expect(pairingResults(state).every((r) => r.paired === r.total && r.total > 0)).toBe(true);
    const sat = placementSatisfaction(state);
    expect(sat.terms.length).toBeGreaterThan(3);
    expect(sat.raw).toBeGreaterThan(sat.limit);
    expect(sat.capped).toBe(true);
    expect(sat.applied).toBe(sat.limit);
    expect(sat.limit).toBe(PLACEMENT_CAP * 100);
    // Satisfaction runs 0–100, so the cap is the share of the whole scale.
    expect(Math.abs(sat.applied)).toBeLessThanOrEqual(100 * PLACEMENT_CAP);
    const pool = placementPoolEffect(state);
    expect(Math.abs(pool.applied)).toBeLessThanOrEqual(PLACEMENT_CAP);
  });

  it('cannot dominate whatever the campus looks like', () => {
    const run = opened();
    const kinds = [
      'residence-hall',
      'dining-hall',
      'library',
      'academic-hall',
      'lab',
      'health-center',
      'student-center',
      'recreation-center',
    ];
    for (let trial = 0; trial < 60; trial++) {
      const placements: Placement[] = [];
      let seed = trial * 2654435761;
      const roll = (n: number) => {
        seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
        return seed % n;
      };
      for (let i = 0; i < 12; i++) {
        const id = kinds[roll(kinds.length)]!;
        const w = 3 + roll(6);
        const h = 3 + roll(5);
        const col = roll(60 - w);
        const row = roll(56 - h);
        if (
          placements.some(
            (p) => col < p.col + p.w && p.col < col + w && row < p.row + p.h && p.row < row + h,
          )
        )
          continue;
        placements.push(at(id, col, row, w, h));
      }
      const state = withCampus(run.state, campusOf(placements));
      const sat = placementSatisfaction(state);
      const pool = placementPoolEffect(state);
      expect(Math.abs(sat.applied)).toBeLessThanOrEqual(PLACEMENT_CAP * 100);
      expect(Math.abs(pool.applied)).toBeLessThanOrEqual(PLACEMENT_CAP);
      expect(sat.applied).toBe(
        Number(Math.max(-sat.limit, Math.min(sat.limit, sat.raw)).toFixed(3)),
      );
    }
  });

  it('is nothing on an empty parcel, and the default run is under it', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    const sat = placementSatisfaction(run.state);
    expect(sat.capped).toBe(false);
    expect(Math.abs(sat.applied)).toBeLessThan(sat.limit);
    expect(placementPoolEffect(run.state).capped).toBe(false);
  });
});

describe('the log and the save', () => {
  it('replays a renamed quad and survives a round trip', () => {
    let run = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    run = { ...run, state: withCampus(run.state, campusOf(COURT)) };
    run = dispatch(run, { type: 'nameQuad', key: '22,22', name: 'The Sundial' });
    const file = JSON.parse(JSON.stringify(serializeRun(run)));
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.state.campus.quadNames).toEqual({ '22,22': 'The Sundial' });
    // The action replays on the run's own campus, where the quad is real.
    let plain = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    plain = dispatch(plain, { type: 'debug/mark', label: 'no quad here' });
    expect(replay(plain.state.seed, plain.log, plain.state.clock.absoluteWeek)).toEqual(
      plain.state,
    );
  });

  it('migrates a version-12 save: no quad was ever named', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    const v12 = JSON.parse(JSON.stringify(serializeRun(run)));
    v12.version = 12;
    v12.state.schemaVersion = 12;
    delete v12.state.campus.quadNames;
    const loaded = loadSaveFile(v12);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.version).toBe(SCHEMA_VERSION);
      expect(loaded.save.state.campus.quadNames).toEqual({});
    }
    const bad = JSON.parse(JSON.stringify(serializeRun(run)));
    bad.state.campus.quadNames = { '1,1': 7 };
    expect(loadSaveFile(bad)).toMatchObject({ ok: false, reason: /quad name/ });
  });
});
