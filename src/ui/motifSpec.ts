import type { Motif } from '../sim/index.ts';

// WHAT EACH MOTIF LOOKS LIKE, as the parts Phase 2 draws: the founding hall's
// wall and roof, the trim stone, the glass, the gilding, what crowns the
// landmark and what stands at its door. Ported from v1's VERNACULARS
// (reference/v1/src/components/buildingSpec.ts), the brickRed material and
// stone palette only. Phase 3 ports the full spec — seven materials, roof
// pitches, window shapes, massing — and this file grows into it.

export type Apex = 'cupola' | 'spire' | 'campanile' | 'dome' | 'core';
export type Entrance = 'portico' | 'porch' | 'arcade' | 'canopy';

export interface MotifSpec {
  wall: string; // the founding hall's wall
  roof: string;
  trim: string | null; // null: no trim (Modern) — a wall is one plane
  gilt: string | null; // null: no gilding
  towerStone: string;
  glass: string;
  apex: Apex;
  entrance: Entrance;
}

const PAINTED_SASH = 'rgba(255, 253, 246, 0.5)';
const GEORGIAN_GILT = '#c9a227';
const DECK = '#7c8377';

export const MOTIF_SPECS: Readonly<Record<Motif, MotifSpec>> = {
  georgian: {
    wall: '#a2564a',
    roof: '#5f6b5f',
    trim: '#efe9da',
    gilt: GEORGIAN_GILT,
    towerStone: '#e4dcc8',
    glass: PAINTED_SASH,
    apex: 'cupola',
    entrance: 'portico',
  },
  gothic: {
    wall: '#8a8b86',
    roof: '#5a6270',
    trim: '#e6e3d6',
    gilt: '#b9bcc4',
    towerStone: '#d9d5c4',
    glass: PAINTED_SASH,
    apex: 'spire',
    entrance: 'porch',
  },
  classical: {
    wall: '#d6cfbb',
    roof: '#5f7a63',
    trim: '#f3eee1',
    gilt: GEORGIAN_GILT,
    towerStone: '#e9e2d0',
    glass: PAINTED_SASH,
    apex: 'dome',
    entrance: 'portico',
  },
  mission: {
    wall: '#e3d6b6',
    roof: '#9c4f3a',
    trim: '#fbf4e2',
    gilt: '#b08d3f',
    towerStone: '#ece0c4',
    glass: PAINTED_SASH,
    apex: 'campanile',
    entrance: 'arcade',
  },
  modern: {
    wall: '#dcd9cf',
    roof: DECK,
    trim: null,
    gilt: null,
    towerStone: '#e8e6df',
    glass: 'rgba(40, 60, 75, 0.7)',
    apex: 'core',
    entrance: 'canopy',
  },
};

// Darken or lighten a hex colour by a factor. Every shade on a building is
// derived from one material this way rather than authored by hand.
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n) || hex.length !== 7) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v * factor))),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
