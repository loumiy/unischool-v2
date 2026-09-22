/// <reference types="node" />
// DD §17's guardrails, measured rather than asserted. Reports numbers; it
// changes nothing and tunes nothing.
//
//   npx tsx tools/guardrails.ts

import { WEEKS_PER_YEAR } from '../src/sim/calendar.ts';
import { entriesOfKind } from '../src/sim/bus.ts';
import { placementSatisfaction, placementPoolEffect } from '../src/sim/placement.ts';
import { seatSlots } from '../src/sim/seats.ts';
import { adminShareOfPayroll } from '../src/sim/treasury.ts';
import { PLACEMENT_CAP } from '../src/tuning.ts';
import { GROWTH, PASSIVE, type Strategy } from './harness.ts';
import { DEFAULT_PALETTE } from '../src/content/palettes.ts';
import { defaultResolution } from '../src/sim/beats.ts';
import { dispatch, newRun, tickRunWeeks, type Run } from '../src/sim/run.ts';
import type { GameState } from '../src/sim/state.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

function drive(seed: number, strategy: Strategy, years: number): Run {
  let run = dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
  for (let week = 0; week < years * WEEKS_PER_YEAR; week++) {
    run = tickRunWeeks(run, 1, defaultResolution);
    run = strategy.play(run, week);
  }
  return run;
}

const SEEDS = [4, 11, 21];
console.log('DD §17 guardrails, measured at the Phase 21 checkpoint\n');

// §17.5 — admin share of payroll should land at 25–40% by year 50.
console.log('§17.5 admin share of payroll at Y50 (target band 25–40%)');
for (const strategy of [PASSIVE, GROWTH]) {
  for (const seed of SEEDS) {
    const run = drive(seed, strategy, 50);
    const share = adminShareOfPayroll(run.state.treasury.budget);
    const seats = run.state.delegation.seats.length;
    const slots = seatSlots(run.state).length;
    const faculty = run.state.faculty.roster.length;
    const inBand = share >= 0.25 && share <= 0.4;
    console.log(
      `  ${strategy.id}/${seed}: ${(share * 100).toFixed(1)}%  ` +
        `[seats ${seats}/${slots}, faculty ${faculty}]  ${inBand ? 'IN BAND' : 'OUT OF BAND'}`,
    );
  }
}

// §17.3 — ~1 player-decided event per 2–4 weeks at mid-game, declining
// with delegation. A delegated event is not player-decided.
console.log('\n§17.3 player-decided event cadence at mid-game (target: 1 per 2–4 weeks)');
for (const strategy of [PASSIVE, GROWTH]) {
  for (const seed of SEEDS) {
    const run = drive(seed, strategy, 30);
    const midFrom = 15 * WEEKS_PER_YEAR;
    const asked = entriesOfKind(run.state, 'eventFired').filter((e) => e.week >= midFrom).length;
    const handled = entriesOfKind(run.state, 'eventDelegated').filter(
      (e) => e.week >= midFrom,
    ).length;
    const beats = entriesOfKind(run.state, 'beatFired').filter((e) => e.week >= midFrom).length;
    const weeks = run.state.clock.absoluteWeek - midFrom;
    const perAsk = asked > 0 ? weeks / asked : Infinity;
    const withBeats = asked + beats > 0 ? weeks / (asked + beats) : Infinity;
    console.log(
      `  ${strategy.id}/${seed}: 1 event per ${perAsk.toFixed(1)} weeks ` +
        `(${asked} asked, ${handled} delegated over ${weeks} weeks)` +
        `  — with calendar beats counted: 1 per ${withBeats.toFixed(1)} weeks`,
    );
  }
}

// §17.2 — the placement bonus must not exceed the 12% cap.
console.log(`\n§17.2 largest placement bonus against the ${(PLACEMENT_CAP * 100).toFixed(0)}% cap`);
let worstSat = 0;
let worstPool = 0;
for (const strategy of [PASSIVE, GROWTH]) {
  for (const seed of SEEDS) {
    let run = dispatch(dispatch(newRun(seed), FOUND), {
      type: 'placeBuilding',
      buildingId: 'founders-hall',
      col: 28,
      row: 28,
      rotated: false,
    });
    // Each effect caps in its OWN units — satisfaction in points on a
    // 0-100 scale, the pool as a multiplier about 1 — so the only
    // meaningful figure is the share of that effect's own limit.
    let sat = 0;
    let pool = 0;
    let satLimit = 0;
    let poolLimit = 0;
    let everCapped = false;
    for (let week = 0; week < 50 * WEEKS_PER_YEAR; week++) {
      run = tickRunWeeks(run, 1, defaultResolution);
      run = strategy.play(run, week);
      if (week % WEEKS_PER_YEAR !== 0) continue;
      const s = placementSatisfaction(run.state);
      const p = placementPoolEffect(run.state);
      sat = Math.max(sat, Math.abs(s.applied));
      pool = Math.max(pool, Math.abs(p.applied));
      satLimit = s.limit;
      poolLimit = p.limit;
      if (s.capped || p.capped) everCapped = true;
    }
    worstSat = Math.max(worstSat, sat / satLimit);
    worstPool = Math.max(worstPool, pool / poolLimit);
    console.log(
      `  ${strategy.id}/${seed}: satisfaction ${sat.toFixed(3)}/${satLimit} pts ` +
        `(${((sat / satLimit) * 100).toFixed(0)}% of cap), pool ${pool.toFixed(4)}/${poolLimit} ` +
        `(${((pool / poolLimit) * 100).toFixed(0)}% of cap)` +
        (everCapped ? '  — clamped at least once' : ''),
    );
  }
}
const worstShare = Math.max(worstSat, worstPool);
console.log(
  `  worst seen: ${(worstShare * 100).toFixed(0)}% of its own cap ` +
    `(cap is ${(PLACEMENT_CAP * 100).toFixed(0)}% of each output) — ` +
    (worstShare <= 1 ? 'WITHIN CAP' : 'OVER CAP'),
);

// §17.4 — named students are a lens on cohort truth, not a simulation.
console.log('\n§17.4 named students as a lens');
const run = drive(4, GROWTH, 20);
const named = run.state.people.named;
const fields = new Set(named.flatMap((n) => Object.keys(n)));
console.log(`  ${named.length} named students; fields: ${[...fields].sort().join(', ')}`);
const numeric = [...fields].filter((f) =>
  named.some((n) => typeof (n as unknown as Record<string, unknown>)[f] === 'number'),
);
console.log(`  numeric fields on a named student: ${numeric.join(', ') || '(none)'}`);
const readers = (state: GameState) => state.people.cohorts.length;
console.log(`  cohorts remain the unit of simulation: ${readers(run.state)} cohorts`);
