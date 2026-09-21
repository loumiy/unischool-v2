import { TERRAIN_CONTENT } from '../content/terrain.ts';
import { Rng } from './rng.ts';

// The parcel, expanded from content/terrain.json into tiles — once, at
// module load, from a FIXED seed, so every run opens on the same land and
// the same wood (DD §6.1). Nothing here is state: it is derived, and a save
// never carries it.

export const GRID_WIDTH = 64;
export const GRID_HEIGHT = 64;

export type TerrainKind = 'stream' | 'road';

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function parseTileKey(key: string): { col: number; row: number } | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const col = Number(parts[0]);
  const row = Number(parts[1]);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return { col, row };
}

export function inGrid(col: number, row: number): boolean {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    row >= 0 &&
    col < GRID_WIDTH &&
    row < GRID_HEIGHT
  );
}

interface Terrain {
  // Tiles nothing may stand on, and why.
  blocked: ReadonlyMap<string, TerrainKind>;
  stream: readonly { col: number; row: number }[];
  road: readonly { col: number; row: number }[];
  // The founding woodland: tile key → the tree's seed (see ui/map/trees.tsx
  // for what a seed becomes).
  woodland: Readonly<Record<string, number>>;
}

export const TREE_SEED_RANGE = 1 << 20;

function expand(): Terrain {
  const c = TERRAIN_CONTENT;
  const blocked = new Map<string, TerrainKind>();
  const road: { col: number; row: number }[] = [];
  const stream: { col: number; row: number }[] = [];

  for (let row = c.road.rows[0]; row <= c.road.rows[1]; row++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      blocked.set(tileKey(col, row), 'road');
      road.push({ col, row });
    }
  }

  // The stream: a polyline walked tile by tile, `width` tiles wide across
  // the columns. Where it meets the road it stops — the road bridges it.
  const half = Math.floor(c.stream.width / 2);
  const paint = (col: number, row: number) => {
    for (let d = -half; d < c.stream.width - half; d++) {
      const cc = col + d;
      if (!inGrid(cc, row)) continue;
      const key = tileKey(cc, row);
      if (blocked.has(key)) continue;
      blocked.set(key, 'stream');
      stream.push({ col: cc, row });
    }
  };
  for (let i = 0; i + 1 < c.stream.points.length; i++) {
    const [c0, r0] = c.stream.points[i]!;
    const [c1, r1] = c.stream.points[i + 1]!;
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
    for (let s = 0; s <= steps; s++) {
      paint(Math.round(c0 + ((c1 - c0) * s) / steps), Math.round(r0 + ((r1 - r0) * s) / steps));
    }
  }

  // The wood: groves with a falling-off density, then a thin scatter, all
  // off one fixed seed and never inside the clearing or on blocked ground.
  const rng = Rng.fromSeed(c.seed);
  const woodland: Record<string, number> = {};
  const clearing = c.woodland.clearing;
  const plant = (col: number, row: number) => {
    if (!inGrid(col, row)) return;
    if (Math.hypot(col - clearing.col, row - clearing.row) < clearing.radius) return;
    const key = tileKey(col, row);
    if (blocked.has(key) || key in woodland) return;
    woodland[key] = rng.int(0, TREE_SEED_RANGE - 1);
  };
  // A normally-ish distributed offset in [-1, 1], from the mean of two rolls.
  const clustered = () => rng.next() + rng.next() - 1;
  for (const g of c.woodland.groves) {
    for (let i = 0; i < g.trees; i++) {
      plant(Math.round(g.col + clustered() * g.radius), Math.round(g.row + clustered() * g.radius));
    }
  }
  const scatter = Math.round(GRID_WIDTH * GRID_HEIGHT * c.woodland.scatterPerTile);
  for (let i = 0; i < scatter; i++) plant(rng.int(0, GRID_WIDTH - 1), rng.int(0, GRID_HEIGHT - 1));

  return { blocked, stream, road, woodland };
}

export const TERRAIN: Terrain = expand();

export function terrainAt(col: number, row: number): TerrainKind | null {
  return TERRAIN.blocked.get(tileKey(col, row)) ?? null;
}

export function foundingWoodland(): Record<string, number> {
  return { ...TERRAIN.woodland };
}
