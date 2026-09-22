/// <reference types="node" />
// The Phase 21 checkpoint smoke run: 3 seeds x 2 strategies x 50 years,
// plus the two claims the audit has to check by simulation rather than by
// reading — the Phase 16 housing-crunch claim, and DD §3.2's speed gating.
//
//   npx tsx tools/smoke.ts

import { WEEKS_PER_YEAR } from '../src/sim/calendar.ts';
import { annualGiving } from '../src/sim/alumni.ts';
import { defaultResolution } from '../src/sim/beats.ts';
import { dispatch, newRun, tickRunWeeks, type Run } from '../src/sim/run.ts';
import { DEFAULT_PALETTE } from '../src/content/palettes.ts';
import { canApply } from '../src/sim/actions.ts';
import { GROWTH, PASSIVE, runOne, type RunReport } from './harness.ts';

const SEEDS = [4, 11, 21];
const money = (n: number) => `$${(n / 1e6).toFixed(2)}M`;

function table(reports: RunReport[]): void {
  console.log('\n--- 50-year runs ---');
  console.log(
    [
      'strategy',
      'seed',
      'ms',
      'Y50 enrolled',
      'alumni',
      'giving',
      'endowment',
      'admin%',
      'rung max',
      'exited',
      'problems',
    ]
      .map((h) => h.padEnd(13))
      .join(''),
  );
  for (const r of reports) {
    const last = r.samples.at(-1)!;
    console.log(
      [
        r.strategy,
        String(r.seed),
        String(r.ms),
        String(last.enrolled),
        String(last.alumni),
        money(last.giving),
        money(last.endowment),
        `${(last.adminShare * 100).toFixed(1)}%`,
        String(r.rungReached),
        r.rungExited ? 'yes' : 'no',
        String(r.problems.length),
      ]
        .map((c) => c.padEnd(13))
        .join(''),
    );
  }
  const problems = reports.flatMap((r) => r.problems.map((p) => `${r.strategy}/${r.seed}: ${p}`));
  console.log(`\nproblems: ${problems.length}`);
  for (const p of problems.slice(0, 40)) console.log('  ' + p);
}

// DD §3.2, checked over a run rather than asserted: 4x and 8x open only
// when the seats say so, and never before.
function gating(reports: RunReport[]): void {
  console.log('\n--- speed gating (DD §3.2) ---');
  for (const r of reports) {
    const firstX4 = r.samples.find((s) => s.x4);
    const firstX8 = r.samples.find((s) => s.x8);
    const everClosedAfterOpen = r.samples.some((s, i) => i > 0 && r.samples[i - 1]!.x8 && !s.x8);
    console.log(
      `  ${r.strategy}/${r.seed}: 4x from Y${firstX4?.year ?? '-'}, 8x from Y${firstX8?.year ?? '-'}` +
        (everClosedAfterOpen ? '  (8x closed again)' : ''),
    );
  }
}

// The Phase 16 claim, as the DD states it: a housing crunch in year 12 is
// still measurably thinning the annual fund in year 30.
function housingCrunch(): void {
  console.log('\n--- Phase 16 claim: a Y12 crunch thins the Y30 fund ---');
  const FOUND = {
    type: 'found',
    name: 'Blackmoor',
    motif: 'georgian',
    paletteId: DEFAULT_PALETTE.id,
    colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
  } as const;
  for (const seed of SEEDS) {
    const base = () =>
      dispatch(dispatch(newRun(seed), FOUND), {
        type: 'placeBuilding',
        buildingId: 'founders-hall',
        col: 28,
        row: 28,
        rotated: false,
      });
    // Both colleges build the same residence hall; only one of them loses
    // it out from under the students in year 12.
    const grow = (run: Run) => {
      let r = run;
      for (const [b, col, row] of [
        ['residence-hall', 6, 40],
        ['dining-hall', 16, 40],
        ['residence-hall', 40, 40],
      ] as [string, number, number][]) {
        for (const financing of ['cash', 'debt'] as const) {
          const a = {
            type: 'placeBuilding',
            buildingId: b,
            col,
            row,
            rotated: false,
            financing,
          } as const;
          if (canApply(r.state, a).ok) {
            r = dispatch(r, a);
            break;
          }
        }
      }
      return r;
    };
    let control = grow(tickRunWeeks(base(), WEEKS_PER_YEAR, defaultResolution));
    control = tickRunWeeks(control, WEEKS_PER_YEAR * 11, defaultResolution);
    let crunched = grow(tickRunWeeks(base(), WEEKS_PER_YEAR, defaultResolution));
    crunched = tickRunWeeks(crunched, WEEKS_PER_YEAR * 11, defaultResolution);

    // Year 12: the crunched college loses a hall of beds.
    const hall = crunched.state.campus.placements.find(
      (p) => p.buildingId === 'residence-hall' && p.status === 'open',
    );
    if (!hall) {
      console.log(`  seed ${seed}: no residence hall to take away — inconclusive`);
      continue;
    }
    const demolished = dispatch(crunched, { type: 'demolish', placementId: hall.id });
    if (demolished === crunched) {
      console.log(`  seed ${seed}: could not demolish — inconclusive`);
      continue;
    }
    crunched = demolished;

    control = tickRunWeeks(control, WEEKS_PER_YEAR * 18, defaultResolution);
    crunched = tickRunWeeks(crunched, WEEKS_PER_YEAR * 18, defaultResolution);
    const c = annualGiving(control.state);
    const x = annualGiving(crunched.state);
    const marked = crunched.state.people.alumni.filter((a) =>
      a.memory.includes('overcrowded'),
    ).length;
    console.log(
      `  seed ${seed}: Y${crunched.state.clock.year} fund ${money(x)} vs control ${money(c)} ` +
        `(${(((x - c) / Math.max(1, c)) * 100).toFixed(1)}%), classes marked overcrowded: ${marked}`,
    );
  }
}

const reports: RunReport[] = [];
for (const strategy of [PASSIVE, GROWTH]) {
  for (const seed of SEEDS) reports.push(runOne(seed, strategy, 50));
}
table(reports);
gating(reports);
housingCrunch();
console.log(
  `\nslowest 50-year run: ${Math.max(...reports.map((r) => r.ms))}ms (DD §15 target: 60000ms)`,
);
