import { buildingById } from '../content/buildings.ts';
import {
  BEAUTY_POOL_SWING,
  BEAUTY_WEIGHTS,
  GREENERY_TARGET_SHARE,
  LANDMARK_TARGET,
} from '../tuning.ts';
import { openPlacements } from './estate.ts';
import type { GameState } from './state.ts';
import { TERRAIN } from './terrain.ts';

// CAMPUS BEAUTY (DD §6.2): a campus-wide score, 0–100, from greenery,
// landmarks and upkeep — each a share of a target, weighted — feeding the
// applicant pool (DD §8.2) under the cap on placement-derived effects, and
// the cohorts' satisfaction (DD §8.3). Enclosed spaces (quads, Ph.14) and
// coherent motifs (per-building motifs) take their share when they arrive.

export interface BeautyTerms {
  greenery: number; // 0–1
  landmarks: number; // 0–1
  upkeep: number; // 0–1
  score: number; // 0–100
}

const FOUNDING_TREES = Object.keys(TERRAIN.woodland).length;

export function beautyTerms(state: GameState): BeautyTerms {
  const trees = Object.keys(state.campus.trees).length;
  const greenery = Math.min(1, trees / Math.max(1, FOUNDING_TREES * GREENERY_TARGET_SHARE));
  const open = openPlacements(state);
  const marks = open.reduce((t, p) => t + (buildingById(p.buildingId).beauty ?? 0), 0);
  const landmarks = Math.min(1, marks / LANDMARK_TARGET);
  const upkeep = open.length === 0 ? 1 : open.reduce((t, p) => t + p.condition, 0) / open.length;
  const score =
    100 *
    (greenery * BEAUTY_WEIGHTS.greenery +
      landmarks * BEAUTY_WEIGHTS.landmarks +
      upkeep * BEAUTY_WEIGHTS.upkeep);
  return { greenery, landmarks, upkeep, score: Number(score.toFixed(1)) };
}

export function campusBeauty(state: GameState): number {
  return beautyTerms(state).score;
}

// Beauty's factor on the applicant pool: neutral at 50, at most the swing
// either way (DD §6.2's hard cap).
export function beautyPoolFactor(beauty: number): number {
  return 1 + ((beauty - 50) / 50) * BEAUTY_POOL_SWING;
}
