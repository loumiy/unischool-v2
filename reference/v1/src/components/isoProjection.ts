// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { CAMPUS_GRID_HEIGHT, CAMPUS_GRID_WIDTH } from '../state/types';

// The campus map's projection: an axonometric camera looking down at the
// grid from a chosen AZIMUTH (which way round the grid it stands) and PITCH
// (how steeply it looks down). Everything here is pure geometry — no React,
// no game state, no colour — so the map, the motifs and the ground markings
// all share one definition of where a tile is rather than each deriving
// their own.
//
// The camera it opens on is the 2:1 dimetric this genre means by
// "isometric": azimuth 45 degrees, pitch 30 degrees. At that camera a
// tile's diagonals run exactly one pixel down for every two across, so grid
// lines and footprint edges land on clean pixel slopes, and it is the ratio
// every sprite-based management sim uses. The projection accepts ANY
// camera, but the map only ever rests on the four azimuths and three
// pitches in VIEWS and PITCHES below, every one of which keeps the tile
// edges on a clean pixel slope: the motifs were drawn for that grid, and
// at an in-between angle they shimmer and foreshorten into shapes nobody
// drew. A continuous camera was tried and looked worse than it sounded.
//
// IMPORTANT: this is a RENDERING projection only. Tile coordinates
// (row/col), footprints, occupancy, canPlace and the stored Placement are
// completely unaware of it — exactly as they were unaware of the flat map's
// own tileX/tileY. Nothing here changes what a building costs, gates or
// grants, and nothing about the camera is ever saved.

// One tile is TILE_W across and TILE_H down on screen at zoom 1, at the
// DEFAULT camera. The flat map's tiles were 64px square; keeping TILE_W at
// 64 means a footprint covers the same width it used to, so the campus reads
// at a familiar size. Every other camera is derived from these two numbers.
export const TILE_W = 64;
export const TILE_H = 32;

export interface Pt { x: number; y: number; }

// --- the camera ------------------------------------------------------------

// Where the camera stands. Both in radians.
//
//   azimuth  which way round the grid the camera is. At the default, 45
//            degrees, increasing col runs down-right on screen and
//            increasing row down-left. Increasing the azimuth turns the
//            camera anticlockwise round the campus. Any value is valid;
//            it wraps.
//   pitch    the elevation the camera looks down from. 90 degrees would be
//            straight down (a plan, no walls visible); 0 would be along the
//            ground (no roofs). Clamped to a range where both still read.
export interface Camera { azimuth: number; pitch: number; }

export const DEFAULT_AZIMUTH = Math.PI / 4;
// DERIVED, NOT CHOSEN. The two tile constants pin the default camera: the
// uniform world scale is TILE_W / sqrt2, and the elevation satisfies
// sin(pitch) = TILE_H / TILE_W — 30 degrees at a 64x32 tile. See
// campusScale.ts for what follows from that for vertical distances.
export const DEFAULT_PITCH = Math.asin(TILE_H / TILE_W);
// Steeper than this and the walls collapse to slivers with nothing left to
// hang a door on; shallower and a tall hall covers most of the campus
// behind it, and the ground-only depth relation (see depthSort.ts) starts
// to have visibly wrong answers.
export const MIN_PITCH = (20 * Math.PI) / 180;
export const MAX_PITCH = (55 * Math.PI) / 180;

export const DEFAULT_CAMERA: Camera = { azimuth: DEFAULT_AZIMUTH, pitch: DEFAULT_PITCH };

// THE VIEWS THE MAP RESTS ON. Four azimuths, a quarter turn apart — the
// four corners of the campus, each with the tile diagonals at the same 2:1
// — and three pitches. The pitches are the ones where sin(pitch) is a small
// fraction: at 1/2, 2/3 and 3/4 a tile edge climbs one pixel every 2, 3 or
// 4 across, and stays crisp; anything else shimmers. A steeper view sees
// more of the ground and less of the walls, and is what a player pulls
// back to when siting.
export const VIEWS: readonly number[] = [0, 1, 2, 3].map((k) => DEFAULT_AZIMUTH + (k * Math.PI) / 2);
export const PITCHES: readonly number[] = [1 / 2, 2 / 3, 3 / 4].map((s) => Math.asin(s));

