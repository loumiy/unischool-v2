// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { memo } from 'react';
import { lift, polyPoints, project, projectedCircle, type Camera, type Pt } from './isoProjection';
import { shadowOffset, sunScreenDir } from './light';

// Trees on the campus map. Geometry here, colour in styles.css — the same
// house rule buildingMotifs.tsx and groundMarkings.tsx follow, and the same
// no-art, no-library, hand-rolled-SVG constraint.
//
// EVERYTHING ABOUT ONE TREE COMES OUT OF ITS SEED (see state/types.ts's
// Trees block for why the state is one integer per tile). Species, height,
// crown size and where in its own tile it stands are all derived from that
// number, so a wood is varied without storing anything per tree beyond it,
// and a given tree looks the same every render, every session, forever —
// which matters, because a tree that changed shape when the camera moved
// would read as a rendering bug rather than as a tree.
//
// Trees are drawn in the SAME depth-sorted pass as buildings (see
// CampusMap.tsx), not in a layer of their own. That is the whole reason
// they read as standing on the ground: a tree in front of a hall paints
// over it, one behind it is hidden by it. A separate layer would put every
// tree either in front of or behind every building, and both look wrong.

// Three species, chosen so the wood has silhouettes rather than one shape
// at three sizes: a broad round-crowned deciduous tree, a narrow conifer,
// and a small ornamental. See the crown block below for the proportions and
// for why a crown is drawn in screen space while its shadow is not.
export type Species = 'canopy' | 'conifer' | 'ornamental';
const SPECIES: Species[] = ['canopy', 'canopy', 'canopy', 'conifer', 'conifer', 'ornamental'];

