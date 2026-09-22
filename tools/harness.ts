/// <reference types="node" />
// THE HEADLESS HARNESS (seed of Phase 31's, per the plan).
//
// Runs the sim core on Node with no UI, no React and no bundler: importing
// this file at all is the standing proof of DD §15's isolation claim. It
// measures and reports; it tunes nothing and draws nothing.
//
//   npx tsx tools/harness.ts            # 3 seeds x 2 strategies, 50 years
//   npx tsx tools/harness.ts --json     # machine-readable
//
// Phase 31 owns the dashboards. This is instrumentation only.

import { DEFAULT_PALETTE } from '../src/content/palettes.ts';
import { findProgram, PROGRAMS, SCHOOLS } from '../src/content/schools.ts';
import { canApply, type Action } from '../src/sim/actions.ts';
import { defaultResolution } from '../src/sim/beats.ts';
import { WEEKS_PER_YEAR } from '../src/sim/calendar.ts';
import { speedAllowed } from '../src/sim/clock.ts';
import { annualGiving } from '../src/sim/alumni.ts';
import { dispatch, newRun, tickRunWeeks, type Run } from '../src/sim/run.ts';
import { deansAppointed, provostAppointed, seatPayroll } from '../src/sim/seats.ts';
import type { GameState } from '../src/sim/state.ts';
import { adminShareOfPayroll } from '../src/sim/treasury.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

export interface Strategy {
  id: string;
  blurb: string;
  // Called once a week, after the tick, with whatever the college can do.
  play: (run: Run, week: number) => Run;
  resolve?: (state: GameState) => Action | null;
}

function place(run: Run, buildingId: string, col: number, row: number, rotated = false): Run {
  for (const financing of ['gift', 'cash', 'debt'] as const) {
    const action = { type: 'placeBuilding', buildingId, col, row, rotated, financing } as const;
    if (canApply(run.state, action).ok) return dispatch(run, action);
  }
  return run;
}

// A college nobody is really running: it sites Founders Hall because the
// game will not start otherwise, and then lets the years happen.
export const PASSIVE: Strategy = {
  id: 'passive',
  blurb: 'sites Founders Hall, then nothing',
  play: (run) => run,
};

const SITES: [string, number, number, boolean][] = [
  ['library', 21, 9, false],
  ['library', 22, 20, false],
  ['academic-hall', 17, 14, true],
  ['academic-hall', 28, 13, true],
  ['residence-hall', 6, 40, false],
  ['dining-hall', 16, 40, false],
  ['residence-hall', 40, 40, false],
  ['student-center', 40, 4, false],
  ['lab', 50, 20, false],
  ['admin-building', 6, 28, false],
  ['academic-hall', 26, 50, false],
  ['residence-hall', 16, 52, false],
  ['residence-hall', 26, 40, false],
  ['health-center', 50, 40, false],
  ['recreation-center', 8, 8, false],
];

// A college somebody is running reasonably: it builds, founds schools,
// opens programmes, hires every summer, and delegates as it grows.
export const GROWTH: Strategy = {
  id: 'growth',
  blurb: 'builds, hires, admits, delegates',
  play: (run, week) => {
    let r = run;
    // One site at a time, skipping any the ground refuses.
    for (let i = 0; i < SITES.length; i++) {
      const [b, col, row, rot] = SITES[i]!;
      const before = r;
      r = place(r, b, col, row, rot);
      if (r !== before) break;
    }
    if (r.state.faculty.marketOpen && r.state.faculty.roster.length < 30) {
      for (const candidate of [...r.state.faculty.market]) {
        const fit = r.state.academics.programs.find(
          (open) => findProgram(open.programId)?.schoolId === candidate.schoolId,
        );
        const hire = {
          type: 'hire',
          candidateId: candidate.id,
          programId: fit?.programId ?? null,
        } as const;
        if (canApply(r.state, hire).ok) r = dispatch(r, hire);
      }
    }
    if (week % WEEKS_PER_YEAR === 0) {
      for (const school of SCHOOLS) {
        for (const p of r.state.campus.placements) {
          const found = { type: 'foundSchool', schoolId: school.id, placementId: p.id } as const;
          if (canApply(r.state, found).ok) {
            r = dispatch(r, found);
            break;
          }
        }
      }
      for (const program of PROGRAMS) {
        const open = { type: 'openProgram', programId: program.id } as const;
        if (canApply(r.state, open).ok) r = dispatch(r, open);
      }
      // Delegate as the college grows: the Provost first, then the Deans,
      // which is also what buys the top speed tiers (DD §3.2).
      for (const seatId of ['provost', 'facilities', 'dean-of-students', 'advancement']) {
        const appoint = { type: 'appointSeat', seatId, from: { kind: 'outside' } } as const;
        if (canApply(r.state, appoint).ok) r = dispatch(r, appoint);
      }
      for (const school of r.state.academics.schools) {
        const appoint = {
          type: 'appointSeat',
          seatId: 'dean',
          schoolId: school.schoolId,
          from: { kind: 'outside' },
        } as const;
        if (canApply(r.state, appoint).ok) r = dispatch(r, appoint);
      }
    }
    return r;
  },
};