// World units per tile, measured along the ground, whatever the camera. At
// the default camera a tile's diagonal is TILE_W across: TILE_W / sqrt2.
const SCALE = TILE_W / Math.SQRT2;

// Which way a wall or roof face points, in GRID terms. The four names are
// the ones the palettes already use for roof slopes (see buildingMotifs'
// SLOPE): a face is lit by where it points, not by where it happens to land
// on screen, which is what lets one palette be right at every azimuth.
export type FaceDir = 'negRow' | 'posCol' | 'posRow' | 'negCol';

// Everything the camera decides, precomputed once per camera change rather
// than per point: the projection is applied tens of thousands of times per
// frame and must stay four multiplications.
interface Frame {
  camera: Camera;
  cosA: number; sinA: number;
  // The 2x2 ground map: screen x = xCol * col + xRow * row, and y likewise.
  xCol: number; xRow: number; yCol: number; yRow: number;
  // How much a screen unit of HEIGHT (authored at the default pitch — see
  // campusScale.ts's `up`) is foreshortened at this pitch.
  heightScale: number;
  // Which of the four corners of any grid rectangle is the BACK one on
  // screen (smallest y), as an index into [NW, NE, SE, SW]. Fixed by the
  // camera alone, so boxFaces below need not search for it per box.
  back: 0 | 1 | 2 | 3;
  // The two walls the camera can see, by grid direction: `left` is the
  // wall whose front edge runs from the screen-left corner to the front
  // corner, `right` the one from the front corner to the screen-right one.
  left: FaceDir; right: FaceDir;
}

// The default camera must reproduce today's integer constants EXACTLY —
// (col - row) * 32 and (col + row) * 16 — not to within floating point.
// The map's polygon strings are printed to two decimals, so a coefficient
// of 31.999999999999996 would flip the last digit of thousands of points and
// make every render differ from the one before this camera existed.
function snap(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 ? r : v;
}

// Wrap the azimuth into [0, 2pi) and clamp the pitch, so callers can add an
// increment without ever thinking about either.
export function normaliseCamera(c: Camera): Camera {
  const TAU = Math.PI * 2;
  let azimuth = c.azimuth % TAU;
  if (azimuth < 0) azimuth += TAU;
  const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, c.pitch));
  return { azimuth, pitch };
}

// The outward direction of the edge from grid corner i to corner i + 1,
// taking the corners round as [NW, NE, SE, SW] — that is, (col, row),
// (col + w, row), (col + w, row + h), (col, row + h).
const EDGE_DIR: readonly FaceDir[] = ['negRow', 'posCol', 'posRow', 'negCol'];

function frameFor(c: Camera): Frame {
  const camera = normaliseCamera(c);
  const cosA = Math.cos(camera.azimuth);
  const sinA = Math.sin(camera.azimuth);
  const sinP = Math.sin(camera.pitch);
  // Screen y of the unit square's corners, in [NW, NE, SE, SW] order; the
  // smallest is the back corner. Ties happen only at the exact cardinal
  // azimuths, where two corners share a y and one wall is edge-on with zero
  // width — either choice draws the same picture.
  const ys = [0, sinA, sinA + cosA, cosA];
  let back: 0 | 1 | 2 | 3 = 0;
  for (let i = 1; i < 4; i++) if (ys[i] < ys[back] - 1e-12) back = i as 0 | 1 | 2 | 3;
  return {
    camera, cosA, sinA,
    xCol: snap(SCALE * cosA), xRow: snap(-SCALE * sinA),
    yCol: snap(SCALE * sinP * sinA), yRow: snap(SCALE * sinP * cosA),
    heightScale: Math.cos(camera.pitch) / Math.cos(DEFAULT_PITCH),
    back,
    left: EDGE_DIR[(back + 2) % 4],
    right: EDGE_DIR[(back + 1) % 4],
  };
}

