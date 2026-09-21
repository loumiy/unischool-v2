import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  classLabel,
  clockFromAbsoluteWeek,
  formatClock,
  FOUNDING_CLOCK,
  isYearTurn,
  TERMS,
  WEEKS_IN_TERM,
  WEEKS_PER_YEAR,
  type Clock,
} from './calendar.ts';

function advance(c: Clock, weeks: number): Clock {
  let x = c;
  for (let i = 0; i < weeks; i++) x = advanceClock(x);
  return x;
}

describe('calendar', () => {
  it('has three terms totalling 36 weeks (DD §3.1)', () => {
    expect(TERMS).toEqual(['fall', 'spring', 'summer']);
    expect(WEEKS_IN_TERM.fall + WEEKS_IN_TERM.spring + WEEKS_IN_TERM.summer).toBe(WEEKS_PER_YEAR);
    expect(WEEKS_PER_YEAR).toBe(36);
  });

  it('founds at Year 1 · Fall Term · Week 1', () => {
    expect(formatClock(FOUNDING_CLOCK)).toBe('Year 1 · Fall Term · Week 1');
    expect(FOUNDING_CLOCK.absoluteWeek).toBe(0);
  });

  it('rolls Fall → Spring → Summer → next Fall', () => {
    expect(advance(FOUNDING_CLOCK, 13)).toMatchObject({ year: 1, term: 'fall', week: 14 });
    expect(advance(FOUNDING_CLOCK, 14)).toMatchObject({ year: 1, term: 'spring', week: 1 });
    expect(advance(FOUNDING_CLOCK, 28)).toMatchObject({ year: 1, term: 'summer', week: 1 });
    expect(advance(FOUNDING_CLOCK, 35)).toMatchObject({ year: 1, term: 'summer', week: 8 });
    expect(advance(FOUNDING_CLOCK, 36)).toMatchObject({
      year: 2,
      term: 'fall',
      week: 1,
      absoluteWeek: 36,
    });
  });

  it("formats in v1's clock format with the week counted within the term", () => {
    const c = advance(FOUNDING_CLOCK, 11 * WEEKS_PER_YEAR + 2);
    expect(formatClock(c)).toBe('Year 12 · Fall Term · Week 3');
    expect(formatClock(advance(FOUNDING_CLOCK, 14 + 9))).toBe('Year 1 · Spring Term · Week 10');
    expect(formatClock(advance(FOUNDING_CLOCK, 28 + 3))).toBe('Year 1 · Summer Term · Week 4');
  });

  it('agrees between the incremental clock and the absolute-week clock', () => {
    let c = FOUNDING_CLOCK;
    for (let w = 0; w < WEEKS_PER_YEAR * 51; w++) {
      expect(clockFromAbsoluteWeek(w)).toEqual(c);
      c = advanceClock(c);
    }
  });

  it('rejects a negative or fractional absolute week', () => {
    expect(() => clockFromAbsoluteWeek(-1)).toThrow(RangeError);
    expect(() => clockFromAbsoluteWeek(1.5)).toThrow(RangeError);
  });

  it('derives class labels from the run year (DD §3.1)', () => {
    expect(classLabel(34)).toBe("Class of '34");
    expect(classLabel(5)).toBe("Class of '05");
    expect(classLabel(50)).toBe("Class of '50");
  });

  it('detects the year turn', () => {
    const endOfYear = advance(FOUNDING_CLOCK, 35);
    expect(isYearTurn(endOfYear, advanceClock(endOfYear))).toBe(true);
    expect(isYearTurn(FOUNDING_CLOCK, advanceClock(FOUNDING_CLOCK))).toBe(false);
  });
});
