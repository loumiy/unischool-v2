import { QUAD_NAMES } from '../content/placement.ts';
import { QUAD_GREEN_WEIGHT, QUAD_MAX_AREA, QUAD_MIN_AREA, QUAD_MIN_ENCLOSURE } from '../tuning.ts';
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

export interface Quad {
  key: string; // the anchor tile, "col,row"
  tiles: string[];
  area: number;
  enclosure: number; // 0–1: the share of its boundary that is building wall
  green: number; // 0–1: the share of it that is lawn or trees, not paving
  quality: number; // 0–1: enclosure, lifted by how green it is
  name: string;
  centre: { col: number; row: number };
}

const ORTHO = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

function nameFor(key: string, taken: Set<string>): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 1000003;
  for (let i = 0; i < QUAD_NAMES.length; i++) {
    const name = QUAD_NAMES[(h + i) % QUAD_NAMES.length]!;
    if (!taken.has(name)) return name;
  }
  return QUAD_NAMES[h % QUAD_NAMES.length]!;
}

// Detection is a flood fill over open ground, so it costs the grid once.
// The campus is immutable, so the answer is cached against the object
// itself: the map asks every render and pays once a change.
const cache = new WeakMap<Campus, Quad[]>();

export function detectQuads(campus: Campus): Quad[] {
  const cached = cache.get(campus);
  if (cached) return cached;
  const N = GRID_WIDTH * GRID_HEIGHT;
  // 0 open ground, 1 building, 2 terrain (water or road).
  const kind = new Uint8Array(N);
  for (let r = 0; r < GRID_HEIGHT; r++) {
    for (let c = 0; c < GRID_WIDTH; c++) {
      if (terrainAt(c, r) !== null) kind[r * GRID_WIDTH + c] = 2;
    }
  }
  for (const p of campus.placements) {
    for (let r = p.row; r < p.row + p.h; r++) {
      for (let c = p.col; c < p.col + p.w; c++) {
        if (r >= 0 && c >= 0 && r < GRID_HEIGHT && c < GRID_WIDTH) kind[r * GRID_WIDTH + c] = 1;
      }
    }
  }
  const paved = new Set(campus.paths);
  const seen = new Uint8Array(N);
  const quads: Quad[] = [];
  const taken = new Set<string>();
  const queue = new Int32Array(N);
  for (let start = 0; start < N; start++) {
    if (seen[start] || kind[start] !== 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const tiles: number[] = [];
    let touchesEdge = false;
    let wall = 0;
    let boundary = 0;
    while (head < tail) {
      const i = queue[head++]!;
      tiles.push(i);
      const c = i % GRID_WIDTH;
      const r = (i - c) / GRID_WIDTH;
      if (c === 0 || r === 0 || c === GRID_WIDTH - 1 || r === GRID_HEIGHT - 1) touchesEdge = true;
      for (const [dc, dr] of ORTHO) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= GRID_WIDTH || nr >= GRID_HEIGHT) continue;
        const j = nr * GRID_WIDTH + nc;
        if (kind[j] === 0) {
          if (!seen[j]) {
            seen[j] = 1;
            queue[tail++] = j;
          }
          continue;
        }
        boundary++;
        if (kind[j] === 1) wall++;
      }
    }
    if (touchesEdge || tiles.length < QUAD_MIN_AREA || tiles.length > QUAD_MAX_AREA) continue;
    const enclosure = boundary === 0 ? 0 : wall / boundary;
    if (enclosure < QUAD_MIN_ENCLOSURE) continue;
    const keys = tiles.map((i) => {
      const c = i % GRID_WIDTH;
      return tileKey(c, (i - c) / GRID_WIDTH);
    });
    const green = keys.filter((k) => !paved.has(k)).length / keys.length;
    const anchorCol = tiles[0]! % GRID_WIDTH;
    const anchorRow = (tiles[0]! - anchorCol) / GRID_WIDTH;
    const key = tileKey(anchorCol, anchorRow);
    const name = campus.quadNames[key] ?? nameFor(key, taken);
    taken.add(name);
    quads.push({
      key,
      tiles: keys,
      area: tiles.length,
      enclosure: Number(enclosure.toFixed(3)),
      green: Number(green.toFixed(3)),
      quality: Number((enclosure * (1 - QUAD_GREEN_WEIGHT + QUAD_GREEN_WEIGHT * green)).toFixed(3)),
      name,
      centre: {
        col: tiles.reduce((t, i) => t + (i % GRID_WIDTH), 0) / tiles.length + 0.5,
        row: tiles.reduce((t, i) => t + Math.floor(i / GRID_WIDTH), 0) / tiles.length + 0.5,
      },
    });
  }
  cache.set(campus, quads);
  return quads;
}

export function quadAt(campus: Campus, key: string): Quad | null {
  return detectQuads(campus).find((q) => q.key === key) ?? null;
}