// THE CURRENT CAMERA, module-wide. A singleton rather than a parameter
// threaded through every call, deliberately: `project` has some two hundred
// call sites across the motifs and the ground markings, all of them pure
// geometry that has no other reason to know a camera exists. CampusMap sets
// it at the top of each render (React renders a subtree synchronously, so
// every polygon in one commit sees one camera) and hands the camera object
// to its memoised children as a prop, which is what makes them redraw when
// it changes. Nothing else may set it.
let frame: Frame = frameFor(DEFAULT_CAMERA);

// Point the projection at a camera. Returns the normalised camera actually
// applied, so a caller holding camera state stores the wrapped/clamped form.
export function setCamera(c: Camera): Camera {
  if (c.azimuth !== frame.camera.azimuth || c.pitch !== frame.camera.pitch) frame = frameFor(c);
  return frame.camera;
}
export function getCamera(): Camera {
  return frame.camera;
}

// The camera's facts the depth sort needs (see depthSort.ts): which way each
// grid axis runs on screen. Increasing col moves a point toward the camera
// (down the screen) when sinA > 0; increasing row does when cosA > 0.
export function cameraAxes(): { cosA: number; sinA: number } {
  return { cosA: frame.cosA, sinA: frame.sinA };
}

// The two walls of any axis-aligned box that this camera can see.
export function visibleWalls(): { left: FaceDir; right: FaceDir } {
  return { left: frame.left, right: frame.right };
}

// How much a height authored at the default pitch is foreshortened now.
export function heightScale(): number {
  return frame.heightScale;
}

// --- the projection -------------------------------------------------------

// Grid CORNER (col, row) to world point. Note this takes corner
// coordinates, not tile indices: tile (row, col) spans corners (col, row)
// through (col + 1, row + 1), which is what lets a footprint of any size
// project by passing its far corner rather than looping its tiles.
//
// The map is linear: rotate the grid by the azimuth, then squash screen y by
// sin(pitch). At the default camera the four coefficients are exactly 32,
// -32, 16, 16, i.e. x = (col - row) * TILE_W / 2, y = (col + row) * TILE_H / 2.
export function project(col: number, row: number): Pt {
  const f = frame;
  return { x: f.xCol * col + f.xRow * row, y: f.yCol * col + f.yRow * row };
}

// World point back to FRACTIONAL grid corner coordinates — the inverse of
// project, and what turns a mouse position into a tile. A 2x2 inverse; the
// determinant is never zero because sin(pitch) never is.
//
// This is the whole reason an angled map needs no per-tile hit-target: one
// division replaces CAMPUS_GRID_WIDTH * CAMPUS_GRID_HEIGHT DOM elements.
export function unproject(x: number, y: number): { col: number; row: number } {
  const f = frame;
  const det = f.xCol * f.yRow - f.xRow * f.yCol;
  return {
    col: (f.yRow * x - f.xRow * y) / det,
    row: (f.xCol * y - f.yCol * x) / det,
  };
}

// The tile a world point falls in, or null if it falls off the grid.
export function tileAt(x: number, y: number): { row: number; col: number } | null {
  const { col, row } = unproject(x, y);
  const c = Math.floor(col);
  const r = Math.floor(row);
  if (r < 0 || c < 0 || r >= CAMPUS_GRID_HEIGHT || c >= CAMPUS_GRID_WIDTH) return null;
  return { row: r, col: c };
}

// Raise a point by `h` screen units, as authored at the default pitch. Height
// is a pure screen-space offset: the camera never rolls, so a vertical edge
// is a vertical line on screen at every azimuth, and only its LENGTH changes
// with the pitch — a steeper camera sees less of a wall. That foreshortening
// is applied here, once, so every height on the map (motif tables, tree
// trunks, the scale module's storeys) stays authored in one unit.
export function lift(p: Pt, h: number): Pt {
  return { x: p.x, y: p.y - h * frame.heightScale };
}

