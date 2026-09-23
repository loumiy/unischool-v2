import {
  budgetFactor,
  SPORTS,
  sportById,
  TAUNTS,
  type AthleticsBudget,
  type SportDef,
} from '../content/athletics.ts';
import { LEAGUE_SCHOOLS } from '../content/league.ts';
import {
  ATHLETICS_BUDGET_SCHEDULE,
  ATHLETICS_CLIMB,
  ATHLETICS_CLIMB_FROM,
  GAMES_PER_SEASON,
  RIVAL_MATCH,
  RIVAL_NEAR_START,
  RIVAL_NEAR_YEARLY,
  RIVAL_THRESHOLD,
  RIVAL_FIRST_YEAR,
  TAUNT_CHANCE,
  TITLE_WINS,
  VARSITY_BUDGET_EDGE,
  VARSITY_LIFE,
} from '../tuning.ts';
import { emit } from './bus.ts';
import { openPlacements } from './estate.ts';
import { latestTable, PLAYER_ID, rankOf } from './league.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';
import { tagTeeth } from './tags.ts';

// ATHLETICS-LITE AND THE RIVAL (DD §8.5, §11.3). Varsity teams are toggled
// on where the college has the facilities they need; each costs a year at
// the budget level the college sets, reaches students the way a student-
// life building does, and at the end of its term plays a season against
// the league. No rosters: a season is a record, and sometimes a title.
//
// The rival emerges from the world rather than a menu: the neighbours start
// ahead, every meeting on the field adds to it, and so does anything one
// college takes from the other. Once a school's score clears the line, it
// is the rival for good, and it talks.

export interface Season {
  year: number;
  term: 'fall' | 'spring';
  sportId: string;
  wins: number;
  losses: number;
  title: boolean;
  // The meeting with the rival this season, if there was one.
  rivalResult: 'won' | 'lost' | null;
}

export interface Athletics {
  varsity: string[];
  budget: AthleticsBudget;
  seasons: Season[];
  rivalry: Record<string, number>; // league school id → how much of a rival
  rivalId: string | null;
  rivalSince: number | null;
}

export function foundingAthletics(seed: number): Athletics {
  // The neighbours start with a head start, each a little different run to
  // run, so the same one is not the rival every time.
  const rng = athleticsRng(seed, 0, 0x71fa1);
  const rivalry: Record<string, number> = {};
  for (const s of LEAGUE_SCHOOLS)
    rivalry[s.id] = s.region === 'near' ? RIVAL_NEAR_START + rng.int(0, 3) : 0;
  return { varsity: [], budget: 'standard', seasons: [], rivalry, rivalId: null, rivalSince: null };
}

// ---------- reading it ----------

export function sportHasVenue(state: GameState, sport: SportDef): boolean {
  if (sport.requires.length === 0) return true;
  return openPlacements(state).some((p) => sport.requires.includes(p.buildingId));
}

export function annualAthleticsCost(state: GameState): number {
  const factor = budgetFactor(state.athletics.budget);
  return Math.round(state.athletics.varsity.reduce((t, id) => t + sportById(id).cost, 0) * factor);
}

// Students the varsity teams reach (counted into student life).
export function varsityLife(state: GameState): number {
  return state.athletics.varsity.length * VARSITY_LIFE;
}

export function lastSeason(state: GameState, sportId: string): Season | null {
  for (let i = state.athletics.seasons.length - 1; i >= 0; i--) {
    const s = state.athletics.seasons[i]!;
    if (s.sportId === sportId) return s;
  }
  return null;
}

export function titlesIn(state: GameState, year: number): number {
  return state.athletics.seasons.filter((s) => s.year === year && s.title).length;
}

// ---------- the actions ----------

export function setVarsity(state: GameState, sportId: string, on: boolean): GameState {
  const has = state.athletics.varsity.includes(sportId);
  if (has === on) return state;
  const varsity = on
    ? [...state.athletics.varsity, sportId]
    : state.athletics.varsity.filter((id) => id !== sportId);
  return { ...state, athletics: { ...state.athletics, varsity } };
}

