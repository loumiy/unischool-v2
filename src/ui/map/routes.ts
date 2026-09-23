import { buildingById } from '../../content/buildings.ts';
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  parseTileKey,
  terrainAt,
  throughTiles,
  type Campus,
  type Placement,
} from '../../sim/index.ts';

// ROUTES FOR WALKERS (DD §6.3): the cheapest way over the grid between two
// doors — paths first, lawn when there is no path, the road at the edge,
// never through a building or the stream. Found on the map's own copy of
// the grid and cached per campus, so a route costs once and a walker
// costs nothing.

const PATH_COST = 1;
const ROAD_COST = 1.5;
const LAWN_COST = 4;

export interface Waypoint {
  col: number; // tile centre
  row: number;
}

export interface Door {
  placementId: string;
  buildingId: string;
  col: number;
  row: number;
}

function idx(col: number, row: number): number {
  return row * GRID_WIDTH + col;
}

// The tile cost grid: -1 where nothing walks.
export function walkGrid(campus: Campus): Float32Array {
  const g = new Float32Array(GRID_WIDTH * GRID_HEIGHT).fill(LAWN_COST);
  for (let r = 0; r < GRID_HEIGHT; r++) {
    for (let c = 0; c < GRID_WIDTH; c++) {
      const t = terrainAt(c, r);
      if (t === 'stream') g[idx(c, r)] = -1;
      else if (t === 'road') g[idx(c, r)] = ROAD_COST;
    }
  }
  for (const p of campus.placements) {
    for (let r = p.row; r < p.row + p.h; r++)
      for (let c = p.col; c < p.col + p.w; c++) g[idx(c, r)] = -1;
    // A gate is walked through (Phase 21J), and a footbridge walked across
    // (Phase 21L): their ways are as good as paving once they are open.
    if (p.status === 'open') for (const t of throughTiles(p)) g[idx(t.col, t.row)] = PATH_COST;
  }
  for (const key of campus.paths) {
    const t = parseTileKey(key);
    if (t && g[idx(t.col, t.row)] !== -1) g[idx(t.col, t.row)] = PATH_COST;
  }
  return g;
}

// A building's door: the tile just outside the middle of its front (the
// +row edge), or the nearest free tile around its perimeter.
export function doorOf(p: Placement, grid: Float32Array): Door | null {
  const want: [number, number][] = [[p.col + Math.floor(p.w / 2), p.row + p.h]];
  for (let c = p.col; c < p.col + p.w; c++) want.push([c, p.row + p.h], [c, p.row - 1]);
  for (let r = p.row; r < p.row + p.h; r++) want.push([p.col - 1, r], [p.col + p.w, r]);
  for (const [c, r] of want) {
    if (c < 0 || r < 0 || c >= GRID_WIDTH || r >= GRID_HEIGHT) continue;
    if (grid[idx(c, r)]! > 0)
      return { placementId: p.id, buildingId: p.buildingId, col: c, row: r };
  }
  return null;
}

// Open buildings' doors, with a weight for how much of the day happens
// there: home and the halls first.
export function doors(campus: Campus, grid: Float32Array): { door: Door; weight: number }[] {
  const out: { door: Door; weight: number }[] = [];
  for (const p of campus.placements) {
    if (p.status !== 'open') continue;
    const door = doorOf(p, grid);
    if (!door) continue;
    const def = buildingById(p.buildingId);
    const weight =
      def.category === 'residential'
        ? 3
        : def.category === 'academic' || def.category === 'dining'
          ? 2
          : def.category === 'life'
            ? 1.5
            : 1;
    out.push({ door, weight });
  }
  return out;
}

// Dijkstra on the tile grid, eight-way, diagonal moves costing more and
// refused across a blocked corner. Returns tile centres, or null.
export function findRoute(
  grid: Float32Array,
  from: { col: number; row: number },
  to: { col: number; row: number },
): Waypoint[] | null {
  const n = GRID_WIDTH * GRID_HEIGHT;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const start = idx(from.col, from.row);
  const goal = idx(to.col, to.row);
  if (grid[start]! <= 0 || grid[goal]! <= 0) return null;
  dist[start] = 0;
  // A binary min-heap over (cost, tile), as two parallel arrays.
  const hc: number[] = [];
  const hi: number[] = [];
  const swap = (a: number, b: number) => {
    [hc[a], hc[b]] = [hc[b]!, hc[a]!];
    [hi[a], hi[b]] = [hi[b]!, hi[a]!];
  };
  const push = (cost: number, i: number) => {
    hc.push(cost);
    hi.push(i);
    let k = hc.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (hc[parent]! <= hc[k]!) break;
      swap(parent, k);
      k = parent;
    }
  };
  const pop = (): [number, number] => {
    const cost = hc[0]!;
    const i = hi[0]!;
    const lastCost = hc.pop()!;
    const lastI = hi.pop()!;
    if (hc.length > 0) {
      hc[0] = lastCost;
      hi[0] = lastI;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < hc.length && hc[l]! < hc[m]!) m = l;
        if (r < hc.length && hc[r]! < hc[m]!) m = r;
        if (m === k) break;
        swap(m, k);
        k = m;
      }
    }
    return [cost, i];
  };
  push(0, start);
  while (hc.length > 0) {
    const [cost, i] = pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i === goal) break;
    const c = i % GRID_WIDTH;
    const r = (i - c) / GRID_WIDTH;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= GRID_WIDTH || nr >= GRID_HEIGHT) continue;
        const j = idx(nc, nr);
        const step = grid[j]!;
        if (step <= 0) continue;
        if (dr !== 0 && dc !== 0) {
          // No cutting a blocked corner.
          if (grid[idx(c + dc, r)]! <= 0 || grid[idx(c, r + dr)]! <= 0) continue;
        }
        const w = cost + step * (dr !== 0 && dc !== 0 ? Math.SQRT2 : 1);
        if (w < dist[j]!) {
          dist[j] = w;
          prev[j] = i;
          push(w, j);
        }
      }
    }
  }
  if (!done[goal]) return null;
  const out: Waypoint[] = [];
  for (let i = goal; i !== -1; i = prev[i]!) {
    out.push({ col: (i % GRID_WIDTH) + 0.5, row: Math.floor(i / GRID_WIDTH) + 0.5 });
  }
  return out.reverse();
}

// The road's tiles along the parcel's edge, where students come from and go
// to when there is nowhere else: a door with no building.
export function roadsides(grid: Float32Array): Waypoint[] {
  const out: Waypoint[] = [];
  for (let c = 4; c < GRID_WIDTH - 4; c += 6) {
    for (let r = GRID_HEIGHT - 1; r >= GRID_HEIGHT - 4; r--) {
      if (terrainAt(c, r) === 'road' && grid[idx(c, r)]! > 0) {
        out.push({ col: c, row: r });
        break;
      }
    }
  }
  return out;
}
