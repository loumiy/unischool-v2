import { describe, expect, it } from 'vitest';
import {
  ATHLETICS_CLIMB,
  ATHLETICS_CLIMB_FROM,
  EXPECTATION_PRESTIGE_POINTS,
  MARKET_TUITION,
  SATISFACTION_SOFT_FROM,
  SATISFACTION_TOP_RETURN,
} from '../tuning.ts';
import { scheduleClimb } from './athletics.ts';
import { played } from './colleges.ts';
import { diminished, enrolled, expectationsTerm, satisfactionBreakdown } from './people.ts';
import type { GameState } from './state.ts';

// NO CEILINGS YOU CAN SIT ON (Phase 38): students judge a college against
// its promise, the top of the scale is hard going, and the schedule climbs
// with the team.

const base = played(4, 12).state;

function withAxes(state: GameState, level: number): GameState {
  const axes = { ...state.prestige.axes };
  for (const k of Object.keys(axes) as (keyof typeof axes)[]) axes[k] = level;
  return { ...state, prestige: { ...state.prestige, axes } };
}

function withTuition(state: GameState, tuition: number): GameState {
  return {
    ...state,
    people: { ...state.people, terms: { ...state.people.terms, tuition } },
  };
}

describe('expectations', () => {
  it('judge a famous, dear college harder than a new, cheap one', () => {
    const famous = expectationsTerm(withTuition(withAxes(base, 100), MARKET_TUITION * 1.5));
    const humble = expectationsTerm(withTuition(withAxes(base, 25), MARKET_TUITION * 0.6));
    expect(famous).toBeLessThan(-EXPECTATION_PRESTIGE_POINTS);
    expect(humble).toBeGreaterThan(0);
  });

  it('appear in the breakdown, which still adds up', () => {
    const b = satisfactionBreakdown(withAxes(base, 80), enrolled(base));
    expect(b.expectations).toBeLessThan(0);
    const sum =
      b.base +
      b.housing +
      b.dining +
      b.seats +
      b.condition +
      b.teaching +
      b.morale +
      b.placement +
      b.life +
      b.events +
      b.conditions +
      b.expectations +
      b.returns;
    expect(b.total).toBeCloseTo(Math.min(100, Math.max(0, sum)), 0);
  });
});

describe('diminishing returns near the top', () => {
  it('leave the middle of the scale alone and flatten the top', () => {
    expect(diminished(60)).toBe(60);
    expect(diminished(SATISFACTION_SOFT_FROM)).toBe(SATISFACTION_SOFT_FROM);
    expect(diminished(SATISFACTION_SOFT_FROM + 10)).toBeCloseTo(
      SATISFACTION_SOFT_FROM + 10 * SATISFACTION_TOP_RETURN,
    );
    // A sum that would have pinned the old scale at 100 now reads in the
    // high eighties.
    expect(diminished(100)).toBeLessThan(90);
  });
});

describe('the schedule climbs with the team', () => {
  it('books a rising programme against better opponents', () => {
    const low = { ...base, prestige: { ...base.prestige, axes: { ...base.prestige.axes } } };
    low.prestige.axes.athletics = ATHLETICS_CLIMB_FROM;
    const high = { ...low, prestige: { ...low.prestige, axes: { ...low.prestige.axes } } };
    high.prestige.axes.athletics = ATHLETICS_CLIMB_FROM + 40;
    expect(scheduleClimb(high) - scheduleClimb(low)).toBeCloseTo(40 * ATHLETICS_CLIMB);
  });

  it('and a bigger budget buys a harder schedule', () => {
    const lean = { ...base, athletics: { ...base.athletics, budget: 'standard' as const } };
    const big = { ...base, athletics: { ...base.athletics, budget: 'ambitious' as const } };
    expect(scheduleClimb(big)).toBeGreaterThan(scheduleClimb(lean));
  });
});
