import {
  HERITAGES,
  NAME_POOLS,
  QUIRKS,
  quirkById,
  type Gender,
  type RankId,
} from '../content/faculty.ts';
import { findProgram, SCHOOLS, tierById } from '../content/schools.ts';
import {
  FACULTY_TEACHING_LOAD,
  MARKET_FOUNDED_SHARE,
  MARKET_SIZE,
  QUIRK_MORALE_CAP,
  RANK_ODDS,
  RANK_SKILL_BONUS,
  SALARY_BY_RANK,
  SALARY_ROUNDING,
  SALARY_SKILL_PREMIUM,
  SEVERANCE_WEEKS,
  SKILL_MAX,
  SKILL_MEAN,
  SKILL_MIN,
  SKILL_SD,
  TEACHING_NEUTRAL,
  TEACHING_WEIGHT,
} from '../tuning.ts';
import { openProgram, type OpenProgram } from './academics.ts';
import { emit } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { pay } from './estate.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';

// FACULTY (DD §7.3): competence and cost, deliberately not ego-sims. A
// hire is a teaching skill, a research skill, a salary, a rank and one
// quirk. The market is listed at Budget & Hiring and closes when the
// budget is approved; a hire joins the payroll the week they sign and is
// assigned to a program in their field. Program quality (DD §7.4) is the
// faculty assigned, damped by understaffing, lifted by tier and worn by
// the hall, and it feeds satisfaction (DD §8.3).

export interface Faculty {
  id: string;
  name: string;
  // For the portrait (ui/FacultyPortrait.tsx), never for the sim.
  gender: Gender;
  heritage: string;
  rank: RankId;
  teaching: number; // 0–100, before the quirk
  research: number; // 0–100, before the quirk
  salary: number; // a year
  quirkId: string;
  schoolId: string; // their field
  programId: string | null; // what they teach; null on the market or between programs
  hiredWeek: number | null; // null while a candidate
}

export interface FacultyState {
  roster: Faculty[];
  market: Faculty[]; // this summer's candidates, while the market is open
  marketOpen: boolean;
  marketYear: number; // the last year a market was listed
  nextId: number;
}

export function foundingFaculty(): FacultyState {
  return { roster: [], market: [], marketOpen: false, marketYear: 0, nextId: 1 };
}

// ---------- a hire, read ----------

export function effectiveTeaching(f: Faculty): number {
  return clampSkill(f.teaching + (quirkById(f.quirkId).effects.teaching ?? 0));
}

export function effectiveResearch(f: Faculty): number {
  return clampSkill(f.research + (quirkById(f.quirkId).effects.research ?? 0));
}

function clampSkill(v: number): number {
  return Math.min(100, Math.max(0, v));
}

// The asking salary: the rank's base, moved by skill, times the quirk.
export function askingSalary(
  rank: RankId,
  teaching: number,
  research: number,
  quirkId: string,
): number {
  const skill = (teaching + research) / 2;
  const premium = 1 + ((skill - 50) / 100) * SALARY_SKILL_PREMIUM;
  const factor = quirkById(quirkId).effects.salary ?? 1;
  return Math.round((SALARY_BY_RANK[rank] * premium * factor) / SALARY_ROUNDING) * SALARY_ROUNDING;
}

export function severanceFor(f: Faculty): number {
  return Math.round((f.salary * SEVERANCE_WEEKS) / WEEKS_PER_YEAR);
}

// ---------- the market ----------