export function polyPoints(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

// The faces of an axis-aligned box standing on the grid.
//
//   A ---- B      A is the BACK corner (smallest screen y), B the RIGHT one,
//   |      |      C the FRONT corner (largest screen y), D the LEFT one, so
//   D ---- C      the two walls the camera can see are always the ones
//                 meeting at C: D-C on the left, C-B on the right.
//
// These four letters are SCREEN positions, not grid positions: turn the
// camera and a different grid corner becomes A, but A is still the back and
// D-C still the visible left wall, so a motif that hangs windows on `left`
// and a door on D→C is right at every azimuth without knowing one exists.
// The u axis of each visible wall (origin → along) always runs left to right
// on screen, which is what facePoint's callers assume.
//
// Anything that cares which GRID edge a face is — a roof slope tinted by the
// direction it points, a wing that has to be on the south side — uses the
// grid-fixed corners NW/NE/SE/SW instead, or reads `dir`, which says what
// grid direction each screen-labelled face points in.
export interface BoxFaces {
  A: Pt; B: Pt; C: Pt; D: Pt;
  At: Pt; Bt: Pt; Ct: Pt; Dt: Pt;
  // The same eight points by GRID corner: NW is (col, row), NE (col + w, row),
  // SE (col + w, row + h), SW (col, row + h).
  NW: Pt; NE: Pt; SE: Pt; SW: Pt;
  NWt: Pt; NEt: Pt; SEt: Pt; SWt: Pt;
  top: Pt[]; left: Pt[]; right: Pt[];
  // What grid direction each face points: AB and DA are the two walls the
  // camera cannot see, CD is `left` and BC is `right`.
  dir: { AB: FaceDir; BC: FaceDir; CD: FaceDir; DA: FaceDir };
  // How long the visible left and right walls are, in tiles — w for a wall
  // that runs along col, h for one along row. Anything set out along a wall
  // in bays (windows, doors, courses) needs the span of the wall it is
  // actually on, which is no longer always w on the left and h on the right.
  spanLeft: number; spanRight: number;
}
export function boxFaces(
  col: number, row: number, w: number, h: number, base: number, height: number,
): BoxFaces {
  const NW = lift(project(col, row), base);
  const NE = lift(project(col + w, row), base);
  const SE = lift(project(col + w, row + h), base);
  const SW = lift(project(col, row + h), base);
  const NWt = lift(NW, height); const NEt = lift(NE, height);
  const SEt = lift(SE, height); const SWt = lift(SW, height);
  const P = [NW, NE, SE, SW];
  const Pt_ = [NWt, NEt, SEt, SWt];
  const k = frame.back;
  const A = P[k]; const B = P[(k + 1) % 4]; const C = P[(k + 2) % 4]; const D = P[(k + 3) % 4];
  const At = Pt_[k]; const Bt = Pt_[(k + 1) % 4]; const Ct = Pt_[(k + 2) % 4]; const Dt = Pt_[(k + 3) % 4];
  return {
    A, B, C, D, At, Bt, Ct, Dt,
    NW, NE, SE, SW, NWt, NEt, SEt, SWt,
    top: [At, Bt, Ct, Dt], left: [D, C, Ct, Dt], right: [C, B, Bt, Ct],
    dir: { AB: EDGE_DIR[k], BC: EDGE_DIR[(k + 1) % 4], CD: EDGE_DIR[(k + 2) % 4], DA: EDGE_DIR[(k + 3) % 4] },
    // Edges 0 and 2 (NW-NE, SE-SW) run along col; CD is edge k + 2, BC is k + 1.
    spanLeft: (k % 2 === 0) ? w : h,
    spanRight: (k % 2 === 0) ? h : w,
  };
}

// One wall of a box by the GRID direction it faces, oriented the way every
// visible wall is: `origin` → `along` runs left to right on screen, and
// `visible` says whether the camera can see its outside at all. For the two
// hidden walls the polygon returned is their INSIDE face, which is what an
// open enclosure (a hoarding, a stand) shows.
export function wallOf(f: BoxFaces, dir: FaceDir): { origin: Pt; along: Pt; poly: Pt[]; visible: boolean } {
  if (dir === f.dir.CD) return { origin: f.D, along: f.C, poly: f.left, visible: true };
  if (dir === f.dir.BC) return { origin: f.C, along: f.B, poly: f.right, visible: true };
  if (dir === f.dir.AB) return { origin: f.A, along: f.B, poly: [f.A, f.B, f.Bt, f.At], visible: false };
  return { origin: f.D, along: f.A, poly: [f.D, f.A, f.At, f.Dt], visible: false };
}

// A point on a wall face in the wall's OWN coordinates: u runs along the
// wall from `origin` to `along`, v runs up it from 0 to 1. Anything drawn
// through this comes out correctly skewed for free — a window is just a
// rectangle in (u, v). `height` is in the same authored screen units as
// lift's, and is foreshortened the same way.
export function facePoint(origin: Pt, along: Pt, height: number, u: number, v: number): Pt {
  return {
    x: origin.x + (along.x - origin.x) * u,
    y: origin.y + (along.y - origin.y) * u - height * v * frame.heightScale,
  };
}

// A circle drawn ON the ground, projected. Sampled as a polygon rather than
// emitted as an <ellipse> because the projection turns a circle into an
// ellipse whose axes are not screen-aligned; a sampled ring needs no
// rotation maths and stays correct at every camera.
export function projectedCircle(
  centreCol: number, centreRow: number, radius: number, segments = 40,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(project(centreCol + Math.cos(a) * radius, centreRow + Math.sin(a) * radius));
  }
  return out;
}

