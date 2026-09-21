import { describe, expect, it } from 'vitest';
import { buildingById, BUILDINGS } from '../content/buildings.ts';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  BACKLOG_GROWTH_RATE,
  DEBT_CAP_SHARE_OF_ENDOWMENT,
  DEMOLITION_COST_SHARE,
  DERELICT_CONDITION,
  RENOVATION_FEE_SHARE,
  RENOVATION_WEEKS,
  STARTING_CASH,
  UPKEEP_AGE_RATE,
} from '../tuning.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind, lastEntry } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import {
  annualUpkeep,
  borrowingRoom,
  conditionFor,
  debtCap,
  demolitionCost,
  renovationCost,
  totalBacklog,
  weeklyMaintenance,
} from './estate.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import type { GameState } from './state.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

const HALL = buildingById('founders-hall');
const LIBRARY = buildingById('library');

function opened(seed = 4): Run {
  return dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
}

const LIB = {
  type: 'placeBuilding',
  buildingId: 'library',
  col: 10,
  row: 10,
  rotated: false,
} as const;

function withCash(run: Run, cash: number): Run {
  return { ...run, state: { ...run.state, treasury: { ...run.state.treasury, cash } } };
}

// Run to the Budget & Hiring beat, approve next year at this maintenance
// funding, and carry on into the new year.
function fundedAt(run: Run, funding: number, weeks: number): Run {
  let r = tickRunWeeks(run, 31, defaultResolution);
  expect(r.state.pendingBeat).toBe('budget-and-hiring');
  r = dispatch(r, {
    type: 'resolveBeat',
    beatId: 'budget-and-hiring',
    maintenanceFunding: funding,
  });
  return tickRunWeeks(r, weeks, defaultResolution);
}

describe('the catalogue as economic objects', () => {
  it('prices every building', () => {
    for (const b of BUILDINGS) {
      expect(b.cost).toBeGreaterThan(0);
      expect(b.upkeep).toBeGreaterThanOrEqual(0);
      expect(b.buildWeeks).toBeGreaterThanOrEqual(1);
    }
  });

  it('upkeep grows with age and condition falls with backlog', () => {
    expect(annualUpkeep(HALL, 0)).toBe(HALL.upkeep);
    expect(annualUpkeep(HALL, 50)).toBe(Math.round(HALL.upkeep * (1 + 50 * UPKEEP_AGE_RATE)));
    expect(conditionFor(HALL, 0)).toBe(1);
    expect(conditionFor(HALL, HALL.cost * 0.25)).toBe(0.5);
    expect(conditionFor(HALL, HALL.cost)).toBe(0);
  });
});

describe('construction (DD §6.4, §5.2)', () => {
  it('charges the build cost and breaks ground', () => {
    const run = opened();
    const p = run.state.campus.placements[0]!;
    expect(run.state.treasury.cash).toBe(STARTING_CASH - HALL.cost);
    expect(run.state.treasury.capitalThisYear).toEqual({ spent: HALL.cost, borrowed: 0 });
    expect(p.status).toBe('building');
    expect(p.completesWeek).toBe(HALL.buildWeeks);
    expect(p.openedWeek).toBeNull();
    expect(lastEntry(run.state)).toMatchObject({ kind: 'doorsOpened' });
  });

  it('opens after its build weeks and journals it', () => {
    let run = tickRunWeeks(opened(), HALL.buildWeeks - 1, defaultResolution);
    expect(run.state.campus.placements[0]!.status).toBe('building');
    expect(weeklyMaintenance(run.state)).toBe(0);
    run = tickRunWeeks(run, 1, defaultResolution);
    const p = run.state.campus.placements[0]!;
    expect(p.status).toBe('open');
    expect(p.openedWeek).toBe(HALL.buildWeeks);
    expect(p.completesWeek).toBeNull();
    const done = entriesOfKind(run.state, 'buildingCompleted');
    expect(done).toHaveLength(1);
    expect(describeEntry(done[0]!, run.state).text).toBe('Founders Hall opens.');
    expect(weeklyMaintenance(run.state)).toBe(Math.round(HALL.upkeep / WEEKS_PER_YEAR));
  });

  it('refuses what the cash cannot cover, unless borrowed', () => {
    const poor = withCash(opened(), 1000);
    expect(canApply(poor.state, LIB)).toMatchObject({ ok: false, reason: /cash/ });
    expect(canApply(poor.state, { ...LIB, financing: 'debt' })).toMatchObject({ ok: true });
    const run = dispatch(poor, { ...LIB, financing: 'debt' });
    expect(run.state.treasury.cash).toBe(1000);
    expect(run.state.treasury.debt).toBe(LIBRARY.cost);
    expect(run.state.treasury.capitalThisYear.borrowed).toBe(LIBRARY.cost);
  });

  it('caps borrowing at the board’s share of the endowment', () => {
    const run = withCash(opened(), 0);
    const cap = Math.round(run.state.treasury.endowment * DEBT_CAP_SHARE_OF_ENDOWMENT);
    expect(debtCap(run.state)).toBe(cap);
    expect(borrowingRoom(run.state)).toBe(cap);
    let r = run;
    let placed = 0;
    for (let i = 0; i < 6; i++) {
      const next = dispatch(r, { ...LIB, col: 2 + i * 8, row: 2, financing: 'debt' });
      if (next === r) break;
      r = next;
      placed++;
    }
    expect(placed).toBe(Math.floor(cap / LIBRARY.cost));
    expect(canApply(r.state, { ...LIB, col: 50, row: 2, financing: 'debt' })).toMatchObject({
      ok: false,
      reason: /borrow/,
    });
  });

  it('services debt weekly and amortises it', () => {
    let run = dispatch(withCash(opened(), 0), { ...LIB, financing: 'debt' });
    const debt0 = run.state.treasury.debt;
    run = tickRunWeeks(run, 1, defaultResolution);
    const t = run.state.treasury;
    expect(t.lastWeek.expenses.debtService).toBeGreaterThan(0);
    expect(t.debt).toBeLessThan(debt0);
    const run20 = tickRunWeeks(run, WEEKS_PER_YEAR * 20, defaultResolution);
    expect(run20.state.treasury.debt).toBe(0);
    expect(run20.state.treasury.debtRepayment).toBe(0);
  });

  it('charges a share of the build cost to demolish', () => {
    const run = tickRunWeeks(opened(), 30, defaultResolution);
    const before = run.state.treasury.cash;
    const gone = dispatch(run, { type: 'demolish', placementId: 'p1' });
    expect(gone.state.treasury.cash).toBe(before - Math.round(HALL.cost * DEMOLITION_COST_SHARE));
    expect(demolitionCost(HALL)).toBe(Math.round(HALL.cost * DEMOLITION_COST_SHARE));
  });
});

