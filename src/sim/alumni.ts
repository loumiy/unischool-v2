import {
  ALUMNI_WORDS,
  MEMORY_CLAUSES,
  MEMORY_LINE,
  type MemoryCondition,
} from '../content/alumni.ts';
import {
  BUILDING_GIVING_CAP,
  GIVING_MATURITY_YEARS,
  MEMORY_BEDS_LOST,
  GIVING_PER_ALUM,
  GIVING_YOUNG_SHARE,
  MEMORY_ADRIFT_SHARE,
  MEMORY_BUILDINGS,
  MEMORY_CLAUSE_LIMIT,
  MEMORY_DEFICIT_YEARS,
  MEMORY_DISTINGUISHED_SHARE,
  MEMORY_THINNED_SHARE,
  REUNION_COST_PER_HEAD,
  REUNION_WARMTH,
  REUNION_WARMTH_CAP,
  WARMTH_FROM_OUTCOMES,
  WARMTH_FROM_SATISFACTION,
} from '../tuning.ts';
import { buildingById } from '../content/buildings.ts';
import { campusBeauty } from './beauty.ts';
import { entriesBetween } from './bus.ts';
import { classLabel, WEEKS_PER_YEAR } from './calendar.ts';
import { RUNG_AUSTERITY, RUNG_FREEZE, RUNG_RECEIVERSHIP } from './distress.ts';
import type { AlumniClass, Cohort, Outcomes } from './people.ts';
import type { GameState } from './state.ts';
import { tagTeeth } from './tags.ts';

// THE ALUMNI LEDGER (DD §8.4): the game's long memory. A class is stamped
// at graduation with one line about its four years — read off the journal
// of those years and the numbers it left with, never invented — and that
// line sets its WARMTH. Warmth pays out for the rest of the run through
// the annual fund, and later through campaigns (§9.3). It can be nudged
// by a reunion and never rewritten, which is the point: a housing crunch
// in year 12 is still costing the college money in year 40.

// What the four years held, as facts. Everything here is read from the
// journal between their Convocation and their Commencement.
export interface ClassHistory {
  // Beds that went out from under them: a hall demolished or shut for
  // the works while they were here. The routine crowding the admissions
  // office plans for is not this (tuning.ts).
  bedsLost: number;
  left: number;
  buildings: number;
  renovations: number;
  schoolsFounded: number;
  programsOpened: number;
  programsClosed: number;
  worstRung: number;
  cuts: boolean;
  deficitYears: number;
}

// The week a class arrived: Convocation of the year they came up, three
// years before the year they graduate.
export function arrivalWeekOf(classYear: number): number {
  return Math.max(0, (classYear - 4) * WEEKS_PER_YEAR);
}

export function classHistory(state: GameState, cohort: Cohort): ClassHistory {
  const from = arrivalWeekOf(cohort.classYear);
  const entries = entriesBetween(state, from, state.clock.absoluteWeek);
  const h: ClassHistory = {
    bedsLost: 0,
    left: 0,
    buildings: 0,
    renovations: 0,
    schoolsFounded: 0,
    programsOpened: 0,
    programsClosed: 0,
    worstRung: 0,
    cuts: false,
    deficitYears: 0,
  };
  for (const e of entries) {
    switch (e.kind) {
      case 'buildingDemolished':
      case 'renovationBegun':
        h.bedsLost += buildingById(e.buildingId).capacity?.beds ?? 0;
        if (e.kind === 'renovationBegun') h.renovations++;
        break;
      case 'studentsLeft':
        h.left += e.count;
        break;
      case 'buildingCompleted':
        h.buildings++;
        break;
      case 'renovated':
        h.renovations++;
        break;
      case 'schoolFounded':
        h.schoolsFounded++;
        break;
      case 'programOpened':
        h.programsOpened++;
        break;
      case 'programClosed':
        h.programsClosed++;
        break;
      case 'rungChanged':
        h.worstRung = Math.max(h.worstRung, e.to);
        break;
      case 'cutsImposed':
        h.cuts = true;
        break;
      case 'yearClosed':
        if (e.net < 0) h.deficitYears++;
        break;
      default:
        break;
    }
  }
  return h;
}

// ---------- the memory ----------

interface MemoryContext {
  state: GameState;
  cohort: Cohort;
  history: ClassHistory;
  outcomes: Outcomes;
}

const CONDITIONS: Record<MemoryCondition, (c: MemoryContext) => boolean> = {
  always: () => true,
  overcrowded: ({ history }) => history.bedsLost >= MEMORY_BEDS_LOST,
  thinned: ({ history, cohort }) =>
    cohort.size > 0 && history.left / (cohort.size + history.left) >= MEMORY_THINNED_SHARE,
  poorlyTaught: ({ cohort }) => cohort.quality < 40,
  wellTaught: ({ cohort }) => cohort.quality >= 60,
  happy: ({ cohort }) => cohort.satisfaction >= 70,
  unhappy: ({ cohort }) => cohort.satisfaction < 50,
  building: ({ history }) => history.buildings >= MEMORY_BUILDINGS,
  renovated: ({ history }) => history.renovations > 0,
  newSchool: ({ history }) => history.schoolsFounded > 0,
  firstOfProgram: ({ history }) => history.programsOpened > 0,
  programLost: ({ history }) => history.programsClosed > 0,
  freeze: ({ history }) => history.worstRung === RUNG_FREEZE,
  austerity: ({ history }) => history.worstRung === RUNG_AUSTERITY,
  receivership: ({ history }) => history.worstRung >= RUNG_RECEIVERSHIP,
  cuts: ({ history }) => history.cuts,
  deficits: ({ history }) => history.deficitYears >= MEMORY_DEFICIT_YEARS,
  distinguished: ({ outcomes, cohort }) =>
    cohort.size > 0 && outcomes.distinguished / cohort.size >= MEMORY_DISTINGUISHED_SHARE,
  adrift: ({ outcomes, cohort }) =>
    cohort.size > 0 && outcomes.adrift / cohort.size >= MEMORY_ADRIFT_SHARE,
  beautiful: ({ state }) => campusBeauty(state) >= 70,
};

