import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildingById } from '../content/buildings.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { applyAction, canApply } from './actions.ts';
import { footprintIsClear, hasFoundersHall, orientedFootprint, placementAt } from './campus.ts';
import { dispatch, newRun, replay, tickRunWeeks } from './run.ts';
import { loadSaveFile } from './save.ts';
import { createNewGame, type GameState } from './state.ts';
import {
  foundingWoodland,
  GRID_HEIGHT,
  GRID_WIDTH,
  TERRAIN,
  terrainAt,
  tileKey,
} from './terrain.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;
const HALL = {
  type: 'placeBuilding',
  buildingId: 'founders-hall',
  col: 28,
  row: 28,
  rotated: false,
} as const;

function running(): GameState {
  return applyAction(applyAction(createNewGame(1), FOUND), HALL);
}

describe('terrain (DD §6.1)', () => {
  it('is the same land every time', () => {
    expect(foundingWoodland()).toEqual(foundingWoodland());
    expect(Object.keys(TERRAIN.woodland).length).toBeGreaterThan(200);
  });

  it('has a road along the south edge and a stream down the east', () => {
    expect(terrainAt(10, 62)).toBe('road');
    expect(terrainAt(0, 63)).toBe('road');
    expect(TERRAIN.stream.length).toBeGreaterThan(60);
    expect(TERRAIN.stream.every((t) => t.col > 50)).toBe(true);
    expect(terrainAt(32, 30)).toBeNull();
  });

  it('keeps the clearing clear and never plants on water or road', () => {
    for (const key of Object.keys(TERRAIN.woodland)) {
      expect(TERRAIN.blocked.has(key)).toBe(false);
    }
    expect(TERRAIN.woodland[tileKey(32, 30)]).toBeUndefined();
    expect(TERRAIN.woodland[tileKey(30, 32)]).toBeUndefined();
  });
});

describe('catalogue', () => {
  it('seeds every DD §14 category but landmarks', () => {
    const cats = new Set(BUILDINGS.map((b) => b.category));
    for (const c of ['academic', 'residential', 'dining', 'life', 'athletics', 'admin'])
      expect(cats.has(c as never)).toBe(true);
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(10);
  });

  it('marks exactly one landmark, Founders Hall', () => {
    expect(BUILDINGS.filter((b) => b.landmark).map((b) => b.id)).toEqual(['founders-hall']);
  });
});

describe('placement', () => {
  it('refuses water, road, and the edge', () => {
    const s = running();
    const lab = buildingById('lab').footprint;
    expect(footprintIsClear(s.campus, 0, 60, lab.w, lab.h)).toBe(false); // road
    const stream = TERRAIN.stream[10]!;
    expect(footprintIsClear(s.campus, stream.col - 2, stream.row, lab.w, lab.h)).toBe(false);
    expect(footprintIsClear(s.campus, GRID_WIDTH - 2, 10, lab.w, lab.h)).toBe(false);
    expect(footprintIsClear(s.campus, 10, GRID_HEIGHT - 1, lab.w, lab.h)).toBe(false);
  });

  it('fells the trees and lifts the paths under a new building', () => {
    let s = running();
    s = applyAction(s, { type: 'paint', tool: 'plant', col: 40, row: 40 });
    s = applyAction(s, { type: 'paint', tool: 'path', col: 41, row: 40 });
    expect(s.campus.trees[tileKey(40, 40)]).toBeDefined();
    s = applyAction(s, {
      type: 'placeBuilding',
      buildingId: 'lab',
      col: 40,
      row: 40,
      rotated: false,
    });
    expect(s.campus.placements).toHaveLength(2);
    expect(s.campus.trees[tileKey(40, 40)]).toBeUndefined();
    expect(s.campus.paths).not.toContain(tileKey(41, 40));
  });

  it('rotates a non-square footprint and refuses to rotate a square one', () => {
    expect(orientedFootprint({ w: 5, h: 3 }, true)).toEqual({ w: 3, h: 5 });
    expect(orientedFootprint({ w: 3, h: 3 }, true)).toEqual({ w: 3, h: 3 });
    const s = applyAction(running(), {
      type: 'placeBuilding',
      buildingId: 'lab',
      col: 40,
      row: 40,
      rotated: true,
    });
    expect(s.campus.placements[1]).toMatchObject({ w: 3, h: 5 });
  });

  it('allows only one Founders Hall, and only it while siting', () => {
    const founded = applyAction(createNewGame(1), FOUND);
    expect(
      canApply(founded, {
        type: 'placeBuilding',
        buildingId: 'lab',
        col: 40,
        row: 40,
        rotated: false,
      }),
    ).toMatchObject({ ok: false });
    const s = running();
    expect(canApply(s, HALL)).toMatchObject({ ok: false, reason: /already/ });
    expect(hasFoundersHall(s.campus)).toBe(true);
  });

  it('demolishes by placement id', () => {
    let s = applyAction(running(), {
      type: 'placeBuilding',
      buildingId: 'lab',
      col: 40,
      row: 40,
      rotated: false,
    });
    const id = placementAt(s.campus, 41, 41)!.id;
    s = applyAction(s, { type: 'demolish', placementId: id });
    expect(placementAt(s.campus, 41, 41)).toBeUndefined();
    expect(canApply(s, { type: 'demolish', placementId: id })).toMatchObject({ ok: false });
  });

  it('gives each placement a fresh id even after demolition', () => {
    let s = applyAction(running(), {
      type: 'placeBuilding',
      buildingId: 'lab',
      col: 40,
      row: 40,
      rotated: false,
    });
    s = applyAction(s, { type: 'demolish', placementId: 'p2' });
    s = applyAction(s, {
      type: 'placeBuilding',
      buildingId: 'lab',
      col: 40,
      row: 40,
      rotated: false,
    });
    expect(s.campus.placements.map((p) => p.id)).toEqual(['p1', 'p3']);
  });
});