describe('maintenance, backlog and renovation (DD §6.4)', () => {
  it('funded in full, a building holds its condition', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 3, defaultResolution);
    const p = run.state.campus.placements[0]!;
    expect(p.backlog).toBe(0);
    expect(p.condition).toBe(1);
    expect(run.state.treasury.budget.maintenanceFunding).toBe(1);
    expect(run.state.treasury.budget.expenses.maintenance).toBeGreaterThan(0);
  });

  it('underfunded, backlog accrues and condition falls', () => {
    const run = fundedAt(opened(), 0.5, WEEKS_PER_YEAR);
    expect(run.state.treasury.budget.maintenanceFunding).toBe(0.5);
    const p = run.state.campus.placements[0]!;
    expect(p.backlog).toBeGreaterThan(0);
    expect(p.condition).toBeLessThan(1);
    // Roughly half a year's upkeep, plus a little compounding.
    expect(p.backlog).toBeGreaterThan(HALL.upkeep * 0.45);
    expect(p.backlog).toBeLessThan(HALL.upkeep * 0.6);
    expect(totalBacklog(run.state)).toBe(p.backlog);
  });

  it('backlog compounds even once funding is restored', () => {
    let run = fundedAt(opened(), 0, WEEKS_PER_YEAR);
    const b1 = run.state.campus.placements[0]!.backlog;
    expect(b1).toBeGreaterThan(0);
    // The year's Budget & Hiring is the beat now pending: restore funding.
    expect(run.state.pendingBeat).toBe('budget-and-hiring');
    run = dispatch(run, {
      type: 'resolveBeat',
      beatId: 'budget-and-hiring',
      maintenanceFunding: 1,
    });
    run = tickRunWeeks(run, 5, defaultResolution);
    const atTurn = run.state.campus.placements[0]!.backlog;
    run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
    expect(run.state.treasury.budget.maintenanceFunding).toBe(1);
    const b2 = run.state.campus.placements[0]!.backlog;
    expect(b2).toBeGreaterThan(atTurn);
    expect(b2 / atTurn).toBeCloseTo(1 + BACKLOG_GROWTH_RATE, 1);
  });

  it('neglect visibly and financially compounds over twenty years', () => {
    const neglected = fundedAt(opened(11), 0, WEEKS_PER_YEAR * 20);
    const kept = tickRunWeeks(opened(11), WEEKS_PER_YEAR * 21, defaultResolution);
    const worn = neglected.state.campus.placements[0]!;
    const sound = kept.state.campus.placements[0]!;
    expect(sound.condition).toBe(1);
    expect(worn.condition).toBeLessThan(DERELICT_CONDITION);
    expect(worn.backlog).toBeGreaterThan(HALL.upkeep * 20);
    expect(renovationCost(worn)).toBeGreaterThan(HALL.upkeep * 20);
    // Neglect saved cash along the way...
    expect(neglected.state.treasury.cash).toBeGreaterThan(kept.state.treasury.cash);
    // ...but the bill to put it right exceeds what was saved.
    const saved = neglected.state.treasury.cash - kept.state.treasury.cash;
    expect(renovationCost(worn)).toBeGreaterThan(saved);
  });

  it('renovation pays the backlog and the fee, closes the building, and reopens it', () => {
    let run = fundedAt(opened(), 0, WEEKS_PER_YEAR);
    const p = run.state.campus.placements[0]!;
    const cost = renovationCost(p);
    expect(cost).toBe(Math.round(p.backlog + HALL.cost * RENOVATION_FEE_SHARE));
    const cash = run.state.treasury.cash;
    run = dispatch(run, { type: 'renovate', placementId: 'p1' });
    const r = run.state.campus.placements[0]!;
    expect(run.state.treasury.cash).toBe(cash - cost);
    expect(r.status).toBe('renovating');
    expect(r.backlog).toBe(0);
    expect(r.condition).toBe(1);
    expect(r.completesWeek).toBe(run.state.clock.absoluteWeek + RENOVATION_WEEKS);
    expect(lastEntry(run.state)).toMatchObject({ kind: 'renovationBegun' });
    expect(weeklyMaintenance(run.state)).toBe(0);
    run = tickRunWeeks(run, RENOVATION_WEEKS, defaultResolution);
    const back = run.state.campus.placements[0]!;
    expect(back.status).toBe('open');
    expect(back.openedWeek).toBe(r.openedWeek);
    expect(entriesOfKind(run.state, 'renovated')).toHaveLength(1);
  });

  it('refuses to renovate a sound or closed building', () => {
    const run = tickRunWeeks(opened(), 30, defaultResolution);
    expect(canApply(run.state, { type: 'renovate', placementId: 'p1' })).toMatchObject({
      ok: false,
      reason: /nothing/,
    });
    const site = dispatch(run, LIB);
    expect(canApply(site.state, { type: 'renovate', placementId: 'p2' })).toMatchObject({
      ok: false,
      reason: /not open/,
    });
  });

  it('replays identically, costs and renovations included', () => {
    let run = fundedAt(opened(77), 0.25, WEEKS_PER_YEAR + 3);
    run = dispatch(run, { ...LIB, financing: 'debt' });
    run = tickRunWeeks(run, 20, defaultResolution);
    run = dispatch(run, { type: 'renovate', placementId: 'p1', financing: 'debt' });
    run = tickRunWeeks(run, 40, defaultResolution);
    expect(replay(77, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });
});

