import { winterDepth, type Clock } from '../../sim/index.ts';
import { AMBIENT_DENSITY, SNOWFLAKES } from '../../tuning.ts';

// THE SEASON (DD §6.3): the term as a tint and a crowd. The calendar has
// three terms; the lawn and the trees read them — fresh in spring,
// sun-bleached in summer, turning through the fall — as a class on the
// map's root that the stylesheet colours.
//
// Winter (Phase 21E) is weather laid over those four rather than a fifth
// term: it comes at the end of the fall and leaves in the middle of the
// spring (sim/weather.ts), and while it lasts it is the season the map
// shows. How deep it is goes to the stylesheet as a number, so the snow
// can lie thin in the first week and thick by the start of the spring.

export type Season = 'spring' | 'summer' | 'early-fall' | 'late-fall' | 'winter';

export function seasonOf(clock: Clock): Season {
  if (winterDepth(clock) > 0) return 'winter';
  if (clock.term === 'spring') return 'spring';
  if (clock.term === 'summer') return 'summer';
  return clock.week > 8 ? 'late-fall' : 'early-fall';
}

// How full the paths are, 0–1: the term's crowd, with the two moments the
// campus fills — move-in at Convocation, the lawn at Commencement — and the
// cold, which keeps people indoors and walking fast between doors.
export function ambientDensity(clock: Clock): number {
  const base = AMBIENT_DENSITY[clock.term];
  if (clock.term === 'summer' && clock.week === 1) return 0.6;
  if (clock.term === 'fall' && clock.week === 1) return Math.min(1, base * 1.2);
  return base * (1 - 0.35 * winterDepth(clock));
}

// Whether it is snowing this week, and how hard, 0–1. Not every winter
// week: the map's own dice on the week number, so the same week always
// has the same weather and a replay looks like the run it replays. Deepest
// winter snows more often than the edges of it.
export function snowfallOf(clock: Clock): number {
  const depth = winterDepth(clock);
  if (depth <= 0) return 0;
  let h = (clock.absoluteWeek + 0x9e37) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  const roll = ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  if (roll > 0.35 + 0.4 * depth) return 0;
  return Math.min(1, 0.45 + 0.55 * depth);
}

// How many flakes fall at full strength. Budgeted like the walkers (DD
// §15): a fixed number of absolutely positioned dots moved by a CSS
// animation the compositor runs, so the snow costs the map nothing per
// frame beyond painting them.
export function flakesOf(clock: Clock): number {
  return Math.round(SNOWFLAKES * snowfallOf(clock));
}
