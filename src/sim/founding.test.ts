import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../content/buildings.ts';
import { DEFAULT_MOTIF, MOTIF_CHOICES } from '../content/motifs.ts';
import { DEFAULT_PALETTE, pairIsReadable, PALETTES } from '../content/palettes.ts';
import { applyAction, canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import {
  footprintIsClear,
  foundersHallFootprint,
  GRID_HEIGHT,
  GRID_WIDTH,
  hasFoundersHall,
} from './campus.ts';
import { institutionName, MOTIFS } from './identity.ts';
import { dispatch, newRun, replay, tickRunWeeks } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { clockRuns, createNewGame, SCHEMA_VERSION } from './state.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'gothic',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

describe('content: identity', () => {
  it('offers every motif exactly once, Georgian first', () => {
    expect(MOTIF_CHOICES.map((m) => m.id)).toEqual([...MOTIFS]);
    expect(DEFAULT_MOTIF).toBe('georgian');
  });

  it('offers eight readable colour pairs (DD §14)', () => {
    expect(PALETTES).toHaveLength(8);
    for (const p of PALETTES) expect(pairIsReadable(p), p.name).toBe(true);
    expect(pairIsReadable({ primary: '#f7f2e8', secondary: '#ffffff' })).toBe(false);
  });

  it('has Founders Hall as a 7×5 academic building', () => {
    expect(BUILDINGS.map((b) => b.id)).toContain('founders-hall');
    expect(foundersHallFootprint()).toEqual({ w: 7, h: 5 });
  });
});

describe('founding (DD §2.4)', () => {
  it('starts in the founding phase with the clock stopped', () => {
    const s = createNewGame(1);
    expect(s.phase).toBe('founding');
    expect(s.identity).toBeNull();
    expect(clockRuns(s)).toBe(false);
  });

  it('found → siting, with the identity stamped', () => {
    const s = applyAction(createNewGame(1), FOUND);
    expect(s.phase).toBe('siting');
    expect(s.identity).toMatchObject({ name: 'Blackmoor', motif: 'gothic' });
    expect(institutionName(s.identity!)).toBe('Blackmoor College');
    expect(clockRuns(s)).toBe(false);
  });

  it('refuses founding twice or with a bad name', () => {
    const s = applyAction(createNewGame(1), FOUND);
    expect(canApply(s, FOUND)).toMatchObject({ ok: false });
    expect(canApply(createNewGame(1), { ...FOUND, name: '   ' })).toMatchObject({ ok: false });
    expect(applyAction(s, FOUND)).toBe(s);
  });

  it('placing Founders Hall is the first action and starts the clock', () => {
    const founded = applyAction(createNewGame(1), FOUND);
    expect(
      canApply(createNewGame(1), {
        type: 'placeBuilding',
        buildingId: 'founders-hall',
        col: 10,
        row: 10,
        rotated: false,
      }),
    ).toMatchObject({
      ok: false,
    });
    const placed = applyAction(founded, {
      type: 'placeBuilding',
      buildingId: 'founders-hall',
      col: 10,
      row: 10,
      rotated: false,
    });
    expect(placed.phase).toBe('running');
    expect(hasFoundersHall(placed.campus)).toBe(true);
    expect(placed.campus.placements[0]).toMatchObject({ id: 'p1', col: 10, row: 10, w: 7, h: 5 });
    expect(clockRuns(placed)).toBe(true);
  });

  it('keeps the hall on the parcel', () => {
    const founded = applyAction(createNewGame(1), FOUND);
    for (const [col, row] of [
      [-1, 0],
      [GRID_WIDTH - 6, 0],
      [0, GRID_HEIGHT - 4],
      [1.5, 2],
    ]) {
      expect(
        canApply(founded, {
          type: 'placeBuilding',
          buildingId: 'founders-hall',
          col: col!,
          row: row!,
          rotated: false,
        }),
      ).toMatchObject({
        ok: false,
      });
    }
    // The road along the south edge is never buildable.
    expect(
      footprintIsClear(
        { placements: [], paths: [], trees: {}, quadNames: {}, nextPlacementId: 1 },
        0,
        59,
        7,
        5,
      ),
    ).toBe(false);
  });

  it('detects overlap', () => {
    const campus = {
      placements: [
        {
          id: 'a',
          buildingId: 'a',
          col: 10,
          row: 10,
          w: 7,
          h: 5,
          status: 'open' as const,
          completesWeek: null,
          openedWeek: 0,
          backlog: 0,
          condition: 1,
        },
      ],
      paths: [],
      trees: {},
      quadNames: {},
      nextPlacementId: 2,
    };
    expect(footprintIsClear(campus, 16, 14, 7, 5)).toBe(false);
    expect(footprintIsClear(campus, 17, 10, 7, 5)).toBe(true);
    expect(footprintIsClear(campus, 10, 15, 7, 5)).toBe(true);
  });

  it('dispatch drops a refused action without logging it', () => {
    const run = newRun(1);
    const same = dispatch(run, {
      type: 'placeBuilding',
      buildingId: 'founders-hall',
      col: 1,
      row: 1,
      rotated: false,
    });
    expect(same).toBe(run);
    expect(same.log).toHaveLength(0);
  });

  it('replays the whole opening from the log', () => {
    let run = newRun(2024);
    run = dispatch(run, FOUND);
    run = dispatch(run, {
      type: 'placeBuilding',
      buildingId: 'founders-hall',
      col: 20,
      row: 22,
      rotated: false,
    });
    run = tickRunWeeks(run, 40, defaultResolution);
    run = dispatch(run, { type: 'debug/mark', label: 'year two' });
    expect(run.state.clock.absoluteWeek).toBe(40);
    expect(replay(2024, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });
});

describe('save migration v1 → v2', () => {
  it('migrates a version-1 file to the founding phase', () => {
    const v1 = {
      version: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      seed: 5,
      state: {
        schemaVersion: 1,
        seed: 5,
        rng: [1, 2, 3, 4],
        clock: { year: 2, term: 'spring', week: 3, absoluteWeek: 52 },
        marks: [],
      },
      log: [],
    };
    const result = loadSaveFile(v1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.version).toBe(SCHEMA_VERSION);
    expect(result.save.state).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      phase: 'founding',
      identity: null,
      campus: { placements: [] },
      clock: { absoluteWeek: 52 },
    });
  });

  it('round-trips a founded run', () => {
    let run = newRun(9);
    run = dispatch(run, FOUND);
    run = dispatch(run, {
      type: 'placeBuilding',
      buildingId: 'founders-hall',
      col: 28,
      row: 28,
      rotated: false,
    });
    const result = loadSaveFile(JSON.parse(JSON.stringify(serializeRun(run))));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save.state).toEqual(run.state);
  });

  it('rejects a running save with no identity', () => {
    const run = newRun(9);
    const raw = JSON.parse(JSON.stringify(serializeRun(run)));
    raw.state.phase = 'running';
    expect(loadSaveFile(raw)).toMatchObject({ ok: false, reason: /identity/ });
  });
});