// A normal draw (Box–Muller) off the given stream.
function normal(rng: Rng, mean: number, sd: number): number {
  const u = 1 - rng.next();
  const v = rng.next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function drawRank(rng: Rng): RankId {
  const r = rng.next();
  if (r < RANK_ODDS.assistant) return 'assistant';
  if (r < RANK_ODDS.assistant + RANK_ODDS.associate) return 'associate';
  return 'full';
}

function drawSkill(rng: Rng, rank: RankId): number {
  const raw = normal(rng, SKILL_MEAN, SKILL_SD) + RANK_SKILL_BONUS[rank];
  return Math.round(Math.min(SKILL_MAX, Math.max(SKILL_MIN, raw)));
}

export function generateCandidate(rng: Rng, id: string, schoolId: string): Faculty {
  const gender: Gender = rng.chance(0.5) ? 'male' : 'female';
  const heritage = rng.pick(HERITAGES);
  const name = `${rng.pick(NAME_POOLS.given[gender])} ${rng.pick(NAME_POOLS.surnames[heritage]!)}`;
  const rank = drawRank(rng);
  const teaching = drawSkill(rng, rank);
  const research = drawSkill(rng, rank);
  const quirkId = rng.pick(QUIRKS).id;
  return {
    id,
    name,
    gender,
    heritage,
    rank,
    teaching,
    research,
    salary: askingSalary(rank, teaching, research, quirkId),
    quirkId,
    schoolId,
    programId: null,
    hiredWeek: null,
  };
}

// The candidates who exist a given summer are the world's, like the
// market return (treasury.ts): drawn from the seed and the year, not the
// run's stream, so nothing the player does changes who was looking for
// work. Their fields do follow the school — most candidates work in
// fields it has founded, because that is where the searches are.
export function listMarket(state: GameState, year: number): Faculty[] {
  const rng = Rng.fromSeed((state.seed ^ Math.imul(year, 0x85ebca6b) ^ 0xfac0) >>> 0);
  const founded = state.academics.schools.map((s) => s.schoolId);
  const all = SCHOOLS.map((s) => s.id);
  const out: Faculty[] = [];
  for (let i = 0; i < MARKET_SIZE; i++) {
    const field =
      founded.length > 0 && rng.chance(MARKET_FOUNDED_SHARE) ? rng.pick(founded) : rng.pick(all);
    out.push(generateCandidate(rng, `f${state.faculty.nextId + i}`, field));
  }
  return out;
}

// Budget & Hiring fires (DD §3.3): the market is listed.
export function openMarket(state: GameState): GameState {
  const year = state.clock.year;
  const market = listMarket(state, year);
  return emit(
    {
      ...state,
      faculty: {
        ...state.faculty,
        market,
        marketOpen: true,
        marketYear: year,
        nextId: state.faculty.nextId + market.length,
      },
    },
    { kind: 'marketOpened', count: market.length },
  );
}

// The budget is approved: the market closes for the year and whoever is
// still listed takes another offer.
export function closeMarket(state: GameState): GameState {
  if (!state.faculty.marketOpen) return state;
  const unhired = state.faculty.market.length;
  const next: GameState = {
    ...state,
    faculty: { ...state.faculty, market: [], marketOpen: false },
  };
  return unhired > 0 ? emit(next, { kind: 'marketClosed', count: unhired }) : next;
}

export function candidate(state: GameState, id: string): Faculty | null {
  return state.faculty.market.find((f) => f.id === id) ?? null;
}

export function facultyById(state: GameState, id: string): Faculty | null {
  return state.faculty.roster.find((f) => f.id === id) ?? null;
}

// ---------- the roster ----------

export function facultyOf(state: GameState, programId: string): Faculty[] {
  return state.faculty.roster.filter((f) => f.programId === programId);
}

export function unassignedFaculty(state: GameState): Faculty[] {
  return state.faculty.roster.filter((f) => f.programId === null);
}

// Whether a hire may teach this program: it is open, and in their field.
export function canTeach(state: GameState, f: Faculty, programId: string): boolean {
  const def = findProgram(programId);
  return def !== undefined && def.schoolId === f.schoolId && openProgram(state, programId) !== null;
}

export function hireCandidate(
  state: GameState,
  candidateId: string,
  programId: string | null,
): GameState {
  const c = candidate(state, candidateId)!;
  const hired: Faculty = { ...c, programId, hiredWeek: state.clock.absoluteWeek };
  return emit(
    {
      ...state,
      faculty: {
        ...state.faculty,
        roster: [...state.faculty.roster, hired],
        market: state.faculty.market.filter((f) => f.id !== candidateId),
      },
    },
    { kind: 'facultyHired', facultyId: hired.id, name: hired.name, programId },
  );
}

export function assignFaculty(
  state: GameState,
  facultyId: string,
  programId: string | null,
): GameState {
  return {
    ...state,
    faculty: {
      ...state.faculty,
      roster: state.faculty.roster.map((f) => (f.id === facultyId ? { ...f, programId } : f)),
    },
  };
}

export function dismissFaculty(state: GameState, facultyId: string): GameState {
  const f = facultyById(state, facultyId)!;
  const paid = pay(state, severanceFor(f), 'cash');
  return emit(
    {
      ...paid,
      faculty: {
        ...paid.faculty,
        roster: paid.faculty.roster.filter((g) => g.id !== facultyId),
      },
    },
    { kind: 'facultyDismissed', facultyId, name: f.name },
  );
}

// A closed program's faculty are between programs, still on the payroll.
export function unassignFrom(state: GameState, programId: string): GameState {
  if (!state.faculty.roster.some((f) => f.programId === programId)) return state;
  return {
    ...state,
    faculty: {
      ...state.faculty,
      roster: state.faculty.roster.map((f) =>
        f.programId === programId ? { ...f, programId: null } : f,
      ),
    },
  };
}

// ---------- money (DD §5.2) ----------

export function annualFacultyPayroll(state: GameState): number {
  return state.faculty.roster.reduce((t, f) => t + f.salary, 0);
}

// ---------- quality (DD §7.4) ----------

// Hires a program needs at its tier to teach every seat at full quality.
export function staffingNeed(program: OpenProgram): number {
  return Math.max(1, Math.ceil(tierById(program.tier).seats / FACULTY_TEACHING_LOAD));
}

// Program quality, 0–100: the assigned faculty's teaching, damped by
// understaffing, lifted by the tier, worn by the condition of the hall the
// school lives in. Overcrowding (seats against enrollment) is Phase 11's.
export function programQuality(state: GameState, program: OpenProgram): number {
  const staff = facultyOf(state, program.programId);
  if (staff.length === 0) return 0;
  const teaching = staff.reduce((t, f) => t + effectiveTeaching(f), 0) / staff.length;
  const staffing = Math.min(1, staff.length / staffingNeed(program));
  const def = findProgram(program.programId);
  const school = state.academics.schools.find((s) => s.schoolId === def?.schoolId);
  const hall = state.campus.placements.find((p) => p.id === school?.placementId);
  const condition = hall?.status === 'open' ? hall.condition : 1;
  const q = teaching * staffing * tierById(program.tier).qualityFactor * condition;
  return Number(Math.min(100, Math.max(0, q)).toFixed(1));
}

// The campus's teaching, as the cohorts feel it: program quality averaged
// over the open programs; nothing to study is nothing.
export function teachingQuality(state: GameState): number {
  const programs = state.academics.programs;
  if (programs.length === 0) return 0;
  const total = programs.reduce((t, p) => t + programQuality(state, p), 0);
  return Number((total / programs.length).toFixed(1));
}

// Satisfaction points from teaching (DD §8.3): a swing of TEACHING_WEIGHT
// across the scale, neutral at the line.
export function teachingSatisfaction(state: GameState): number {
  return ((teachingQuality(state) - TEACHING_NEUTRAL) / 100) * TEACHING_WEIGHT;
}

// The quirks' morale, summed over the roster and capped either way.
export function quirkMorale(state: GameState): number {
  const total = state.faculty.roster.reduce(
    (t, f) => t + (quirkById(f.quirkId).effects.morale ?? 0),
    0,
  );
  return Math.min(QUIRK_MORALE_CAP, Math.max(-QUIRK_MORALE_CAP, total));
}
