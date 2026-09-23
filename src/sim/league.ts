import {
  AXES,
  LEAGUE_SCHOOLS,
  METHODOLOGIES,
  leagueSchoolById,
  methodologyById,
  type Axes,
} from '../content/league.ts';
import {
  LEAGUE_HOME_PULL,
  LEAGUE_MOMENTUM_KEEP,
  LEAGUE_NOISE,
  METHODOLOGY_CHANGE_CHANCE,
  METHODOLOGY_FIRST_YEAR,
  POACH_CHANCE,
  POACH_STAR_SKILL,
} from '../tuning.ts';
import { emit } from './bus.ts';
import { fireEvent } from './events.ts';
import { trailPrestige, weightedScore } from './prestige.ts';
import { turnPerception } from './tags.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';

// THE LEAGUE (DD §11.3): twenty-four colleges simulated shallowly. Each
// drifts on its six axes around a home level, with a momentum that carries
// a good decade into the next and fades; once a year, at the turn, the
// guide publishes its table under whatever methodology it currently holds,
// and now and then changes the methodology, to general outrage.
//
// The league draws its dice from its own stream, derived from the run's
// seed and the year — never from the state's own — so adding the world
// changes nothing about the college's events, markets or students.

export const PLAYER_ID = 'you';

export interface LeagueSchool {
  id: string;
  axes: Axes;
  momentum: Axes;
}

export interface RankingRow {
  id: string; // a league school's id, or PLAYER_ID
  score: number;
}

export interface Rankings {
  year: number;
  methodologyId: string;
  rows: RankingRow[]; // best first
}

export interface League {
  schools: LeagueSchool[];
  methodologyId: string;
  methodologySince: number; // the year it came into force
  tables: Rankings[]; // one per year published, oldest first
}

function leagueRng(seed: number, year: number): Rng {
  return Rng.fromSeed((seed ^ Math.imul(year + 7919, 0x85ebca6b) ^ 0x1ea9) >>> 0);
}

// A standard normal draw from two uniforms (Box–Muller).
function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (n: number) => Math.max(1, Math.min(99, n));
const round = (n: number) => Number(n.toFixed(2));

export function foundingLeague(seed: number): League {
  const rng = leagueRng(seed, 0);
  const schools = LEAGUE_SCHOOLS.map((def) => {
    const axes = {} as Axes;
    const momentum = {} as Axes;
    for (const a of AXES) {
      axes[a] = round(clamp(def.home[a] + gauss(rng) * 3));
      momentum[a] = 0;
    }
    return { id: def.id, axes, momentum };
  });
  return { schools, methodologyId: METHODOLOGIES[0]!.id, methodologySince: 1, tables: [] };
}

// One year of drift for every school.
export function driftLeague(league: League, seed: number, year: number): League {
  const rng = leagueRng(seed, year);
  const schools = league.schools.map((s) => {
    const home = LEAGUE_SCHOOLS.find((d) => d.id === s.id)!.home;
    const axes = {} as Axes;
    const momentum = {} as Axes;
    for (const a of AXES) {
      const m = s.momentum[a] * LEAGUE_MOMENTUM_KEEP + gauss(rng) * LEAGUE_NOISE;
      momentum[a] = round(m);
      axes[a] = round(clamp(s.axes[a] + m + (home[a] - s.axes[a]) * LEAGUE_HOME_PULL));
    }
    return { ...s, axes, momentum };
  });
  return { ...league, schools };
}

// The table for a year, under a methodology, the college among the rest.
export function tableFor(state: GameState, methodologyId: string, year: number): Rankings {
  const weights = methodologyById(methodologyId).weights;
  const rows: RankingRow[] = [
    ...state.league.schools.map((s) => ({ id: s.id, score: weightedScore(s.axes, weights) })),
    { id: PLAYER_ID, score: weightedScore(state.prestige.axes, weights) },
  ].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { year, methodologyId, rows };
}

export function rankOf(table: Rankings, id: string = PLAYER_ID): number {
  return table.rows.findIndex((r) => r.id === id) + 1;
}

export function latestTable(state: GameState): Rankings | null {
  return state.league.tables[state.league.tables.length - 1] ?? null;
}

export function previousTable(state: GameState): Rankings | null {
  return state.league.tables[state.league.tables.length - 2] ?? null;
}

// The school that climbed furthest this year (three places or more), and
// the one that fell furthest: a rising school poaches, a falling one sheds
// faculty the college can grab (DD §11.3, §7.3).
export function mover(before: Rankings, after: Rankings, rising: boolean): string | null {
  let best: string | null = null;
  let by = 2;
  for (const row of after.rows) {
    if (row.id === PLAYER_ID) continue;
    const d = (rankOf(before, row.id) - rankOf(after, row.id)) * (rising ? 1 : -1);
    if (d > by || (d === by && best !== null && row.id < best)) {
      best = row.id;
      by = d;
    }
  }
  return best;
}

// A rising school makes one of the college's stars an offer: counter it,
// or let them go (DD §7.3). One offer at most a year, and never over the
// top of a question already waiting.
function poach(state: GameState, before: Rankings, after: Rankings, rng: Rng): GameState {
  const suitor = mover(before, after, true);
  if (!suitor || !rng.chance(POACH_CHANCE)) return state;
  if (state.events.pending.length > 0) return state;
  const seated = new Set(
    state.delegation.seats.flatMap((x) =>
      x.filledBy.kind === 'internal' ? [x.filledBy.facultyId] : [],
    ),
  );
  const stars = state.faculty.roster
    .filter((f) => !seated.has(f.id) && Math.max(f.teaching, f.research) >= POACH_STAR_SKILL)
    .sort(
      (a, b) => b.research + b.teaching - (a.research + a.teaching) || a.id.localeCompare(b.id),
    );
  const star = stars[0];
  if (!star) return state;
  return fireEvent(state, 'the-outside-offer', {
    faculty: star.name,
    facultyId: star.id,
    suitor: leagueSchoolById(suitor).name,
    schoolId: suitor,
  });
}

// The turn of the year: the college's standings trail its readings, the
// league drifts, the guide perhaps changes its mind, and the table comes
// out. Year 1 has no table: the guide ranks nobody who has not finished a
// year.
export function leagueWeek(state: GameState): GameState {
  const { clock } = state;
  if (clock.week !== 1 || clock.term !== 'fall' || clock.year < 2) return state;
  const year = clock.year - 1; // the year just finished
  let s = turnPerception(trailPrestige(state));
  const drifted = driftLeague(s.league, s.seed, year);
  let { methodologyId, methodologySince } = drifted;
  const rng = leagueRng(s.seed, year + 100_000);
  let changed = false;
  if (year >= METHODOLOGY_FIRST_YEAR && rng.chance(METHODOLOGY_CHANGE_CHANCE)) {
    const others = METHODOLOGIES.filter((m) => m.id !== methodologyId);
    methodologyId = others[rng.int(0, others.length - 1)]!.id;
    methodologySince = year;
    changed = true;
  }
  s = { ...s, league: { ...drifted, methodologyId, methodologySince } };
  const table = tableFor(s, methodologyId, year);
  const before = latestTable(s);
  s = { ...s, league: { ...s.league, tables: [...s.league.tables, table] } };
  if (changed) s = emit(s, { kind: 'methodologyChanged', methodologyId });
  if (before) s = poach(s, before, table, rng);
  return emit(s, {
    kind: 'rankingsPublished',
    year,
    rank: rankOf(table),
    previous: before ? rankOf(before) : null,
    total: table.rows.length,
  });
}
