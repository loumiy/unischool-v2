// The calendar (DD §3.1). Time is continuous with pause; the base tick is one
// week; a year is three terms — Fall (14), Spring (14), Summer (8) — for 36
// ticks a year. Dates are run-relative: Year 1 through Year 50, no real-world
// calendar years anywhere, and the week counts within the current term.

export type Term = 'fall' | 'spring' | 'summer';

export const TERMS: readonly Term[] = ['fall', 'spring', 'summer'];

export const WEEKS_IN_TERM: Readonly<Record<Term, number>> = { fall: 14, spring: 14, summer: 8 };

export const WEEKS_PER_YEAR = 36;

// The run formally ends at Year 50, Week 1 (DD §2.3). The sim keeps ticking
// past it in Epilogue mode; the ending itself is Phase 27's.
export const FINAL_YEAR = 50;

export interface Clock {
  year: number; // 1-based
  term: Term;
  week: number; // 1-based, within the term
  // Whole weeks elapsed since founding. The sim's monotonic time axis: what
  // the action log is stamped with, and what "advanced N weeks" means.
  absoluteWeek: number;
}

export const FOUNDING_CLOCK: Readonly<Clock> = { year: 1, term: 'fall', week: 1, absoluteWeek: 0 };

export function advanceClock(c: Clock): Clock {
  const absoluteWeek = c.absoluteWeek + 1;
  if (c.week < WEEKS_IN_TERM[c.term]) {
    return { ...c, week: c.week + 1, absoluteWeek };
  }
  const termIndex = TERMS.indexOf(c.term);
  const nextTerm = TERMS[(termIndex + 1) % TERMS.length]!;
  const year = nextTerm === 'fall' ? c.year + 1 : c.year;
  return { year, term: nextTerm, week: 1, absoluteWeek };
}

export function clockFromAbsoluteWeek(absoluteWeek: number): Clock {
  if (!Number.isInteger(absoluteWeek) || absoluteWeek < 0) {
    throw new RangeError(`absoluteWeek must be a non-negative integer, got ${absoluteWeek}`);
  }
  const year = Math.floor(absoluteWeek / WEEKS_PER_YEAR) + 1;
  let rest = absoluteWeek % WEEKS_PER_YEAR;
  for (const term of TERMS) {
    if (rest < WEEKS_IN_TERM[term]) return { year, term, week: rest + 1, absoluteWeek };
    rest -= WEEKS_IN_TERM[term];
  }
  throw new Error('unreachable: WEEKS_PER_YEAR disagrees with WEEKS_IN_TERM');
}

export function termLabel(term: Term): string {
  switch (term) {
    case 'fall':
      return 'Fall Term';
    case 'spring':
      return 'Spring Term';
    case 'summer':
      return 'Summer Term';
  }
}

// v1's clock format, kept (DD §3.1): "Year 12 · Fall Term · Week 3".
export function formatClock(c: Clock): string {
  return `Year ${c.year} · ${termLabel(c.term)} · Week ${c.week}`;
}

export function termName(term: Term): string {
  return termLabel(term).replace(' Term', '');
}

// The same date as a stamp for a ticker line or a journal row, where the
// full form would crowd the sentence: "Y12 · Fall · W3".
export function formatClockShort(c: Clock): string {
  return `Y${c.year} · ${termName(c.term)} · W${c.week}`;
}

// Class labels derive from the run year: the class graduating in Year 34 is
// "the Class of '34" (DD §3.1). Two digits, zero-padded, so Year 5 is '05.
export function classLabel(graduationYear: number): string {
  return `Class of '${String(graduationYear % 100).padStart(2, '0')}`;
}

export function isYearTurn(before: Clock, after: Clock): boolean {
  return after.year > before.year;
}
