import type { BuildingDef } from '../../content/buildings.ts';
import type { Motif } from '../../sim/index.ts';
import { materialOf, wallHeightOf } from './buildingSpec.ts';
import { paletteFrom } from './buildingMotifs.tsx';
import { boxFaces, lift, polyPoints, project, TILE_W } from './iso.ts';
import { faceTone } from './light.ts';

// WORKS ON THE MAP (ported from v1's site rendering): a building under
// construction is a footprint pegged out and a frame barely off the
// ground, not a building with the roof left off. The mass RISING is what
// completion looks like. A renovation is the finished building with the
// scaffold up its walls. Both carry a progress bar flat on the ground
// along the front edge of the plot.

// How tall a site stands: a frame, never nothing, so it throws a shadow.
export function siteHeightOf(def: BuildingDef): number {
  if (def.form === 'grounds') return 0;
  return Math.max(4, wallHeightOf(def) * 0.16);
}

export const SCAFFOLD_PATTERN_ID = 'campus-scaffold';
export function ScaffoldPattern() {
  return (
    <pattern id={SCAFFOLD_PATTERN_ID} width={14} height={14} patternUnits="userSpaceOnUse">
      <path className="scaffold-hatch" d="M-4,4 L4,-4 M0,14 L14,0 M10,18 L18,10" />
    </pattern>
  );
}

// Poles at the corners of a plot with one lift line along the back. A hatch
// alone reads as a texture; the poles say work is happening here.
export function Scaffolding({
  col,
  row,
  w,
  h,
  height,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  height: number;
}) {
  const posts: [number, number][] = [
    [col + w * 0.06, row + h * 0.06],
    [col + w * 0.94, row + h * 0.06],
    [col + w * 0.94, row + h * 0.94],
    [col + w * 0.06, row + h * 0.94],
  ];
  const pole = height + 14;
  const foot = (c: number, r: number) => project(c, r);
  const a = lift(foot(posts[0]![0], posts[0]![1]), pole * 0.72);
  const b = lift(foot(posts[1]![0], posts[1]![1]), pole * 0.72);
  return (
    <g className="scaffolding" aria-hidden="true">
      {posts.map(([c, r], i) => {
        const f = foot(c, r);
        const head = lift(f, pole);
        return <line key={i} className="scaffold-pole" x1={f.x} y1={f.y} x2={head.x} y2={head.y} />;
      })}
      <line className="scaffold-rail" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
    </g>
  );
}

// A tower crane on a big site: a mast, a jib over the plot, a counter-jib
// and a hook line — the one thing that says "building" from any distance.
function Crane({
  col,
  row,
  w,
  h,
  height,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  height: number;
}) {
  const foot = project(col + w * 0.18, row + h * 0.82);
  const mastH = Math.max(height * 2.2, 70) + 40;
  const top = lift(foot, mastH);
  const reach = Math.min(w, h) * TILE_W * 0.42;
  const jibEnd = { x: top.x + reach, y: top.y - reach * 0.18 };
  const counter = { x: top.x - reach * 0.32, y: top.y + reach * 0.06 };
  const hook = { x: top.x + reach * 0.62, y: top.y - reach * 0.11 };
  return (
    <g className="site-crane" aria-hidden="true">
      <line x1={foot.x} y1={foot.y} x2={top.x} y2={top.y} />
      <line x1={counter.x} y1={counter.y} x2={jibEnd.x} y2={jibEnd.y} />
      <line x1={top.x} y1={top.y - 10} x2={jibEnd.x} y2={jibEnd.y} className="site-crane-tie" />
      <line x1={top.x} y1={top.y - 10} x2={counter.x} y2={counter.y} className="site-crane-tie" />
      <line
        x1={hook.x}
        y1={hook.y}
        x2={hook.x}
        y2={hook.y + mastH * 0.45}
        className="site-crane-tie"
      />
      <polygon
        className="site-crane-weight"
        points={polyPoints([
          { x: counter.x - 4, y: counter.y - 3 },
          { x: counter.x + 4, y: counter.y - 3 },
          { x: counter.x + 4, y: counter.y + 3 },
          { x: counter.x - 4, y: counter.y + 3 },
        ])}
      />
    </g>
  );
}

// The site: the plot hatched, the frame in the building's own wall colour,
// the scaffold, and a crane once the plot is big enough to need one.
export function ConstructionSite({
  def,
  motif,
  col,
  row,
  w,
  h,
}: {
  def: BuildingDef;
  motif: Motif;
  col: number;
  row: number;
  w: number;
  h: number;
}) {
  const H = siteHeightOf(def);
  const plate = boxFaces(col, row, w, h, 0, 0).top;
  if (def.form === 'grounds') {
    return (
      <g className="construction-site" aria-hidden="true">
        <polygon className="site-plate" points={polyPoints(plate)} />
        <polygon className="site-peg" points={polyPoints(plate)} />
      </g>
    );
  }
  const pal = paletteFrom(materialOf(def, motif));
  const f = boxFaces(col, row, w, h, 0, H);
  return (
    <g className="construction-site" aria-hidden="true">
      <polygon className="site-plate" points={polyPoints(plate)} />
      <polygon
        points={polyPoints(f.left)}
        fill={faceTone(f.dir.CD, pal.wall.posRow, pal.wall.posCol)}
      />
      <polygon
        points={polyPoints(f.right)}
        fill={faceTone(f.dir.BC, pal.wall.posRow, pal.wall.posCol)}
      />
      <polygon className="site-deck" points={polyPoints(f.top)} />
      <Scaffolding col={col} row={row} w={w} h={h} height={H} />
      {w * h >= 20 && <Crane col={col} row={row} w={w} h={h} height={H} />}
    </g>
  );
}

const PROGRESS_BAR_DEPTH = 0.22; // in tiles

// Flat on the ground along the front edge of the plot, where nothing can
// stand on it.
export function ProgressBar({
  col,
  row,
  w,
  h,
  fraction,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  fraction: number;
}) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <g className="campus-progress" aria-hidden="true">
      <polygon
        className="campus-progress-track"
        points={polyPoints(
          boxFaces(col, row + h - PROGRESS_BAR_DEPTH, w, PROGRESS_BAR_DEPTH, 0, 0).top,
        )}
      />
      {f > 0 && (
        <polygon
          className="campus-progress-fill"
          points={polyPoints(
            boxFaces(col, row + h - PROGRESS_BAR_DEPTH, w * f, PROGRESS_BAR_DEPTH, 0, 0).top,
          )}
        />
      )}
    </g>
  );
}
