import { describe, expect, it } from 'vitest';
import {
  REPUTATION_NEUTRAL,
  REPUTATION_POOL_FLOOR,
  REPUTATION_POOL_SWING,
  REPUTATION_START,
  REPUTATION_TRAIL,
  REPUTATION_WEIGHTS,
} from '../tuning.ts';
import { defaultResolution } from './beats.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { opened, played } from './colleges.ts';
import { runAdmissions } from './people.ts';
import {
  reputationPoolFactor,
  reputationTerms,
  reputationYear,
  reputationYieldFactor,
} from './reputation.ts';
import { tickRunWeeks } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';

// DEMAND THAT ANSWERS TO QUALITY (Phase 37, DD §8.2): what families say
// about the place, lagged, and what it does to the applicant pool.

const at = (state: GameState, reputation: number): GameState => ({
  ...state,
  people: { ...state.people, reputation },
});

describe('reputation', () => {
  it('starts at the line and says nothing until someone has graduated', () => {
    const s = opened(4).state;
    expect(s.people.reputation).toBe(REPUTATION_START);
    expect(reputationYear(s)).toBe(s);
  });

  it('reads the four causes, weighted, and moves a share of the way each year', () => {
    const s = played(4, 8).state;
    expect(s.people.alumni.length).toBeGreaterThan(0);
    const t = reputationTerms(s);
    const w = REPUTATION_WEIGHTS;
    expect(t.reading).toBeCloseTo(
      t.teaching * w.teaching +
        t.satisfaction * w.satisfaction +
        t.outcomes * w.outcomes +
        t.condition * w.condition,
      0,
    );
    const from = at(s, 20);
    const moved = reputationYear(from).people.reputation;
    expect(moved).toBeCloseTo(20 + (reputationTerms(from).reading - 20) * REPUTATION_TRAIL, 1);
  });

  it('grows the pool above the line and shrinks it below, never past the floor', () => {
    const s = opened(4).state;
    expect(reputationPoolFactor(at(s, REPUTATION_NEUTRAL))).toBe(1);
    expect(reputationPoolFactor(at(s, REPUTATION_NEUTRAL + 10))).toBeCloseTo(
      1 + 0.1 * REPUTATION_POOL_SWING,
    );
    expect(reputationPoolFactor(at(s, REPUTATION_NEUTRAL - 10))).toBeCloseTo(
      1 - 0.1 * REPUTATION_POOL_SWING,
    );
    expect(reputationPoolFactor(at(s, 0))).toBe(REPUTATION_POOL_FLOOR);
    expect(reputationYieldFactor(at(s, REPUTATION_NEUTRAL + 10))).toBeGreaterThan(1);
  });

  it('reaches the applicant pool and the yield on Admissions Day', () => {
    const s = played(4, 8).state;
    const terms = s.people.terms;
    const good = runAdmissions(at(s, 80), terms);
    const bad = runAdmissions(at(s, 20), terms);
    expect(bad.applicants).toBeLessThan(good.applicants * 0.6);
    expect(bad.yieldRate).toBeLessThan(good.yieldRate);
  });

  it('comes down within a few Commencements when the teaching does', () => {
    const run = played(4, 20);
    const idle = {
      ...run,
      state: at(
        {
          ...run.state,
          faculty: {
            ...run.state.faculty,
            roster: run.state.faculty.roster.map((f) => ({ ...f, teaching: 0 })),
          },
        },
        75,
      ),
    };
    expect(reputationTerms(idle.state).teaching).toBeLessThan(5);
    const after = tickRunWeeks(idle, 3 * WEEKS_PER_YEAR, defaultResolution).state;
    expect(after.people.reputation).toBeLessThan(55);
  });

  it('migrates a version-28 save', () => {
    const run = tickRunWeeks(opened(4), 10, defaultResolution);
    const v28 = JSON.parse(JSON.stringify(serializeRun(run)));
    v28.version = 28;
    v28.state.schemaVersion = 28;
    delete v28.state.people.reputation;
    const loaded = loadSaveFile(v28);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.version).toBe(SCHEMA_VERSION);
      expect(loaded.save.state.people.reputation).toBe(REPUTATION_START);
    }
  });
});
