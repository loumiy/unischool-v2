/// <reference types="node" />
// THE CATALOGUE, LAID OUT (Phase 44): every building type in the catalogue
// standing on one parcel, open and sound, one save per motif, for the
// contact sheet (tools/contactsheet.mjs). Dev-only: nothing in src/ imports
// it.
//
//   node --experimental-strip-types tools/catalogue.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDINGS } from '../src/content/buildings.ts';
import { footprintIsClear, GRID_HEIGHT, GRID_WIDTH } from '../src/sim/campus.ts';
import { opened } from '../src/sim/colleges.ts';
import { MOTIFS } from '../src/sim/identity.ts';
import { serializeRun } from '../src/sim/save.ts';

const dir = join(import.meta.dirname, '.scenarios');
mkdirSync(dir, { recursive: true });
const run = opened(7);
const campus = structuredClone(run.state.campus);
campus.trees = {};
campus.placements = [];
let id = 1;
let col = 2;
let row = 2;
let rowH = 0;
// Biggest first, so the rows pack, and Founders Hall among them.
const all = [...BUILDINGS].sort((a, b) => b.footprint.h - a.footprint.h);
for (const b of all) {
  const { w, h } = b.footprint;
  for (;;) {
    if (col + w > GRID_WIDTH - 1) {
      col = 2;
      row += rowH + 1;
      rowH = 0;
    }
    if (row + h > GRID_HEIGHT - 1) throw new Error(`out of room at ${b.id}`);
    if (footprintIsClear(campus, col, row, w, h)) break;
    col += 1;
  }
  campus.placements.push({
    id: `p${id++}`,
    buildingId: b.id,
    col,
    row,
    w,
    h,
    status: 'open',
    completesWeek: null,
    openedWeek: 0,
    backlog: 0,
    condition: 1,
  });
  col += w + 1;
  rowH = Math.max(rowH, h);
}
for (const motif of MOTIFS) {
  const state = { ...run.state, campus, identity: { ...run.state.identity!, motif } };
  writeFileSync(
    join(dir, `catalogue-${motif}.json`),
    JSON.stringify(serializeRun({ ...run, state })),
  );
}
console.log(`${campus.placements.length} types placed, five motifs`);
