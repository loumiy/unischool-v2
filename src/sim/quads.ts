import { QUAD_NAMES } from '../content/placement.ts';
import {
  QUAD_DOORWAY_DEPTH,
  QUAD_DOORWAY_WIDTH,
  QUAD_GREEN_WEIGHT,
  QUAD_MAX_AREA,
  QUAD_MIN_AREA,
  QUAD_MIN_ENCLOSURE,
  QUAD_PATH_WEIGHT,
} from '../tuning.ts';
import type { Campus } from './campus.ts';
import { GRID_HEIGHT, GRID_WIDTH, terrainAt, tileKey } from './terrain.ts';

// QUADS (DD §6.2): the open spaces the buildings enclose, detected rather
// than declared. A quad is a patch of ground that is not built on, not
// water or road, does not reach the edge of the parcel, is neither a
// courtyard-sized nothing nor the rest of the campus, and is bounded mostly
// by walls. The game finds them, names them, and lets the player rename
// them; what they are worth is placement.ts's business.
//
// A quad's identity is its anchor — the first of its tiles in row-major
// order — so a name sticks to a space as long as its top corner does. A
// quad reshaped from that corner is a new quad, and is named afresh.
//
// TWO THINGS ENCLOSE GROUND (Phase 21C). The fill runs twice. First over
// open ground with paving underfoot, which finds the spaces the BUILDINGS
// enclose and lets a walk cross a green without cutting it in two. Then,
// through what that pass did not claim, with paving as edge rather than
// floor, which finds the spaces the PAVING encloses — a lawn a player has
// drawn a rectangle of path around is a lawn, and says so at a path's
// weight rather than a wall's. Before either, narrow gaps between
// buildings are sealed: a courtyard left open at the corners for a path is
// a courtyard with doorways, not a bay off the rest of the campus.

export interface Quad {
  key: string; // the anchor tile, "col,row"
  tiles: string[];
  area: number;
  enclosure: number; // 0–1: how much of its edge is wall, paving counting for less
  green: number; // 0–1: the share of it that is lawn or trees, not paving
  quality: number; // 0–1: enclosure, lifted by how green it is
  name: string;
  centre: { col: number; row: number };
}

// The four neighbours, north first, as two flat arrays: the fill walks
// every open tile on the parcel four times over.
const DC = [0, 1, 0, -1] as const;
const DR = [-1, 0, 1, 0] as const;

// What a tile is to the fill. Anything but OPEN stops it and is edge.
const OPEN = 0;
const BUILT = 1;
const TERRAIN = 2; // water or road: it bounds a space without walling it
const DOORWAY = 3; // a gap too narrow to be a way out

function nameFor(key: string, taken: Set<string>): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 1000003;
  for (let i = 0; i < QUAD_NAMES.length; i++) {
    const name = QUAD_NAMES[(h + i) % QUAD_NAMES.length]!;
    if (!taken.has(name)) return name;
  }
  return QUAD_NAMES[h % QUAD_NAMES.length]!;
}

// A DOORWAY IS A HOLE THROUGH SOMETHING THIN. The gap a player leaves
// between two buildings to walk through is narrow — at most
// QUAD_DOORWAY_WIDTH tiles across, closed at both ends by something solid —
// and it is a hole in a wall, so it is also shallow: the run of equally
// narrow ground through it is no deeper than QUAD_DOORWAY_DEPTH. Both
// halves matter. Without the first, a courtyard drains through its own
// entrance into the rest of the campus and is rejected for reaching the
// parcel edge. Without the second, a long alley between two halls, or a
// narrow light well a player meant as a court, would be sealed as well —
// and those are narrow without being a hole in anything.
//
// A sealed doorway counts against the enclosure it breaks, like water or a
// road: it is a way in, and a court with four of them is not a closed
// court. What it does not do is make the space fail to exist.

// The run of open ground through (col,row) along one axis: its length, or 0
// if it is longer than the width allowed or runs off the parcel rather than
// ending against something solid.
function narrowRun(kind: Uint8Array, col: number, row: number, dc: number, dr: number): number {
  let length = 1;
  let ends = 0;
  for (const sign of [1, -1]) {
    let c = col + dc * sign;
    let r = row + dr * sign;
    while (c >= 0 && r >= 0 && c < GRID_WIDTH && r < GRID_HEIGHT) {
      if (kind[r * GRID_WIDTH + c] !== OPEN) {
        ends++;
        break;
      }
      length++;
      if (length > QUAD_DOORWAY_WIDTH) return 0;
      c += dc * sign;
      r += dr * sign;
    }
  }
  return ends === 2 ? length : 0;
}