export function setAthleticsBudget(state: GameState, budget: AthleticsBudget): GameState {
  return { ...state, athletics: { ...state.athletics, budget } };
}

// ---------- the seasons ----------

function athleticsRng(seed: number, year: number, salt: number): Rng {
  return Rng.fromSeed((seed ^ Math.imul(year + 104_729, 0xc2b2ae35) ^ salt) >>> 0);
}

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// How good a team is, 0–100: the college's athletics standing, the budget,
// and whether it has a proper venue (rowing needs only the stream).
export function teamStrength(state: GameState, sport: SportDef): number {
  const edge = (budgetFactor(state.athletics.budget) - 1) * VARSITY_BUDGET_EDGE;
  const venues = sport.requires.length === 0 ? 1 : sportHasVenue(state, sport) ? 1 : 0;
  return (
    30 + 0.5 * state.prestige.axes.athletics + edge + venues * 10 + tagTeeth(state, 'athletics')
  );
}

// How much harder the schedule is than the league's own standings say: a
// rising programme is booked against better ones, and a bigger budget
// buys bigger games (Phase 38).
export function scheduleClimb(state: GameState): number {
  const standing = Math.max(0, state.prestige.axes.athletics - ATHLETICS_CLIMB_FROM);
  const edge = Math.max(0, (budgetFactor(state.athletics.budget) - 1) * VARSITY_BUDGET_EDGE);
  return standing * ATHLETICS_CLIMB + edge * ATHLETICS_BUDGET_SCHEDULE;
}

function playSeason(
  state: GameState,
  sport: SportDef,
  term: 'fall' | 'spring',
): { season: Season; met: { id: string; won: boolean }[] } {
  const year = state.clock.year;
  const rng = athleticsRng(state.seed, year, hashOf(sport.id + term));
  const us = teamStrength(state, sport);
  // The schedule: the rival and the neighbours first, the rest drawn.
  const pool = [...state.league.schools];
  const fixed = pool.filter(
    (s) =>
      s.id === state.athletics.rivalId ||
      LEAGUE_SCHOOLS.find((d) => d.id === s.id)?.region === 'near',
  );
  const rest = pool.filter((s) => !fixed.includes(s));
  const schedule = [...fixed];
  while (schedule.length < GAMES_PER_SEASON && rest.length > 0) {
    schedule.push(rest.splice(rng.int(0, rest.length - 1), 1)[0]!);
  }
  let wins = 0;
  let rivalResult: Season['rivalResult'] = null;
  const met: { id: string; won: boolean }[] = [];
  const climb = scheduleClimb(state);
  for (const opp of schedule.slice(0, GAMES_PER_SEASON)) {
    // The schedule climbs with the college, and the rival raises its game
    // to meet it (Phase 38): a conference won every year is a conference
    // the college has outgrown.
    let them = opp.axes.athletics + climb;
    if (opp.id === state.athletics.rivalId && us > them) them += (us - them) * RIVAL_MATCH;
    const p = 1 / (1 + Math.exp(-(us - them) / 12));
    const won = rng.next() < p;
    if (won) wins++;
    met.push({ id: opp.id, won });
    if (opp.id === state.athletics.rivalId) rivalResult = won ? 'won' : 'lost';
  }
  const played = met.length;
  return {
    season: {
      year,
      term,
      sportId: sport.id,
      wins,
      losses: played - wins,
      title: wins >= TITLE_WINS,
      rivalResult,
    },
    met,
  };
}

// The share of games won over the last year's seasons: the "form" the
// athletics reading carries (prestige.ts).
function formOf(state: GameState): number {
  const recent = state.athletics.seasons.filter((s) => s.year >= state.clock.year - 1);
  const played = recent.reduce((t, s) => t + s.wins + s.losses, 0);
  if (played === 0) return state.prestige.athleticsForm * 0.5;
  return recent.reduce((t, s) => t + s.wins, 0) / played;
}

