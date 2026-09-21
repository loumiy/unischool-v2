import { GRID_HEIGHT, GRID_WIDTH } from '../../sim/index.ts';

// The campus map's projection (ported from v1's isoProjection.ts): an
// axonometric camera looking down at the grid from a chosen AZIMUTH and
// PITCH. Pure geometry — no React, no game state, no colour — so the map,
// the motifs and the ground all share one definition of where a tile is.
//
// The opening camera is the 2:1 dimetric this genre means by "isometric":
// azimuth 45°, pitch 30°. The map only ever rests on the four azimuths and
// three pitches in VIEWS and PITCHES, every one of which keeps tile edges on
// a clean pixel slope; in-between angles shimmer.
//
// A RENDERING projection only: tile coordinates, footprints and placements
// know nothing about it, and nothing about the camera is ever saved.

export const TILE_W = 64;
export const TILE_H = 32;

export interface Pt {
  x: number;
  y: number;
}

export interface Camera {
  azimuth: number;
  pitch: number;
}

export const DEFAULT_AZIMUTH = Math.PI / 4;
export const DEFAULT_PITCH = Math.asin(TILE_H / TILE_W);
export const MIN_PITCH = (20 * Math.PI) / 180;
export const MAX_PITCH = (55 * Math.PI) / 180;
export const DEFAULT_CAMERA: Camera = { azimuth: DEFAULT_AZIMUTH, pitch: DEFAULT_PITCH };

export const VIEWS: readonly number[] = [0, 1, 2, 3].map(
  (k) => DEFAULT_AZIMUTH + (k * Math.PI) / 2,
);
export const PITCHES: readonly number[] = [1 / 2, 2 / 3, 3 / 4].map((s) => Math.asin(s));

const SCALE = TILE_W / Math.SQRT2;

// Which way a wall or roof face points, in GRID terms.
export type FaceDir = 'negRow' | 'posCol' | 'posRow' | 'negCol';

interface Frame {
  camera: Camera;
  cosA: number;
  sinA: number;
  xCol: number;
  xRow: number;
  yCol: number;
  yRow: number;
  heightScale: number;
  back: 0 | 1 | 2 | 3;
  left: FaceDir;
  right: FaceDir;
}

function snap(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 ? r : v;
}

export function normaliseCamera(c: Camera): Camera {
  const TAU = Math.PI * 2;
  let azimuth = c.azimuth % TAU;
  if (azimuth < 0) azimuth += TAU;
  const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, c.pitch));
  return { azimuth, pitch };
}

const EDGE_DIR: readonly FaceDir[] = ['negRow', 'posCol', 'posRow', 'negCol'];

function frameFor(c: Camera): Frame {
  const camera = normaliseCamera(c);
  const cosA = Math.cos(camera.azimuth);
  const sinA = Math.sin(camera.azimuth);
  const sinP = Math.sin(camera.pitch);
  const ys = [0, sinA, sinA + cosA, cosA];
  let back: 0 | 1 | 2 | 3 = 0;
  for (let i = 1; i < 4; i++) if (ys[i]! < ys[back]! - 1e-12) back = i as 0 | 1 | 2 | 3;
  return {
    camera,
    cosA,
    sinA,
    xCol: snap(SCALE * cosA),
    xRow: snap(-SCALE * sinA),
    yCol: snap(SCALE * sinP * sinA),
    yRow: snap(SCALE * sinP * cosA),
    heightScale: Math.cos(camera.pitch) / Math.cos(DEFAULT_PITCH),
    back,
    left: EDGE_DIR[(back + 2) % 4]!,
    right: EDGE_DIR[(back + 1) % 4]!,
  };
}

// THE CURRENT CAMERA, module-wide: `project` has hundreds of call sites in
// the motifs, all pure geometry with no reason to know a camera exists.
// CampusMap sets it at the top of each render and hands the camera to its
// memoised children as a prop so they redraw when it changes.
let frame: Frame = frameFor(DEFAULT_CAMERA);

export function setCamera(c: Camera): Camera {
  if (c.azimuth !== frame.camera.azimuth || c.pitch !== frame.camera.pitch) frame = frameFor(c);
  return frame.camera;
}
export function getCamera(): Camera {
  return frame.camera;
}
export function cameraAxes(): { cosA: number; sinA: number } {
  return { cosA: frame.cosA, sinA: frame.sinA };
}
export function visibleWalls(): { left: FaceDir; right: FaceDir } {
  return { left: frame.left, right: frame.right };
}
export function heightScale(): number {
  return frame.heightScale;
}

// Grid CORNER (col, row) to world point.
export function project(col: number, row: number): Pt {
  const f = frame;
  return { x: f.xCol * col + f.xRow * row, y: f.yCol * col + f.yRow * row };
}

export function unproject(x: number, y: number): { col: number; row: number } {
  const f = frame;
  const det = f.xCol * f.yRow - f.xRow * f.yCol;
  return { col: (f.yRow * x - f.xRow * y) / det, row: (f.xCol * y - f.yCol * x) / det };
}

