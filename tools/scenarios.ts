/// <reference types="node" />
// Builds the saves the screenshot pass injects, so every screen is shot
// with real state rather than a mocked one. Writes JSON to tools/.scenarios/.
//
//   npx tsx tools/scenarios.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDINGS } from '../src/content/buildings.ts';
import { MOTIF_CHOICES } from '../src/content/motifs.ts';
import { DEFAULT_PALETTE } from '../src/content/palettes.ts';
import { canApply } from '../src/sim/actions.ts';
import { defaultResolution } from '../src/sim/beats.ts';
import { WEEKS_PER_YEAR } from '../src/sim/calendar.ts';
import { fireEvent } from '../src/sim/events.ts';
import { dispatch, newRun, tickRunWeeks, type Run } from '../src/sim/run.ts';
import { serializeRun } from '../src/sim/save.ts';
import type { GameState } from '../src/sim/state.ts';
import { GROWTH } from './harness.ts';

const OUT = join(import.meta.dirname, '.scenarios');
mkdirSync(OUT, { recursive: true });

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

function opened(seed = 4, motif: string = 'georgian'): Run {
  return dispatch(dispatch(newRun(seed), { ...FOUND, motif: motif as typeof FOUND.motif }), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
}

function grow(seed: number, years: number): Run {
  let run = opened(seed);
  for (let week = 0; week < years * WEEKS_PER_YEAR; week++) {
    run = tickRunWeeks(run, 1, defaultResolution);
    run = GROWTH.play(run, week);
  }
  return run;
}

function save(name: string, run: Run): void {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(serializeRun(run)), 'utf8');
  const s = run.state;
  console.log(
    `${name.padEnd(22)} Y${String(s.clock.year).padStart(2)} ` +
      `buildings ${String(s.campus.placements.length).padStart(2)} ` +
      `enrolled ${String(s.people.cohorts.reduce((t, c) => t + c.size, 0)).padStart(4)} ` +
      `faculty ${String(s.faculty.roster.length).padStart(2)} rung ${s.distress.rung}`,
  );
}

function withState(run: Run, state: GameState): Run {
  return { ...run, state };
}

// ---------- the ordinary run of play ----------

// Year 1, before the first Convocation: the hall is up, nobody has arrived.
let y1 = opened();
y1 = tickRunWeeks(y1, WEEKS_PER_YEAR - 4, defaultResolution);
save('year-01-before-convocation', y1);

save('mid-game-year-15', grow(4, 15));
const mature = grow(4, 32);
save('mature-year-32', mature);

// ---------- a dense campus: every building type, awkwardly ----------
// Tight clusters, buildings behind each other, map edges, next to water and
// road, and a path network through it. This is the art stress test.
{
  let run = opened(4);
  run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
  const cash = run.state.treasury.cash;
  // Give it the money to build everything; this save is a test fixture,
  // never a run anybody plays.
  run = withState(run, { ...run.state, treasury: { ...run.state.treasury, cash: 900_000_000 } });
  void cash;

  const placeable = BUILDINGS.filter((b) => b.id !== 'founders-hall');
  let placed = 0;
  const tries: [number, number][] = [];
  // A tight lattice, deliberately shoulder to shoulder, plus edge rows.
  for (let row = 2; row <= 58; row += 6)
    for (let col = 2; col <= 58; col += 8) tries.push([col, row]);
  for (let col = 0; col <= 58; col += 7) tries.push([col, 0]);
  for (let col = 0; col <= 58; col += 7) tries.push([col, 59]);
  for (let row = 0; row <= 58; row += 6) tries.push([0, row]);
  for (let row = 0; row <= 58; row += 6) tries.push([58, row]);

  let i = 0;
  for (const [col, row] of tries) {
    const def = placeable[i % placeable.length]!;
    const rotated = (i & 1) === 1;
    const action = {
      type: 'placeBuilding',
      buildingId: def.id,
      col,
      row,
      rotated,
      financing: 'cash',
    } as const;
    if (canApply(run.state, action).ok) {
      run = dispatch(run, action);
      placed++;
      i++;
    } else {
      i++;
    }
  }
  // Paths threaded between them, including joins and dead ends.
  for (let col = 1; col < 62; col++) {
    for (const row of [7, 19, 31, 43, 55]) {
      const a = { type: 'paint', tool: 'path', col, row } as const;
      if (canApply(run.state, a).ok) run = dispatch(run, a);
    }
  }
  for (let row = 1; row < 62; row++) {
    for (const col of [11, 27, 43]) {
      const a = { type: 'paint', tool: 'path', col, row } as const;
      if (canApply(run.state, a).ok) run = dispatch(run, a);
    }
  }
  // Finish the builds so they are drawn as open buildings, not sites.
  run = tickRunWeeks(run, WEEKS_PER_YEAR * 4, defaultResolution);
  console.log(`stress: placed ${placed} of ${tries.length} sites, ${BUILDINGS.length} types exist`);
  save('stress-dense-campus', run);
}

