import { describe, expect, it } from 'vitest';
import { buildingById } from '../content/buildings.ts';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  ENDOWMENT_DRAW_DEFAULT,
  ENDOWMENT_MEAN_RETURN,
  ENDOWMENT_RETURN_SPREAD,
  FOUNDING_ADMIN_PAYROLL,
  STARTING_CASH,
  STARTING_ENDOWMENT,
} from '../tuning.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { createNewGame } from './state.ts';
import { tickWeeks } from './tick.ts';
import {
  adminShareOfPayroll,
  clampDrawRate,
  formatMoney,
  formatPercent,
  marketReturnFor,
  netOf,
  sumExpenses,
  sumRevenue,
  tuitionDependence,
} from './treasury.ts';

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

const WEEKLY_DRAW = Math.round((STARTING_ENDOWMENT * ENDOWMENT_DRAW_DEFAULT) / WEEKS_PER_YEAR);
const FOUNDERS_COST = buildingById('founders-hall').cost;
const WEEKLY_ADMIN = Math.round(FOUNDING_ADMIN_PAYROLL / WEEKS_PER_YEAR);

describe('treasury (DD §5)', () => {
  it('starts with the founding gift and a Year 1 budget', () => {
    const t = createNewGame(1).treasury;
    expect(t.cash).toBe(STARTING_CASH);
    expect(t.endowment).toBe(STARTING_ENDOWMENT);
    expect(t.budget.year).toBe(1);
    expect(t.budget.drawRate).toBe(ENDOWMENT_DRAW_DEFAULT);
    expect(t.budget.revenue.endowmentDraw).toBe(STARTING_ENDOWMENT * ENDOWMENT_DRAW_DEFAULT);
    expect(t.budget.expenses.adminPayroll).toBe(FOUNDING_ADMIN_PAYROLL);
    expect(t.history).toEqual([]);
  });

  it('does not move money before the doors are open', () => {
    const s = tickWeeks(createNewGame(1), 10);
    expect(s.treasury.cash).toBe(STARTING_CASH);
    expect(s.treasury.endowment).toBe(STARTING_ENDOWMENT);
  });

  it('moves the budget in weekly slices once the doors are open', () => {
    const run = tickRunWeeks(opened(), 1);
    const t = run.state.treasury;
    expect(t.lastWeek.revenue.endowmentDraw).toBe(WEEKLY_DRAW);
    expect(t.lastWeek.expenses.adminPayroll).toBe(WEEKLY_ADMIN);
    expect(netOf(t.lastWeek)).toBe(WEEKLY_DRAW - WEEKLY_ADMIN);
    expect(t.cash).toBe(STARTING_CASH - FOUNDERS_COST + WEEKLY_DRAW - WEEKLY_ADMIN);
    expect(t.actual.revenue.endowmentDraw).toBe(WEEKLY_DRAW);
    const growth = Math.round((STARTING_ENDOWMENT * t.marketReturn) / WEEKS_PER_YEAR);
    expect(t.endowment).toBe(STARTING_ENDOWMENT + growth - WEEKLY_DRAW);
  });

  it('closes the year into the history and journals it', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    const t = run.state.treasury;
    expect(t.history).toHaveLength(1);
    const y1 = t.history[0]!;
    expect(y1.year).toBe(1);
    // The doors open in Week 1; the money moves for the 35 weeks after it.
    expect(sumRevenue(y1.revenue)).toBe(WEEKLY_DRAW * 35);
    // Founders Hall opens in week 24 and wants upkeep from the week after.
    expect(y1.expenses.maintenance).toBeGreaterThan(0);
    expect(sumExpenses(y1.expenses)).toBe(WEEKLY_ADMIN * 35 + y1.expenses.maintenance);
    expect(y1.net).toBe((WEEKLY_DRAW - WEEKLY_ADMIN) * 35 - y1.expenses.maintenance);
    expect(y1.capital).toEqual({ spent: FOUNDERS_COST, borrowed: 0 });
    expect(y1.marketReturn).toBe(marketReturnFor(4, 1));
    expect(t.budget.year).toBe(2);
    expect(t.actual.revenue.endowmentDraw).toBe(t.lastWeek.revenue.endowmentDraw);
    const closed = entriesOfKind(run.state, 'yearClosed');
    expect(closed).toHaveLength(1);
    expect(describeEntry(closed[0]!, run.state)).toEqual({
      text: `Year 1 closes ${formatMoney(y1.net)} in the black.`,
      tone: 'good',
    });
  });

  it('approves next year’s budget at the Budget & Hiring beat', () => {
    // Summer Week 4 is absolute week 31.
    let run = tickRunWeeks(opened(), 31, defaultResolution);
    expect(run.state.pendingBeat).toBe('budget-and-hiring');
    const before = run.state.treasury;
    run = dispatch(run, { type: 'resolveBeat', beatId: 'budget-and-hiring', drawRate: 0.055 });
    const t = run.state.treasury;
    expect(t.drawRate).toBe(0.055);
    expect(t.pendingBudget?.year).toBe(2);
    expect(t.pendingBudget?.drawRate).toBe(0.055);
    expect(t.pendingBudget?.revenue.endowmentDraw).toBe(Math.round(before.endowment * 0.055));
    // Still Year 1's budget until the year turns.
    expect(t.budget.year).toBe(1);
    expect(t.budget.drawRate).toBe(ENDOWMENT_DRAW_DEFAULT);
    expect(entriesOfKind(run.state, 'budgetApproved')[0]).toMatchObject({
      year: 2,
      drawRate: 0.055,
    });
    run = tickRunWeeks(run, WEEKS_PER_YEAR - 31, defaultResolution);
    expect(run.state.treasury.budget.year).toBe(2);
    expect(run.state.treasury.budget.drawRate).toBe(0.055);
    expect(run.state.treasury.pendingBudget).toBeNull();
    expect(run.state.treasury.lastWeek.revenue.endowmentDraw).toBe(
      Math.round(Math.round(before.endowment * 0.055) / WEEKS_PER_YEAR),
    );
  });

  it('resolves to the standing rate by default, and clamps the rate', () => {
    let run = tickRunWeeks(opened(), 31, defaultResolution);
    run = dispatch(run, defaultResolution(run.state)!);
    expect(run.state.treasury.pendingBudget?.drawRate).toBe(ENDOWMENT_DRAW_DEFAULT);
    expect(clampDrawRate(0.5)).toBe(0.06);
    expect(clampDrawRate(0)).toBe(0.03);
    expect(clampDrawRate(0.0449)).toBe(0.045);
    expect(clampDrawRate(0.0413)).toBe(0.0425);
    expect(clampDrawRate(0.041)).toBe(0.04);
  });

  it('draws each year’s market return from the seed and the year', () => {
    expect(marketReturnFor(4, 1)).toBe(marketReturnFor(4, 1));
    expect(marketReturnFor(4, 1)).not.toBe(marketReturnFor(4, 2));
    expect(marketReturnFor(4, 1)).not.toBe(marketReturnFor(5, 1));
    for (let y = 1; y <= 50; y++) {
      const r = marketReturnFor(9, y);
      expect(r).toBeGreaterThanOrEqual(ENDOWMENT_MEAN_RETURN - ENDOWMENT_RETURN_SPREAD - 1e-9);
      expect(r).toBeLessThanOrEqual(ENDOWMENT_MEAN_RETURN + ENDOWMENT_RETURN_SPREAD + 1e-9);
    }
  });

  it('moves believably over twenty simulated years', () => {
    const run = tickRunWeeks(opened(21), WEEKS_PER_YEAR * 20, defaultResolution);
    const t = run.state.treasury;
    expect(t.history).toHaveLength(20);
    expect(Number.isFinite(t.cash) && Number.isFinite(t.endowment)).toBe(true);
    // Every year the draw beat the office, so cash climbed; the endowment
    // earned its mean minus its draw, so it climbed too, unevenly.
    for (const y of t.history) expect(y.net).toBeGreaterThan(0);
    expect(t.cash).toBeGreaterThan(STARTING_CASH);
    expect(t.endowment).toBeGreaterThan(STARTING_ENDOWMENT);
    const returns = t.history.map((y) => y.marketReturn);
    expect(new Set(returns).size).toBeGreaterThan(10);
    const ends = t.history.map((y) => y.endowmentEnd);
    expect(ends.some((e, i) => i > 0 && e < ends[i - 1]!)).toBe(true);
  });

  it('replays identically, budgets included', () => {
    let run = tickRunWeeks(opened(77), 31, defaultResolution);
    run = dispatch(run, { type: 'resolveBeat', beatId: 'budget-and-hiring', drawRate: 0.03 });
    run = tickRunWeeks(run, 60, defaultResolution);
    expect(replay(77, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });

  it('reads tuition dependence and admin share honestly at zero', () => {
    const t = tickRunWeeks(opened(), 3).state.treasury;
    expect(tuitionDependence(t.actual)).toBe(0);
    expect(adminShareOfPayroll(t.actual)).toBe(1);
    expect(
      tuitionDependence({
        revenue: { ...t.actual.revenue, tuition: 0 },
        expenses: t.actual.expenses,
      }),
    ).toBe(0);
  });

  it('formats money in the register', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(450)).toBe('$450');
    expect(formatMoney(12_500)).toBe('$12.5k');
    expect(formatMoney(250_000)).toBe('$250k');
    expect(formatMoney(2_250_000)).toBe('$2.25M');
    expect(formatMoney(30_000_000)).toBe('$30M');
    expect(formatMoney(-1_200_000)).toBe('−$1.2M');
    expect(formatMoney(12_500, { sign: true })).toBe('+$12.5k');
    expect(formatMoney(500_000_000)).toBe('$500M');
    expect(formatMoney(1_250_000_000)).toBe('$1.25B');
    expect(formatPercent(0.045)).toBe('4.5%');
    expect(formatPercent(0.045, 2)).toBe('4.5%');
    expect(formatPercent(0.0525, 2)).toBe('5.25%');
    expect(formatPercent(1)).toBe('100%');
  });
});