// A tiny integer hash, so the several independent rolls a tree needs
// (species, scale, offset) can all come off one seed without correlating
// with each other — using `seed % n` for each would tie the species to the
// position in a way the eye picks up as banding across the map.
function roll(seed: number, salt: number): number {
  let h = (seed ^ (salt * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export interface TreeShape {
  species: Species;
  // Where in its own tile the trunk stands, 0..1 across and down — so a
  // grove is not a lattice. Kept inside the middle 60% of the tile so a
  // tree never appears to stand on the tile next door.
  u: number;
  v: number;
  scale: number;
}

export function treeShape(seed: number): TreeShape {
  return {
    species: SPECIES[Math.floor(roll(seed, 1) * SPECIES.length)],
    u: 0.2 + roll(seed, 2) * 0.6,
    v: 0.2 + roll(seed, 3) * 0.6,
    scale: 0.78 + roll(seed, 4) * 0.5,
  };
}

// A crown is a MASS IN THE AIR, and that is the whole reason it is drawn in
// SCREEN space rather than projected onto the ground plane like everything
// else on this map. The first version built a crown from projected circles,
// which come out as 2:1 squashed ellipses — correct for anything lying on
// the ground (a shadow, a fountain's basin, a running track) and exactly
// wrong for a canopy, which read as a dinner plate balanced on a stick. A
// roughly spherical thing looks roughly circular from every direction, so a
// crown is circles.
//
// Each species gets a silhouette rather than one shape at three sizes:
//   - canopy: three overlapping blobs, with a lit cap up and to the left
//     (the direction the whole map is lit from — see buildingMotifs' SLOPE)
//   - conifer: a stack of three tapering triangles, narrow and dark
//   - ornamental: one small round head
//
// The SHADOW stays projected, because a shadow genuinely does lie on the
// ground and genuinely is an ellipse at this angle.

interface Blob { dx: number; dy: number; r: number; }

// Offsets are in units of the crown's own radius, so a species' silhouette
// holds its shape at every size.
const CANOPY_BLOBS: Blob[] = [
  { dx: -0.42, dy: 0.16, r: 0.72 },
  { dx: 0.44, dy: 0.20, r: 0.68 },
  { dx: 0.02, dy: -0.24, r: 0.86 },
];

// ONE TREE, at a fractional grid position. Takes an explicit species and
// scale rather than a seed, because it has two callers with two different
// ideas of where a tree comes from: the woodland (Tree below, which rolls
// both off a tile's stored seed) and the campus quad's own planting (see
// groundMarkings.tsx), which is authored geometry belonging to the quad —
// it arrives and leaves with the building and has no state at all. Sharing
// this rather than drawing two kinds of tree is what stops the quad's
// planting looking like a different species of object from the wood around
// it.
//
// `col`/`row` are grid CORNER coordinates, fractional — exactly what
// isoProjection's project() takes.
// Trunk height and crown radius in SCREEN units (as authored at the default
// pitch — lift foreshortens the trunk with the camera). A tile is TILE_H
// (32) deep and a lecture hall stands 114 units to its ridge, so a canopy
// tree at ~60 to the top of its crown is about half the height of a hall —
// which is what a mature tree beside a teaching building is.
function treeMetrics(species: Species, scale: number) {
  return {
    trunkH: (species === 'conifer' ? 12 : species === 'ornamental' ? 11 : 22) * scale,
    crownR: (species === 'conifer' ? 13 : species === 'ornamental' ? 10 : 19) * scale,
    trunkW: (species === 'ornamental' ? 1.7 : species === 'conifer' ? 2.0 : 3.0) * scale,
  };
}

// The shadow a tree throws: a ground ellipse the crown's size, offset away
// from the sun by the height of the crown's middle (see light.ts), so a
// tree's shadow and a building's fall the same way and nothing on the map
// is lit from two directions at once. PROJECTED, unlike the crown — a
// shadow really does lie on the ground, which is the whole distinction this
// file turns on.
export function treeShadow(col: number, row: number, species: Species, scale: number): Pt[] {
  const { trunkH, crownR } = treeMetrics(species, scale);
  const shadowR = (crownR / 64) * (species === 'conifer' ? 0.7 : 1);
  const { dcol, drow } = shadowOffset(trunkH + crownR * 0.7);
  return projectedCircle(col + dcol, row + drow, shadowR, 12);
}

// A woodland tree's shadow, by the tile's stored seed — what CampusMap's
// shadow pass draws for every tree of the wood.
export function woodlandShadow(row: number, col: number, seed: number): Pt[] {
  const { species, u, v, scale } = treeShape(seed);
  return treeShadow(col + u, row + v, species, scale);
}

export function TreeAt({ col, row, species, scale, shadow = true }: {
  col: number; row: number; species: Species; scale: number;
  // Whether to draw the shadow here, under the tree. The woodland's trees
  // pass false: their shadows are drawn in one pass under every mass (see
  // CampusMap), so a shadow can never land on top of a building behind the
  // tree. A quad's own planting keeps its shadow inline, on the quad.
  shadow?: boolean;
}) {
  const foot = project(col, row);
  const { trunkH, crownR, trunkW } = treeMetrics(species, scale);
  const trunkTop = lift(foot, trunkH);
  // The lit side of a crown follows the sun across the screen and is always
  // toward the top — the sun is above whichever way the camera stands.
  const sun = sunScreenDir();

  return (
    <g className={`campus-tree ${species}`} aria-hidden="true">
      {shadow && <polygon className="campus-tree-shadow" points={polyPoints(treeShadow(col, row, species, scale))} />}
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
        // Three tapering tiers, each starting a little above the last, so
        // the profile steps rather than being one smooth cone.
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
          <circle className="campus-tree-crown" cx={trunkTop.x} cy={trunkTop.y - crownR * 0.55} r={crownR} />
          <circle
            className="campus-tree-crown-top"
            cx={trunkTop.x + sun.x * crownR * 0.42} cy={trunkTop.y - crownR * 0.95}
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
          {/* The lit cap, toward the sun — see light.ts. Without it a crown
              is one flat colour and has no top. */}
          <circle
            className="campus-tree-crown-top"
            cx={trunkTop.x + sun.x * crownR * 0.36}
            cy={trunkTop.y - crownR * 1.10}
            r={crownR * 0.60}
          />
        </>
      )}
    </g>
  );
}

// A WOODLAND tree, on tile (row, col): TreeAt with everything about it —
// species, size, and where in its own tile it stands — rolled off the one
// integer that tile's entry in `trees` stores.
//
// MEMOISED, for the same reason BuildingMotif is: a tree is a pure function
// of its three props, and a campus carries several hundred of them. Without
// this every render of the map rebuilt every crown, trunk and shadow —
// which was most of the JavaScript the map ran while a building was being
// sited (see CampusMap.tsx's CampusScene for the other half of that story).
// The camera is a prop for the memo's sake only — the geometry reads it from
// the projection — so a tree redraws when the view turns.
function Tree({ row, col, seed }: { row: number; col: number; seed: number; camera: Camera }) {
  const { species, u, v, scale } = treeShape(seed);
  return <TreeAt col={col + u} row={row + v} species={species} scale={scale} shadow={false} />;
}
export default memo(Tree);