describe('save migration v5 → v6', () => {
  function downgrade(state: GameState, log: Run['log']) {
    const file = JSON.parse(JSON.stringify(serializeRun({ state, log })));
    file.version = 5;
    file.state.schemaVersion = 5;
    for (const p of file.state.campus.placements) {
      delete p.status;
      delete p.completesWeek;
      delete p.openedWeek;
      delete p.backlog;
      delete p.condition;
    }
    const t = file.state.treasury;
    delete t.maintenanceFunding;
    delete t.capitalThisYear;
    delete t.budget.maintenanceFunding;
    if (t.pendingBudget) delete t.pendingBudget.maintenanceFunding;
    for (const y of t.history) delete y.capital;
    // A v5 run paid nothing for its buildings.
    t.cash = STARTING_CASH;
    file.log = file.log.map((e: { action: Record<string, unknown> }) =>
      e.action.type === 'placeBuilding'
        ? { ...e, action: { ...e.action, financing: undefined } }
        : e,
    );
    return file;
  }

  it('opens every standing building, paid and sound, when the replay disagrees', () => {
    let run = tickRunWeeks(opened(12), 40, defaultResolution);
    run = dispatch(run, LIB);
    run = tickRunWeeks(run, 3, defaultResolution);
    const file = downgrade(run.state, run.log);
    // A building the log does not carry, so the replay cannot agree.
    file.state.campus.placements.push({ id: 'p9', buildingId: 'lab', col: 1, row: 1, w: 5, h: 3 });
    const result = loadSaveFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.save.state;
    expect(s.campus.placements).toHaveLength(3);
    for (const p of s.campus.placements) {
      expect(p).toMatchObject({
        status: 'open',
        completesWeek: null,
        openedWeek: 0,
        backlog: 0,
        condition: 1,
      });
    }
    expect(s.treasury.cash).toBe(STARTING_CASH);
    expect(s.treasury.maintenanceFunding).toBe(1);
    expect(s.treasury.budget.maintenanceFunding).toBe(1);
    expect(s.treasury.capitalThisYear).toEqual({ spent: 0, borrowed: 0 });
    expect(s.treasury.history[0]!.capital).toEqual({ spent: 0, borrowed: 0 });
    expect(s.clock).toEqual(run.state.clock);
  });
});
