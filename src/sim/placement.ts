import { buildingById } from '../content/buildings.ts';
import { PAIRINGS, type PairingDef } from '../content/placement.ts';
import { BEAUTY_POOL_SWING, BEAUTY_WEIGHT, PAIRING_RADIUS, PLACEMENT_CAP } from '../tuning.ts';
import { campusBeauty } from './beauty.ts';
import type { Placement } from './campus.ts';
import { openPlacements } from './estate.ts';
import type { GameState } from './state.ts';

// PLACEMENT, AGGREGATED AND CAPPED (DD §6.2, guardrail §17.2). Everything
// the layout is worth — campus beauty and the pairings of buildings that
// belong near each other — passes through this one function, and the total
// is clamped to the cap on each output it touches. There is deliberately
// one place to look: a new placement effect adds a term here and cannot
// widen the total, so the player who ignores layout entirely stays fully
// viable, and the proof is a test rather than a promise.

export interface PlacementTerm {
  id: string;
  label: string;
  line: string;
  value: number; // in the output's own units, before the cap
}

export interface CappedEffect {
  terms: PlacementTerm[];
  raw: number; // the terms, summed
  limit: number; // the cap, in the output's units
  applied: number; // what the sim actually uses
  capped: boolean;
}

function capped(terms: PlacementTerm[], limit: number): CappedEffect {
  const raw = Number(terms.reduce((t, x) => t + x.value, 0).toFixed(3));
  const applied = Number(Math.max(-limit, Math.min(limit, raw)).toFixed(3));
  return { terms, raw, limit, applied, capped: applied !== raw };
}

// ---------- pairings (DD §6.2) ----------

// Tiles between two footprints, edge to edge; 0 if they touch or overlap.
export function gapBetween(a: Placement, b: Placement): number {
  const dc = Math.max(0, Math.max(a.col - (b.col + b.w), b.col - (a.col + a.w)));
  const dr = Math.max(0, Math.max(a.row - (b.row + b.h), b.row - (a.row + a.h)));
  return Math.max(dc, dr);
}

// A rule's side names either a building id or a category.
function matches(p: Placement, side: string): boolean {
  const def = buildingById(p.buildingId);
  return def.id === side || def.category === side;
}

export interface PairingResult {
  def: PairingDef;
  total: number; // eligible buildings of the rule's own kind
  paired: number; // of those, the ones with a partner within the radius
  points: number;
}

export function pairingResults(state: GameState): PairingResult[] {
  const open = openPlacements(state);
  return PAIRINGS.map((def) => {
    const from = open.filter((p) => matches(p, def.from));
    const to = open.filter((p) => matches(p, def.to) && !(def.from === def.to && from.length < 2));
    const paired = from.filter((p) =>
      to.some((q) => q.id !== p.id && gapBetween(p, q) <= PAIRING_RADIUS),
    ).length;
    const points = from.length === 0 ? 0 : (paired / from.length) * def.points;
    return { def, total: from.length, paired, points: Number(points.toFixed(3)) };
  });
}

// ---------- the aggregation ----------

// What the layout is worth to the students' mood, in satisfaction points.
// Satisfaction runs 0–100, so the cap is that many points either way.
export function placementSatisfaction(state: GameState): CappedEffect {
  const beauty = campusBeauty(state);
  const terms: PlacementTerm[] = [
    {
      id: 'beauty',
      label: 'Campus beauty',
      line: 'Greenery, landmarks, upkeep and the quads, against the middle.',
      value: Number((((beauty - 50) / 50) * BEAUTY_WEIGHT).toFixed(3)),
    },
  ];
  for (const r of pairingResults(state)) {
    if (r.total === 0) continue;
    terms.push({ id: r.def.id, label: r.def.label, line: r.def.line, value: r.points });
  }
  return capped(terms, PLACEMENT_CAP * 100);
}

// What it is worth to the applicant pool, as a multiplier about 1.
export function placementPoolEffect(state: GameState): CappedEffect {
  const beauty = campusBeauty(state);
  const terms: PlacementTerm[] = [
    {
      id: 'beauty',
      label: 'Campus beauty',
      line: 'What the guidebooks say about the place, against the middle.',
      value: Number((((beauty - 50) / 50) * BEAUTY_POOL_SWING).toFixed(3)),
    },
  ];
  return capped(terms, PLACEMENT_CAP);
}

export function placementPoolFactor(state: GameState): number {
  return 1 + placementPoolEffect(state).applied;
}
