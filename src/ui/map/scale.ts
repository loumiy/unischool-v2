import { TILE_H, TILE_W } from './iso.ts';

// The campus's unit system (ported from v1's campusScale.ts): how a real
// dimension in METRES becomes a distance on the map. Two axes, two
// conversions — a metre across the ground and a metre up are not the same
// distance on screen.

export const METRES_PER_TILE = 9;

export const PITCH = Math.asin(TILE_H / TILE_W);
export const UNITS_PER_TILE_UP = (TILE_W / Math.SQRT2) * Math.cos(PITCH);
const UNITS_PER_METRE = UNITS_PER_TILE_UP / METRES_PER_TILE;

export function across(metres: number): number {
  return metres / METRES_PER_TILE;
}

export function up(metres: number): number {
  return metres * UNITS_PER_METRE;
}

export const STOREY_METRES = 3.9;
export const STOREY = up(STOREY_METRES);