describe('save migration v4 → v5', () => {
  function downgrade(run: Run) {
    const file = JSON.parse(JSON.stringify(serializeRun(run)));
    file.version = 4;
    file.state.schemaVersion = 4;
    delete file.state.treasury;
    file.state.bus = file.state.bus.filter(
      (e: { kind: string }) => e.kind !== 'budgetApproved' && e.kind !== 'yearClosed',
    );
    return file;
  }

  it('rebuilds the money history by replay', () => {
    let run = tickRunWeeks(opened(11), 31, defaultResolution);
    run = dispatch(run, { type: 'resolveBeat', beatId: 'budget-and-hiring', drawRate: 0.04 });
    run = tickRunWeeks(run, 40, defaultResolution);
    run = dispatch(run, { type: 'paint', tool: 'plant', col: 10, row: 10 });
    const result = loadSaveFile(downgrade(run));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state).toEqual(run.state);
  });

  it('falls back to the founding treasury when the replay disagrees', () => {
    const run = tickRunWeeks(opened(12), 40, defaultResolution);
    const file = downgrade(run);
    file.state.campus.placements.push({
      id: 'p9',
      buildingId: 'library',
      col: 1,
      row: 1,
      w: 5,
      h: 5,
    });
    const result = loadSaveFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state.treasury.cash).toBe(STARTING_CASH);
    expect(result.save.state.campus.placements).toHaveLength(2);
    expect(result.save.state.clock).toEqual(run.state.clock);
  });
});
