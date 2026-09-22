import type { BuildingDef } from '../../content/buildings.ts';
import type { Motif } from '../../sim/index.ts';
import { materialOf, wallHeightOf } from './buildingSpec.ts';
import { paletteFrom } from './buildingMotifs.tsx';
import { boxFaces, heightScale, lift, polyPoints, project, TILE_W, type Pt } from './iso.ts';
import { faceTone } from './light.ts';
import { shade } from './tint.ts';

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

// ---------- the tower crane ----------

// A thick line as a polygon, taperable end to end. Everything the crane is
// made of is one of these: strokes would stay hairline at every zoom, which
// is what made the old crane read as a diagram among buildings that have
// mass.
function beam(a: Pt, b: Pt, wa: number, wb = wa): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return [
    { x: a.x + nx * wa, y: a.y + ny * wa },
    { x: b.x + nx * wb, y: b.y + ny * wb },
    { x: b.x - nx * wb, y: b.y - ny * wb },
    { x: a.x - nx * wa, y: a.y - ny * wa },
  ];
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// The zig-zag between two chords of a truss, as one polyline of beams.
function web(aFrom: Pt, aTo: Pt, bFrom: Pt, bTo: Pt, bays: number, thick: number): Pt[][] {
  const out: Pt[][] = [];
  for (let i = 0; i < bays; i++) {
    const t0 = i / bays;
    const t1 = (i + 1) / bays;
    const top = i % 2 === 0 ? lerp(aFrom, aTo, t0) : lerp(aFrom, aTo, t1);
    const bot = i % 2 === 0 ? lerp(bFrom, bTo, t1) : lerp(bFrom, bTo, t0);
    out.push(beam(top, bot, thick));
  }
  return out;
}

// Standards at the corners of a plot with two lifts of ledgers between them
// and a brace across the back. A hatch alone reads as a texture; the tubes
// say work is happening here. Drawn as beams rather than strokes, for the
// same reason the crane is (Phase 21A): a hairline at every zoom sits oddly
// beside buildings that have bulk.
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
  const at = (i: number, up: number) => lift(foot(posts[i]![0], posts[i]![1]), pole * up);
  const tube = 1.5;
  const ledger = 1;
  // Two working lifts, each a rail along the back and one down each side.
  const lifts = [0.42, 0.78].flatMap((up) => [
    [at(0, up), at(1, up)],
    [at(1, up), at(2, up)],
    [at(0, up), at(3, up)],
  ]);
  return (
    <g className="scaffolding" aria-hidden="true">
      {posts.map(([c, r], i) => (
        <polygon
          key={i}
          className="scaffold-pole"
          points={polyPoints(beam(foot(c, r), lift(foot(c, r), pole), tube))}
        />
      ))}
      {lifts.map(([a, b], i) => (
        <polygon key={i} className="scaffold-rail" points={polyPoints(beam(a!, b!, ledger))} />
      ))}
      {/* one brace, so the bay reads as braced rather than as a box */}
      <polygon
        className="scaffold-rail"
        points={polyPoints(beam(at(0, 0.42), at(1, 0.78), ledger * 0.8))}
      />
    </g>
  );
}

const CRANE_YELLOW = '#d8a92a';

