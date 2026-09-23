import { buildingById, type BuildingDef } from '../content/buildings.ts';
import { footprintIsClear, inBounds, type Campus, type Placement } from './campus.ts';
import { GRID_HEIGHT, GRID_WIDTH, TERRAIN, tileKey } from './terrain.ts';

// REACHABILITY (Phase 21L). A building nobody can walk to is not a
// building a registrar would enrol anyone into. The rule is a floor, not a
// pathfinder: every building with a door, and every field, must have a
// walking route to the road — over lawn, paving, the road itself, a gate's
// way through or a footbridge's deck — and nothing may be placed that
// walls off something already standing.
//
// Walking is four-way here: a diagonal between two corners is not a way
// through a wall.

const idx = (col: number, row: number) => row * GRID_WIDTH + col;

// The tiles of a placement a person can walk across: a gate's middle and
// a footbridge's whole deck.
export function throughTiles(p: Pick<Placement, 'buildingId' | 'col' | 'row' | 'w' | 'h'>) {
  const form = buildingById(p.buildingId).form;
  const out: { col: number; row: number }[] = [];
  if (form === 'gate') {
    out.push({ col: p.col + Math.floor(p.w / 2), row: p.row + Math.floor(p.h / 2) });
  } else if (form === 'bridge') {
    for (let r = p.row; r < p.row + p.h; r++)
      for (let c = p.col; c < p.col + p.w; c++) out.push({ col: c, row: r });
  }
  return out;
}

type Site = Pick<Placement, 'buildingId' | 'col' | 'row' | 'w' | 'h'>;

// Every tile a person can reach on foot from the road, as a mask.
export function reachFromRoad(placements: readonly Site[]): Uint8Array {
  const open = new Uint8Array(GRID_WIDTH * GRID_HEIGHT).fill(1);
  for (const t of TERRAIN.stream) open[idx(t.col, t.row)] = 0;
  for (const p of placements) {
    for (let r = p.row; r < p.row + p.h; r++)
      for (let c = p.col; c < p.col + p.w; c++) open[idx(c, r)] = 0;
  }
  for (const p of placements) for (const t of throughTiles(p)) open[idx(t.col, t.row)] = 1;
  const seen = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  const queue: number[] = [];
  for (const t of TERRAIN.road) {
    const i = idx(t.col, t.row);
    if (open[i] && !seen[i]) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const col = i % GRID_WIDTH;
    const row = (i - col) / GRID_WIDTH;
    const next: [number, number][] = [
      [col + 1, row],
      [col - 1, row],
      [col, row + 1],
      [col, row - 1],
    ];
    for (const [c, r] of next) {
      if (c < 0 || r < 0 || c >= GRID_WIDTH || r >= GRID_HEIGHT) continue;
      const j = idx(c, r);
      if (open[j] && !seen[j]) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  return seen;
}

// Does this building need a way in? Everything with a door, and every
// field; a statue in a walled garden is a statue in a walled garden.
export function needsAccess(def: BuildingDef): boolean {
  return def.door !== null || def.form === 'grounds';
}

// Is some tile beside the footprint reachable?
export function reachable(reach: Uint8Array, p: Site): boolean {
  for (let c = p.col; c < p.col + p.w; c++) {
    if (p.row - 1 >= 0 && reach[idx(c, p.row - 1)]) return true;
    if (p.row + p.h < GRID_HEIGHT && reach[idx(c, p.row + p.h)]) return true;
  }
  for (let r = p.row; r < p.row + p.h; r++) {
    if (p.col - 1 >= 0 && reach[idx(p.col - 1, r)]) return true;
    if (p.col + p.w < GRID_WIDTH && reach[idx(p.col + p.w, r)]) return true;
  }
  return false;
}

// A FOOTBRIDGE fits where it spans the stream: one tile wide, on no road
// and nothing standing, over water in the middle and landing on dry
// ground at both ends.
export function bridgeFits(campus: Campus, col: number, row: number, w: number, h: number) {
  if (!inBounds(col, row, w, h) || Math.min(w, h) !== 1) return false;
  const along = w >= h;
  const length = Math.max(w, h);
  let water = 0;
  for (let i = 0; i < length; i++) {
    const c = along ? col + i : col;
    const r = along ? row : row + i;
    const kind = TERRAIN.blocked.get(tileKey(c, r));
    if (kind === 'road') return false;
    if (
      campus.placements.some((p) => c >= p.col && c < p.col + p.w && r >= p.row && r < p.row + p.h)
    )
      return false;
    const end = i === 0 || i === length - 1;
    if (kind === 'stream') {
      if (end) return false;
      water++;
    }
  }
  return water > 0;
}

// Why the ground refuses a building here, or null: cheap, so it can be
// asked first.
export function groundRefusal(
  campus: Campus,
  def: BuildingDef,
  col: number,
  row: number,
  w: number,
  h: number,
): string | null {
  if (def.form === 'bridge') {
    return bridgeFits(campus, col, row, w, h)
      ? null
      : 'a footbridge spans the stream, landing on dry ground at both ends';
  }
  return footprintIsClear(campus, col, row, w, h)
    ? null
    : 'footprint is off the parcel, on water or road, or occupied';
}

// Why the walk refuses it, or null: no way to it from the road, or it
// would wall off something already standing. Two flood fills of the
// parcel, so it is asked last.
export function accessRefusal(
  campus: Campus,
  def: BuildingDef,
  col: number,
  row: number,
  w: number,
  h: number,
): string | null {
  const site = { buildingId: def.id, col, row, w, h };
  const after = reachFromRoad([...campus.placements, site]);
  if (needsAccess(def) && !reachable(after, site))
    return 'there is no way to walk to it from the road';
  const before = reachFromRoad(campus.placements);
  for (const p of campus.placements) {
    const other = buildingById(p.buildingId);
    if (!needsAccess(other)) continue;
    if (reachable(before, p) && !reachable(after, p))
      return `it would wall off the ${other.name.toLowerCase()}`;
  }
  return null;
}

// Why a building may not go here, or null if it may: the ground itself,
// then the walk to it, then what it would wall off.
export function siteRefusal(
  campus: Campus,
  def: BuildingDef,
  col: number,
  row: number,
  w: number,
  h: number,
): string | null {
  return groundRefusal(campus, def, col, row, w, h) ?? accessRefusal(campus, def, col, row, w, h);
}
