import { describe, expect, it } from 'vitest';
import { canApply } from './actions.ts';
import { annualAthleticsCost, varsityLife } from './athletics.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { opened, played } from './colleges.ts';
import { latestTable, rankOf } from './league.ts';
import { dispatch, tickRunWeeks } from './run.ts';
import { defaultResolution } from './beats.ts';

// ATHLETICS-LITE AND THE RIVAL (DD §8.5, §11.3; Phase 23). Done when
// year-40 rankings have an antagonist.

describe('the rival', () => {
  it('emerges by year forty in every run, even a college that fields no team', () => {
    for (const seed of [4242, 7, 99991]) {
      const run = played(seed, 40);
      const a = run.state.athletics;
      expect(a.rivalId, `seed ${seed}`).not.toBeNull();
      expect(a.rivalSince!).toBeGreaterThanOrEqual(5);
      const table = latestTable(run.state)!;
      expect(rankOf(table, a.rivalId!)).toBeGreaterThan(0);
      expect(entriesOfKind(run.state, 'rivalNamed')).toHaveLength(1);
      expect(entriesOfKind(run.state, 'rivalTaunt').length).toBeGreaterThan(5);
    }
  });

  it('is not the same neighbour every run', () => {
    const rivals = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => played(seed, 14).state.athletics.rivalId),
    );
    expect(rivals.size).toBeGreaterThan(1);
  });
});

describe('the teams', () => {
  it('fields a team only where it has a venue, and costs a year at the budget', () => {
    const run = tickRunWeeks(opened(4), 40, defaultResolution);
    expect(
      canApply(run.state, { type: 'setVarsity', sportId: 'swimming', on: true }),
    ).toMatchObject({ ok: false, reason: /venue/ });
    const rowing = dispatch(run, { type: 'setVarsity', sportId: 'rowing', on: true });
    expect(rowing.state.athletics.varsity).toEqual(['rowing']);
    expect(annualAthleticsCost(rowing.state)).toBe(400_000);
    expect(varsityLife(rowing.state)).toBeGreaterThan(0);
    const lean = dispatch(rowing, { type: 'setAthleticsBudget', budget: 'lean' });
    expect(annualAthleticsCost(lean.state)).toBe(240_000);
  });

  it('plays its season at the end of its term, and the record carries into athletics', () => {
    let run = dispatch(tickRunWeeks(opened(4), 40, defaultResolution), {
      type: 'setVarsity',
      sportId: 'rowing',
      on: true,
    });
    run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
    const seasons = run.state.athletics.seasons;
    expect(seasons).toHaveLength(1);
    expect(seasons[0]!.wins + seasons[0]!.losses).toBe(10);
    expect(entriesOfKind(run.state, 'seasonClosed')).toHaveLength(1);
    expect(run.state.prestige.athleticsForm).toBeCloseTo(seasons[0]!.wins / 10, 3);
  });
});