// A STADIUM (running-track) outline on the ground: two dead-straight sides
// joined by semicircular ends. This is what a 400m track actually is, and it
// is not an ellipse — an ellipse curves continuously, so its long sides bow
// where a track's are straight, which is the first thing that reads as wrong
// about one.
//
// `halfLen` is measured along the long axis and `halfWid` across it, both
// from the centre, so the straight portion is (halfLen - halfWid) long on
// each side and the caps have radius halfWid. `landscape` says which grid
// axis the long one is, so a rotated field gets an oval the right way round.
export function projectedStadium(
  centreCol: number, centreRow: number,
  halfLen: number, halfWid: number, landscape: boolean, segments = 20,
): Pt[] {
  const straight = Math.max(0, halfLen - halfWid);
  const r = halfWid;
  const out: Pt[] = [];
  // (along, across) offsets from the centre, mapped onto whichever grid axis
  // is the long one.
  const push = (a: number, c: number) => {
    out.push(landscape ? project(centreCol + a, centreRow + c) : project(centreCol + c, centreRow + a));
  };
  push(straight, -r);
  push(-straight, -r);
  for (let i = 1; i < segments; i++) {
    const t = -Math.PI / 2 - (i / segments) * Math.PI;   // round the far cap
    push(-straight + r * Math.cos(t), r * Math.sin(t));
  }
  push(-straight, r);
  push(straight, r);
  for (let i = 1; i < segments; i++) {
    const t = Math.PI / 2 - (i / segments) * Math.PI;    // round the near cap
    push(straight + r * Math.cos(t), r * Math.sin(t));
  }
  return out;
}

// An arc on the ground between two angles — the outfield boundary and the
// infield dirt of a ball field are both this.
export function projectedArc(
  centreCol: number, centreRow: number, radius: number,
  fromAngle: number, toAngle: number, segments = 28,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = fromAngle + (toAngle - fromAngle) * (i / segments);
    out.push(project(centreCol + Math.cos(a) * radius, centreRow + Math.sin(a) * radius));
  }
  return out;
}

// The whole grid's extent in world space, at the CURRENT camera. x is not
// anchored at zero (the grid projects to a rhombus, one corner of which sits
// at negative x), so nothing may assume the world starts at the origin.
export function worldBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  const pts = [
    project(0, 0), project(CAMPUS_GRID_WIDTH, 0),
    project(CAMPUS_GRID_WIDTH, CAMPUS_GRID_HEIGHT), project(0, CAMPUS_GRID_HEIGHT),
  ];
  return {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
  };
}

// The same, at the DEFAULT camera, as a constant: what the map's first view
// is centred on and sized against, which is decided once at mount.
export const WORLD = (() => {
  const N = Math.max(CAMPUS_GRID_WIDTH, CAMPUS_GRID_HEIGHT);
  return { ...worldBounds(), width: N * TILE_W, height: N * TILE_H };
})();