// A tower crane: a latticed mast on a ballast pad, a slewing ring, the cab,
// the A-frame the ties hang from, a tapering jib with its trolley and hook,
// and a counter-jib with the weights on the end. Drawn in screen space
// because it is a tall thin thing seen against the campus, and foreshortened
// with the tilt like everything else that stands up.
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
  const standing = Math.max(0.12, Math.min(1, heightScale()));
  const base = project(col + w * 0.18, row + h * 0.82);
  const mastH = (Math.max(height * 2.2, 70) + 40) * standing;
  const top = { x: base.x, y: base.y - mastH };
  const legW = Math.max(2.6, mastH * 0.035);
  const reach = Math.min(w, h) * TILE_W * 0.46;
  const back = reach * 0.38;

  // The jib: two chords converging on the tip, and the counter-jib, which
  // is stubbier and carries the weights.
  const jibRoot = { x: top.x + legW * 1.4, y: top.y - mastH * 0.04 };
  const jibTip = { x: top.x + reach, y: top.y - reach * 0.1 };
  const jibRootLow = { x: jibRoot.x, y: jibRoot.y + legW * 3.1 };
  const jibTipLow = { x: jibTip.x, y: jibTip.y + legW * 1.05 };
  const cjRoot = { x: top.x - legW * 1.4, y: top.y + mastH * 0.01 };
  const cjEnd = { x: top.x - back, y: top.y + back * 0.1 };
  const cjRootLow = { x: cjRoot.x, y: cjRoot.y + legW * 2.7 };
  const cjEndLow = { x: cjEnd.x, y: cjEnd.y + legW * 1.2 };

  // The A-frame over the slewing ring, and the ties out to both arms.
  const apex = { x: top.x, y: top.y - mastH * 0.3 };
  const tieJib = lerp(jibRoot, jibTip, 0.62);
  const tieCj = lerp(cjRoot, cjEnd, 0.8);

  // The trolley, and the hook hanging off it.
  const trolley = lerp(jibRootLow, jibTipLow, 0.55);
  const hookY = trolley.y + mastH * 0.42;
  const dark = shade(CRANE_YELLOW, 0.72);
  const poly = (pts: Pt[], cls: string, fill?: string) => (
    <polygon className={cls} points={polyPoints(pts)} fill={fill} />
  );
  return (
    <g className="site-crane" aria-hidden="true">
      {/* ballast pad */}
      <polygon
        className="crane-ballast"
        points={polyPoints(boxFaces(col + w * 0.06, row + h * 0.7, 0.9, 0.9, 0, 3).top)}
      />
      {/* mast: two legs, lattice between them */}
      {poly(beam(base, top, legW * 0.9, legW * 0.62), 'crane-steel', dark)}
      {Array.from({ length: 7 }, (_, i) => {
        const t0 = i / 7;
        const t1 = (i + 1) / 7;
        const wide = (t: number) => legW * (0.9 - 0.28 * t);
        const l0 = { x: base.x - wide(t0), y: base.y - mastH * t0 };
        const r1 = { x: base.x + wide(t1), y: base.y - mastH * t1 };
        const r0 = { x: base.x + wide(t0), y: l0.y };
        const l1 = { x: base.x - wide(t1), y: r1.y };
        return (
          <g key={i}>
            {poly(beam(l0, r1, legW * 0.16), 'crane-lattice')}
            {poly(beam(r0, l1, legW * 0.16), 'crane-lattice')}
          </g>
        );
      })}
      {/* counter-jib, behind the mast head */}
      {poly(beam(cjRoot, cjEnd, legW * 0.42, legW * 0.3), 'crane-steel', dark)}
      {poly(beam(cjRootLow, cjEndLow, legW * 0.3), 'crane-steel', dark)}
      {web(cjRoot, cjEnd, cjRootLow, cjEndLow, 4, legW * 0.16).map((pts, i) => (
        <polygon key={i} className="crane-lattice" points={polyPoints(pts)} />
      ))}
      {poly(
        [
          { x: cjEnd.x - legW * 1.7, y: cjEnd.y - legW * 0.2 },
          { x: cjEnd.x + legW * 0.2, y: cjEnd.y - legW * 0.2 },
          { x: cjEnd.x + legW * 0.2, y: cjEndLow.y + legW * 1.5 },
          { x: cjEnd.x - legW * 1.7, y: cjEndLow.y + legW * 1.5 },
        ],
        'crane-weight',
      )}
      {/* the jib */}
      {poly(beam(jibRoot, jibTip, legW * 0.5, legW * 0.26), 'crane-steel')}
      {poly(beam(jibRootLow, jibTipLow, legW * 0.34, legW * 0.2), 'crane-steel')}
      {web(jibRoot, jibTip, jibRootLow, jibTipLow, 9, legW * 0.16).map((pts, i) => (
        <polygon key={i} className="crane-lattice" points={polyPoints(pts)} />
      ))}
      {/* A-frame and the ties it carries */}
      {poly(
        beam({ x: top.x - legW * 1.1, y: top.y }, apex, legW * 0.36, legW * 0.2),
        'crane-steel',
      )}
      {poly(
        beam({ x: top.x + legW * 1.1, y: top.y }, apex, legW * 0.36, legW * 0.2),
        'crane-steel',
      )}
      {poly(beam(apex, tieJib, legW * 0.11), 'crane-tie')}
      {poly(beam(apex, tieCj, legW * 0.11), 'crane-tie')}
      {/* the cab, where the operator sits */}
      {poly(
        [
          { x: top.x + legW * 0.9, y: top.y + mastH * 0.015 },
          { x: top.x + legW * 3.1, y: top.y + mastH * 0.015 },
          { x: top.x + legW * 3.1, y: top.y + mastH * 0.075 },
          { x: top.x + legW * 0.9, y: top.y + mastH * 0.075 },
        ],
        'crane-cab',
      )}
      {/* trolley, hoist line and hook block */}
      {poly(
        [
          { x: trolley.x - legW * 0.5, y: trolley.y - legW * 0.35 },
          { x: trolley.x + legW * 0.5, y: trolley.y - legW * 0.35 },
          { x: trolley.x + legW * 0.5, y: trolley.y + legW * 0.35 },
          { x: trolley.x - legW * 0.5, y: trolley.y + legW * 0.35 },
        ],
        'crane-weight',
      )}
      {poly(beam(trolley, { x: trolley.x, y: hookY }, legW * 0.1), 'crane-tie')}
      {poly(
        [
          { x: trolley.x - legW * 0.42, y: hookY },
          { x: trolley.x + legW * 0.42, y: hookY },
          { x: trolley.x + legW * 0.42, y: hookY + legW * 0.8 },
          { x: trolley.x - legW * 0.42, y: hookY + legW * 0.8 },
        ],
        'crane-weight',
      )}
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
