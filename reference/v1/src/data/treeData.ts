// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// v1's founding-woodland generator. Reference for how groves read on the map; v2's fixed canvas (DD §6.1) authors terrain as data, not by generation.
import type { Placements, Trees } from '../state/types';
import { CAMPUS_GRID_HEIGHT, CAMPUS_GRID_WIDTH } from '../state/types';
import { pathTileKey, placementTiles } from '../state/campusMap';

// ---------------------------------------------------------------------
// THE FOUNDING WOODLAND. What generates a new campus's trees (see
// state/types.ts's Trees block for what one is and the three rules it
// follows). Content, not a system: this runs exactly once, in
// createInitialState, and nothing ticks it — a campus's woodland only ever
// shrinks, by being built on.
//
// GROVES, NOT A SCATTER. A uniform random sprinkle at any density reads as
// noise: evenly spaced single trees over the whole plate, none of them
// anywhere in particular. Real ground has stands of trees with open
// meadow between them, so this places a handful of GROVE CENTRES and
// scatters most of the wood around those with a falling-off density, then
// adds a thin scatter of specimen trees everywhere else. The result is a
// map with places on it — a wood along one edge, a clearing in the middle —
// which is what makes siting a building a choice about ground rather than
// about empty coordinates.
//
// A CLEAR MIDDLE is deliberate and is the one non-random rule: Founders
// Hall is pre-placed at the centre of the grid (see actions.ts), so the
// tiles it stands on are excluded outright, and grove centres are kept out
// of the ring around it. A founding campus should open with room to build
// in without felling anything first.
// ---------------------------------------------------------------------

// How much of the plate is wooded. 5% of a 126x126 grid is about 790 trees,
// which is enough for the groves to read as woods at the zoom the game
// opens at without putting a tree on every other tile — and, since each one
// draws as three or four small polygons (see components/trees.tsx), enough
// to stay cheap beside the buildings that share the same render pass.
const TREE_COVERAGE = 0.05;
// Of that, how much falls in groves rather than in the thin scatter.
const GROVE_SHARE = 0.78;
const GROVE_COUNT = 14;
// Trees fall within this many tiles of their grove's centre, with density
// falling off toward the edge (see the radius roll below).
const GROVE_RADIUS = 13;
// No grove centre lands within this many tiles of the middle of the grid,
// so the founding campus opens with a clearing to build in.
const CLEARING_RADIUS = 18;

// The seed each tree carries. One integer, from which the renderer derives
// species, size and the offset within the tile — see Trees in types.ts for
// why a seed rather than a record of fields.
// Exported for the reducer's PLANT_TREE, which rolls a seed the same way
// the founding woodland's are rolled.
export const TREE_SEED_RANGE = 1 << 20;

function randomSeed(): number {
  return Math.floor(Math.random() * TREE_SEED_RANGE);
}

// Every tile any already-placed Buildable stands on. A founding campus has
// exactly one (Founders Hall), but this takes the whole Placements record
// rather than one placement so the same function can be reused to re-seed
// against any layout.
function occupiedTiles(placements: Placements): Set<string> {
  const taken = new Set<string>();
  for (const p of Object.values(placements)) {
    for (const tile of placementTiles(p)) taken.add(pathTileKey(tile));
  }
  return taken;
}

// A normally-ish distributed offset in [-1, 1], from the mean of two
// uniform rolls: cheap, needs no Box-Muller, and is exactly the shape
// wanted here — most trees near their grove's centre, a few out at the
// edge.
function clustered(): number {
  return (Math.random() + Math.random()) - 1;
}

export function seedTrees(placements: Placements): Trees {
  const trees: Trees = {};
  const taken = occupiedTiles(placements);
  const total = Math.round(CAMPUS_GRID_WIDTH * CAMPUS_GRID_HEIGHT * TREE_COVERAGE);

  const plant = (row: number, col: number): void => {
    if (row < 0 || col < 0 || row >= CAMPUS_GRID_HEIGHT || col >= CAMPUS_GRID_WIDTH) return;
    const key = pathTileKey({ row, col });
    if (taken.has(key) || key in trees) return;
    trees[key] = randomSeed();
  };

  // Grove centres, kept out of the clearing in the middle.
  const midRow = CAMPUS_GRID_HEIGHT / 2;
  const midCol = CAMPUS_GRID_WIDTH / 2;
  const centres: Array<{ row: number; col: number }> = [];
  // Bounded rather than `while (centres.length < GROVE_COUNT)`: a run of
  // unlucky rolls must not be able to spin. Falling a grove or two short of
  // GROVE_COUNT on such a run costs nothing — the scatter below still fills
  // the map out to TREE_COVERAGE.
  for (let attempt = 0; attempt < GROVE_COUNT * 8 && centres.length < GROVE_COUNT; attempt++) {
    const row = Math.floor(Math.random() * CAMPUS_GRID_HEIGHT);
    const col = Math.floor(Math.random() * CAMPUS_GRID_WIDTH);
    if (Math.hypot(row - midRow, col - midCol) < CLEARING_RADIUS) continue;
    centres.push({ row, col });
  }

  const inGroves = Math.round(total * GROVE_SHARE);
  for (let i = 0; i < inGroves && centres.length > 0; i++) {
    const centre = centres[i % centres.length];
    plant(
      Math.round(centre.row + clustered() * GROVE_RADIUS),
      Math.round(centre.col + clustered() * GROVE_RADIUS),
    );
  }

  // The thin scatter: specimen trees anywhere, including across the
  // clearing, so the open middle is a meadow rather than a bald patch.
  for (let i = inGroves; i < total; i++) {
    plant(
      Math.floor(Math.random() * CAMPUS_GRID_HEIGHT),
      Math.floor(Math.random() * CAMPUS_GRID_WIDTH),
    );
  }

  return trees;
}

// Fell every tree under a footprint. The one place a tree is ever removed,
// called from the reducer's PLACE_BUILDABLE the moment a placement is
// committed (and from the save loader's own hygiene pass, which applies the
// same rule to a save that predates trees). Mutates, like everything else
// the reducer calls.
export function fellTrees(trees: Trees, placement: { row: number; col: number; w: number; h: number }): void {
  for (const tile of placementTiles(placement)) delete trees[pathTileKey(tile)];
}
