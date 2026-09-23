import { charterById, type CharterDef } from '../content/charters.ts';
import type { BuildingDef } from '../content/buildings.ts';
import {
  CHARTER_FADE_YEARS,
  CHARTER_LEAN_FLOOR,
  CHARTER_TAG_NUDGE,
  CHARTER_LANDMARK_SHARE,
  CHARTER_PROJECT_SHARE,
  CHARTER_SCHOOL_SHARE,
  SCHOOL_FOUNDING_COST,
} from '../tuning.ts';
import type { GameState } from './state.ts';

// THE FOUNDING CHARTER, AT WORK (Phase 43). What the founders meant the
// college to be: a school cheaper to found, a capital project and a grand
// landmark at a discount, a lean on the standings and on the applicant pool
// that fades over the college's first quarter century, and the world's
// questions weighted its way. A college founded before charters has none.

export function charterOf(state: GameState): CharterDef | null {
  const id = state.identity?.charter ?? null;
  return id ? charterById(id) : null;
}

// How much of the founders' intent is still the college's: all of it at
// the founding, none of it by CHARTER_FADE_YEARS.
export function charterFade(state: GameState): number {
  return Math.max(0, 1 - (state.clock.year - 1) / CHARTER_FADE_YEARS);
}

// The founders' intent never quite leaves: the lean on the standings fades
// to a floor, not to nothing.
function leanFade(state: GameState): number {
  return Math.max(CHARTER_LEAN_FLOOR, charterFade(state));
}

// How far the guidebooks are inclined, from the start, toward calling the
// college what its charter meant it to be: a nudge on that tag's
// indicator, fading with the rest.
export function charterTagNudge(state: GameState, tag: string): number {
  const c = charterOf(state);
  return c && c.tag === tag ? CHARTER_TAG_NUDGE * leanFade(state) : 0;
}

export function schoolFoundingCostFor(state: GameState, schoolId: string): number {
  const c = charterOf(state);
  return Math.round(SCHOOL_FOUNDING_COST * (c?.school === schoolId ? CHARTER_SCHOOL_SHARE : 1));
}

// What a building costs this college to put up.
export function buildCost(state: GameState, def: BuildingDef): number {
  const c = charterOf(state);
  if (!c) return def.cost;
  const share =
    c.project === def.id
      ? CHARTER_PROJECT_SHARE
      : c.landmark === def.id
        ? CHARTER_LANDMARK_SHARE
        : 1;
  return Math.round(def.cost * share);
}

// Points on the year's axis readings, fading.
export function charterLean(state: GameState): Partial<Record<string, number>> {
  const c = charterOf(state);
  if (!c) return {};
  const f = leanFade(state);
  const out: Partial<Record<string, number>> = {};
  for (const [axis, n] of Object.entries(c.lean)) out[axis] = (n ?? 0) * f;
  return out;
}

// A factor on the applicant pool, fading to 1.
export function charterDemand(state: GameState): number {
  const c = charterOf(state);
  return c ? 1 + (c.demand - 1) * charterFade(state) : 1;
}

// A factor on an event's weight by its domain (the world asks a research
// university about grants, and a land-grant college about its board).
export function charterDomainWeight(state: GameState, domain: string): number {
  return charterOf(state)?.domains[domain] ?? 1;
}
