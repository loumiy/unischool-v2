import { AXES, type Axes, type AxisId } from '../content/league.ts';
import { buildingById, PROJECT_AXES, type ProjectAxis } from '../content/buildings.ts';
import {
  AID_DISCOUNT_RATE,
  PRESTIGE_POOL_SWING,
  PRESTIGE_START,
  PRESTIGE_TRAIL,
  RESEARCH_FULL_ROSTER,
} from '../tuning.ts';
import { openPlacements } from './estate.ts';
import { teachingQuality } from './faculty.ts';
import { enrolled, inTriples } from './people.ts';
import type { GameState } from './state.ts';

// PRESTIGE (DD §11.1): six axes, kept from v1's report card. Each has a
// READING — what the college is doing this year, 0–100 — and a STANDING
// that trails it, moving a share of the way each year. Prestige is the
// standings averaged: a trailing indicator by design, earned over an era
// rather than bought in a term.

export interface Prestige {
  axes: Axes; // the standings
  // Athletics results carry into the reading (Phase 23); a record of the
  // last season's, 0–1, lives here so the reading stays a pure function.
  athleticsForm: number;
  // Every year's standings, as they stood at its turn (Phase 27): the
  // Final Report grades the arc, not the last snapshot.
  history: { year: number; axes: Axes }[];
}

export function foundingPrestige(): Prestige {
  const axes = {} as Axes;
  for (const a of AXES) axes[a] = PRESTIGE_START;
  return { axes, athleticsForm: 0, history: [] };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);

function countOpen(state: GameState, pick: (id: string) => boolean): number {
  return openPlacements(state).filter((p) => pick(p.buildingId)).length;
}

// What the college is doing on each axis this year.
export function axisReadings(state: GameState): Axes {
  const cohorts = state.people.cohorts;
  const quality = mean(cohorts.map((c) => c.quality));
  const satisfaction = mean(cohorts.map((c) => c.satisfaction));
  const teaching = teachingQuality(state);
  const signatures = state.academics.programs.filter((p) => p.signature).length;
  const academics = cohorts.length
    ? 0.45 * teaching + 0.45 * quality + 10 * Math.min(1, signatures / 2)
    : 0.5 * teaching;

  const roster = state.faculty.roster;
  const researchers = mean(roster.map((f) => f.research));
  const labs = countOpen(state, (id) =>
    ['research-institute', 'science-center', 'engineering-building', 'observatory', 'lab'].includes(
      id,
    ),
  );
  const research =
    researchers * Math.min(1, roster.length / RESEARCH_FULL_ROSTER) + Math.min(15, labs * 5);

  const experience = cohorts.length ? satisfaction : 0;

  const venues = countOpen(state, (id) => buildingById(id).category === 'athletics');
  const athletics = Math.min(60, 15 * venues) + 40 * state.prestige.athleticsForm;

  const aid = state.people.aidRate;
  const open = 1 - state.people.terms.selectivity;
  const crowded = enrolled(state) > 0 ? inTriples(state) / enrolled(state) : 0;
  const access = 40 + (aid - AID_DISCOUNT_RATE) * 150 + open * 30 - crowded * 60;

  const t = state.treasury;
  const endowment = t.endowment / 1e6;
  const finance =
    20 +
    28 * Math.log10(1 + endowment / 10) +
    (t.cash > 0 ? 6 : -10) -
    Math.min(20, t.debt / 1e6 / 5) -
    8 * state.distress.rung;

  const lift = projectBoosts(state);
  return {
    academics: clamp(academics + lift.academics),
    research: clamp(research + lift.research),
    experience: clamp(experience + lift.experience),
    athletics: clamp(athletics + lift.athletics),
    access: clamp(access),
    finance: clamp(finance),
  };
}

// What the open capital projects add to the year's readings (Phase 42): a
// research park makes a research college, a stadium an athletic one.
export function projectBoosts(state: GameState): Record<ProjectAxis, number> {
  const lift: Record<ProjectAxis, number> = {
    academics: 0,
    research: 0,
    experience: 0,
    athletics: 0,
  };
  for (const p of openPlacements(state)) {
    const terms = buildingById(p.buildingId).project;
    if (!terms) continue;
    for (const axis of PROJECT_AXES) lift[axis] += (terms.boosts[axis] ?? 0) * p.condition;
  }
  return lift;
}

// The year's move: each standing a share of the way to its reading.
export function trailPrestige(state: GameState): GameState {
  const reading = axisReadings(state);
  const axes = { ...state.prestige.axes };
  for (const a of AXES) {
    axes[a] = Number((axes[a] + (reading[a] - axes[a]) * PRESTIGE_TRAIL).toFixed(2));
  }
  const history = [...state.prestige.history, { year: state.clock.year - 1, axes }];
  return { ...state, prestige: { ...state.prestige, axes, history } };
}

export function prestigeOf(axes: Axes): number {
  return Number(mean(AXES.map((a) => axes[a])).toFixed(1));
}

export function collegePrestige(state: GameState): number {
  return prestigeOf(state.prestige.axes);
}

// Prestige on the applicant pool (DD §8.2, Phase 24): neutral at a
// founding college's standing, and a share more for every point above it.
export function prestigePoolFactor(state: GameState): number {
  return Math.max(0.5, 1 + ((collegePrestige(state) - PRESTIGE_START) / 100) * PRESTIGE_POOL_SWING);
}

export function weightedScore(axes: Axes, weights: Axes): number {
  let s = 0;
  for (const a of AXES) s += axes[a] * weights[a];
  return Number(s.toFixed(2));
}

export function axisLabelOrder(): readonly AxisId[] {
  return AXES;
}
