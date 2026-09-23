import { describe, expect, it } from 'vitest';
import { EVENTS } from '../content/events.ts';
import type { Clock, Term } from './calendar.ts';
import { winterDepth } from './weather.ts';

// WINTER (Phase 21E): weather laid over the terms, not a fourth term.

const at = (term: Term, week: number): Clock => ({ year: 3, term, week, absoluteWeek: 80 });

describe('the winter', () => {
  it('comes at the end of the fall and leaves in the middle of the spring', () => {
    for (let w = 1; w <= 11; w++) expect(winterDepth(at('fall', w)), `fall ${w}`).toBe(0);
    for (let w = 12; w <= 14; w++)
      expect(winterDepth(at('fall', w)), `fall ${w}`).toBeGreaterThan(0);
    for (let w = 1; w <= 6; w++)
      expect(winterDepth(at('spring', w)), `spring ${w}`).toBeGreaterThan(0);
    for (let w = 7; w <= 14; w++) expect(winterDepth(at('spring', w)), `spring ${w}`).toBe(0);
    for (let w = 1; w <= 8; w++) expect(winterDepth(at('summer', w)), `summer ${w}`).toBe(0);
  });

  it('deepens into the new year and thaws out of it', () => {
    const run = [
      ...[12, 13, 14].map((w) => winterDepth(at('fall', w))),
      ...[1, 2, 3, 4, 5, 6].map((w) => winterDepth(at('spring', w))),
    ];
    const peak = run.indexOf(Math.max(...run));
    for (let i = 1; i <= peak; i++) expect(run[i]).toBeGreaterThanOrEqual(run[i - 1]!);
    for (let i = peak + 1; i < run.length; i++) expect(run[i]).toBeLessThanOrEqual(run[i - 1]!);
    expect(Math.max(...run)).toBe(1);
  });
});

describe('the cold weeks’ questions', () => {
  const winter = EVENTS.filter((e) => e.when.winterAtLeast !== undefined);

  it('exist, and ask only when it is cold', () => {
    expect(winter.length).toBeGreaterThanOrEqual(6);
    for (const e of winter) expect(e.when.winterAtLeast, e.id).toBeGreaterThan(0);
  });

  // A default is what happens to a college that did not decide. Weather is
  // nobody's neglect, so leaving a winter question alone must not quietly
  // put the estate into backlog: deferring is a choice the player makes.
  it('never run an estate down by default', () => {
    for (const e of winter) {
      const fallback = e.choices.find((c) => c.id === e.default);
      expect(fallback, e.id).toBeDefined();
      expect(fallback!.effects.backlog ?? 0, e.id).toBeLessThanOrEqual(0);
    }
  });
});
