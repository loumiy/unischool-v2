import { memo } from 'react';
import { roll, speciesOf, type Species } from '../../sim/index.ts';
import { lift, polyPoints, project, projectedCircle, type Camera, type Pt } from './iso.ts';
import { shadowOffset, sunScreenDir } from './light.ts';

// Trees on the campus map (ported from v1's trees.tsx). Everything about one
// tree comes out of its seed: species, size, and where in its own tile it
// stands, so a wood is varied without storing anything per tree beyond one
// integer, and a tree looks the same every render, forever.
//
// The seed's hash and the species it means live in sim/trees.ts, not here:
// since Phase 21A the player can ask for a kind of tree, so the sim has to
// know what a seed means in order to hand back one that means it. This file
// keeps only what is purely drawing — the size and the offset within a tile.

export type { Species };

export interface TreeShape {
  species: Species;
  u: number;
  v: number;
  scale: number;
}

export function treeShape(seed: number): TreeShape {
  return {
    species: speciesOf(seed),
    u: 0.2 + roll(seed, 2) * 0.6,
    v: 0.2 + roll(seed, 3) * 0.6,
    scale: 0.78 + roll(seed, 4) * 0.5,
  };
}

interface Blob {
  dx: number;
  dy: number;
  r: number;
}
const CANOPY_BLOBS: Blob[] = [
  { dx: -0.42, dy: 0.16, r: 0.72 },
  { dx: 0.44, dy: 0.2, r: 0.68 },
  { dx: 0.02, dy: -0.24, r: 0.86 },
];

function treeMetrics(species: Species, scale: number) {
  return {
    trunkH: (species === 'conifer' ? 12 : species === 'ornamental' ? 11 : 22) * scale,
    crownR: (species === 'conifer' ? 13 : species === 'ornamental' ? 10 : 19) * scale,
    trunkW: (species === 'ornamental' ? 1.7 : species === 'conifer' ? 2.0 : 3.0) * scale,
  };
}

// The shadow a tree throws: a ground ellipse offset away from the sun.
export function treeShadow(col: number, row: number, species: Species, scale: number): Pt[] {
  const { trunkH, crownR } = treeMetrics(species, scale);
  const shadowR = (crownR / 64) * (species === 'conifer' ? 0.7 : 1);
  const { dcol, drow } = shadowOffset(trunkH + crownR * 0.7);
  return projectedCircle(col + dcol, row + drow, shadowR, 12);
}

export function woodlandShadow(col: number, row: number, seed: number): Pt[] {
  const { species, u, v, scale } = treeShape(seed);
  return treeShadow(col + u, row + v, species, scale);
}

// A crown is a mass in the air, so it is drawn in SCREEN space: a roughly
// spherical thing looks roughly circular from every direction.
export function TreeAt({
  col,
  row,
  species,
  scale,
}: {
  col: number;
  row: number;
  species: Species;
  scale: number;
}) {
  const foot = project(col, row);
  const { trunkH, crownR, trunkW } = treeMetrics(species, scale);
  const trunkTop = lift(foot, trunkH);
  const sun = sunScreenDir();
  return (
    <g className={`campus-tree ${species}`} aria-hidden="true">
      <polygon
        className="campus-tree-trunk"
        points={polyPoints([
          { x: foot.x - trunkW, y: foot.y },
          { x: foot.x + trunkW, y: foot.y },
          { x: trunkTop.x + trunkW * 0.6, y: trunkTop.y },
          { x: trunkTop.x - trunkW * 0.6, y: trunkTop.y },
        ])}
      />
      {species === 'conifer' ? (
        [0, 1, 2].map((tier) => {
          const halfW = crownR * (1 - (tier / 2) * 0.45);
          const base = trunkTop.y - crownR * 0.75 * tier;
          return (
            <polygon
              key={tier}
              className={tier === 2 ? 'campus-tree-crown-top' : 'campus-tree-crown'}
              points={polyPoints([
                { x: foot.x - halfW, y: base },
                { x: foot.x + halfW, y: base },
                { x: foot.x, y: base - crownR * 1.5 },
              ])}
            />
          );
        })
      ) : species === 'ornamental' ? (
        <>
          <circle
            className="campus-tree-crown"
            cx={trunkTop.x}
            cy={trunkTop.y - crownR * 0.55}
            r={crownR}
          />
          <circle
            className="campus-tree-crown-top"
            cx={trunkTop.x + sun.x * crownR * 0.42}
            cy={trunkTop.y - crownR * 0.95}
            r={crownR * 0.52}
          />
        </>
      ) : (
        <>
          {CANOPY_BLOBS.map((b, i) => (
            <circle
              key={i}
              className="campus-tree-crown"
              cx={trunkTop.x + b.dx * crownR}
              cy={trunkTop.y - crownR * 0.62 + b.dy * crownR}
              r={b.r * crownR}
            />
          ))}
          <circle
            className="campus-tree-crown-top"
            cx={trunkTop.x + sun.x * crownR * 0.36}
            cy={trunkTop.y - crownR * 1.1}
            r={crownR * 0.6}
          />
        </>
      )}
    </g>
  );
}

// A woodland tree on tile (col, row). Memoised: a campus carries hundreds.
// The camera is a prop for the memo's sake only.
function Tree({ col, row, seed }: { col: number; row: number; seed: number; camera: Camera }) {
  const { species, u, v, scale } = treeShape(seed);
  return <TreeAt col={col + u} row={row + v} species={species} scale={scale} />;
}
export default memo(Tree);