// How far the narrowness goes on, across the run: the depth of the thing
// the gap is a hole in.
function depthOfGap(narrow: Uint8Array, col: number, row: number, dc: number, dr: number): number {
  let depth = 1;
  for (const sign of [1, -1]) {
    let c = col + dc * sign;
    let r = row + dr * sign;
    while (c >= 0 && r >= 0 && c < GRID_WIDTH && r < GRID_HEIGHT && narrow[r * GRID_WIDTH + c]) {
      depth++;
      if (depth > QUAD_DOORWAY_DEPTH) return depth;
      c += dc * sign;
      r += dr * sign;
    }
  }
  return depth;
}

// Every tile of a run that is bounded at both ends within the width
// allowed touches one of those ends, so a tile with open ground all round
// it cannot be part of a doorway. The check is four reads and it skips most
// of an unbuilt parcel, which is what detection spends its time on.
function touchesSolid(kind: Uint8Array, col: number, row: number): boolean {
  for (let k = 0; k < 4; k++) {
    const c = col + DC[k]!;
    const r = row + DR[k]!;
    if (c < 0 || r < 0 || c >= GRID_WIDTH || r >= GRID_HEIGHT) continue;
    if (kind[r * GRID_WIDTH + c] !== OPEN) return true;
  }
  return false;
}

function sealDoorways(kind: Uint8Array): void {
  const N = GRID_WIDTH * GRID_HEIGHT;
  const narrowAcross = new Uint8Array(N); // narrow left-to-right
  const narrowDown = new Uint8Array(N); // narrow top-to-bottom
  const candidates: number[] = [];
  for (let r = 0; r < GRID_HEIGHT; r++) {
    for (let c = 0; c < GRID_WIDTH; c++) {
      const i = r * GRID_WIDTH + c;
      if (kind[i] !== OPEN || !touchesSolid(kind, c, r)) continue;
      if (narrowRun(kind, c, r, 1, 0) > 0) narrowAcross[i] = 1;
      if (narrowRun(kind, c, r, 0, 1) > 0) narrowDown[i] = 1;
      if (narrowAcross[i] || narrowDown[i]) candidates.push(i);
    }
  }
  // Collected first and applied after, so one doorway does not make the
  // next tile look like one.
  const sealed: number[] = [];
  for (const i of candidates) {
    const c = i % GRID_WIDTH;
    const r = (i - c) / GRID_WIDTH;
    const thin =
      (narrowAcross[i] === 1 && depthOfGap(narrowAcross, c, r, 0, 1) <= QUAD_DOORWAY_DEPTH) ||
      (narrowDown[i] === 1 && depthOfGap(narrowDown, c, r, 1, 0) <= QUAD_DOORWAY_DEPTH);
    if (thin) sealed.push(i);
  }
  for (const i of sealed) kind[i] = DOORWAY;
}

interface Region {
  tiles: number[];
  touchesEdge: boolean;
  boundary: number;
  wall: number; // weighted: a building wall is worth 1, paving less
}

// One flood from `start`. `pavingIsEdge` says which of the two passes this
// is; `claimed` are the tiles an earlier quad already owns, which stop the
// fill without walling it.
function flood(
  start: number,
  kind: Uint8Array,
  paved: Uint8Array,
  claimed: Uint8Array,
  seen: Uint8Array,
  queue: Int32Array,
  pavingIsEdge: boolean,
): Region {
  const blockPaving = pavingIsEdge;
  const passable = (i: number) =>
    kind[i] === OPEN && claimed[i] === 0 && !(blockPaving && paved[i] === 1);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  const region: Region = { tiles: [], touchesEdge: false, boundary: 0, wall: 0 };
  while (head < tail) {
    const i = queue[head++]!;
    region.tiles.push(i);
    const c = i % GRID_WIDTH;
    const r = (i - c) / GRID_WIDTH;
    if (c === 0 || r === 0 || c === GRID_WIDTH - 1 || r === GRID_HEIGHT - 1) {
      region.touchesEdge = true;
    }
    for (let k = 0; k < 4; k++) {
      const nc = c + DC[k]!;
      const nr = r + DR[k]!;
      if (nc < 0 || nr < 0 || nc >= GRID_WIDTH || nr >= GRID_HEIGHT) continue;
      const j = nr * GRID_WIDTH + nc;
      if (passable(j)) {
        if (!seen[j]) {
          seen[j] = 1;
          queue[tail++] = j;
        }
        continue;
      }
      region.boundary++;
      if (kind[j] === BUILT) region.wall += 1;
      else if (kind[j] === OPEN && pavingIsEdge && paved[j] === 1) region.wall += QUAD_PATH_WEIGHT;
      // Water, road, a doorway or another quad bound the space without
      // enclosing it, and count against the share that does.
    }
  }
  return region;
}

