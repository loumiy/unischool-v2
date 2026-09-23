import { describe, expect, it } from 'vitest';
import { buildingById } from '../content/buildings.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import type { Placement } from './campus.ts';
import { opened, played } from './colleges.ts';
import {
  effectiveDef,
  extensionCost,
  freeLandShare,
  historicYear,
  landScarce,
  placementCapacity,
  storeyFactor,
} from './lateGame.ts';
import { campusCapacity } from './people.ts';
import { dispatch, tickRunWeeks, type Run } from './run.ts';
import type { GameState } from './state.ts';

// THE FULL-CANVAS LATE GAME (DD §6.5–§6.6, Phase 25). Done when a full map
// presents rebuild-vs-preserve dilemmas rather than a dead end.

const hall = (over: Partial<Placement> = {}): Placement => ({
  id: 'p90',
  buildingId: 'residence-hall',
  col: 10,
  row: 10,
  w: 9,
  h: 4,
  status: 'open',
  completesWeek: null,
  openedWeek: 0,
  backlog: 0,
  condition: 1,
  ...over,
});

function withPlacement(run: Run, p: Placement): Run {
  return {
    ...run,
    state: {
      ...run.state,
      campus: { ...run.state.campus, placements: [...run.state.campus.placements, p] },
    },
  };
}

describe('going up instead of out', () => {
  it('adds a storey: paid for, closed while it goes up, then holding more', () => {
    const base = withPlacement(tickRunWeeks(opened(4), 40, defaultResolution), hall());
    const before = campusCapacity(base.state).beds;
    const cash = base.state.treasury.cash;
    const up = dispatch(base, { type: 'extend', placementId: 'p90' });
    const p = up.state.campus.placements.find((x) => x.id === 'p90')!;
    expect(p.storeysAdded).toBe(1);
    expect(p.status).toBe('renovating');
    expect(up.state.treasury.cash).toBe(cash - extensionCost(p));
    expect(entriesOfKind(up.state, 'storeyAdded')).toHaveLength(1);
    const done = tickRunWeeks(up, 20, defaultResolution);
    const beds = campusCapacity(done.state).beds;
    const catalogue = buildingById('residence-hall').capacity!.beds!;
    expect(beds - before).toBe(Math.round(catalogue * storeyFactor(p)) - catalogue);
    expect(effectiveDef(p).storeys).toBe(5);
    expect(placementCapacity(p).beds).toBeGreaterThan(catalogue);
  });

  it('stops at two storeys, and never on a field or a gym', () => {
    const base = withPlacement(
      tickRunWeeks(opened(4), 40, defaultResolution),
      hall({ storeysAdded: 2 }),
    );
    expect(canApply(base.state, { type: 'extend', placementId: 'p90' })).toMatchObject({
      ok: false,
      reason: /as far/,
    });
    const gym = withPlacement(
      tickRunWeeks(opened(4), 40, defaultResolution),
      hall({ id: 'p91', buildingId: 'gymnasium', w: 7, h: 5 }),
    );
    expect(canApply(gym.state, { type: 'extend', placementId: 'p91' }).ok).toBe(false);
  });
});

describe('Historic', () => {
  it('comes to buildings of age, Founders Hall likeliest', () => {
    const run = played(4, 45);
    const historic = run.state.campus.placements.filter((p) => p.historic);
    expect(historic.length).toBeGreaterThan(0);
    for (const p of historic) expect(p.historicSince).toBeGreaterThanOrEqual(26);
    expect(entriesOfKind(run.state, 'becameHistoric')).toHaveLength(historic.length);
  });

  it('costs the alumni, the board and the students to take down, and brings a protest', () => {
    const base = withPlacement(
      tickRunWeeks(opened(4), WEEKS_PER_YEAR * 6, defaultResolution),
      hall({ historic: true, historicSince: 3 }),
    );
    const s0 = base.state;
    const down = dispatch(base, { type: 'demolish', placementId: 'p90' });
    const s1 = down.state;
    expect(s1.distress.confidence).toBeLessThan(s0.distress.confidence);
    expect(entriesOfKind(s1, 'historicDemolished')).toHaveLength(1);
    expect(s1.events.pending.some((p) => p.eventId === 'the-protest')).toBe(true);
    expect(s1.events.pending.find((p) => p.eventId === 'the-protest')!.vars.building).toBe(
      'Residence Hall',
    );
  });

  it('is only ever declared at the turn of the year', () => {
    const run = played(4, 30);
    const s: GameState = { ...run.state, clock: { ...run.state.clock, week: 5 } };
    expect(historicYear(s)).toBe(s);
  });
});

describe('the land', () => {
  it('reads how much ground is left, and calls it scarce when little is', () => {
    const s = opened(4).state;
    expect(freeLandShare(s.campus)).toBeGreaterThan(0.95);
    expect(landScarce(s.campus)).toBe(false);
    const crowded = {
      ...s.campus,
      placements: Array.from({ length: 80 }, (_, i) =>
        hall({ id: `x${i}`, col: (i % 8) * 8, row: Math.floor(i / 8) * 6, w: 7, h: 5 }),
      ),
    };
    expect(landScarce(crowded)).toBe(true);
  });
});