function closeSeasons(state: GameState, term: 'fall' | 'spring'): GameState {
  let s = state;
  const rivalry = { ...s.athletics.rivalry };
  const seasons = [...s.athletics.seasons];
  for (const id of s.athletics.varsity) {
    const sport = sportById(id);
    if (sport.season !== term) continue;
    const { season, met } = playSeason(s, sport, term);
    seasons.push(season);
    s = emit(s, {
      kind: 'seasonClosed',
      sportId: id,
      wins: season.wins,
      losses: season.losses,
      title: season.title,
    });
    // Every meeting on the field makes a rival, and a defeat more so: the
    // neighbours, whom the schedule always meets, most of all.
    for (const m of met)
      rivalry[m.id] = Number(((rivalry[m.id] ?? 0) + (m.won ? 0.4 : 0.7)).toFixed(2));
    if (season.rivalResult && s.athletics.rivalId) {
      const line = TAUNTS[season.rivalResult === 'won' ? 'beat' : 'lost'];
      s = emit(s, {
        kind: 'rivalTaunt',
        schoolId: s.athletics.rivalId,
        mood: season.rivalResult === 'won' ? 'beat' : 'lost',
        index: season.wins % line.length,
      });
    }
  }
  s = { ...s, athletics: { ...s.athletics, seasons, rivalry } };
  return { ...s, prestige: { ...s.prestige, athleticsForm: Number(formOf(s).toFixed(3)) } };
}

// The rival, once a school clears the line (and never before a few years
// have passed: a rivalry wants a history).
function nameRival(state: GameState): GameState {
  if (state.athletics.rivalId || state.clock.year < RIVAL_FIRST_YEAR) return state;
  let best: string | null = null;
  let score = RIVAL_THRESHOLD - 1e-9;
  for (const [id, v] of Object.entries(state.athletics.rivalry)) {
    if (v > score || (v === score && best !== null && id < best)) {
      best = id;
      score = v;
    }
  }
  if (!best) return state;
  return emit(
    { ...state, athletics: { ...state.athletics, rivalId: best, rivalSince: state.clock.year } },
    { kind: 'rivalNamed', schoolId: best },
  );
}

// Something one college took from the other (Phase 24's poaching) makes a
// rival faster than anything.
export function addRivalry(state: GameState, schoolId: string, amount: number): GameState {
  const rivalry = { ...state.athletics.rivalry };
  rivalry[schoolId] = (rivalry[schoolId] ?? 0) + amount;
  return { ...state, athletics: { ...state.athletics, rivalry } };
}

// A taunt mid-term, when there is a rival to make one: gloating from
// above, sniping from below.
function midTermTaunt(state: GameState): GameState {
  const rival = state.athletics.rivalId;
  const table = latestTable(state);
  if (!rival || !table) return state;
  const rng = athleticsRng(state.seed, state.clock.year, hashOf(`taunt-${state.clock.term}`));
  if (!rng.chance(TAUNT_CHANCE)) return state;
  const mood = rankOf(table, rival) < rankOf(table, PLAYER_ID) ? 'ahead' : 'behind';
  return emit(state, {
    kind: 'rivalTaunt',
    schoolId: rival,
    mood,
    index: rng.int(0, TAUNTS[mood].length - 1),
  });
}

export function athleticsWeek(state: GameState): GameState {
  const { clock } = state;
  let s = state;
  if (clock.term === 'fall' && clock.week === 1) {
    // A year of being neighbours.
    const rivalry = { ...s.athletics.rivalry };
    for (const n of LEAGUE_SCHOOLS)
      if (n.region === 'near') rivalry[n.id] = (rivalry[n.id] ?? 0) + RIVAL_NEAR_YEARLY;
    s = nameRival({ ...s, athletics: { ...s.athletics, rivalry } });
  }
  if ((clock.term === 'fall' || clock.term === 'spring') && clock.week === 7) s = midTermTaunt(s);
  if (clock.term === 'fall' && clock.week === 14) s = closeSeasons(s, 'fall');
  if (clock.term === 'spring' && clock.week === 14) s = closeSeasons(s, 'spring');
  return s;
}

export { SPORTS };
