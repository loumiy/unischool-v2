import { GRID_HEIGHT, GRID_WIDTH } from '../../sim/index.ts';

// The campus map's projection (ported from v1's isoProjection.ts at its
// default camera): the 2:1 dimetric this genre means by "isometric". A
// tile's diagonals run one pixel down for every two across, so grid lines
// and footprint edges land on clean slopes. Phase 3 ports the movable
// camera; Phase 2 needs only the one view.
//
// A RENDERING projection only. Tile coordinates, footprints and placements
// know nothing about it.

export const TILE_W = 64;
export const TILE_H = 32;

export interface Pt {
  x: number;
  y: number;
}

// Grid CORNER (col, row) to world point. Tile (row, col) spans corners
// (col, row) through (col + 1, row + 1), which is what lets a footprint of
// any size project by passing its far corner.
export function project(col: number, row: number): Pt {
  return { x: ((col - row) * TILE_W) / 2, y: ((col + row) * TILE_H) / 2 };
}

// World point back to fractional grid coordinates: the inverse, and what
// turns a mouse position into a tile.
export function unproject(x: number, y: number): { col: number; row: number } {
  return { col: x / TILE_W + y / TILE_H, row: y / TILE_H - x / TILE_W };
}

export function tileAt(x: number, y: number): { row: number; col: number } | null {
  const { col, row } = unproject(x, y);
  const c = Math.floor(col);
  const r = Math.floor(row);
  if (r < 0 || c < 0 || r >= GRID_HEIGHT || c >= GRID_WIDTH) return null;
  return { row: r, col: c };
}

// Raise a point by `h` screen units: height is a pure vertical offset.
export function lift(p: Pt, h: number): Pt {
  return { x: p.x, y: p.y - h };
}

export function polyPoints(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

// The ground outline of a footprint.
export function footprintPoly(col: number, row: number, w: number, h: number): Pt[] {
  return [
    project(col, row),
    project(col + w, row),
    project(col + w, row + h),
    project(col, row + h),
  ];
}

// The faces of an axis-aligned box standing on the grid, at the default
// camera: the back corner is NW (smallest y), the front is SE, so the two
// visible walls are SW–SE (left) and SE–NE (right).
export interface BoxFaces {
  top: Pt[];
  left: Pt[];
  right: Pt[];
  base: Pt[];
}

export function boxFaces(col: number, row: number, w: number, h: number, height: number): BoxFaces {
  const NW = project(col, row);
  const NE = project(col + w, row);
  const SE = project(col + w, row + h);
  const SW = project(col, row + h);
  const NWt = lift(NW, height);
  const NEt = lift(NE, height);
  const SEt = lift(SE, height);
  const SWt = lift(SW, height);
  return {
    top: [NWt, NEt, SEt, SWt],
    left: [SW, SE, SEt, SWt],
    right: [SE, NE, NEt, SEt],
    base: [NW, NE, SE, SW],
  };
}

// The whole grid's extent in world space. x is not anchored at zero: the
// grid projects to a rhombus, one corner of which sits at negative x.
export const WORLD = (() => {
  const pts = [
    project(0, 0),
    project(GRID_WIDTH, 0),
    project(GRID_WIDTH, GRID_HEIGHT),
    project(0, GRID_HEIGHT),
  ];
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
})();