// Every motif, so palette and motif bleed between neighbours is visible.
for (const motif of MOTIF_CHOICES) {
  let run = opened(4, motif.id);
  run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
  run = withState(run, { ...run.state, treasury: { ...run.state.treasury, cash: 400_000_000 } });
  let i = 0;
  for (let row = 8; row <= 44; row += 6) {
    for (let col = 8; col <= 48; col += 8) {
      const def = BUILDINGS[i % BUILDINGS.length]!;
      const a = {
        type: 'placeBuilding',
        buildingId: def.id,
        col,
        row,
        rotated: (i & 1) === 1,
        financing: 'cash',
      } as const;
      if (canApply(run.state, a).ok) run = dispatch(run, a);
      i++;
    }
  }
  run = tickRunWeeks(run, WEEKS_PER_YEAR * 3, defaultResolution);
  save(`motif-${motif.id}`, run);
}

// ---------- the beats ----------
// Each beat screen, reached by walking to the week it fires.
{
  const beats: [string, string][] = [
    ['convocation', 'beat-convocation'],
    ['board-meeting', 'beat-board-meeting'],
    ['admissions-day', 'beat-admissions'],
    ['budget-and-hiring', 'beat-budget-hiring'],
  ];
  for (const [beatId, name] of beats) {
    let run = grow(4, 14);
    for (let i = 0; i < WEEKS_PER_YEAR * 2; i++) {
      if (run.state.pendingBeat === beatId) break;
      const next = tickRunWeeks(run, 1, (s) =>
        s.pendingBeat === beatId ? null : defaultResolution(s),
      );
      if (next === run) break;
      run = next;
    }
    save(name, run);
  }
}

// ---------- events ----------
{
  const base = grow(4, 16);
  save('event-inline', withState(base, fireEvent(base.state, 'roof-goes')));
  save('event-seismic', withState(base, fireEvent(base.state, 'storm')));
}

// ---------- the distress ladder, one save per rung ----------
{
  // A college spending far beyond its means, sampled as it falls.
  let run = opened(7);
  const seen = new Set<number>();
  for (let week = 0; week < 50 * WEEKS_PER_YEAR; week++) {
    run = tickRunWeeks(run, 1, (s) =>
      s.pendingBeat === 'budget-and-hiring'
        ? {
            type: 'resolveBeat',
            beatId: 'budget-and-hiring',
            drawRate: 0.03,
            maintenanceFunding: 1,
          }
        : s.pendingBeat === 'admissions-day'
          ? { type: 'resolveBeat', beatId: 'admissions-day', tuition: 4_000, selectivity: 0.2 }
          : defaultResolution(s),
    );
    run = GROWTH.play(run, week);
    const rung = run.state.distress.rung;
    if (!seen.has(rung)) {
      seen.add(rung);
      save(`distress-rung-${rung}`, run);
    }
    if (seen.size >= 6) break;
  }
  console.log(`distress rungs captured: ${[...seen].sort().join(', ')}`);
}

// ---------- delegation and advancement, staffed ----------
{
  let run = grow(4, 30);
  save('seats-staffed', run);
  const def = run.state.advancement.running;
  void def;
  for (const c of ['new-residence', 'library-wing', 'aid-fund']) {
    const a = { type: 'launchCampaign', campaignId: c } as const;
    if (canApply(run.state, a).ok) {
      run = dispatch(run, a);
      break;
    }
  }
  run = tickRunWeeks(run, WEEKS_PER_YEAR * 2, defaultResolution);
  save('campaign-running', run);
}
console.log(`\nwrote scenarios to ${OUT}`);