// Detection is a flood fill over open ground, so it costs the grid twice.
// The campus is immutable, so the answer is cached against the object
// itself: the map asks every render and pays once a change.
const cache = new WeakMap<Campus, Quad[]>();

// The water and the road never move, so the grid they make is built once
// and copied, rather than asked tile by tile on every detection. A replay
// detects quads once a week for fifty years, and this is the bulk of it.
let terrainGrid: Uint8Array | null = null;
function baseGrid(): Uint8Array {
  if (terrainGrid) return terrainGrid;
  const grid = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  for (let r = 0; r < GRID_HEIGHT; r++) {
    for (let c = 0; c < GRID_WIDTH; c++) {
      if (terrainAt(c, r) !== null) grid[r * GRID_WIDTH + c] = TERRAIN;
    }
  }
  terrainGrid = grid;
  return grid;
}

export function detectQuads(campus: Campus): Quad[] {
  const cached = cache.get(campus);
  if (cached) return cached;
  const N = GRID_WIDTH * GRID_HEIGHT;
  const kind = baseGrid().slice();
  for (const p of campus.placements) {
    for (let r = p.row; r < p.row + p.h; r++) {
      for (let c = p.col; c < p.col + p.w; c++) {
        if (r >= 0 && c >= 0 && r < GRID_HEIGHT && c < GRID_WIDTH) kind[r * GRID_WIDTH + c] = BUILT;
      }
    }
  }
  sealDoorways(kind);
  const paved = new Uint8Array(N);
  for (const key of campus.paths) {
    const comma = key.indexOf(',');
    const c = Number(key.slice(0, comma));
    const r = Number(key.slice(comma + 1));
    if (r >= 0 && c >= 0 && r < GRID_HEIGHT && c < GRID_WIDTH) paved[r * GRID_WIDTH + c] = 1;
  }

  const claimed = new Uint8Array(N);
  const queue = new Int32Array(N);
  const quads: Quad[] = [];
  const taken = new Set<string>();

  // Pass one: what the buildings enclose, paving underfoot. Pass two: what
  // the paving encloses, in the ground pass one left — and there is nothing
  // for it to find on a campus with no paths, so it is not run.
  const passes = campus.paths.length > 0 ? [false, true] : [false];
  for (const pavingIsEdge of passes) {
    const seen = new Uint8Array(N);
    for (let start = 0; start < N; start++) {
      if (seen[start] || claimed[start] || kind[start] !== OPEN) continue;
      if (pavingIsEdge && paved[start] === 1) continue;
      const region = flood(start, kind, paved, claimed, seen, queue, pavingIsEdge);
      const { tiles } = region;
      if (region.touchesEdge || tiles.length < QUAD_MIN_AREA || tiles.length > QUAD_MAX_AREA) {
        continue;
      }
      const enclosure = region.boundary === 0 ? 0 : region.wall / region.boundary;
      if (enclosure < QUAD_MIN_ENCLOSURE) continue;
      const keys = tiles.map((i) => {
        const c = i % GRID_WIDTH;
        return tileKey(c, (i - c) / GRID_WIDTH);
      });
      const green = tiles.filter((i) => paved[i] !== 1).length / tiles.length;
      const anchorCol = tiles[0]! % GRID_WIDTH;
      const anchorRow = (tiles[0]! - anchorCol) / GRID_WIDTH;
      const key = tileKey(anchorCol, anchorRow);
      const name = campus.quadNames[key] ?? nameFor(key, taken);
      taken.add(name);
      for (const i of tiles) claimed[i] = 1;
      quads.push({
        key,
        tiles: keys,
        area: tiles.length,
        enclosure: Number(enclosure.toFixed(3)),
        green: Number(green.toFixed(3)),
        quality: Number(
          (enclosure * (1 - QUAD_GREEN_WEIGHT + QUAD_GREEN_WEIGHT * green)).toFixed(3),
        ),
        name,
        centre: {
          col: tiles.reduce((t, i) => t + (i % GRID_WIDTH), 0) / tiles.length + 0.5,
          row: tiles.reduce((t, i) => t + Math.floor(i / GRID_WIDTH), 0) / tiles.length + 0.5,
        },
      });
    }
  }
  // Row-major order over the whole campus, so two passes read as one map.
  quads.sort((a, b) => {
    const [ac, ar] = a.key.split(',').map(Number) as [number, number];
    const [bc, br] = b.key.split(',').map(Number) as [number, number];
    return ar - br || ac - bc;
  });
  cache.set(campus, quads);
  return quads;
}

export function quadAt(campus: Campus, key: string): Quad | null {
  return detectQuads(campus).find((q) => q.key === key) ?? null;
}
