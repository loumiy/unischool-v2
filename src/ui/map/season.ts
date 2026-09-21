import type { Clock } from '../../sim/index.ts';
import { AMBIENT_DENSITY } from '../../tuning.ts';

// THE SEASON (DD §6.3): the term as a tint and a crowd. The calendar has
// three terms; the lawn and the trees read them — fresh in spring,
// sun-bleached in summer, turning through the fall — as a class on the
// map's root that the stylesheet colours.

export type Season = 'spring' | 'summer' | 'early-fall' | 'late-fall';

export function seasonOf(clock: Clock): Season {
  if (clock.term === 'spring') return 'spring';
  if (clock.term === 'summer') return 'summer';
  return clock.week > 8 ? 'late-fall' : 'early-fall';
}

// How full the paths are, 0–1: the term's crowd, with the two moments the
// campus fills — move-in at Convocation, the lawn at Commencement.
export function ambientDensity(clock: Clock): number {
  const base = AMBIENT_DENSITY[clock.term];
  if (clock.term === 'summer' && clock.week === 1) return 0.6;
  if (clock.term === 'fall' && clock.week === 1) return Math.min(1, base * 1.2);
  return base;
}