describe('paint tools', () => {
  it('paves, lifts, plants, and fells with the rules', () => {
    let s = running();
    expect(canApply(s, { type: 'paint', tool: 'path', col: 28, row: 28 })).toMatchObject({
      ok: false,
    }); // under the hall
    expect(canApply(s, { type: 'paint', tool: 'path', col: 5, row: 62 })).toMatchObject({
      ok: false,
    }); // road
    s = applyAction(s, { type: 'paint', tool: 'path', col: 20, row: 20 });
    expect(s.campus.paths).toContain(tileKey(20, 20));
    expect(canApply(s, { type: 'paint', tool: 'plant', col: 20, row: 20 })).toMatchObject({
      ok: false,
    });
    s = applyAction(s, { type: 'paint', tool: 'erasePath', col: 20, row: 20 });
    s = applyAction(s, { type: 'paint', tool: 'plant', col: 20, row: 20 });
    expect(s.campus.trees[tileKey(20, 20)]).toBeGreaterThanOrEqual(0);
    s = applyAction(s, { type: 'paint', tool: 'fell', col: 20, row: 20 });
    expect(s.campus.trees[tileKey(20, 20)]).toBeUndefined();
  });

  it('plants the same tree on replay', () => {
    let run = newRun(77);
    run = dispatch(run, FOUND);
    run = dispatch(run, HALL);
    run = dispatch(run, { type: 'paint', tool: 'plant', col: 20, row: 20 });
    run = tickRunWeeks(run, 5);
    run = dispatch(run, { type: 'paint', tool: 'plant', col: 21, row: 20 });
    expect(replay(77, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });
});

describe('save migration v2 → v3', () => {
  it('migrates a v2 run and rewrites its logged founding action', () => {
    const v2 = {
      version: 2,
      savedAt: '2026-01-01T00:00:00.000Z',
      seed: 5,
      state: {
        schemaVersion: 2,
        phase: 'running',
        identity: {
          name: 'Old',
          motif: 'gothic',
          paletteId: 'maroon-gold',
          colors: { primary: '#7b1e2b', secondary: '#f2c14e' },
        },
        campus: {
          placements: [
            { id: 'founders-hall', buildingId: 'founders-hall', col: 28, row: 28, w: 7, h: 5 },
          ],
        },
        seed: 5,
        rng: [1, 2, 3, 4],
        clock: { year: 1, term: 'fall', week: 4, absoluteWeek: 3 },
        marks: [],
      },
      log: [
        {
          week: 0,
          action: {
            type: 'found',
            name: 'Old',
            motif: 'gothic',
            paletteId: 'maroon-gold',
            colors: { primary: '#7b1e2b', secondary: '#f2c14e' },
          },
        },
        { week: 0, action: { type: 'placeFoundersHall', col: 28, row: 28 } },
      ],
    };
    const result = loadSaveFile(v2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state.campus.placements[0]).toMatchObject({
      id: 'p1',
      buildingId: 'founders-hall',
    });
    expect(result.save.state.campus.paths).toEqual([]);
    expect(result.save.state.campus.trees[tileKey(30, 30)]).toBeUndefined();
    expect(result.save.log[1]!.action).toEqual({
      type: 'placeBuilding',
      buildingId: 'founders-hall',
      col: 28,
      row: 28,
      rotated: false,
    });
    // The rewritten log replays to a running campus with the hall in place.
    const rebuilt = replay(5, result.save.log, 0);
    expect(rebuilt.phase).toBe('running');
    expect(hasFoundersHall(rebuilt.campus)).toBe(true);
  });
});
