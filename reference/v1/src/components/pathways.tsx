// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { useMemo } from 'react';
import type { Pathways } from '../state/types';
import { parsePathTileKey } from '../state/campusMap';
import { boxFaces, polyPoints, project, type Camera, type Pt } from './isoProjection';

// Drawn walkways, autotiled.
//
// Each path tile still occupies exactly one grid square — nothing here
// changes what the player drew or what is stored. What changes is that a
// tile is no longer drawn in isolation: every tile looks at its eight
// neighbours first, and the run as a whole is rendered as one continuous
// surface with a kerb only along its real boundary.
//
// Two things that needed fixing, both visible on the angled map:
//
//   1. A run drawn along a SCREEN-horizontal line is a DIAGONAL in grid
//      terms — consecutive tiles meet at a single corner and nowhere else —
//      so it came out as a chain of separate diamonds with pinholes between
//      them. The diagonal-connector patch below closes exactly those.
//
//   2. Every tile carried its own outline, so a wide plaza was a grid of
//      squares rather than one paved area. The kerb is now drawn ONLY on
//      edges with no neighbour behind them, which is what makes a run read
//      as a walkway and a block read as a plaza.
//
// The whole layer renders as THREE <path> elements no matter how much the
// player has drawn — every tile is a subpath, not an element. A campus with
// a thousand paving squares costs the same three nodes as one with ten.

// Neighbour offsets, in tile space: [dRow, dCol].
const ORTHO = [[-1, 0], [0, 1], [1, 0], [0, -1]] as const;     // N, E, S, W
const DIAGONAL = [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const; // NE, SE, SW, NW

// How far a diagonal connector reaches into each of the two tiles it
// bridges, in tiles. Big enough to close the pinhole convincingly, small
// enough that a diagonal run still reads as stepping rather than as a solid
// band.
const CONNECTOR = 0.3;

function sub(pts: Pt[]): string {
  return `M${polyPoints(pts).replace(/ /g, 'L')}Z`;
}
function seg(a: Pt, b: Pt): string {
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

interface Geometry { fill: string; kerb: string; joints: string; }

export function buildPathGeometry(pathways: Pathways): Geometry {
  const tiles: { row: number; col: number }[] = [];
  const present = new Set<string>();
  for (const key of Object.keys(pathways)) {
    const t = parsePathTileKey(key);
    if (!t) continue;
    tiles.push(t);
    present.add(`${t.row},${t.col}`);
  }
  const has = (row: number, col: number) => present.has(`${row},${col}`);

  const fill: string[] = [];
  const kerb: string[] = [];
  const joints: string[] = [];

  for (const { row, col } of tiles) {
    const f = boxFaces(col, row, 1, 1, 0, 0);
    // top is [A, B, C, D] — A back, B right, C front, D left. The four edges
    // in the same order as ORTHO: N is A-B, E is B-C, S is C-D, W is D-A.
    const [A, B, C, D] = f.top;
    fill.push(sub(f.top));

    const edges: [Pt, Pt][] = [[A, B], [B, C], [C, D], [D, A]];
    const neighbour = ORTHO.map(([dr, dc]) => has(row + dr, col + dc));
    for (let i = 0; i < 4; i++) {
      // A kerb only where the paving actually stops. This is the whole of
      // the autotile: the bitmask decides which edges exist, and the run's
      // silhouette falls out of it without any per-tile variants.
      if (!neighbour[i]) kerb.push(seg(edges[i][0], edges[i][1]));
      // Where paving DOES continue, a light joint line instead, so a large
      // plaza still reads as laid paving rather than as one poured slab.
      else if (i === 0 || i === 1) joints.push(seg(edges[i][0], edges[i][1]));
    }

    // Diagonal connectors. Only when the diagonal neighbour exists and
    // NEITHER of the two orthogonal tiles between them does — with either
    // one present the paving already meets along a full edge and a patch
    // would be drawing over solid ground.
    DIAGONAL.forEach(([dr, dc], k) => {
      if (!has(row + dr, col + dc)) return;
      // One patch per PAIR, not one per tile: both tiles of a diagonal pair
      // see the same shared corner, so the tile further back is made its
      // canonical owner and the other skips. Every pair has exactly one tile
      // that sees the other as SE or SW.
      if (dr < 0) return;
      const a = ORTHO[k];                  // one of the two tiles flanking this diagonal
      const b = ORTHO[(k + 1) % 4];        // the other
      if (has(row + a[0], col + a[1]) || has(row + b[0], col + b[1])) return;
      // The grid corner the two tiles share, as a small diamond centred on
      // it and reaching into both.
      const cc = col + (dc > 0 ? 1 : 0);
      const cr = row + (dr > 0 ? 1 : 0);
      fill.push(sub([
        project(cc - CONNECTOR, cr),
        project(cc, cr - CONNECTOR),
        project(cc + CONNECTOR, cr),
        project(cc, cr + CONNECTOR),
      ]));
    });
  }

  return { fill: fill.join(''), kerb: kerb.join(''), joints: joints.join('') };
}

export default function PathwayLayer({ pathways, camera }: { pathways: Pathways; camera: Camera }) {
  // Rebuilt only when the pathways record itself changes identity, which the
  // reducer does exactly when a tile is drawn or erased — or when the camera
  // moves, since the geometry is drawn at it — not on every pan frame, and
  // not on every unrelated tick.
  const { fill, kerb, joints } = useMemo(() => buildPathGeometry(pathways), [pathways, camera]);
  if (!fill) return null;
  return (
    <g className="campus-paths" aria-hidden="true">
      <path className="campus-path-fill" d={fill} />
      <path className="campus-path-joint" d={joints} />
      <path className="campus-path-kerb" d={kerb} />
    </g>
  );
}
