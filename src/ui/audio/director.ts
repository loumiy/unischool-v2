import { AMBIENCE, CUES, type ThemeId } from '../../content/audio.ts';
import { enrolled, winterDepth, type BusEntry, type GameState } from '../../sim/index.ts';

// WHAT THE COLLEGE SOUNDS LIKE, READ OFF THE STATE (DD §13.4). Pure: the
// engine (engine.ts) plays whatever these say, and these say it from a
// snapshot, so "the game sounds like itself" is a claim the tests can
// check without a speaker. Nothing adaptive beyond state switching.

// The music: a founding theme for the first years, a distress undertone
// once the board has frozen something, the ceremonial theme for the last
// few years and the report, and growth for everything between.
export const CEREMONIAL_FROM = 46;
export const DISTRESS_RUNG = 2;
export const FOUNDING_UNTIL = 3;

export function themeFor(state: GameState | null): ThemeId {
  if (!state || state.phase !== 'running') return 'founding';
  if (state.ending.report || state.ending.epilogue) return 'ceremonial';
  if (state.distress.rung >= DISTRESS_RUNG) return 'distress';
  if (state.clock.year >= CEREMONIAL_FROM) return 'ceremonial';
  if (state.clock.year <= FOUNDING_UNTIL) return 'founding';
  return 'growth';
}

export interface AmbienceLevels {
  crowd: number; // 0–1 of the crowd's gain: how many live here
  wind: number; // 0–1: how deep the winter is
  birds: number; // chirps a second
  roar: boolean; // a game this week
}

// The campus: a murmur that scales with the roll (and thins in summer,
// when the students are away), wind with the winter, birds when it is not,
// and a stadium's roar on a game week — every other week of a varsity
// season, once there are teams.
export function ambienceFor(state: GameState | null): AmbienceLevels {
  if (!state || state.phase !== 'running') return { crowd: 0, wind: 0.3, birds: 0.2, roar: false };
  const { clock } = state;
  const students = enrolled(state);
  const away = clock.term === 'summer' ? AMBIENCE.crowd.summer : 1;
  const winter = winterDepth(clock);
  const inSeason =
    (clock.term === 'fall' || clock.term === 'spring') && clock.week >= 2 && clock.week <= 13;
  return {
    crowd: Math.min(1, students / AMBIENCE.crowd.fullAt) * away,
    wind: winter,
    birds: AMBIENCE.birds.perSecond * (1 - winter) * (clock.term === 'fall' ? 0.5 : 1),
    roar: inSeason && clock.week % 2 === 0 && state.athletics.varsity.length > 0,
  };
}

// The effects the journal's new entries cue, in order, each named once:
// a tick that lands a building, a bell and a hire in one frame plays the
// three, not the bell three times.
export function cuesFor(entries: readonly BusEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    let id = CUES[e.kind];
    if (e.kind === 'seasonClosed' && e.title) id = 'cheer';
    if (e.kind === 'rungChanged' && e.to < e.from) id = 'complete';
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// Entries newer than the last one heard.
export function entriesSince(state: GameState, seq: number): BusEntry[] {
  const bus = state.bus;
  let i = bus.length;
  while (i > 0 && bus[i - 1]!.seq > seq) i--;
  return bus.slice(i);
}

export function lastSeq(state: GameState | null): number {
  return state?.bus[state.bus.length - 1]?.seq ?? 0;
}
