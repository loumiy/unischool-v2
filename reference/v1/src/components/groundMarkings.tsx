// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import type { FacilityType } from '../state/types';
import { boxFaces, lift, polyPoints, project, projectedArc, projectedCircle, projectedStadium, type Pt } from './isoProjection';
import { faceTone } from './light';
import { METRES_PER_TILE, up } from './campusScale';
import { shade } from './tint';
import { TreeAt, type Species } from './trees';

// Open ground: the Buildables you walk across rather than into — the quad,
// the pool deck, the courts, the pitches, and the stadium's own field. These
// have no mass at all, so they are the one part of the map that is drawn
// flat ON the grid, with their markings projected into the same angle as
// everything standing on it.
//
// Markings are authored in NORMALISED footprint coordinates (u across, v
// down, both 0..1) and projected at draw time, so a 6x3 tennis court and a
// 12x9 stadium use the same numbers and each comes out correctly
// proportioned and correctly skewed. Colour lives in styles.css; this file
// is geometry.

// u/v within the footprint -> world point.
function uv(col: number, row: number, w: number, h: number, u: number, v: number): Pt {
  return project(col + w * u, row + h * v);
}
function uvPoly(col: number, row: number, w: number, h: number, pts: [number, number][]): string {
  return polyPoints(pts.map(([u, v]) => uv(col, row, w, h, u, v)));
}
function uvLine(col: number, row: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number) {
  const a = uv(col, row, w, h, u0, v0);
  const b = uv(col, row, w, h, u1, v1);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

interface GroundProps { col: number; row: number; w: number; h: number; }

// A tile-space point: [col, row].
export type TilePt = [number, number];

// ---------------------------------------------------------------------
// FLAT GROUND AND THE THINGS STANDING ON IT — a split this file needs and
// the campus map enforces (see CampusMap.tsx's render).
//
// An angled map is painted back to front, and the order IS the occlusion.
// That works for masses, each of which can be represented by one depth (the
// far corner of its footprint) well enough. It does NOT work for a large
// FLAT plate: a 9x9 quad sorted on its far corner draws AFTER — and so over
// — a tree standing in front of its near corner but off to one side, whose
// own depth is smaller. That is not a tuning problem, it is what a single
// sort key cannot express about a big footprint.
//
// The fix is to stop asking. Flat ground has no height, so it can never
// legitimately occlude anything: it belongs UNDER every mass on the map,
// drawn in a pass of its own before them, and needs no depth at all. What
// genuinely stands on a quad or a ball field — planting, hedges, a
// fountain, a monument, a stand, a fence — is a mass like any other and
// sorts like one, each over the ground it actually covers.
//
// So each open-ground marking below comes in two halves: a component that
// draws the paint, and a function returning its raised props. `groundProps`
// at the bottom of this file is the one entry point for the second half.
export interface GroundProp {
  key: string;
  // The GROUND this prop covers, in grid coordinates: origin plus extent, the
  // same {col,row,w,h} shape a Placement uses, and what the map depth-sorts it
  // on (see depthSort.ts).
  //
  // An extent rather than a point, because several of these are not points. A
  // stand behind home plate, an outfield fence and a garden hedge each cover
  // real ground, and a prop that declares itself a point has to nominate ONE
  // spot to be sorted at — which is the same class of mistake as sorting a
  // building on its far corner, at a smaller scale. Anything genuinely
  // point-like (a tree) declares the tile it stands in, exactly as the
  // woodland on the map around it does.
  col: number;
  row: number;
  w: number;
  h: number;
  node: React.JSX.Element;
}

// The box a round prop covers, from its centre and radius — the shape a
// fountain, a medallion or a tree crown actually occupies on the ground.
function aroundPoint(cc: number, cr: number, radius: number): { col: number; row: number; w: number; h: number } {
  return { col: cc - radius, row: cr - radius, w: radius * 2, h: radius * 2 };
}

// ---------------------------------------------------------------------
// A raked stand. This is the one piece of furniture every venue on campus
// shares — the stadium is four of them around a gridiron, and the pitch and
// the ball field each get one small one — so it is defined once here and
// the geometry is identical wherever it appears.
//
// A stand is NOT a box. It is a wedge: the row nearest the field sits low,
// and each row behind it sits higher, so the surface the camera sees is a
// rake climbing away from the play. Drawing it as a box was what made the
// stadium read as "a field inside a container" — a box has a flat top and
// vertical inner walls, which is a wall around a pitch, not seating.
//
// Colours are passed in rather than taken from CSS: the stadium shades its
// stands from its own tint the way every building shades its walls, while
// the small bleachers beside a pitch are plain concrete. One geometry, two
// palettes.
// ---------------------------------------------------------------------
export function RakedStand({
  outer, inner, bottomH, topH, rakeFill, wallFill, seatStroke, rows = 4, wall = false, frontWall = false,
  endFaces = true, aisles = 0, rail = true,
}: {
  outer: [TilePt, TilePt];   // the back edge, furthest from the field and highest
  inner: [TilePt, TilePt];   // the front edge, at the field and lowest
  bottomH: number; topH: number;
  rakeFill: string; wallFill: string; seatStroke: string;
  rows?: number;
  // Which of the stand's two vertical faces the camera can actually see.
  // A stand on the near side of a pitch (max row / max col) shows its OUTER
  // back; one on the far side shows the face toward the field instead. Draw
  // the wrong one and the stand has no mass at all — it reads as a striped
  // ramp lying in the grass, which is exactly what the first version of the
  // small bleachers looked like.
  wall?: boolean;
  frontWall?: boolean;
  // The two side profiles of the wedge. These are what say "raked seating"
  // from any angle — a stand without them is a plane — and are drawn unless
  // the caller knows both ends are buried in a neighbouring bank.
  endFaces?: boolean;
  // Gangways cut down the rake, as dark slots. Zero for a bleacher.
  aisles?: number;
  // The rail along the back of the top row.
  rail?: boolean;
}) {
  const [o0, o1] = outer;
  const [i0, i1] = inner;
  const at = (t: TilePt, up: number) => lift(project(t[0], t[1]), up);
  const between = (a: TilePt, b: TilePt, f: number): TilePt => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

  // Which edge is nearer the camera. A stand whose FRONT edge is nearer
  // climbs away from the viewer, so its risers face the camera and the
  // seating reads as steps; one whose back edge is nearer shows its back
  // wall and the tops of its treads only, which is what you see looking
  // over a near stand into a bowl.
  const midO = project((o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2);
  const midI = project((i0[0] + i1[0]) / 2, (i0[1] + i1[1]) / 2);
  const climbsAway = midI.y > midO.y;

  const tiers = Math.max(1, rows);
  const step = (topH - bottomH) / tiers;
  const tierTop = (k: number) => bottomH + step * (k + 1);
  const riserFill = shade(rakeFill, 0.72);
  const endFill = shade(wallFill, 0.9);

  // The side profile of the wedge: stepped when the steps face the camera,
  // a plain trapezoid when they do not (the steps would be hidden behind
  // the back wall anyway).
  const profile = (i: TilePt, o: TilePt): Pt[] => {
    const pts: Pt[] = [at(i, 0), at(i, bottomH)];
    if (climbsAway) {
      for (let k = 0; k < tiers; k++) {
        pts.push(at(between(i, o, k / tiers), tierTop(k)));
        pts.push(at(between(i, o, (k + 1) / tiers), tierTop(k)));
      }
    } else {
      pts.push(at(o, topH));
    }
    pts.push(at(o, 0));
    return pts;
  };

  const treads: React.JSX.Element[] = [];
  if (climbsAway) {
    // Back to front: the top tier first, each lower one painting over the
    // foot of the riser behind it. Tread k sits between the k/tiers and
    // (k+1)/tiers lines, at its own height; its riser stands on the front
    // line from the tread below up to it.
    for (let k = tiers - 1; k >= 0; k--) {
      const f0 = k / tiers; const f1 = (k + 1) / tiers;
      const z = tierTop(k); const zPrev = k === 0 ? bottomH : tierTop(k - 1);
      const a0 = between(i0, o0, f0); const a1 = between(i1, o1, f0);
      const b0 = between(i0, o0, f1); const b1 = between(i1, o1, f1);
      treads.push(
        <g key={k}>
          <polygon points={polyPoints([at(a0, zPrev), at(a1, zPrev), at(a1, z), at(a0, z)])} fill={riserFill} />
          <polygon points={polyPoints([at(a0, z), at(a1, z), at(b1, z), at(b0, z)])} fill={rakeFill} />
        </g>,
      );
    }
  } else {
    // Seen from behind: the rake as one surface, with the tier edges as
    // bands of riser tone across it, which is what terraces look like
    // from the back of the top row.
    treads.push(
      <polygon key="rake" points={polyPoints([at(o0, topH), at(o1, topH), at(i1, bottomH), at(i0, bottomH)])} fill={rakeFill} />,
    );
    for (let k = 1; k < tiers; k++) {
      const f = k / tiers;
      const z = tierTop(k - 1);
      const a0 = between(i0, o0, f); const a1 = between(i1, o1, f);
      const c0 = between(i0, o0, f + 0.22 / tiers); const c1 = between(i1, o1, f + 0.22 / tiers);
      treads.push(
        <polygon key={k} points={polyPoints([at(a0, z), at(a1, z), at(c1, z + step * 0.22), at(c0, z + step * 0.22)])} fill={riserFill} />,
      );
    }
  }

  // Gangways: dark slots down the rake, from the front row to the back.
  const slots: React.JSX.Element[] = [];
  for (let j = 0; j < aisles; j++) {
    const u = (j + 1) / (aisles + 1);
    const half = 0.018;
    const fa = between(i0, i1, u - half); const fb = between(i0, i1, u + half);
    const ba = between(o0, o1, u - half); const bb = between(o0, o1, u + half);
    slots.push(
      <polygon key={j} className="stand-aisle" points={polyPoints([at(fa, bottomH), at(fb, bottomH), at(bb, topH), at(ba, topH)])} />,
    );
  }

  return (
    <>
      {endFaces && <polygon points={polyPoints(profile(i0, o0))} fill={endFill} />}
      {endFaces && <polygon points={polyPoints(profile(i1, o1))} fill={endFill} />}
      {wall && (
        <polygon points={polyPoints([at(o0, 0), at(o1, 0), at(o1, topH), at(o0, topH)])} fill={wallFill} />
      )}
      {frontWall && (
        <polygon points={polyPoints([at(i0, 0), at(i1, 0), at(i1, bottomH), at(i0, bottomH)])} fill={wallFill} />
      )}
      {treads}
      {slots}
      {rail && (
        <line className="stand-rail" x1={at(o0, topH).x} y1={at(o0, topH).y} x2={at(o1, topH).x} y2={at(o1, topH).y} />
      )}
      {void seatStroke}
    </>
  );
}

// Plain concrete, for the bleachers that are not part of a tinted building.
const CONCRETE = { rake: '#cfc7b4', wall: '#b3ab99', seat: 'rgba(60, 54, 42, 0.35)' };

// ---------------------------------------------------------------------
// A MESH FENCE around a plot — tennis courts, a pool deck, the ballpark's
// backstop. A translucent band standing on the ground with a post every
// couple of tiles and a rail along the top: the one vertical thing open
// ground has, and what stops a slab of court reading as paint.
// ---------------------------------------------------------------------
function FenceRun({ a, b, height, postEvery = 2 }: { a: TilePt; b: TilePt; height: number; postEvery?: number }) {
  const at = (t: TilePt, up: number) => lift(project(t[0], t[1]), up);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const posts = Math.max(1, Math.round(len / postEvery));
  return (
    <>
      <polygon className="ground-fence-mesh" points={polyPoints([at(a, 0), at(b, 0), at(b, height), at(a, height)])} />
      {Array.from({ length: posts + 1 }, (_, i) => {
        const f = i / posts;
        const t: TilePt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        return <line key={i} className="ground-fence-post" x1={at(t, 0).x} y1={at(t, 0).y} x2={at(t, height).x} y2={at(t, height).y} />;
      })}
      <line className="ground-fence-rail" x1={at(a, height).x} y1={at(a, height).y} x2={at(b, height).x} y2={at(b, height).y} />
    </>
  );
}

// The whole perimeter of a rectangle of ground, far sides first so the
// near sides paint over them.
function FenceAround({ col, row, w, h, height }: GroundProps & { height: number }) {
  const A: TilePt = [col, row]; const B: TilePt = [col + w, row];
  const C: TilePt = [col + w, row + h]; const D: TilePt = [col, row + h];
  return (
    <>
      <FenceRun a={A} b={B} height={height} />
      <FenceRun a={A} b={D} height={height} />
      <FenceRun a={D} b={C} height={height} />
      <FenceRun a={B} b={C} height={height} />
    </>
  );
}

// A plain box standing on open ground, in the concrete tones: a dugout, a
// pool house, a scoreboard's housing.
function GroundBox({ col, row, w, h, base = 0, height, side, front, top }: GroundProps & {
  base?: number; height: number; side: string; front: string; top: string;
}) {
  const f = boxFaces(col, row, w, h, base, height);
  // `front` is the +row face's tone and `side` the +col face's — the pair
  // the default camera sees; the other two take their place in the same sun
  // (light.ts's faceTone) when the camera turns them into view.
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={faceTone(f.dir.CD, front, side)} />
      <polygon points={polyPoints(f.right)} fill={faceTone(f.dir.BC, front, side)} />
      <polygon points={polyPoints(f.top)} fill={top} />
    </>
  );
}

// A post standing on the ground: a floodlight mast, a foul pole, a canopy
// column. Screen-space line, like a tree's trunk.
function Post({ at: t, from = 0, to, className }: { at: TilePt; from?: number; to: number; className: string }) {
  const foot = lift(project(t[0], t[1]), from);
  const head = lift(project(t[0], t[1]), to);
  return <line className={className} x1={foot.x} y1={foot.y} x2={head.x} y2={head.y} />;
}

// ---------------------------------------------------------------------
// Gridiron. The markings ARE the recognition: without cross-field yard
// lines and the two rows of hash marks down the middle, a green rectangle
// is just a green rectangle. Drawn along the footprint's longer axis, so a
// rotated stadium still has its yard lines running the right way.
// ---------------------------------------------------------------------
function Gridiron({ col, row, w, h, inset = 0, insetAcross = inset, posts = false }: GroundProps & {
  inset?: number; insetAcross?: number; posts?: boolean;
}) {
  const landscape = w >= h;
  // Work in (along, across) and map to (u, v) at the end, so the same
  // numbers describe the field whichever way round the footprint sits.
  const A = (a: number, c: number): [number, number] => (landscape ? [a, c] : [c, a]);
  const at = (a: number, c: number): [number, number] => A(inset + a * (1 - inset * 2), insetAcross + c * (1 - insetAcross * 2));

  const END_ZONE = 0.12;          // each end zone as a fraction of the field's length
  const HASH_IN = 0.36;           // how far in from each sideline the hash rows sit
  const lines: number[] = [];
  for (let i = 1; i < 10; i++) lines.push(END_ZONE + (i / 10) * (1 - END_ZONE * 2));

  return (
    <>
      <polygon className="ground-turf" points={uvPoly(col, row, w, h, [at(0, 0), at(1, 0), at(1, 1), at(0, 1)])} />
      {/* End zones, one at each end, in the darker turf tone. */}
      <polygon className="ground-endzone" points={uvPoly(col, row, w, h, [at(0, 0), at(END_ZONE, 0), at(END_ZONE, 1), at(0, 1)])} />
      <polygon className="ground-endzone" points={uvPoly(col, row, w, h, [at(1 - END_ZONE, 0), at(1, 0), at(1, 1), at(1 - END_ZONE, 1)])} />
      {/* Yard lines, full width, every ten yards. */}
      {lines.map((a, i) => {
        const p = at(a, 0); const q = at(a, 1);
        const l = uvLine(col, row, w, h, p[0], p[1], q[0], q[1]);
        return <line key={`y${i}`} className="ground-line" {...l} />;
      })}
      {/* Hash marks: two rows of short ticks between the yard lines, which
          is the detail that makes it read as gridiron rather than soccer. */}
      {lines.flatMap((a, i) => [HASH_IN, 1 - HASH_IN].map((c, j) => {
        const p = at(a - 0.022, c); const q = at(a + 0.022, c);
        const l = uvLine(col, row, w, h, p[0], p[1], q[0], q[1]);
        return <line key={`h${i}-${j}`} className="ground-line-fine" {...l} />;
      }))}
      {/* Goal lines, heavier than the yard lines. */}
      {[END_ZONE, 1 - END_ZONE].map((a, i) => {
        const p = at(a, 0); const q = at(a, 1);
        const l = uvLine(col, row, w, h, p[0], p[1], q[0], q[1]);
        return <line key={`g${i}`} className="ground-line-heavy" {...l} />;
      })}
      {/* The midfield roundel: a darker disc where a real field carries its
          crest. */}
      {(() => {
        const c = at(0.5, 0.5);
        return (
          <polygon
            className="ground-endzone"
            points={polyPoints(projectedCircle(col + w * c[0], row + h * c[1], Math.min(w, h) * 0.05, 24))}
          />
        );
      })()}
      {/* Goalposts on both goal lines: a stem, a crossbar and two uprights,
          in screen space like anything else that stands up. */}
      {posts && [END_ZONE * 0.5, 1 - END_ZONE * 0.5].map((a, i) => {
        const g = (c: number) => { const p = at(a, c); return project(col + w * p[0], row + h * p[1]); };
        const bar = up(3.0); const top = up(9.0); const half = 0.045;
        const c0 = g(0.5); const l = g(0.5 - half); const r = g(0.5 + half);
        return (
          <g key={`gp${i}`}>
            <line className="ground-goal" x1={c0.x} y1={c0.y} x2={c0.x} y2={lift(c0, bar).y} />
            <line className="ground-goal" x1={l.x} y1={lift(l, bar).y} x2={r.x} y2={lift(r, bar).y} />
            <line className="ground-goal" x1={l.x} y1={lift(l, bar).y} x2={l.x} y2={lift(l, top).y} />
            <line className="ground-goal" x1={r.x} y1={lift(r, bar).y} x2={r.x} y2={lift(r, top).y} />
          </g>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------
// Ball diamond. A ballfield is not a square with a diamond in it — it is a
// QUARTER CIRCLE: home plate at one corner, the foul lines 90 degrees
// apart, the outfield sweeping between them, and a wedge of infield dirt
// around the bases. The dirt is what makes it read instantly.
// ---------------------------------------------------------------------
function Diamond({ col, row, w, h }: GroundProps) {
  // Home plate sits well back from the footprint's front corner, because the
  // SEATING needs that room: a ballpark's grandstand wraps the plate and
  // runs down both foul lines to the bases, and that horseshoe is a third
  // of the plot.
  const g = diamondGeometry(col, row, w, h);
  const { hc, hr, R, TRACK, DIRT, BASE, from, to, bisect, short } = g;
  const home = project(hc, hr);
  const polar = (r: number, a: number) => project(hc + r * Math.cos(a), hr + r * Math.sin(a));

  // The base path, and the grass inside it. A real infield is not a solid
  // wedge of dirt — the skin runs around the bases and the middle of the
  // diamond is turf, which is most of what the pattern reads as from above.
  const basePath = [home, polar(BASE, from), polar(BASE * Math.SQRT2, bisect), polar(BASE, to)];
  const infieldGrass = [
    polar(BASE * 0.34, bisect), polar(BASE * 0.72, from), polar(BASE * 1.06, bisect), polar(BASE * 0.72, to),
  ];
  // A base is a small square on the ground; home plate a slightly larger one.
  const pad = (r: number, a: number, size: number) => {
    const c = hc + r * Math.cos(a); const rr = hr + r * Math.sin(a);
    return polyPoints(boxFaces(c - size / 2, rr - size / 2, size, size, 0, 0).top);
  };
  const base = short * 0.035;

  return (
    <>
      <polygon className="ground-turf" points={polyPoints([home, ...projectedArc(hc, hr, R, from, to), home])} />
      {/* Mowing arcs across the outfield, the way the quad's lawn is
          striped — kept grass rather than one flat green. */}
      {[0, 1, 2].map((i) => {
        const r0 = DIRT * 1.25 + (TRACK - DIRT * 1.25) * ((2 * i + 1) / 6);
        const r1 = DIRT * 1.25 + (TRACK - DIRT * 1.25) * ((2 * i + 2) / 6);
        return (
          <polygon
            key={i}
            className="ground-mow"
            points={polyPoints([...projectedArc(hc, hr, r1, from, to, 36), ...projectedArc(hc, hr, r0, to, from, 36)])}
          />
        );
      })}
      {/* The warning track: a band of dirt inside the fence, so a fielder
          knows the wall is coming. The ring between the boundary arc and one
          just inside it. */}
      <polygon
        className="ground-dirt"
        points={polyPoints([
          ...projectedArc(hc, hr, R, from, to, 36),
          ...projectedArc(hc, hr, TRACK, to, from, 36),
        ])}
      />
      <polygon className="ground-dirt" points={polyPoints([home, ...projectedArc(hc, hr, DIRT, from, to), home])} />
      <polygon className="ground-turf" points={polyPoints(infieldGrass)} />
      <polygon className="ground-line" fill="none" points={polyPoints(basePath)} />
      {/* The mound: a real one is about 5.5 m across, which on a 125 m field
          is small. It was drawn at half again that and read as a pale blob. */}
      <polygon className="ground-dirt-pale" points={polyPoints(projectedCircle(
        hc + BASE * 0.62 * Math.cos(bisect), hr + BASE * 0.62 * Math.sin(bisect), short * 0.028, 20,
      ))} />
      {/* Three bases and the plate. */}
      <polygon className="ground-base" points={pad(BASE, from, base)} />
      <polygon className="ground-base" points={pad(BASE, to, base)} />
      <polygon className="ground-base" points={pad(BASE * Math.SQRT2, bisect, base)} />
      <polygon className="ground-base" points={pad(0, 0, base * 1.2)} />
      {/* Batter's boxes either side of the plate. */}
      {[from, to].map((a, i) => (
        <polygon
          key={`bb${i}`}
          className="ground-line-fine"
          fill="none"
          points={pad(base * 1.6, a, base * 1.3)}
        />
      ))}
      {[from, to].map((a, i) => {
        const end = polar(R, a);
        return <line key={i} className="ground-line" x1={home.x} y1={home.y} x2={end.x} y2={end.y} />;
      })}
      {/* Bullpens: a strip of dirt with a mound at each end, in foul
          territory down each line past the grandstand. */}
      {[from, to].map((a, i) => {
        const r0 = short * 0.42; const r1 = short * 0.54; const off = 0.5; const wide = 0.32;
        const pts: [number, number][] = a === from
          ? [[hc - r1, hr + off], [hc - r0, hr + off], [hc - r0, hr + off + wide], [hc - r1, hr + off + wide]]
          : [[hc + off, hr - r1], [hc + off + wide, hr - r1], [hc + off + wide, hr - r0], [hc + off, hr - r0]];
        return <polygon key={`bp${i}`} className="ground-dirt-pale" points={polyPoints(pts.map(([c, r]) => project(c, r)))} />;
      })}
    </>
  );
}

// The geometry Diamond and diamondProps share, so the paint and the things
// standing on it cannot drift apart.
function diamondGeometry(col: number, row: number, w: number, h: number) {
  const short = Math.min(w, h);
  return {
    short,
    hc: col + w * 0.66,
    hr: row + h * 0.66,
    R: short * 0.66,                 // outfield boundary
    TRACK: short * 0.66 * 0.87,      // inner edge of the warning track
    DIRT: short * 0.30,              // the infield skin
    BASE: short * 0.19,              // home-to-base
    from: Math.PI,                   // foul line toward -col
    to: Math.PI * 1.5,               // foul line toward -row
    bisect: Math.PI * 1.25,          // toward the outfield's centre
  };
}

// The diamond's raised props: the outfield fence, and the seating wrapping
// home plate. Both stand ON the field, so both sort against their
// surroundings individually rather than riding the plate's own depth — see
// groundProps at the bottom of this file.
function diamondProps(col: number, row: number, w: number, h: number): GroundProp[] {
  const { hc, hr, R, from, to, bisect, short } = diamondGeometry(col, row, w, h);
  const polar = (r: number, a: number): TilePt => [hc + r * Math.cos(a), hr + r * Math.sin(a)];

  const FENCE_H = up(2.4);
  const arcPts = projectedArc(hc, hr, R, from, to, 36);

  // --- the seating -----------------------------------------------------
  // ONE HORSESHOE, in three straight pieces: a grandstand behind the plate
  // set square to the bisector, and a wing down each foul line as far as
  // the bases — all one depth, one height and one back wall, on a low
  // field wall, with the covered press box over the middle. That is what a
  // college ballpark is (Holman Stadium, the reference for this), and it is
  // what neither of the two earlier drawings was: an unbroken arc read as
  // an amphitheatre, and five fanned banks read as five crates on the lawn.
  //
  // Three props rather than one because the depth sort needs them apart —
  // a tree beside the third-base line passes in front of that wing and
  // behind the plate stand (see depth-sort.test.ts). The foul lines run
  // along the grid axes, so the wings are axis-aligned and draw cleanly.
  const gap = 0.35;                     // the walkway between the line and the front row
  const depth = short * 0.13;           // how deep the seating is
  const s0 = 0.55;                      // where the wings start, out from the plate
  const L = short * 0.30;               // and how far down the lines they run
  const bottomH = up(1.0);
  const topH = up(6.2);
  const at = (t: TilePt, z: number) => lift(project(t[0], t[1]), z);

  // The wing down the -row line (first base): its inside face is toward -col.
  const wingA = {
    inner: [[hc + gap, hr - L], [hc + gap, hr - s0]] as [TilePt, TilePt],
    outer: [[hc + gap + depth, hr - L], [hc + gap + depth, hr - s0]] as [TilePt, TilePt],
  };
  // The wing down the -col line (third base): its inside face is toward -row.
  const wingB = {
    inner: [[hc - s0, hr + gap], [hc - L, hr + gap]] as [TilePt, TilePt],
    outer: [[hc - s0, hr + gap + depth], [hc - L, hr + gap + depth]] as [TilePt, TilePt],
  };
  // The grandstand behind the plate joins the two wings' near ends, square
  // to the bisector, with its outer edge running corner to corner.
  const plate = {
    inner: [[hc + gap, hr - s0], [hc - s0, hr + gap]] as [TilePt, TilePt],
    outer: [[hc + gap + depth, hr - s0], [hc - s0, hr + gap + depth]] as [TilePt, TilePt],
  };
  const boxOf = (pts: TilePt[]) => {
    const cols = pts.map((c) => c[0]); const rows = pts.map((c) => c[1]);
    return { col: Math.min(...cols), row: Math.min(...rows), w: Math.max(...cols) - Math.min(...cols), h: Math.max(...rows) - Math.min(...rows) };
  };
  const bank = (key: string, g: { inner: [TilePt, TilePt]; outer: [TilePt, TilePt] }, aisles: number, extra?: React.JSX.Element) => ({
    key,
    ...boxOf([...g.inner, ...g.outer]),
    node: (
      <>
        <RakedStand outer={g.outer} inner={g.inner} bottomH={bottomH} topH={topH}
          rakeFill={CONCRETE.rake} wallFill={CONCRETE.wall} seatStroke={CONCRETE.seat}
          rows={7} aisles={aisles} wall endFaces />
        {extra}
      </>
    ),
  });

  // The cover and press box over the plate stand: a slab on four posts over
  // the back half of the seating, with the box's dark glazing band under it.
  const cover = (() => {
    const mid = 0.5;
    const f0: TilePt = [plate.inner[0][0] + (plate.outer[0][0] - plate.inner[0][0]) * mid, plate.inner[0][1] + (plate.outer[0][1] - plate.inner[0][1]) * mid];
    const f1: TilePt = [plate.inner[1][0] + (plate.outer[1][0] - plate.inner[1][0]) * mid, plate.inner[1][1] + (plate.outer[1][1] - plate.inner[1][1]) * mid];
    const [b0, b1] = plate.outer;
    const slabZ = topH + up(3.0); const slab = up(0.35);
    const seatZ = bottomH + (topH - bottomH) * mid;
    return (
      <>
        <Post at={b0} from={topH} to={slabZ} className="ground-post" />
        <Post at={b1} from={topH} to={slabZ} className="ground-post" />
        <Post at={f0} from={seatZ} to={slabZ} className="ground-post" />
        <Post at={f1} from={seatZ} to={slabZ} className="ground-post" />
        <polygon points={polyPoints([at(b0, topH), at(b1, topH), at(b1, slabZ), at(b0, slabZ)])} fill={CONCRETE.wall} />
        <polygon className="ground-glazing" points={polyPoints([at(b0, topH + up(1.0)), at(b1, topH + up(1.0)), at(b1, slabZ - up(0.5)), at(b0, slabZ - up(0.5))])} />
        <polygon points={polyPoints([at(f0, slabZ), at(f1, slabZ), at(b1, slabZ), at(b0, slabZ)])} fill={shade(CONCRETE.rake, 1.04)} />
        <polygon points={polyPoints([at(f0, slabZ), at(f1, slabZ), at(f1, slabZ + slab), at(f0, slabZ + slab)])} fill={shade(CONCRETE.wall, 0.9)} />
        <polygon points={polyPoints([at(f0, slabZ + slab), at(f1, slabZ + slab), at(b1, slabZ + slab), at(b0, slabZ + slab)])} fill={shade(CONCRETE.rake, 1.08)} />
      </>
    );
  })();

  const stands: GroundProp[] = [
    bank('stand-0', wingA, 2),
    bank('stand-1', plate, 1, cover),
    bank('stand-2', wingB, 2),
  ];

  // Light towers: two behind the plate stand's corners, one at the end of
  // each wing, two at the outfield fence.
  const towers: GroundProp[] = ([
    [hc + gap + depth + 0.5, hr - s0 - 0.3], [hc - s0 - 0.3, hr + gap + depth + 0.5],
    [hc + gap + depth + 0.4, hr - L - 0.4], [hc - L - 0.4, hr + gap + depth + 0.4],
    polar(R + 0.3, from + 0.32), polar(R + 0.3, to - 0.32),
  ] as TilePt[]).map((t, i) => ({
    key: `tower-${i}`,
    ...aroundPoint(t[0], t[1], 0.2),
    node: (() => {
      const foot = project(t[0], t[1]); const top = lift(foot, up(16));
      return (
        <>
          <line className="ground-mast" x1={foot.x} y1={foot.y} x2={top.x} y2={top.y} />
          <polygon className="ground-mast-head" points={polyPoints([
            { x: top.x - 7, y: top.y + 1 }, { x: top.x + 7, y: top.y + 1 }, { x: top.x + 7, y: top.y - 4 }, { x: top.x - 7, y: top.y - 4 },
          ])} />
        </>
      );
    })(),
  }));

  // --- the dugouts -----------------------------------------------------
  // Two low covered benches just outside the foul lines, a third of the way
  // to the fence. The one thing besides the diamond itself that says
  // "baseball" at map zoom.
  const dugout = (a: number, k: number): GroundProp => {
    const r = L + 0.3;
    const along = 1.4; const deep = 0.55;
    // Just past the end of each wing, tucked outside the line: toward +row
    // off the -col line, toward +col off the -row line.
    const cx = a === from ? hc - r - along : hc + gap;
    const cy = a === from ? hr + gap : hr - r - along;
    const bw = a === from ? along : deep;
    const bh = a === from ? deep : along;
    return {
      key: `dugout-${k}`,
      col: cx, row: cy, w: bw, h: bh,
      node: <GroundBox col={cx} row={cy} w={bw} h={bh} height={up(2.4)} side={shade(CONCRETE.wall, 0.86)} front={CONCRETE.wall} top={shade(CONCRETE.rake, 0.92)} />,
    };
  };

  // --- centre field ----------------------------------------------------
  // The batter's eye — a dark panel on the fence at dead centre — and the
  // scoreboard standing over it.
  const centreField = (() => {
    const c = polar(R * 0.99, bisect);
    const eyeW = 1.7; const eyeD = 0.45;
    const ec = c[0] - eyeW / 2; const er = c[1] - eyeD / 2;
    const boardW = 1.2; const boardD = 0.3;
    const bc = c[0] - boardW / 2; const br = c[1] - boardD / 2 - 0.05;
    const boardBase = up(3.2); const boardH = up(2.6);
    const at = (t: TilePt, z: number) => lift(project(t[0], t[1]), z);
    return {
      key: 'centrefield',
      ...aroundPoint(c[0], c[1], 1.1),
      node: (
        <>
          <Post at={[bc + 0.1, br + boardD / 2]} to={boardBase} className="ground-post" />
          <Post at={[bc + boardW - 0.1, br + boardD / 2]} to={boardBase} className="ground-post" />
          <GroundBox col={bc} row={br} w={boardW} h={boardD} base={boardBase} height={boardH} side="#2d2f31" front="#3a3d40" top="#4a4d50" />
          <polygon className="ground-scoreboard-face" points={polyPoints([
            at([bc, br + boardD], boardBase + boardH * 0.2), at([bc + boardW, br + boardD], boardBase + boardH * 0.2),
            at([bc + boardW, br + boardD], boardBase + boardH * 0.8), at([bc, br + boardD], boardBase + boardH * 0.8),
          ])} />
          <GroundBox col={ec} row={er} w={eyeW} h={eyeD} height={up(3.2)} side="#2b3f2a" front="#345034" top="#3d5c3b" />
        </>
      ),
    };
  })();

  return [
    {
      key: 'fence',
      // The fence rings the OUTFIELD — the quarter-disc of the plot away from
      // home plate — so the ground it covers is the box that arc sweeps.
      col: hc - R, row: hr - R, w: R, h: R,
      node: (
        <>
          <polygon className="ground-fence" points={polyPoints([...arcPts, ...[...arcPts].reverse().map((q) => lift(q, FENCE_H))])} />
          <polyline className="ground-fence-rail" fill="none" points={polyPoints(arcPts.map((q) => lift(q, FENCE_H)))} />
          {/* Foul poles, at the two ends of the fence — the one yellow on the
              campus, because that is what colour they are. */}
          <Post at={polar(R, from)} to={up(7)} className="ground-foul-pole" />
          <Post at={polar(R, to)} to={up(7)} className="ground-foul-pole" />
        </>
      ),
    },
    centreField,
    {
      key: 'backstop',
      // The screen between the plate and the front row of the grandstand:
      // a mesh along the plate stand's inner edge, a storey and a half high.
      ...boxOf([...plate.inner]),
      node: (
        <>
          <FenceRun a={plate.inner[0]} b={plate.inner[1]} height={up(5.0)} postEvery={1.2} />
        </>
      ),
    },
    dugout(from, 0),
    dugout(to, 1),
    ...towers,
    ...stands,
  ];
}

// A soccer pitch: centre circle, halfway line, and the two penalty areas
// that stop it being "a field with a circle on it".
// The number of running lanes. Eight is the competition standard and what a
// track looks like from above — the concentric lines ARE the read.
const TRACK_LANES = 8;

// Where the oval's centre sits across the plot: pushed toward the near side
// so the stand has a margin down the far straight. A fraction of the plot's
// short side, shared with pitchProps so the stand sits on the track's edge.
const TRACK_CENTRE_ACROSS = 0.54;

function pitchGeometry(col: number, row: number, w: number, h: number) {
  const landscape = w >= h;
  const along = landscape ? w : h;    // the footprint side the track's long axis runs down
  const across = landscape ? h : w;
  const cc = landscape ? col + w * 0.5 : col + w * TRACK_CENTRE_ACROSS;
  const cr = landscape ? row + h * TRACK_CENTRE_ACROSS : row + h * 0.5;
  // A track is a STADIUM, not an ellipse: two dead-straight sides joined by
  // semicircular ends. It FILLS the plot now — the footprint was widened to
  // 22 by 13 so it could — because at three-quarters of the plot the pitch
  // inside it came out 70 m long, and a pitch is the size it is: 105 by 68.
  const outerLen = along * 0.445;
  const outerWid = across * 0.39;
  const trackWidth = Math.min(across * 0.1, 8 * 1.22 / METRES_PER_TILE);   // eight 1.22 m lanes
  const innerLen = outerLen - trackWidth;
  const innerWid = outerWid - trackWidth;
  // The pitch inside, at its real size where the infield allows it, and
  // never wider than the infield.
  const PITCH_RATIO = 110 / 68;                                         // a long pitch, within the laws
  const pitchWid = Math.min(innerWid * 0.96, (68 / METRES_PER_TILE) / 2);
  const pitchLen = Math.min(pitchWid * PITCH_RATIO, innerLen * 0.97);
  // (along, across) offsets from the centre onto the grid.
  const tp = (a: number, c: number): Pt => (landscape ? project(cc + a, cr + c) : project(cc + c, cr + a));
  const tile = (a: number, c: number): TilePt => (landscape ? [cc + a, cr + c] : [cc + c, cr + a]);
  return { landscape, cc, cr, along, across, outerLen, outerWid, trackWidth, innerLen, innerWid, pitchWid, pitchLen, tp, tile };
}

function Pitch({ col, row, w, h }: GroundProps) {
  const g = pitchGeometry(col, row, w, h);
  const { landscape, cc, cr, outerLen, outerWid, trackWidth, innerLen, innerWid, pitchWid, pitchLen, tp } = g;

  const stadium = (fraction: number) => projectedStadium(
    cc, cr,
    innerLen + (outerLen - innerLen) * fraction,
    innerWid + (outerWid - innerWid) * fraction,
    landscape,
  );

  // Markings are laid out in the pitch's own (along, across) frame, so a
  // rotated field keeps its halfway line across the short way.
  const pp = (a: number, c: number): Pt => tp(a * pitchLen, c * pitchWid);
  const rect = (a0: number, a1: number, c0: number, c1: number) =>
    polyPoints([pp(a0, c0), pp(a1, c0), pp(a1, c1), pp(a0, c1)]);
  const seg = (a0: number, c0: number, a1: number, c1: number) => {
    const p0 = pp(a0, c0); const p1 = pp(a1, c1);
    return { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y };
  };
  const tseg = (a0: number, c0: number, a1: number, c1: number) => {
    const p0 = tp(a0, c0); const p1 = tp(a1, c1);
    return { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y };
  };

  const STRIPES = 10;
  const straight = outerLen - outerWid;      // half the length of a straight
  const lane = trackWidth / TRACK_LANES;

  return (
    <>
      {/* The running surface in two tones — the outer four lanes a shade
          darker than the inner four, which is how a laid track reads from
          above — then the lane lines over it. The infield inside the
          innermost lane is a paler surface: the D-zones either side of the
          pitch and the strips beside it. */}
      <polygon className="ground-track" points={polyPoints(stadium(1))} />
      <polygon className="ground-track-inner" points={polyPoints(stadium(0.5))} />
      <polygon className="ground-dzone" points={polyPoints(stadium(0))} />
      {Array.from({ length: TRACK_LANES + 1 }, (_, i) => (
        <polygon
          key={i}
          className="ground-lane"
          fill="none"
          points={polyPoints(stadium(i / TRACK_LANES))}
        />
      ))}
      {/* The finish line across all eight lanes at the end of the home
          straight, and the staggered start marks stepping back round the
          bend behind it. At map zoom the finish line alone is what says
          "track" rather than "red oval". */}
      <line className="ground-line-heavy" {...tseg(straight * 0.62, innerWid, straight * 0.62, outerWid)} />
      {Array.from({ length: TRACK_LANES }, (_, i) => {
        const c = innerWid + lane * (i + 0.5);
        const a = -straight * 0.45 + i * lane * 0.9;
        return <line key={`st${i}`} className="ground-line-fine" {...tseg(a, c - lane * 0.4, a, c + lane * 0.4)} />;
      })}
      {/* A long-jump runway and its pit in one D-zone. */}
      {(() => {
        const rc = innerWid * 0.5;           // off the centre line, clear of the goal
        const a0 = -innerLen * 0.9; const a1 = -pitchLen * 1.04;
        return (
          <>
            <polygon
              className="ground-runway"
              points={polyPoints([tp(a0, rc - lane * 0.45), tp(a1, rc - lane * 0.45), tp(a1, rc + lane * 0.45), tp(a0, rc + lane * 0.45)])}
            />
            <polygon
              className="ground-dirt-pale"
              points={polyPoints([tp(a0, rc - lane * 0.9), tp(a0 - lane * 2.4, rc - lane * 0.9), tp(a0 - lane * 2.4, rc + lane * 0.9), tp(a0, rc + lane * 0.9)])}
            />
          </>
        );
      })()}

      {/* The pitch, with mowing stripes — the bands are most of what makes a
          pitch read as cut grass rather than as a green rectangle. */}
      <polygon className="ground-turf" points={rect(-1, 1, -1, 1)} />
      {Array.from({ length: STRIPES }, (_, i) => (i % 2 === 0 ? null : (
        <polygon
          key={i}
          className="ground-mow"
          points={rect(-1 + (2 * i) / STRIPES, -1 + (2 * (i + 1)) / STRIPES, -1, 1)}
        />
      )))}

      <polygon className="ground-line" fill="none" points={rect(-1, 1, -1, 1)} />
      <line className="ground-line" {...seg(0, -1, 0, 1)} />
      <polygon className="ground-line" fill="none" points={rect(-1, -0.68, -0.42, 0.42)} />
      <polygon className="ground-line" fill="none" points={rect(0.68, 1, -0.42, 0.42)} />
      <polygon className="ground-line" fill="none" points={rect(-1, -0.86, -0.2, 0.2)} />
      <polygon className="ground-line" fill="none" points={rect(0.86, 1, -0.2, 0.2)} />
      <polygon
        className="ground-line"
        fill="none"
        points={polyPoints(projectedCircle(cc, cr, Math.min(w, h) * 0.09))}
      />
      {/* Goals: two posts and a crossbar at each end, standing up. */}
      {[-1, 1].map((end) => {
        const l = pp(end, -0.108); const r = pp(end, 0.108); const bar = up(2.4);
        return (
          <g key={`goal${end}`}>
            <line className="ground-goal" x1={l.x} y1={l.y} x2={l.x} y2={lift(l, bar).y} />
            <line className="ground-goal" x1={r.x} y1={r.y} x2={r.x} y2={lift(r, bar).y} />
            <line className="ground-goal" x1={l.x} y1={lift(l, bar).y} x2={r.x} y2={lift(r, bar).y} />
          </g>
        );
      })}
    </>
  );
}

// The pitch's one raised prop: the stand outside the track on the far side.
// Spanning the middle only, where the track's straight runs — and seated ON
// the track's edge rather than at a guessed offset, so shrinking or
// widening the oval cannot leave it floating in the margin.
//
// A real college track stand: raked seating on a low plinth, with a cover
// over the back rows on four posts. The first version was the rake alone,
// four units off the grass, and read as a plank.
function pitchProps(col: number, row: number, w: number, h: number): GroundProp[] {
  const landscape = w >= h;
  const across = landscape ? h : w;
  const { outerWid } = pitchGeometry(col, row, w, h);
  const tp = (a: number, c: number): TilePt => (landscape
    ? [col + w * a, row + h * c]
    : [col + w * c, row + h * a]);
  const trackEdge = TRACK_CENTRE_ACROSS - outerWid / across;   // the oval's far side, as a footprint fraction
  const back = tp(0.32, 0.02);
  const front = tp(0.68, trackEdge);
  const bottomH = up(0.9);
  const topH = up(4.6);
  const at = (t: TilePt, z: number) => lift(project(t[0], t[1]), z);
  // The cover: over the back 55% of the seating.
  const mid = 0.02 + (trackEdge - 0.02) * 0.45;
  const f0 = tp(0.34, mid); const f1 = tp(0.66, mid);
  const b0 = tp(0.34, 0.02); const b1 = tp(0.66, 0.02);
  const slabZ = topH + up(3.2); const slab = up(0.35);
  const seatZ = bottomH + (topH - bottomH) * 0.55;
  return [{
    key: 'stand',
    col: Math.min(back[0], front[0]),
    row: Math.min(back[1], front[1]),
    w: Math.abs(front[0] - back[0]),
    h: Math.abs(front[1] - back[1]),
    node: (
      <>
        <RakedStand
          outer={[tp(0.32, 0.02), tp(0.68, 0.02)]}
          inner={[tp(0.32, trackEdge), tp(0.68, trackEdge)]}
          bottomH={bottomH}
          topH={topH}
          rakeFill={CONCRETE.rake}
          wallFill={CONCRETE.wall}
          seatStroke={CONCRETE.seat}
          rows={6}
          aisles={2}
          frontWall
        />
        <Post at={b0} from={topH} to={slabZ} className="ground-post" />
        <Post at={b1} from={topH} to={slabZ} className="ground-post" />
        <Post at={f0} from={seatZ} to={slabZ} className="ground-post" />
        <Post at={f1} from={seatZ} to={slabZ} className="ground-post" />
        <polygon points={polyPoints([at(f0, slabZ), at(f1, slabZ), at(f1, slabZ + slab), at(f0, slabZ + slab)])} fill={shade(CONCRETE.wall, 0.9)} />
        <polygon points={polyPoints([at(f0, slabZ + slab), at(f1, slabZ + slab), at(b1, slabZ + slab), at(b0, slabZ + slab)])} fill={shade(CONCRETE.rake, 1.08)} />
      </>
    ),
  }];
}

// Courts: a net across the middle and the service boxes either side.
// Six courts, which is what a 12x4 plot IS.
//
// FACILITY_FOOTPRINTS.tennisCourts says so in its own comment -- "six courts
// in a row, which is ~110m by 36m" -- and the drawing ignored it, stretching
// ONE court over the whole plot. That is why the courts read as enormous: a
// net 108 metres long and a service box the size of a basketball hall. The
// footprint was right all along; only the paint was wrong.
//
// Every number below is a real dimension divided by the ground it sits on,
// so the courts stay the right size if the footprint ever changes rather
// than scaling with it. The count comes off the plot too: a longer plot is
// more courts, not wider ones.
const COURT_BAY_METRES = 18;      // one court and its side run-off
const COURT_WIDTH_METRES = 10.97; // doubles sidelines
const COURT_LENGTH_METRES = 23.77;// baseline to baseline
const SINGLES_INSET = (10.97 - 8.23) / 2 / 10.97;  // the doubles alley, as a share of the court's width
const SERVICE_LINE = 6.4 / (23.77 / 2);            // service line, as a share of a half court

function courtsLayout(w: number, h: number) {
  const landscape = w >= h;
  // u runs ALONG the row of courts, v across one court's length, whichever
  // way the plot was placed.
  const A = (a: number, c: number): [number, number] => (landscape ? [a, c] : [c, a]);
  const alongM = (landscape ? w : h) * METRES_PER_TILE;
  const deepM = (landscape ? h : w) * METRES_PER_TILE;
  const courts = Math.max(1, Math.round(alongM / COURT_BAY_METRES));
  const cw = Math.min(COURT_WIDTH_METRES / alongM, 1 / courts);  // one court's width, in plot u
  const cl = Math.min(COURT_LENGTH_METRES / deepM, 1);           // its length, in plot v
  const v0 = (1 - cl) / 2;
  const v1 = v0 + cl;
  return { A, courts, cw, cl, v0, v1 };
}

function Courts({ col, row, w, h }: GroundProps) {
  const { A, courts, cw, cl, v0, v1 } = courtsLayout(w, h);

  const line = (a0: number, c0: number, a1: number, c1: number, cls = 'ground-line') => (
    <line className={cls} {...uvLine(col, row, w, h, ...A(a0, c0), ...A(a1, c1))} />
  );

  return (
    <>
      {/* One surface under all of them. A six-court block is laid as a single
          slab and fenced as one, not as six islands in the grass. Green
          run-off, blue inside the lines: the hard-court scheme, and the two
          tones are what say "tennis" once the line work is below a pixel. */}
      <polygon className="ground-court" points={uvPoly(col, row, w, h, [
        A(0, 0), A(1, 0), A(1, 1), A(0, 1),
      ])} />
      {Array.from({ length: courts }, (_, k) => {
        const centre = (k + 0.5) / courts;
        const u0 = centre - cw / 2;
        const u1 = centre + cw / 2;
        const alley = cw * SINGLES_INSET;
        const service = v0 + cl * 0.5 * (1 - SERVICE_LINE);
        return (
          <g key={k}>
            <polygon
              className="ground-court-play"
              points={uvPoly(col, row, w, h, [A(u0, v0), A(u1, v0), A(u1, v1), A(u0, v1)])}
            />
            {/* Baselines and doubles sidelines: the court itself. */}
            <polygon
              className="ground-line"
              fill="none"
              points={uvPoly(col, row, w, h, [A(u0, v0), A(u1, v0), A(u1, v1), A(u0, v1)])}
            />
            {/* The singles sidelines, which is what the alley is the gap
                between — and the one marking that says "tennis" rather than
                "a rectangle with a net across it". */}
            {line(u0 + alley, v0, u0 + alley, v1, 'ground-line-fine')}
            {line(u1 - alley, v0, u1 - alley, v1, 'ground-line-fine')}
            {/* The service courts behind the net on each side. The net
                itself stands up, and comes from courtsProps. */}
            {line(u0 + alley, service, u1 - alley, service)}
            {line(u0 + alley, v1 - (service - v0), u1 - alley, v1 - (service - v0))}
            {line(centre, service, centre, v1 - (service - v0))}
          </g>
        );
      })}
    </>
  );
}

// What stands on a court block: the fence around it, and a net across each
// court.
function courtsProps(col: number, row: number, w: number, h: number): GroundProp[] {
  const { A, courts, cw, v0, v1 } = courtsLayout(w, h);
  const at = (u: number, v: number, z: number) => { const [a, c] = A(u, v); return lift(project(col + w * a, row + h * c), z); };
  const NET = up(1.07);
  return [
    {
      key: 'fence',
      col, row, w, h,
      node: <FenceAround col={col} row={row} w={w} h={h} height={up(3.2)} />,
    },
    {
      key: 'nets',
      col, row, w, h,
      node: (
        <>
          {Array.from({ length: courts }, (_, k) => {
            const centre = (k + 0.5) / courts;
            const u0 = centre - cw / 2; const u1 = centre + cw / 2; const v = (v0 + v1) / 2;
            return (
              <g key={k}>
                <polygon className="ground-net" points={polyPoints([at(u0, v, 0), at(u1, v, 0), at(u1, v, NET), at(u0, v, NET)])} />
                <line className="ground-net-tape" x1={at(u0, v, NET).x} y1={at(u0, v, NET).y} x2={at(u1, v, NET).x} y2={at(u1, v, NET).y} />
              </g>
            );
          })}
        </>
      ),
    },
  ];
}

const QUAD_WALK = 0.075;

function QuadWalks({ col, row, w, h }: GroundProps) {
  const half = QUAD_WALK / 2;
  return (
    <>
      {/* Edge midpoint to edge midpoint, both ways — so the walks cross at
          the centre and meet every side square on. */}
      <polygon
        className="ground-walk-fill"
        points={uvPoly(col, row, w, h, [[0, 0.5 - half], [1, 0.5 - half], [1, 0.5 + half], [0, 0.5 + half]])}
      />
      <polygon
        className="ground-walk-fill"
        points={uvPoly(col, row, w, h, [[0.5 - half, 0], [0.5 + half, 0], [0.5 + half, 1], [0.5 - half, 1]])}
      />
    </>
  );
}

// The quad's own planting. Drawn through components/trees.tsx's TreeAt,
// the SAME component the founding woodland uses, so a tree on the quad is
// the same object as a tree in the wood beside it rather than a
// second-class lookalike. What differs is only where it comes from: a
// woodland tree is one tile's entry in `trees` (its own state, felled by
// building — see state/types.ts), while a quad's planting is part of the
// quad, arriving and leaving with the building, so it is authored geometry
// here and carries no state at all.
//
// Authored rather than random, and that is load-bearing: the map re-renders
// on every pan and every tick, so planting rolled at draw time would shift
// between frames and read as a rendering fault.
type QuadPlanting = [u: number, v: number, species: Species, scale: number];

const QUAD_TREES: QuadPlanting[] = [
  [0.15, 0.15, 'canopy', 1.0], [0.85, 0.15, 'canopy', 1.0],
  [0.15, 0.85, 'canopy', 1.05], [0.85, 0.85, 'canopy', 1.05],
  [0.5, 0.12, 'ornamental', 1.0], [0.5, 0.88, 'ornamental', 1.0],
];

// The gardens tier keeps every one of those and fills in between them: the
// corners of the four lawn panels the cross walk makes, and a conifer on
// each side to break the line of round crowns.
const GARDEN_TREES: QuadPlanting[] = [
  ...QUAD_TREES,
  [0.08, 0.5, 'conifer', 1.1], [0.92, 0.5, 'conifer', 1.1],
  [0.26, 0.26, 'ornamental', 0.85], [0.74, 0.26, 'ornamental', 0.85],
  [0.26, 0.74, 'canopy', 0.8], [0.74, 0.74, 'canopy', 0.8],
];

// A bed of flowers: dark earth with blooms scattered over it. The blooms
// are placed from a fixed lattice with a fixed nudge per index rather than
// at random — the map re-renders constantly (every pan, every tick), and
// planting that moved between frames would read as a rendering fault.
function FlowerBed({ col, row, w, h, u0, v0, u1, v1 }: GroundProps & {
  u0: number; v0: number; u1: number; v1: number;
}) {
  const cols = 5; const rows = 3;
  const blooms = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const u = u0 + ((c + 0.5) / cols) * (u1 - u0) + ((i % 3) - 1) * 0.004;
      const v = v0 + ((r + 0.5) / rows) * (v1 - v0) + ((i % 2) - 0.5) * 0.004;
      blooms.push(
        <polygon
          key={i}
          className={`ground-bloom-${i % 4}`}
          points={polyPoints(projectedCircle(col + w * u, row + h * v, Math.min(w, h) * 0.011, 8))}
        />,
      );
    }
  }
  return (
    <>
      <polygon className="ground-bed" points={uvPoly(col, row, w, h, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]])} />
      {blooms}
    </>
  );
}

// A clipped hedge: a low box with a lit top face, so it has mass rather
// than being a green stripe painted on the grass.
function Hedge({ col, row, w, h, u0, v0, u1, v1 }: GroundProps & {
  u0: number; v0: number; u1: number; v1: number;
}) {
  const HEIGHT = 7;
  const f = boxFaces(col + w * u0, row + h * v0, w * (u1 - u0), h * (v1 - v0), 0, HEIGHT);
  return (
    <>
      <polygon className="ground-hedge" points={polyPoints(f.left)} />
      <polygon className="ground-hedge" points={polyPoints(f.right)} />
      <polygon className="ground-hedge-top" points={polyPoints(f.top)} />
    </>
  );
}

// The fountain at the centre of the Grand Quad: a stone kerb, the water
// inside it, a raised basin, and a jet standing out of that with a ring of
// spray falling back into the pool. Static geometry — a real animation
// would have to run every frame on a surface that is otherwise only redrawn
// when something changes, and the shape alone already reads as a fountain.
function Fountain({ col, row, w, h }: GroundProps) {
  const cc = col + w * 0.5; const cr = row + h * 0.5;
  const R = Math.min(w, h) * 0.20;
  const centre = project(cc, cr);
  const ring = (r: number, up = 0) => polyPoints(projectedCircle(cc, cr, r, 36).map((q) => lift(q, up)));

  return (
    <>
      <polygon className="ground-fountain-kerb" points={ring(R)} />
      <polygon className="ground-fountain-water" points={ring(R * 0.84)} />
      {/* The raised basin standing in the middle of the pool. */}
      <polygon className="ground-fountain-kerb" points={ring(R * 0.30, 7)} />
      <polygon className="ground-fountain-basin" points={ring(R * 0.24, 9)} />
      {/* The jet: a tapering column of water over the basin, with spray
          falling back around it. The spray ring is deliberately small and
          close to the basin — at the first pass it was wide enough to
          cover most of the pool, which washed the water out to near-white
          and lost the one blue on the quad. */}
      <polygon
        className="ground-fountain-spray"
        points={ring(R * 0.44, 11)}
      />
      <polygon
        className="ground-fountain-jet"
        points={polyPoints([
          { x: centre.x - 3.4, y: lift(centre, 9).y },
          { x: centre.x + 3.4, y: lift(centre, 9).y },
          { x: centre.x + 1.1, y: lift(centre, 44).y },
          { x: centre.x - 1.1, y: lift(centre, 44).y },
        ])}
      />
      <polygon
        className="ground-fountain-jet"
        points={polyPoints(projectedCircle(cc, cr, R * 0.09, 12).map((q) => lift(q, 46)))}
      />
    </>
  );
}

// The tier-1 quad's centrepiece: a paved roundel, a stepped plinth on it,
// and a column standing on that. Drawn in the same two-part language the
// fountain below uses — a ground ring, then mass lifted above it — so the
// two tiers' centres read as the same KIND of thing at different scales.
function Monument({ col, row, w, h }: GroundProps) {
  const cc = col + w * 0.5; const cr = row + h * 0.5;
  const R = Math.min(w, h) * 0.13;
  const centre = project(cc, cr);
  const ring = (r: number, up = 0) => polyPoints(projectedCircle(cc, cr, r, 30).map((q) => lift(q, up)));
  return (
    <>
      <polygon className="ground-medallion" points={ring(R)} />
      <polygon className="ground-fountain-kerb" points={ring(R * 0.46, 5)} />
      {/* The shaft: a tapering column, in screen space like a tree's crown —
          it is mass in the air, not a marking on the ground. */}
      <polygon
        className="ground-monument"
        points={polyPoints([
          { x: centre.x - 4.5, y: lift(centre, 5).y },
          { x: centre.x + 4.5, y: lift(centre, 5).y },
          { x: centre.x + 3.0, y: lift(centre, 34).y },
          { x: centre.x - 3.0, y: lift(centre, 34).y },
        ])}
      />
      <polygon
        className="ground-monument-cap"
        points={polyPoints([
          { x: centre.x - 5.0, y: lift(centre, 33).y },
          { x: centre.x + 5.0, y: lift(centre, 33).y },
          { x: centre.x, y: lift(centre, 43).y },
        ])}
      />
    </>
  );
}

// The quad's FLAT half: everything that is paint on the ground. The things
// that STAND on it — planting, hedges, the fountain, the monument — are not
// here; they are raised props, and they come out of quadProps below so the
// map can sort each of them against whatever else is nearby. See
// groundProps at the bottom of this file for why that split exists.
function Quad({ col, row, w, h, tier }: GroundProps & { tier: number }) {
  const gardens = tier >= 2;
  return (
    <>
      <polygon className="ground-lawn" points={uvPoly(col, row, w, h, [[0, 0], [1, 0], [1, 1], [0, 1]])} />
      {/* Mowing stripes, which are most of what makes a big green read as
          kept lawn rather than a flat colour. */}
      {[0.12, 0.28, 0.44, 0.60, 0.76, 0.92].map((v) => (
        <polygon
          key={v}
          className="ground-mow"
          points={uvPoly(col, row, w, h, [[0, v - 0.05], [1, v - 0.05], [1, v + 0.03], [0, v + 0.03]])}
        />
      ))}
      <QuadWalks col={col} row={row} w={w} h={h} />

      {/* Beds down both sides of each walk. Earth and blooms both lie ON the
          ground, so unlike the hedges beside them they stay in this half. */}
      {gardens && (
        <>
          <FlowerBed col={col} row={row} w={w} h={h} u0={0.10} v0={0.38} u1={0.40} v1={0.44} />
          <FlowerBed col={col} row={row} w={w} h={h} u0={0.60} v0={0.38} u1={0.90} v1={0.44} />
          <FlowerBed col={col} row={row} w={w} h={h} u0={0.10} v0={0.56} u1={0.40} v1={0.62} />
          <FlowerBed col={col} row={row} w={w} h={h} u0={0.60} v0={0.56} u1={0.90} v1={0.62} />
        </>
      )}
    </>
  );
}

// The quad's RAISED half, one entry per standing object, each carrying the
// point it stands on so the map can depth-sort it individually.
function quadProps(col: number, row: number, w: number, h: number, tier: number): GroundProp[] {
  const gardens = tier >= 2;
  // A planting stands in one tile, like every tree in the woodland around the
  // quad — so it sorts against them on the same terms.
  const at = (u: number, v: number) => ({
    col: col + w * u - 0.5, row: row + h * v - 0.5, w: 1, h: 1,
  });

  const hedges: Array<[number, number, number, number]> = [
    [0.38, 0.10, 0.44, 0.32], [0.56, 0.10, 0.62, 0.32],
    [0.38, 0.68, 0.44, 0.90], [0.56, 0.68, 0.62, 0.90],
  ];

  return [
    ...(gardens
      ? hedges.map(([u0, v0, u1, v1], i) => ({
        key: `hedge-${i}`,
        // A hedge covers the whole bed it is clipped into, near edge to far.
        col: col + w * u0, row: row + h * v0, w: w * (u1 - u0), h: h * (v1 - v0),
        node: <Hedge col={col} row={row} w={w} h={h} u0={u0} v0={v0} u1={u1} v1={v1} />,
      }))
      : []),
    ...(gardens ? GARDEN_TREES : QUAD_TREES).map(([u, v, species, size], i) => ({
      key: `tree-${i}`,
      ...at(u, v),
      node: <TreeAt col={col + w * u} row={row + h * v} species={species} scale={size} />,
    })),
    gardens
      ? {
        key: 'fountain',
        // The same radius Fountain draws its kerb at, so the two cannot drift.
        ...aroundPoint(col + w * 0.5, row + h * 0.5, Math.min(w, h) * 0.20),
        node: <Fountain col={col} row={row} w={w} h={h} />,
      }
      // Tier 1's centre: a paved roundel where the walks meet, with a plinth
      // and a column standing on it. The roundel alone was there first and
      // was invisible — it is the same stone as the walks that run into it,
      // so on a lawn it read as a slight widening of the crossing and
      // nothing more. What the walks need at their meeting point is
      // something to be walking TO.
      : {
        key: 'monument',
        ...aroundPoint(col + w * 0.5, row + h * 0.5, Math.min(w, h) * 0.13),
        node: <Monument col={col} row={row} w={w} h={h} />,
      },
  ];
}

// The open-air pool: deck with the water sunk into it, coping round the
// edge, eight lanes, a deep end, and starting blocks at the shallow end.
const POOL_LANES = 8;
const POOL_WATER = { u0: 0.18, u1: 0.82, v0: 0.24, v1: 0.76 };

function PoolDeck({ col, row, w, h }: GroundProps) {
  const { u0, u1, v0, v1 } = POOL_WATER;
  const rect = (a: number, b: number, c: number, d: number): [number, number][] => [[a, c], [b, c], [b, d], [a, d]];
  const cop = 0.02;
  return (
    <>
      <polygon className="ground-deck" points={uvPoly(col, row, w, h, rect(0, 0, 1, 1))} />
      <polygon className="ground-coping" points={uvPoly(col, row, w, h, rect(u0 - cop, u1 + cop, v0 - cop * 2, v1 + cop * 2))} />
      <polygon className="ground-water" points={uvPoly(col, row, w, h, rect(u0, u1, v0, v1))} />
      {/* The deep end. */}
      <polygon className="ground-water-deep" points={uvPoly(col, row, w, h, rect(u0 + (u1 - u0) * 0.58, u1, v0, v1))} />
      {Array.from({ length: POOL_LANES - 1 }, (_, i) => {
        const v = v0 + ((i + 1) / POOL_LANES) * (v1 - v0);
        return <line key={i} className="ground-lane" {...uvLine(col, row, w, h, u0, v, u1, v)} />;
      })}
      {/* Starting blocks on the deck at the shallow end, one per lane. */}
      {Array.from({ length: POOL_LANES }, (_, i) => {
        const v = v0 + ((i + 0.5) / POOL_LANES) * (v1 - v0);
        const s = 0.012;
        return (
          <polygon
            key={`b${i}`}
            className="ground-block"
            points={uvPoly(col, row, w, h, rect(u0 - cop - s * 2.4, u0 - cop - s * 0.6, v - s, v + s))}
          />
        );
      })}
    </>
  );
}

// What stands on a pool deck: a fence round the deck, and a pool house in
// the corner behind the deep end.
function poolProps(col: number, row: number, w: number, h: number): GroundProp[] {
  const inset = 0.03;
  const hc = col + w * 0.86; const hr = row + h * 0.06;
  const hw = w * 0.11; const hh = h * 0.16;
  return [
    {
      key: 'fence',
      col, row, w, h,
      node: <FenceAround col={col + w * inset} row={row + h * inset} w={w * (1 - inset * 2)} h={h * (1 - inset * 2)} height={up(2.0)} />,
    },
    {
      key: 'poolhouse',
      col: hc, row: hr, w: hw, h: hh,
      node: <GroundBox col={hc} row={hr} w={hw} h={hh} height={up(3.0)} side={shade(CONCRETE.wall, 0.86)} front={CONCRETE.wall} top={shade(CONCRETE.rake, 0.94)} />,
    },
  ];
}

// ---------------------------------------------------------------------
// OPEN GROUND UNDER CONSTRUCTION — the state every marking above shares
// while it is being laid.
//
// The old comment in buildingMotifs.tsx said open ground had "no
// construction state worth drawing either, since there is nothing to
// raise", and drew the finished surface throughout. That reasoning is
// backwards: RISING MASS is how a building shows its progress, but it is
// not what makes construction legible. The absence of the finished surface
// is. A quad being laid was drawn complete — lawn, walks, fountain, trees —
// with a progress bar lying on top of it, which reads as a finished quad
// somebody has put a bar on rather than as a site.
//
// So a developing plate is graded earth inside a site hoarding, and nothing
// else: no markings, no planting, no furniture (see groundProps below,
// which returns an empty list while a plate is developing, so the trees and
// fountains that stand ON a quad do not arrive before the quad does). The
// progress bar along the front is drawn by CampusMap for every site alike.
// ---------------------------------------------------------------------

// A real site hoarding, near enough: high enough to stand in front of, low
// enough that it never reads as a wall somebody is building.
const HOARDING_H = up(2.1);

// How far in from the plot edge the hoarding stands. Off the boundary by a
// little so two adjacent sites do not draw their boards through each other.
const HOARDING_INSET = 0.08;

export function GroundSite({ col, row, w, h }: GroundProps) {
  // The grader's passes, as scrape lines running the LONG way across the
  // plot — which is the way a machine would actually work it. Counted from
  // the short span in tiles rather than fixed, so a 3x3 courts site and a
  // 20x11 field site both come out with passes about half a tile apart
  // instead of the small one looking ploughed and the large one swept.
  //
  // Each pass is short of the edges by a different amount. Evenly spaced
  // full-width lines are what a DECK looks like; ground that has been
  // worked reads as overlapping runs that stop short, which is the whole
  // difference between this and a plank floor. The offsets come off the
  // index rather than Math.random: a site that reshuffled its own scrapes
  // on every render would crawl.
  const alongW = w >= h;
  const passes = Math.max(3, Math.round((alongW ? h : w) * 1.8));
  const jitter = (i: number, salt: number) => ((Math.sin((i + 1) * 12.9898 + salt) * 43758.5453) % 1 + 1) % 1;

  const ic = col + w * HOARDING_INSET;
  const ir = row + h * HOARDING_INSET;
  const iw = w * (1 - HOARDING_INSET * 2);
  const ih = h * (1 - HOARDING_INSET * 2);
  const f = boxFaces(ic, ir, iw, ih, 0, HOARDING_H);

  // The two panels facing the camera are f.left and f.right; the two behind
  // are the same edges on the far side, and we see their inner faces. Each
  // takes the tone of the panel it runs parallel to, so the four boards
  // read as one enclosure rather than as four unrelated strips. Back before
  // front, so a near board covers the far one it crosses.
  const boards: Array<{ tone: string; pts: Pt[]; span: number }> = [
    { tone: 'a', pts: [f.A, f.B, f.Bt, f.At], span: iw },
    { tone: 'b', pts: [f.A, f.D, f.Dt, f.At], span: ih },
    { tone: 'a', pts: f.left, span: iw },
    { tone: 'b', pts: f.right, span: ih },
  ];

  return (
    <>
      <polygon className="ground-graded" points={polyPoints(boxFaces(col, row, w, h, 0, 0).top)} />
      {Array.from({ length: passes }, (_, i) => {
        const t = (i + 1) / (passes + 1);
        const a = 0.03 + jitter(i, 0) * 0.22;
        const b = 0.97 - jitter(i, 7) * 0.22;
        return (
          <line
            key={i}
            className="ground-graded-scrape"
            {...(alongW ? uvLine(col, row, w, h, a, t, b, t) : uvLine(col, row, w, h, t, a, t, b))}
          />
        );
      })}
      {boards.map(({ tone, pts, span }, i) => {
        // Posts every couple of tiles along the run. Without them the board
        // is a ribbon of flat colour; with them it is a hoarding somebody
        // erected, which is the difference this whole component is about.
        const posts = Math.max(1, Math.round(span / 2.5) - 1);
        return (
          <g key={i}>
            <polygon className={`site-hoarding-${tone}`} points={polyPoints(pts)} />
            {Array.from({ length: posts }, (_, j) => {
              const u = (j + 1) / (posts + 1);
              const foot = { x: pts[0].x + (pts[1].x - pts[0].x) * u, y: pts[0].y + (pts[1].y - pts[0].y) * u };
              return (
                <line
                  key={j}
                  className="site-hoarding-post"
                  x1={foot.x} y1={foot.y} x2={foot.x} y2={lift(foot, HOARDING_H).y}
                />
              );
            })}
            {/* The capping rail along the top edge of each board, which is
                what stops a flat plate reading as a change of colour. */}
            <line className="site-hoarding-cap" x1={pts[3].x} y1={pts[3].y} x2={pts[2].x} y2={pts[2].y} />
          </g>
        );
      })}
    </>
  );
}

// Which marking each open-ground facility wears. The stadium's own field
// is a gridiron too — see StadiumField below, which the bowl motif draws
// inside its stands.
export default function GroundMarking({ facilityType, col, row, w, h, tier, developing }: GroundProps & {
  facilityType?: FacilityType;
  // The quad is the one open-ground facility with TIERS, and its two are
  // genuinely different places rather than the same lawn at two sizes (see
  // the quad block above). Nothing else here reads it.
  tier?: number;
  // Before the switch, not inside it: a site is a site whatever is going to
  // be on it when it is done, and the point of GroundSite is that every
  // open-ground facility shares one.
  developing?: boolean;
}) {
  if (developing) return <GroundSite col={col} row={row} w={w} h={h} />;
  switch (facilityType) {
    case 'athleticsField': return <Pitch col={col} row={row} w={w} h={h} />;
    case 'athleticsDiamond': return <Diamond col={col} row={row} w={w} h={h} />;
    case 'tennisCourts': return <Courts col={col} row={row} w={w} h={h} />;
    case 'pool': return <PoolDeck col={col} row={row} w={w} h={h} />;
    case 'quad': return <Quad col={col} row={row} w={w} h={h} tier={tier ?? 1} />;
    default:
      return <polygon className="ground-lawn" points={polyPoints(boxFaces(col, row, w, h, 0, 0).top)} />;
  }
}

// The raised half of an open-ground facility: every prop standing on it,
// each with the point it stands on. Mirrors GroundMarking above exactly —
// same switch, same argument list, same `developing` shortcut ahead of it —
// so a facility can never have its paint drawn without its props, or vice
// versa. An empty list is still a normal answer — nothing stands on a
// quad's lawn beyond what quadProps lists — but a tennis block is fenced
// and netted and a pool deck is fenced, and those stand up.
export function groundProps(
  facilityType: FacilityType | undefined,
  col: number, row: number, w: number, h: number, tier?: number, developing?: boolean,
): GroundProp[] {
  // Nothing stands on a site yet. Without this a quad under construction
  // kept its full-grown trees, its fountain and its monument while the
  // ground under them was still being graded — the props are a separate
  // pass from the paint (see the note at the top of this file), so hiding
  // one half and not the other is exactly the mistake the mirroring is
  // meant to prevent.
  if (developing) return [];
  switch (facilityType) {
    case 'athleticsField': return pitchProps(col, row, w, h);
    case 'athleticsDiamond': return diamondProps(col, row, w, h);
    case 'tennisCourts': return courtsProps(col, row, w, h);
    case 'pool': return poolProps(col, row, w, h);
    case 'quad': return quadProps(col, row, w, h, tier ?? 1);
    default: return [];
  }
}

// The stadium's interior, drawn by the bowl motif inside its ring of
// stands. A SOLID surface under everything: the first version left the
// ring's opening showing bare lawn and grid lines between the pitch edge
// and the stands, which read as a hole in the map rather than a stadium.
export function StadiumField({ col, row, w, h }: GroundProps) {
  return (
    <>
      {/* The full interior, so nothing behind the stands is ever visible
          through the opening. A concourse in concrete, not a running track:
          a football stadium's field is ringed by a walkway, and the red band
          this used to be read as a second track next to the real one on the
          multi-sport field. */}
      <polygon className="ground-apron" points={polyPoints(boxFaces(col, row, w, h, 0, 0).top)} />
      {/* A gridiron is 120 by 53 yards, a shape and a SIZE, not a fraction
          of the bowl: it is drawn at that length (the multi-sport field's
          pitch is drawn near its real 110 m, so the two read as the same
          kind of object at map scale), the width follows from the shape,
          and the apron takes what is left all round. */}
      {(() => {
        const along = Math.max(w, h); const across = Math.min(w, h);
        const fieldLen = Math.min(along * (1 - 0.06 * 2), (120 * 0.9144 * 1.15) / METRES_PER_TILE);
        const fieldWid = Math.min(fieldLen / 2.24, across * 0.88);
        return <Gridiron col={col} row={row} w={w} h={h} inset={(along - fieldLen) / 2 / along} insetAcross={(across - fieldWid) / 2 / across} posts />;
      })()}
    </>
  );
}