// Every clause a class earned, loudest first — "loudest" being how far
// it moves warmth, so what mattered most leads. WARMTH counts all of
// them, because all of it happened; the LINE shows the first few,
// because a memory is one sentence and not a transcript.
export function memoryFor(
  state: GameState,
  cohort: Cohort,
  outcomes: Outcomes,
  history = classHistory(state, cohort),
): string[] {
  const ctx: MemoryContext = { state, cohort, history, outcomes };
  const earned = MEMORY_CLAUSES.filter((c) => c.when !== 'always' && CONDITIONS[c.when](ctx));
  if (earned.length === 0) return [MEMORY_CLAUSES.find((c) => c.when === 'always')!.id];
  return earned
    .slice()
    .sort((a, b) => Math.abs(b.warmth) - Math.abs(a.warmth))
    .map((c) => c.id);
}

// Warmth at graduation: how they felt, how they turned out, and what
// their years earned them.
export function warmthFor(cohort: Cohort, outcomes: Outcomes, memory: string[]): number {
  const total = Math.max(1, cohort.size);
  const outcomeScore = 100 * (outcomes.distinguished / total) + 60 * (outcomes.placed / total) + 0;
  const base = cohort.satisfaction * WARMTH_FROM_SATISFACTION + outcomeScore * WARMTH_FROM_OUTCOMES;
  const clauses = memory.reduce(
    (t, id) => t + (MEMORY_CLAUSES.find((c) => c.id === id)?.warmth ?? 0),
    0,
  );
  return Number(Math.min(100, Math.max(0, base + clauses)).toFixed(1));
}

// The line itself, from content/alumni.json.
export function memoryLine(alumni: Pick<AlumniClass, 'classYear' | 'memory'>): string {
  const texts = alumni.memory
    .slice(0, MEMORY_CLAUSE_LIMIT)
    .map((id) => MEMORY_CLAUSES.find((c) => c.id === id)?.text ?? id);
  const clauses =
    texts.length <= 1
      ? (texts[0] ?? '')
      : `${texts.slice(0, -1).join(', ')} and ${texts[texts.length - 1]}`;
  return MEMORY_LINE.replace('{label}', classLabel(alumni.classYear)).replace('{clauses}', clauses);
}

// ---------- the annual fund (DD §5.1) ----------

// How far a class has come since it left, 0–1: nobody gives much in their
// twenties, and a class keeps giving once established.
export function maturityOf(yearsOut: number): number {
  const ramp = Math.min(1, Math.max(0, yearsOut / GIVING_MATURITY_YEARS));
  return GIVING_YOUNG_SHARE + (1 - GIVING_YOUNG_SHARE) * ramp;
}

export function givingOf(alumni: AlumniClass, year: number): number {
  const yearsOut = Math.max(0, year - alumni.classYear);
  const warmth = alumni.warmth / 50; // 0 at nothing, 1 at neutral, 2 at devoted
  const means = 0.5 + alumni.quality / 100;
  return Math.round(alumni.size * GIVING_PER_ALUM * warmth * means * maturityOf(yearsOut));
}

// Somewhere to come back to (Phase 21J): the alumni house's share on top
// of what the classes give, capped.
export function buildingGivingFactor(state: GameState): number {
  let points = 0;
  for (const p of state.campus.placements) {
    if (p.status !== 'open') continue;
    points += buildingById(p.buildingId).capacity?.giving ?? 0;
  }
  return 1 + Math.min(BUILDING_GIVING_CAP, points / 100);
}

export function annualGiving(state: GameState): number {
  const base = state.people.alumni.reduce((t, a) => t + givingOf(a, state.clock.year), 0);
  // Old boys and grant officers (Phase 43): what the tags do for giving.
  return Math.round(base * buildingGivingFactor(state) * (1 + tagTeeth(state, 'giving')));
}

// ---------- reunions (DD §8.4) ----------

export function reunionCost(alumni: AlumniClass): number {
  return Math.round(alumni.size * REUNION_COST_PER_HEAD);
}

export function reunionRoom(alumni: AlumniClass): number {
  return Math.max(0, REUNION_WARMTH_CAP - alumni.nudged);
}

export function canReunite(alumni: AlumniClass, year: number): boolean {
  return reunionRoom(alumni) > 0 && alumni.lastReunion !== year;
}

export function holdReunion(state: GameState, classYear: number): AlumniClass[] {
  return state.people.alumni.map((a) => {
    if (a.classYear !== classYear) return a;
    const nudge = Math.min(REUNION_WARMTH, reunionRoom(a));
    return {
      ...a,
      warmth: Number(Math.min(100, a.warmth + nudge).toFixed(1)),
      nudged: Number((a.nudged + nudge).toFixed(1)),
      lastReunion: state.clock.year,
    };
  });
}

export function warmthNote(): string {
  return ALUMNI_WORDS.warmthNote;
}
