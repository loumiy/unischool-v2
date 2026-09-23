import { buildingById } from '../content/buildings.ts';
import {
  BEAUTY_POOL_SWING,
  BEAUTY_WEIGHTS,
  GREENERY_TARGET_SHARE,
  LANDMARK_TARGET,
  QUAD_TARGET,
} from '../tuning.ts';
import { openPlacements } from './estate.ts';
import { detectQuads } from './quads.ts';
import type { GameState } from './state.ts';
import { tagTeeth } from './tags.ts';
import { TERRAIN } from './terrain.ts';

// CAMPUS BEAUTY (DD §6.2): a campus-wide score, 0–100, from greenery,
// landmarks, upkeep and the quads the buildings enclose (quads.ts) — each a
// share of a target, weighted. It reaches the applicant pool and the
// cohorts' satisfaction only through the capped aggregation in
// placement.ts. Coherent motifs take their share when motifs become
// per-building. Condition runs through all of it but the trees: a campus
// of ruins keeps only its greenery.

export interface BeautyTerms {
  greenery: number; // 0–1
  landmarks: number; // 0–1
  upkeep: number; // 0–1
  enclosure: number; // 0–1
  score: number; // 0–100
}

const FOUNDING_TREES = Object.keys(TERRAIN.woodland).length;

export function beautyTerms(state: GameState): BeautyTerms {
  const trees = Object.keys(state.campus.trees).length;
  const greenery = Math.min(1, trees / Math.max(1, FOUNDING_TREES * GREENERY_TARGET_SHARE));
  const open = openPlacements(state);
  // A ruin is no landmark and a court of ruins is no quad (Phase 37): a
  // landmark counts for its condition, and the quads for the estate's.
  const marks = open.reduce(
    (t, p) => t + (buildingById(p.buildingId).beauty ?? 0) * p.condition,
    0,
  );
  const landmarks = Math.min(1, marks / LANDMARK_TARGET);
  const upkeep = open.length === 0 ? 1 : open.reduce((t, p) => t + p.condition, 0) / open.length;
  const quads = detectQuads(state.campus);
  const enclosure = Math.min(1, quads.reduce((t, q) => t + q.quality, 0) / QUAD_TARGET) * upkeep;
  // Studios and galleries everywhere (Phase 43): an artsy college's own.
  const score =
    tagTeeth(state, 'beauty') +
    100 *
      (greenery * BEAUTY_WEIGHTS.greenery +
        landmarks * BEAUTY_WEIGHTS.landmarks +
        upkeep * BEAUTY_WEIGHTS.upkeep +
        enclosure * BEAUTY_WEIGHTS.enclosure);
  return {
    greenery,
    landmarks,
    upkeep,
    enclosure: Number(enclosure.toFixed(3)),
    score: Number(Math.min(100, score).toFixed(1)),
  };
}

export function campusBeauty(state: GameState): number {
  return beautyTerms(state).score;
}

// Beauty's own swing on the applicant pool, neutral at 50. It reaches the
// funnel through placement.ts, where it meets the cap.
export function beautyPoolFactor(beauty: number): number {
  return 1 + ((beauty - 50) / 50) * BEAUTY_POOL_SWING;
}