export interface Sample {
  year: number;
  cash: number;
  endowment: number;
  enrolled: number;
  alumni: number;
  giving: number;
  rung: number;
  adminShare: number;
  seatPayroll: number;
  buildings: number;
  faculty: number;
  x4: boolean;
  x8: boolean;
}

export interface RunReport {
  seed: number;
  strategy: string;
  years: number;
  ms: number;
  samples: Sample[];
  // Anything that should never happen.
  problems: string[];
  rungReached: number;
  rungExited: boolean;
}

// Everything numeric the sim keeps, walked once a year, looking for values
// no quantity in this game should ever take.
function inspect(state: GameState, year: number, problems: string[]): void {
  const seen = new Set<unknown>();
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) problems.push(`Y${year} ${path} is ${String(node)}`);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, `${path}.${k}`);
  };
  walk(state, 'state');

  const counts: [string, number][] = [
    ['enrolled', state.people.cohorts.reduce((t, c) => t + c.size, 0)],
    ['alumni', state.people.alumni.reduce((t, a) => t + a.size, 0)],
    ['faculty', state.faculty.roster.length],
    ['buildings', state.campus.placements.length],
    ['endowment', state.treasury.endowment],
    ['debt', state.treasury.debt],
  ];
  for (const [name, n] of counts) {
    if (n < 0) problems.push(`Y${year} ${name} is negative (${n})`);
  }
  for (const c of state.people.cohorts) {
    if (c.size < 0) problems.push(`Y${year} cohort ${c.classYear} size ${c.size}`);
    if (c.satisfaction < 0 || c.satisfaction > 100)
      problems.push(`Y${year} cohort ${c.classYear} satisfaction ${c.satisfaction}`);
    if (c.quality < 0 || c.quality > 100)
      problems.push(`Y${year} cohort ${c.classYear} quality ${c.quality}`);
  }
  for (const a of state.people.alumni) {
    if (a.warmth < 0 || a.warmth > 100)
      problems.push(`Y${year} class ${a.classYear} warmth ${a.warmth}`);
  }
  for (const p of state.campus.placements) {
    if (p.condition < 0 || p.condition > 1)
      problems.push(`Y${year} ${p.id} condition ${p.condition}`);
    if (p.backlog < 0) problems.push(`Y${year} ${p.id} backlog ${p.backlog}`);
  }
  if (state.distress.confidence < 0 || state.distress.confidence > 100)
    problems.push(`Y${year} confidence ${state.distress.confidence}`);
}

export function gatingProblems(run: Run): string[] {
  const out: string[] = [];
  const s = run.state;
  const wantX4 = provostAppointed(s);
  const wantX8 = provostAppointed(s) && deansAppointed(s) >= 4;
  if (speedAllowed(s, 'x4') !== wantX4)
    out.push(`x4 gate disagrees with DD §3.2 at Y${s.clock.year}`);
  if (speedAllowed(s, 'x8') !== wantX8)
    out.push(`x8 gate disagrees with DD §3.2 at Y${s.clock.year}`);
  for (const speed of ['paused', 'x1', 'x2'] as const) {
    if (!speedAllowed(s, speed)) out.push(`${speed} should never be gated`);
  }
  return out;
}

export function runOne(seed: number, strategy: Strategy, years = 50): RunReport {
  const started = performance.now();
  const problems: string[] = [];
  const samples: Sample[] = [];
  let rungReached = 0;
  let rungExited = false;
  let sawDistress = false;

  let run = dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });

  for (let week = 0; week < years * WEEKS_PER_YEAR; week++) {
    const before = run.state.clock.absoluteWeek;
    run = tickRunWeeks(run, 1, strategy.resolve ?? defaultResolution);
    if (run.state.clock.absoluteWeek === before) {
      problems.push(`stalled at week ${before} (a hold nothing would release)`);
      break;
    }
    run = strategy.play(run, week);

    const rung = run.state.distress.rung;
    if (rung > rungReached) rungReached = rung;
    if (rung >= 2) sawDistress = true;
    if (sawDistress && rung === 0) rungExited = true;

    if (week % WEEKS_PER_YEAR === 0) {
      const s = run.state;
      inspect(s, s.clock.year, problems);
      problems.push(...gatingProblems(run));
      samples.push({
        year: s.clock.year,
        cash: Math.round(s.treasury.cash),
        endowment: Math.round(s.treasury.endowment),
        enrolled: s.people.cohorts.reduce((t, c) => t + c.size, 0),
        alumni: s.people.alumni.reduce((t, a) => t + a.size, 0),
        giving: Math.round(annualGiving(s)),
        rung: s.distress.rung,
        adminShare: Number(adminShareOfPayroll(s.treasury.budget).toFixed(4)),
        seatPayroll: seatPayroll(s),
        buildings: s.campus.placements.length,
        faculty: s.faculty.roster.length,
        x4: speedAllowed(s, 'x4'),
        x8: speedAllowed(s, 'x8'),
      });
    }
  }
  inspect(run.state, run.state.clock.year, problems);
  return {
    seed,
    strategy: strategy.id,
    years,
    ms: Math.round(performance.now() - started),
    samples,
    problems,
    rungReached,
    rungExited,
  };
}
