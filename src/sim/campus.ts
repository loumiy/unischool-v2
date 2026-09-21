import { BUILDINGS, buildingById } from '../content/buildings.ts';
import { GRID_HEIGHT, GRID_WIDTH, inGrid, TERRAIN, tileKey } from './terrain.ts';

// The canvas (DD §6.1) and what stands on it: placements, paths, trees. Pure
// helpers shared by the reducer and the map UI, so "can this go here" has
// exactly one definition.

export { GRID_HEIGHT, GRID_WIDTH };

export interface Footprint {
  w: number;
  h: number;
}

// Where a building is in its life (DD §6.4): a site being built, open,
// or closed for renovation. Sites and renovations carry the week they
// finish; open buildings carry their backlog and the condition it implies.
export type PlacementStatus = 'building' | 'open' | 'renovating';

export interface Placement {
  id: string; // unique per placed building ("p7")
  buildingId: string; // content/buildings.json id
  col: number; // top-left tile
  row: number;
  w: number; // the footprint as placed — rotation is baked in
  h: number;
  status: PlacementStatus;
  completesWeek: number | null; // absolute week a site or renovation finishes
  openedWeek: number | null; // absolute week the doors first opened; age counts from it
  backlog: number; // deferred maintenance, dollars
  condition: number; // 0–1, derived from the backlog (estate.ts)
}

export interface Campus {
  placements: Placement[];
  // Paved tiles, as tile keys ("col,row"). A path under a tree hides the
  // tree; lifting the path brings it back.
  paths: string[];
  // Standing trees: tile key → seed. The founding woodland at new-game,
  // then whatever the player planted and felled.
  trees: Record<string, number>;
  nextPlacementId: number;
}

export const FOUNDERS_HALL_ID = 'founders-hall';

export function foundersHallFootprint(): Footprint {
  return buildingById(FOUNDERS_HALL_ID).footprint;
}

export function canRotate(fp: Footprint): boolean {
  return fp.w !== fp.h;
}

export function orientedFootprint(fp: Footprint, rotated: boolean): Footprint {
  return rotated && canRotate(fp) ? { w: fp.h, h: fp.w } : fp;
}

export function inBounds(col: number, row: number, w: number, h: number): boolean {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    row >= 0 &&
    col + w <= GRID_WIDTH &&
    row + h <= GRID_HEIGHT
  );
}

function overlaps(a: Placement, col: number, row: number, w: number, h: number): boolean {
  return col < a.col + a.w && col + w > a.col && row < a.row + a.h && row + h > a.row;
}

export function placementCovers(p: Placement, col: number, row: number): boolean {
  return col >= p.col && col < p.col + p.w && row >= p.row && row < p.row + p.h;
}

export function placementAt(campus: Campus, col: number, row: number): Placement | undefined {
  return campus.placements.find((p) => placementCovers(p, col, row));
}

// Every tile a footprint covers.
export function footprintTiles(col: number, row: number, w: number, h: number): string[] {
  const out: string[] = [];
  for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) out.push(tileKey(c, r));
  return out;
}

// Would this footprint sit entirely on buildable, unoccupied, in-bounds
// tiles? Trees do not block — they are felled by the placement — and paths
// do not either; the stream and the road do.
export function footprintIsClear(campus: Campus, col: number, row: number, w: number, h: number) {
  if (!inBounds(col, row, w, h)) return false;
  if (campus.placements.some((p) => overlaps(p, col, row, w, h))) return false;
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) if (TERRAIN.blocked.has(tileKey(c, r))) return false;
  }
  return true;
}

export function hasFoundersHall(campus: Campus): boolean {
  return campus.placements.some((p) => p.buildingId === FOUNDERS_HALL_ID);
}

// A tile a path or a tree could go on: on the grid, not water or road, and
// not under a building.
export function tileIsOpen(campus: Campus, col: number, row: number): boolean {
  return (
    inGrid(col, row) && !TERRAIN.blocked.has(tileKey(col, row)) && !placementAt(campus, col, row)
  );
}

export { BUILDINGS };
