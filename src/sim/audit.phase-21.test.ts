import { describe, expect, it } from 'vitest';

import { MAINTENANCE_FUNDING_DEFAULT } from '../tuning.ts';
import { canApply } from './actions.ts';
import { campusBeauty } from './beauty.ts';
import { opened, played, type Policy } from './colleges.ts';
import { applyCut, RUNG_AUSTERITY } from './distress.ts';
import { openPlacements } from './estate.ts';
import { unassignedFaculty } from './faculty.ts';
import { enrolled } from './people.ts';
import { dispatch, tickRunWeeks, type Run } from './run.ts';
import type { GameState } from './state.ts';
import { approveBudget } from './treasury.ts';

// THE PHASE 21 CHECKPOINT AUDIT, PINNED AS TESTS.
//
// Every `it.fails` here is a finding from docs/audits/phase-21-checkpoint.md.
// The assertion is what the design document leads a reader to expect; it does
// not hold today. Written as `it.fails` so the suite stays honest about a
// state we have measured and reported rather than quietly accepted — and so
// the phase that makes one true is told at once. Do not delete one to make
// the suite pass. Promote it to `it`.
//
// The plain `it`s around them are the measurements those findings rest on,
// and they must keep passing for the findings to mean anything.

const SEEDS = [4242, 7, 99991];

// Every teacher taken off every programme, week by week, with the salaries
// still paid. The cleanest way to ask what teaching is worth.
function empty(run: Run): Run {
  let r = run;
  for (const f of r.state.faculty.roster) {
    if (f.programId == null) continue;
    const action = { type: 'assignFaculty', facultyId: f.id, programId: null } as const;
    if (canApply(r.state, action).ok) r = dispatch(r, action);
  }
  return r;
}

function reading(state: GameState) {
  const cohorts = state.people.cohorts;
  const mean = (pick: (c: (typeof cohorts)[number]) => number) =>
    cohorts.length === 0 ? 0 : cohorts.reduce((t, c) => t + pick(c), 0) / cohorts.length;
  return {
    teaching: state.faculty.roster.length - unassignedFaculty(state).length,
    roster: state.faculty.roster.length,
    enrolled: enrolled(state),
    quality: Number(mean((c) => c.quality).toFixed(1)),
    satisfaction: Number(mean((c) => c.satisfaction).toFixed(1)),
    cash: Math.round(state.treasury.cash),
    rung: state.distress.rung,
  };
}

describe('audit A1 — what teaching is worth (DD §7.2, guardrail §17.1)', () => {
  it('the scripted college does staff its programmes', () => {
    for (const seed of SEEDS) {
      const r = reading(played(seed, 25).state);
      expect(r.roster).toBeGreaterThan(20);
      expect(r.teaching, `seed ${seed}`).toBeGreaterThan(10);
    }
  });

  it.fails('closing every classroom for 25 years is not a way to get richer', () => {
    for (const seed of SEEDS) {
      const staffed = reading(played(seed, 25).state);
      const idle = reading(played(seed, 25, empty).state);
      expect(idle.teaching).toBe(0);
      // Twenty-five years of paying a faculty that teaches nobody should
      // leave the college worse off than one that teaches. On two seeds in
      // three it leaves it with more cash, because the students it loses
      // cost more than they brought.
      expect(
        idle.cash,
        `seed ${seed}: staffed ${JSON.stringify(staffed)} vs idle ${JSON.stringify(idle)}`,
      ).toBeLessThan(staffed.cash);
    }
  });
});

describe('audit A2 — what the estate is worth (DD §6.3, guardrail §17.1)', () => {
  const NEGLECTED: Policy = { maintenanceFunding: 0 };
  const KEPT: Policy = { maintenanceFunding: 1 };

  it('thirty unfunded years ruin the whole campus', () => {
    for (const seed of SEEDS) {
      const state = played(seed, 30, undefined, NEGLECTED).state;
      const open = openPlacements(state);
      const ruined = open.filter((p) => p.condition <= 0.01).length;
      const backlog = state.campus.placements.reduce((t, p) => t + p.backlog, 0);
      expect(open.length).toBeGreaterThan(8);
      expect(ruined, `seed ${seed}: ${ruined} of ${open.length} ruined`).toBe(open.length);
      expect(backlog).toBeGreaterThan(100e6);
    }
  });

  it.fails('a campus of ruins is not still prettier than the average campus', () => {
    // Upkeep is a quarter of beauty (tuning.ts BEAUTY_WEIGHTS), so a campus
    // where every building stands at condition zero still scores above the
    // neutral 50 that the applicant pool is measured against — and the
    // pool effect stays positive for a ruin.
    for (const seed of SEEDS) {
      const beauty = campusBeauty(played(seed, 30, undefined, NEGLECTED).state);
      expect(beauty, `seed ${seed} beauty ${beauty}`).toBeLessThan(50);
    }
  });

  it.fails('letting the campus fall down costs the college its money or its students', () => {
    for (const seed of SEEDS) {
      const kept = reading(played(seed, 30, undefined, KEPT).state);
      const ruins = reading(played(seed, 30, undefined, NEGLECTED).state);
      const hurt =
        ruins.rung > kept.rung ||
        ruins.cash < kept.cash ||
        (kept.enrolled - ruins.enrolled) / Math.max(1, kept.enrolled) > 0.1;
      expect(
        hurt,
        `seed ${seed}: kept ${JSON.stringify(kept)} vs ruins ${JSON.stringify(ruins)}`,
      ).toBe(true);
    }
  });
});

describe('audit A3 — austerity does not hand the college back (DD §5.5)', () => {
  function cutMade(): Run {
    const run = tickRunWeeks(opened(4242), 31);
    const austere: GameState = {
      ...run.state,
      distress: { ...run.state.distress, rung: RUNG_AUSTERITY, termsAtRung: 1 },
    };
    return { ...run, state: applyCut(austere, 'deferMaintenance') };
  }

  it('deferMaintenance zeroes the standing level, this budget and the pending one', () => {
    const t = cutMade().state.treasury;
    expect(t.maintenanceFunding).toBe(0);
    expect(t.budget.maintenanceFunding).toBe(0);
    expect(t.pendingBudget?.maintenanceFunding ?? 0).toBe(0);
  });

  it.fails('the first budget after the emergency proposes maintenance again', () => {
    // Out of austerity, at the next Budget & Hiring, with the player taking
    // the stated default. approveBudget falls back to the standing level,
    // which the cut set to zero and nothing ever raises: the emergency
    // measure outlives the emergency unless the player finds the slider.
    const run = cutMade();
    const sound: GameState = { ...run.state, distress: { ...run.state.distress, rung: 0 } };
    const after = approveBudget(sound, undefined, undefined);
    expect(after.treasury.maintenanceFunding).toBe(MAINTENANCE_FUNDING_DEFAULT);
  });
});
