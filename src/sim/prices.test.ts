import { describe, expect, it } from 'vitest';
import {
  EVENT_PRICE_FIXED_BELOW,
  EVENT_PRICE_REFERENCE_BUDGET,
  RESERVES_SWEEP_YEARS,
} from '../tuning.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { opened } from './colleges.ts';
import { priceScale, scaledAmount, scaledEffects, scaledWords } from './events.ts';
import { dispatch, tickRunWeeks } from './run.ts';
import type { GameState } from './state.ts';
import { investable, sumExpenses } from './treasury.ts';

// MONEY THAT MEANS SOMETHING (Phase 36, DD §10.1): an event's sums grow
// with the college, and idle money has somewhere to go.

function withBudget(state: GameState, total: number): GameState {
  const expenses = { ...state.treasury.budget.expenses };
  const keys = Object.keys(expenses) as (keyof typeof expenses)[];
  for (const k of keys) expenses[k] = 0;
  expenses.facultyPayroll = total;
  return {
    ...state,
    treasury: { ...state.treasury, budget: { ...state.treasury.budget, expenses } },
  };
}

describe('prices that grow with the college', () => {
  const base = opened(4).state;

  it('quotes a founding college the sums as written, and a larger one more', () => {
    expect(priceScale(withBudget(base, EVENT_PRICE_REFERENCE_BUDGET / 2))).toBe(1);
    expect(priceScale(withBudget(base, EVENT_PRICE_REFERENCE_BUDGET * 4))).toBe(4);
  });

  it('leaves the price of a thing alone, and rounds the price of a size', () => {
    expect(scaledAmount(EVENT_PRICE_FIXED_BELOW - 1, 4)).toBe(EVENT_PRICE_FIXED_BELOW - 1);
    expect(scaledAmount(-250_000, 4)).toBe(-1_000_000);
    expect(scaledAmount(123_456, 3)).toBe(370_000);
    expect(scaledEffects({ cash: -200_000, mood: -2, backlog: 150_000 }, 3)).toEqual({
      cash: -600_000,
      mood: -2,
      backlog: 450_000,
    });
  });

  it('says the same sums in the note as it moves in the ledger', () => {
    expect(scaledWords('$250k to raise $3M; $2k in collars', 4)).toBe(
      '$1M to raise $12M; $2k in collars',
    );
    expect(scaledWords('$250k', 1)).toBe('$250k');
  });
});

describe('idle money', () => {
  it('invests what the bank can spare beyond a term, and no more', () => {
    const run = tickRunWeeks(opened(4), 3, defaultResolution);
    const spare = investable(run.state);
    expect(spare).toBeGreaterThan(0);
    const before = run.state.treasury;
    const after = dispatch(run, { type: 'investReserves', amount: spare }).state.treasury;
    expect(after.cash).toBe(before.cash - spare);
    expect(after.endowment).toBe(before.endowment + spare);
    const again = dispatch(
      { ...run, state: { ...run.state, treasury: after } },
      {
        type: 'investReserves',
        amount: 1_000_000,
      },
    );
    expect(again.state.treasury.cash).toBe(after.cash);
  });

  it('sweeps a year of surplus past a year of expenses, unless told not to', () => {
    const on = tickRunWeeks(opened(4), WEEKS_PER_YEAR + 2, defaultResolution).state;
    const swept = entriesOfKind(on, 'reservesSwept');
    expect(swept.length).toBe(1);
    expect(swept[0]!.amount).toBeLessThanOrEqual(on.treasury.history[0]!.net);
    expect(on.treasury.cash).toBeGreaterThanOrEqual(
      sumExpenses(on.treasury.budget.expenses) * RESERVES_SWEEP_YEARS - 1,
    );
    const off = tickRunWeeks(
      dispatch(opened(4), { type: 'setSweep', on: false }),
      WEEKS_PER_YEAR + 2,
      defaultResolution,
    );
    expect(entriesOfKind(off.state, 'reservesSwept')).toHaveLength(0);
  });
});