export function tileAt(x: number, y: number): { row: number; col: number } | null {
  const { col, row } = unproject(x, y);
  const c = Math.floor(col);
  const r = Math.floor(row);
  if (r < 0 || c < 0 || r >= GRID_HEIGHT || c >= GRID_WIDTH) return null;
  return { row: r, col: c };
}

// Raise a point by `h` screen units, as authored at the default pitch.
export function lift(p: Pt, h: number): Pt {
  return { x: p.x, y: p.y - h * frame.heightScale };
}

export function polyPoints(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

// The faces of an axis-aligned box standing on the grid. A is the BACK
// corner (smallest screen y), C the FRONT; the visible walls meet at C:
// D–C on the left, C–B on the right.
export interface BoxFaces {
  A: Pt;
  B: Pt;
  C: Pt;
  D: Pt;
  At: Pt;
  Bt: Pt;
  Ct: Pt;
  Dt: Pt;
  NW: Pt;
  NE: Pt;
  SE: Pt;
  SW: Pt;
  NWt: Pt;
  NEt: Pt;
  SEt: Pt;
  SWt: Pt;
  top: Pt[];
  left: Pt[];
  right: Pt[];
  dir: { AB: FaceDir; BC: FaceDir; CD: FaceDir; DA: FaceDir };
  spanLeft: number;
  spanRight: number;
}

export function boxFaces(
  col: number,
  row: number,
  w: number,
  h: number,
  base: number,
  height: number,
): BoxFaces {
  const NW = lift(project(col, row), base);
  const NE = lift(project(col + w, row), base);
  const SE = lift(project(col + w, row + h), base);
  const SW = lift(project(col, row + h), base);
  const NWt = lift(NW, height);
  const NEt = lift(NE, height);
  const SEt = lift(SE, height);
  const SWt = lift(SW, height);
  const P = [NW, NE, SE, SW];
  const Pt_ = [NWt, NEt, SEt, SWt];
  const k = frame.back;
  const A = P[k]!;
  const B = P[(k + 1) % 4]!;
  const C = P[(k + 2) % 4]!;
  const D = P[(k + 3) % 4]!;
  const At = Pt_[k]!;
  const Bt = Pt_[(k + 1) % 4]!;
  const Ct = Pt_[(k + 2) % 4]!;
  const Dt = Pt_[(k + 3) % 4]!;
  return {
    A,
    B,
    C,
    D,
    At,
    Bt,
    Ct,
    Dt,
    NW,
    NE,
    SE,
    SW,
    NWt,
    NEt,
    SEt,
    SWt,
    top: [At, Bt, Ct, Dt],
    left: [D, C, Ct, Dt],
    right: [C, B, Bt, Ct],
    dir: {
      AB: EDGE_DIR[k]!,
      BC: EDGE_DIR[(k + 1) % 4]!,
      CD: EDGE_DIR[(k + 2) % 4]!,
      DA: EDGE_DIR[(k + 3) % 4]!,
    },
    spanLeft: k % 2 === 0 ? w : h,
    spanRight: k % 2 === 0 ? h : w,
  };
}

// One wall of a box by the GRID direction it faces, oriented left to right
// on screen; `visible` says whether the camera can see its outside.
export function wallOf(
  f: BoxFaces,
  dir: FaceDir,
): { origin: Pt; along: Pt; poly: Pt[]; visible: boolean } {
  if (dir === f.dir.CD) return { origin: f.D, along: f.C, poly: f.left, visible: true };
  if (dir === f.dir.BC) return { origin: f.C, along: f.B, poly: f.right, visible: true };
  if (dir === f.dir.AB)
    return { origin: f.A, along: f.B, poly: [f.A, f.B, f.Bt, f.At], visible: false };
  return { origin: f.D, along: f.A, poly: [f.D, f.A, f.At, f.Dt], visible: false };
}

// A point on a wall face in the wall's own coordinates: u along, v up.
export function facePoint(origin: Pt, along: Pt, height: number, u: number, v: number): Pt {
  return {
    x: origin.x + (along.x - origin.x) * u,
    y: origin.y + (along.y - origin.y) * u - height * v * frame.heightScale,
  };
}

export function projectedCircle(
  centreCol: number,
  centreRow: number,
  radius: number,
  segments = 40,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(project(centreCol + Math.cos(a) * radius, centreRow + Math.sin(a) * radius));
  }
  return out;
}

export function worldBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  const pts = [
    project(0, 0),
    project(GRID_WIDTH, 0),
    project(GRID_WIDTH, GRID_HEIGHT),
    project(0, GRID_HEIGHT),
  ];
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

// The world at the DEFAULT camera, as a constant: what the first view is
// centred on and sized against.
export const WORLD = (() => {
  const N = Math.max(GRID_WIDTH, GRID_HEIGHT);
  return { ...worldBounds(), width: N * TILE_W, height: N * TILE_H };
})();
