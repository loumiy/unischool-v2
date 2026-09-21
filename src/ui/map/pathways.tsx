import { useMemo } from 'react';
import { parseTileKey } from '../../sim/index.ts';
import { boxFaces, polyPoints, project, type Camera, type Pt } from './iso.ts';

// Drawn walkways, autotiled (ported from v1's pathways.tsx). Each tile looks
// at its neighbours: a kerb only along the run's real boundary, a light
// joint where paving continues, and a connector across the corner two
// diagonal tiles share. Three <path> elements however much is drawn.

const ORTHO = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
] as const; // N, E, S, W in (dRow, dCol)
const DIAGONAL = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
] as const;
const CONNECTOR = 0.3;

function sub(pts: Pt[]): string {
  return `M${polyPoints(pts).replace(/ /g, 'L')}Z`;
}
function seg(a: Pt, b: Pt): string {
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

export function buildPathGeometry(paths: readonly string[]): {
  fill: string;
  kerb: string;
  joints: string;
} {
  const tiles: { row: number; col: number }[] = [];
  const present = new Set<string>();
  for (const key of paths) {
    const t = parseTileKey(key);
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
    const [A, B, C, D] = f.top as [Pt, Pt, Pt, Pt];
    fill.push(sub(f.top));
    const edges: [Pt, Pt][] = [
      [A, B],
      [B, C],
      [C, D],
      [D, A],
    ];
    const neighbour = ORTHO.map(([dr, dc]) => has(row + dr, col + dc));
    for (let i = 0; i < 4; i++) {
      const e = edges[i]!;
      if (!neighbour[i]) kerb.push(seg(e[0], e[1]));
      else if (i === 0 || i === 1) joints.push(seg(e[0], e[1]));
    }
    DIAGONAL.forEach(([dr, dc], k) => {
      if (!has(row + dr, col + dc)) return;
      if (dr < 0) return;
      const a = ORTHO[k]!;
      const b = ORTHO[(k + 1) % 4]!;
      if (has(row + a[0], col + a[1]) || has(row + b[0], col + b[1])) return;
      const cc = col + (dc > 0 ? 1 : 0);
      const cr = row + (dr > 0 ? 1 : 0);
      fill.push(
        sub([
          project(cc - CONNECTOR, cr),
          project(cc, cr - CONNECTOR),
          project(cc + CONNECTOR, cr),
          project(cc, cr + CONNECTOR),
        ]),
      );
    });
  }
  return { fill: fill.join(''), kerb: kerb.join(''), joints: joints.join('') };
}

export default function PathwayLayer({
  paths,
  camera,
}: {
  paths: readonly string[];
  camera: Camera;
}) {
  // The camera is a dependency of the geometry, not read here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { fill, kerb, joints } = useMemo(() => buildPathGeometry(paths), [paths, camera]);
  if (!fill) return null;
  return (
    <g className="campus-paths" aria-hidden="true">
      <path className="campus-path-fill" d={fill} />
      <path className="campus-path-joint" d={joints} />
      <path className="campus-path-kerb" d={kerb} />
    </g>
  );
}
