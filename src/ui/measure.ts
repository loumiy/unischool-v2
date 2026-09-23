import {
  LEVER_NAMES,
  MEASURE_WORDS,
  READING_NAMES,
  type ReadingUnit,
} from '../content/conditions.ts';
import type { EventCondition, EventEffect } from '../content/events.ts';
import { fillWords } from '../content/people.ts';
import { formatMoney, formatPercent, readingOf, type GameState } from '../sim/index.ts';

// A CLAUSE AS A MEASUREMENT (Phase 21F). An ambition's goal, an event's
// condition, a campaign's target: all of them are thresholds on the same
// readings the sim already takes, so any of them can be shown as where the
// college is against where it said it would be — "Enrolled 466 of 800" —
// rather than a title and "not yet". A promise whose terms the player
// cannot see is not a temptation; it is a rumour.

function formatIn(unit: ReadingUnit, value: number): string {
  switch (unit) {
    case 'money':
      return formatMoney(value);
    case 'percent':
      return formatPercent(value, 0);
    case 'rate':
      return formatPercent(value, 2);
    case 'score':
      return String(Math.round(value));
    case 'ratio':
      return value.toFixed(1);
    case 'years':
      return `${Math.floor(value)} years`;
    case 'signed':
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
    default:
      return Math.round(value).toLocaleString('en-US');
  }
}

function pointsDown(name: EventCondition): boolean {
  return name.endsWith('Under') || name.endsWith('AtMost');
}

export interface Measure {
  text: string;
  met: boolean;
  // 0–1, how far toward the target; 1 when met. Absent for a ceiling.
  progress?: number;
}

export function measureClause(state: GameState, name: EventCondition, target: number): Measure {
  const words = READING_NAMES[name];
  const now = readingOf(state, name);
  const down = pointsDown(name);
  const met = down ? now <= target : now >= target;
  const text = fillWords(down ? MEASURE_WORDS.holding : MEASURE_WORDS.reaching, {
    label: words.label,
    now: formatIn(words.unit, now),
    target: formatIn(words.unit, target),
  });
  if (down) return { text, met };
  const progress = target > 0 ? Math.max(0, Math.min(1, now / target)) : met ? 1 : 0;
  return { text, met, progress };
}

export function measureAll(
  state: GameState,
  clauses: Partial<Record<EventCondition, number>>,
): Measure[] {
  return (Object.entries(clauses) as [EventCondition, number][]).map(([name, target]) =>
    measureClause(state, name, target),
  );
}

// What a set of levers does, in words: "board confidence −7, alumni warmth
// +4". Money is written as money; everything else as a signed number.
export function leverLine(effects: Partial<Record<EventEffect, number>>): string {
  return (Object.entries(effects) as [EventEffect, number][])
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => {
      const amount =
        k === 'cash' || k === 'endowment' || k === 'debt' || k === 'backlog'
          ? formatMoney(v, { sign: true })
          : `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
      return `${LEVER_NAMES[k]} ${amount}`;
    })
    .join(', ');
}

export function costLine(effects: Partial<Record<EventEffect, number>>): string {
  return fillWords(MEASURE_WORDS.missing, { cost: leverLine(effects) });
}
export function worthLine(effects: Partial<Record<EventEffect, number>>): string {
  return fillWords(MEASURE_WORDS.keeping, { worth: leverLine(effects) });
}
