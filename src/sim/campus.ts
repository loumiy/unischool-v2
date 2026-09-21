import { BUILDINGS, buildingById } from '../content/buildings.ts';

// The canvas (DD §6.1): one fixed, bounded parcel. Phase 3 lays the terrain
// frame and the building catalogue over this; Phase 2 needs only the grid
// and the one placement rule that lets Founders Hall land on it.

export const GRID_WIDTH = 64;
export const GRID_HEIGHT = 64;

export interface Placement {
  id: string; // unique per placed building
  buildingId: string; // content/buildings.json id
  col: number; // top-left tile
  row: number;
  w: number;
  h: number;
}

export interface Campus {
  placements: Placement[];
}

export const FOUNDERS_HALL_ID = 'founders-hall';

export function foundersHallFootprint(): { w: number; h: number } {
  return buildingById(FOUNDERS_HALL_ID).footprint;
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

export function footprintIsClear(campus: Campus, col: number, row: number, w: number, h: number) {
  return inBounds(col, row, w, h) && !campus.placements.some((p) => overlaps(p, col, row, w, h));
}

export function hasFoundersHall(campus: Campus): boolean {
  return campus.placements.some((p) => p.buildingId === FOUNDERS_HALL_ID);
}

export { BUILDINGS };
