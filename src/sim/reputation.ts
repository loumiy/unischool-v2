import {
  REPUTATION_NEUTRAL,
  REPUTATION_OUTCOME_CLASSES,
  REPUTATION_POOL_FLOOR,
  REPUTATION_POOL_SWING,
  REPUTATION_TRAIL,
  REPUTATION_WEIGHTS,
  REPUTATION_YIELD_SWING,
} from '../tuning.ts';
import { teachingQuality } from './faculty.ts';
import { campusCondition } from './people.ts';
import type { GameState } from './state.ts';

// REPUTATION (DD §8.2, Phase 37): what the families who send their
// children here say about the place — a slow, lagged reading of what its
// recent students actually got. Prestige is what the guidebooks rank;
// reputation is what gets passed on at the school gate. It is fed by the
// teaching the students are getting, how they feel about the place, how
// the last few classes turned out, and the state of the buildings they
// lived in, and it moves a share of the way towards that reading once a
// year, at Commencement, when the year's news has been heard. It moves
// the applicant pool and the yield beside price and prestige, so a college
// that starves its faculty or lets its halls rot fills fewer beds within a
// few years, not only a worse grade at Year 50.

export interface ReputationTerms {
  teaching: number; // 0–100, the teaching as the cohorts feel it
  satisfaction: number; // 0–100, the enrolled classes' mean
  outcomes: number; // 0–100, how the last few classes turned out
  condition: number; // 0–100, the buildings they lived in
  reading: number; // 0–100, the weighted sum
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);

// A class's outcomes as a score: the distinguished count in full, the
// placed at three fifths, the adrift not at all (the ledger's own scale,
// alumni.ts).
function outcomeScore(o: { distinguished: number; placed: number; adrift: number }): number {
  const total = o.distinguished + o.placed + o.adrift;
  return total > 0 ? (100 * o.distinguished + 60 * o.placed) / total : REPUTATION_NEUTRAL;
}

export function reputationTerms(state: GameState): ReputationTerms {
  const { cohorts, alumni } = state.people;
  const teaching = teachingQuality(state);
  const satisfaction = mean(cohorts.map((c) => c.satisfaction)) ?? REPUTATION_NEUTRAL;
  const recent = alumni.slice(-REPUTATION_OUTCOME_CLASSES);
  const outcomes = mean(recent.map((a) => outcomeScore(a.outcomes))) ?? REPUTATION_NEUTRAL;
  const condition = 100 * campusCondition(state);
  const w = REPUTATION_WEIGHTS;
  const reading =
    teaching * w.teaching +
    satisfaction * w.satisfaction +
    outcomes * w.outcomes +
    condition * w.condition;
  const r = (n: number) => Number(n.toFixed(1));
  return {
    teaching: r(teaching),
    satisfaction: r(satisfaction),
    outcomes: r(outcomes),
    condition: r(condition),
    reading: r(reading),
  };
}

// The year's move: a share of the way from where the talk stood to what
// the year gave it to say. Until a class has graduated there is nobody to
// do the talking, and a new college is taken on its founding promise.
export function reputationYear(state: GameState): GameState {
  if (state.people.alumni.length === 0) return state;
  const was = state.people.reputation;
  const { reading } = reputationTerms(state);
  const reputation = Number((was + (reading - was) * REPUTATION_TRAIL).toFixed(2));
  return { ...state, people: { ...state.people, reputation } };
}

// What the talk does to the pool and the yield, neutral at the line.
export function reputationPoolFactor(state: GameState): number {
  const swing = ((state.people.reputation - REPUTATION_NEUTRAL) / 100) * REPUTATION_POOL_SWING;
  return Math.max(REPUTATION_POOL_FLOOR, 1 + swing);
}

export function reputationYieldFactor(state: GameState): number {
  const swing = ((state.people.reputation - REPUTATION_NEUTRAL) / 100) * REPUTATION_YIELD_SWING;
  return Math.max(REPUTATION_POOL_FLOOR, 1 + swing);
}
