import { memo } from 'react';
import type { BuildingDef } from '../../content/buildings.ts';
import type { Motif } from '../../sim/index.ts';
import {
  ARCADE_BAY_METRES,
  ARCADE_DEPTH,
  ARCADE_HEIGHT,
  ARCADE_MAX,
  ARCADE_PIER,
  BASE_COURSE,
  BAY_METRES,
  BUTTRESS_PLAN,
  BUTTRESS_SETOFF_DEPTH,
  BUTTRESS_SETOFF_FRACTION,
  CAMPANILE_BELFRY_RISE,
  CAMPANILE_CAP_RISE,
  CAMPANILE_PLAN,
  CAMPANILE_RISE,
  CANOPY_DEPTH,
  CANOPY_POST,
  CANOPY_SLAB,
  CLOCK_RADIUS,
  CLOCK_RADIUS_TILES,
  COLONNADE_BAY_METRES,
  COLONNADE_HEIGHT,
  COLONNADE_MAX,
  COPING,
  COPING_OVERHANG,
  CORE_CAP_RISE,
  CORE_PLAN,
  CORE_RISE,
  CORNICE,
  EAVES_COURSE,
  END_PAVILION_DEPTH,
  END_PAVILION_PLAN,
  END_PAVILION_RISE,
  ENTABLATURE,
  FLOOR_COURSE,
  PAVILION_BAYS,
  PAVILION_DEPTH,
  PAVILION_RISE,
  PEDIMENT_RISE,
  PIER_PROJECTION,
  PIER_WIDTH_METRES,
  PLINTH,
  PORCH_ARCH_HEIGHT,
  PORCH_ARCH_WIDTH,
  PORCH_GABLE_RISE,
  PORCH_HEIGHT_FRACTION,
  PORTICO_COLUMNS,
  PORTICO_COLUMN_PLAN,
  PORTICO_HEIGHT,
  PORTICO_STANDOFF,
  STEP_OVERHANG,
  TOWER_BASE_PLAN,
  TOWER_BASE_RISE,
  TOWER_BELFRY_PLAN,
  TOWER_BELFRY_RISE,
  TOWER_DOME_RISE,
  TOWER_DRUM_PLAN,
  TOWER_DRUM_RISE,
  TOWER_FINIAL_RISE,
  TOWER_PINNACLE_PLAN,
  TOWER_PINNACLE_RISE,
  TOWER_SPIRE_RISE,
  TREAD_DEPTH,
  WINDOW_HEIGHT,
  apexPartOf,
  baysAcross,
  clerestorySill,
  doorOf,
  eavesOf,
  entrancePartOf,
  floorLinesOf,
  hasClockTower,
  hasGilt,
  hasTrim,
  materialOf,
  paneShapeOf,
  parapetOf,
  partsFor,
  rankSills,
  ridgeOf,
  rooflineEndPartOf,
  SIGN_BOARD_DEPTH,
  SIGN_BOARD_RISE,
  SIGN_BOARD_WIDTH,
  SIGN_PLINTH,
  SIGN_PLINTH_DEEP,
  SIGN_PLINTH_LONG,
  SIGN_POST,
  SIGN_POST_METRES,
  stoneFor,
  storeysOf,
  wallHeightOf,
  wallShadeOf,
  windowOutline,
  windowRanksOf,
  windowWidthOf,
  type ApexPart,
  type DoorDimensions,
  type EntrancePart,
  type Material,
  type StonePalette,
  type WindowShape,
} from './buildingSpec.ts';
import { depthOrder, type DepthBox } from './depthSort.ts';
import { GroundField } from './ground.tsx';
import {
  boxFaces,
  facePoint,
  heightScale,
  lift,
  polyPoints,
  project,
  projectedCircle,
  visibleWalls,
  wallOf,
  type BoxFaces,
  type Camera,
  type FaceDir,
  type Pt,
} from './iso.ts';
import { WALL_LIGHT, faceTone, shadowOffset } from './light.ts';
import { METRES_PER_TILE, STOREY, across, up } from './scale.ts';
import { mix, shade } from './tint.ts';

// Architectural motifs (ported from v1's buildingMotifs.tsx): what makes a
// placed building read as a BUILDING rather than as a coloured shape with a
// name on it. The taxonomy is buildingSpec's; this file only turns its
// answers into polygons. Hand-rolled inline SVG, no art, no library.
//
// Trimmed to the forms in the seed catalogue: hall, residential, portico,
// pavilion, works, block, hangar, grounds. v1's village, tower, stadium,
// hospital split, arena, natatorium and studio return with the buildings
// that need them (reference/v1/src/components/buildingMotifs.tsx).

export function labelHeightOf(def: BuildingDef, m: Motif): number {
  return wallHeightOf(def) + ridgeOf(def, m) * 0.5;
}

export function drawnHeightOf(def: BuildingDef, m: Motif): number {
  if (def.form === 'grounds') return 0;
  return wallHeightOf(def) + ridgeOf(def, m);
}

export interface Palette {
  roof: string;
  roofDeck: string;
  negCol: string;
  negRow: string;
  posRow: string;
  posCol: string;
  wall: Record<FaceDir, string>;
  wallLeft: string;
  wallRight: string;
}

function SLOPE(roof: string) {
  return {
    negCol: shade(roof, 1.12),
    negRow: shade(roof, 1.0),
    posRow: shade(roof, 0.84),
    posCol: shade(roof, 0.7),
  };
}
function WALLS(wall: string): Record<FaceDir, string> {
  return {
    negCol: shade(wall, WALL_LIGHT.negCol),
    negRow: shade(wall, WALL_LIGHT.negRow),
    posRow: shade(wall, WALL_LIGHT.posRow),
    posCol: shade(wall, WALL_LIGHT.posCol),
  };
}

export function paletteFrom(m: Material, shadeFactor = 1): Palette {
  const wall = shadeFactor === 1 ? m.wall : shade(m.wall, shadeFactor);
  const walls = WALLS(wall);
  const seen = visibleWalls();
  return {
    roof: m.roof,
    roofDeck: shade(m.roof, 1.06),
    ...SLOPE(m.roof),
    wall: walls,
    wallLeft: walls[seen.left],
    wallRight: walls[seen.right],
  };
}

function sideFaces(f: BoxFaces, posRowTone: string, posColTone: string) {
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={faceTone(f.dir.CD, posRowTone, posColTone)} />
      <polygon points={polyPoints(f.right)} fill={faceTone(f.dir.BC, posRowTone, posColTone)} />
    </>
  );
}

// --- walls by direction ----------------------------------------------------
const isRowWall = (dir: FaceDir): boolean => dir === 'posRow' || dir === 'negRow';
function wallSpan(w: number, h: number, dir: FaceDir): number {
  return isRowWall(dir) ? w : h;
}
function opposite(dir: FaceDir): FaceDir {
  return dir === 'posRow'
    ? 'negRow'
    : dir === 'negRow'
      ? 'posRow'
      : dir === 'posCol'
        ? 'negCol'
        : 'posCol';
}
function outwardOf(dir: FaceDir): { col: number; row: number } {
  return dir === 'posRow'
    ? { col: 0, row: 1 }
    : dir === 'negRow'
      ? { col: 0, row: -1 }
      : dir === 'posCol'
        ? { col: 1, row: 0 }
        : { col: -1, row: 0 };
}
function againstWall(
  col: number,
  row: number,
  w: number,
  h: number,
  dir: FaceDir,
  along0: number,
  width: number,
  depth: number,
  sink = 0,
): DepthBox {
  switch (dir) {
    case 'posRow':
      return { col: col + along0, row: row + h - sink, w: width, h: depth };
    case 'negRow':
      return { col: col + along0, row: row - depth + sink, w: width, h: depth };
    case 'posCol':
      return { col: col + w - sink, row: row + along0, w: depth, h: width };
    default:
      return { col: col - depth + sink, row: row + along0, w: depth, h: width };
  }
}
function outsideWall(
  col: number,
  row: number,
  w: number,
  h: number,
  dir: FaceDir,
  along: number,
  out: number,
): { col: number; row: number } {
  switch (dir) {
    case 'posRow':
      return { col: col + along, row: row + h + out };
    case 'negRow':
      return { col: col + along, row: row - out };
    case 'posCol':
      return { col: col + w + out, row: row + along };
    default:
      return { col: col - out, row: row + along };
  }
}
function attachmentFaces(f: BoxFaces, dir: FaceDir, pal: Palette) {
  const frontIsLeft = f.dir.CD === dir;
  return {
    front: wallOf(f, dir),
    frontFill: frontIsLeft ? pal.wallLeft : pal.wallRight,
    side: frontIsLeft ? f.right : f.left,
    sideFill: frontIsLeft ? pal.wallRight : pal.wallLeft,
    frontIsLeft,
  };
}
function leanToRoof(f: BoxFaces, dir: FaceDir, height: number, rise: number, pal: Palette) {
  const front = wallOf(f, dir);
  const back = wallOf(f, opposite(dir));
  const frontIsLeft = f.dir.CD === dir;
  return {
    leanTo: [
      lift(front.origin, height),
      lift(front.along, height),
      lift(back.along, height + rise),
      lift(back.origin, height + rise),
    ],
    leanToFill: pal[dir],
    endCap: frontIsLeft
      ? [lift(f.C, height), lift(f.B, height), lift(f.B, height + rise)]
      : [lift(f.C, height), lift(f.D, height), lift(f.D, height + rise)],
    endCapFill: frontIsLeft ? pal.wallRight : pal.wallLeft,
  };
}
function gableInward(col: number, row: number, w: number, h: number): { origin: Pt; along: Pt } {
  const dir = visibleWalls().left;
  const strip = againstWall(col, row, w, h, dir, 0, wallSpan(w, h, dir), across(0.6), across(0.6));
  const back = wallOf(boxFaces(strip.col, strip.row, strip.w, strip.h, 0, 0), opposite(dir));
  return { origin: back.origin, along: back.along };
}

// --- windows, courses, doors -------------------------------------------------
interface FaceRect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}
function overlaps(a: FaceRect, b: FaceRect): boolean {
  return a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;
}

function windows(
  origin: Pt,
  along: Pt,
  wallHeight: number,
  spanTiles: number,
  sills: number[],
  windowWidthTiles: number,
  key: string,
  shape: WindowShape,
  glass: string,
  reserved?: FaceRect,
  lights: 1 | 2 = 1,
) {
  const out: React.JSX.Element[] = [];
  if (wallHeight <= 0 || spanTiles <= 0) return out;
  const bays = baysAcross(spanTiles);
  const panes: string[] = [];
  const halfU =
    shape === 'ribbon' ? 1 / bays / 2 : Math.min(windowWidthTiles / spanTiles, 1 / bays) / 2;
  for (let r = 0; r < sills.length; r++) {
    const sill = sills[r]!;
    const v0 = sill / wallHeight;
    const v1 = (sill + WINDOW_HEIGHT) / wallHeight;
    if (v1 > 1) continue;
    for (let b = 0; b < bays; b++) {
      const centre = (b + 0.5) / bays;
      const u0 = centre - halfU;
      const u1 = centre + halfU;
      if (reserved && overlaps({ u0, u1, v0, v1 }, reserved)) continue;
      const spans: Array<[number, number]> =
        lights === 2
          ? [
              [centre - halfU * 1.08, centre - halfU * 0.12],
              [centre + halfU * 0.12, centre + halfU * 1.08],
            ]
          : [[u0, u1]];
      for (const [a, c] of spans) {
        panes.push(
          `M${polyPoints(windowOutline(shape, a, c, v0, v1).map(([u, v]) => facePoint(origin, along, wallHeight, u, v))).replace(/ /g, 'L')}Z`,
        );
      }
    }
  }
  if (panes.length > 0)
    out.push(<path key={`${key}w`} className="iso-window" fill={glass} d={panes.join('')} />);
  return out;
}

function floorCourses(origin: Pt, along: Pt, wallHeight: number, lines: number[], key: string) {
  if (wallHeight <= 0) return [];
  return lines
    .map((at, i) => {
      const v0 = (at - FLOOR_COURSE / 2) / wallHeight;
      const v1 = (at + FLOOR_COURSE / 2) / wallHeight;
      if (v0 <= 0 || v1 >= 1) return null;
      return (
        <polygon
          key={`${key}c${i}`}
          className="iso-course"
          points={polyPoints([
            facePoint(origin, along, wallHeight, 0, v0),
            facePoint(origin, along, wallHeight, 1, v0),
            facePoint(origin, along, wallHeight, 1, v1),
            facePoint(origin, along, wallHeight, 0, v1),
          ])}
        />
      );
    })
    .filter(Boolean);
}

function doorFraction(d: DoorDimensions, span: number): number {
  if (d.widthTiles <= 0 || span <= 0) return 0;
  return Math.min(d.widthTiles / span, 0.6);
}
const SURROUND = 0.018;
const LINTEL = 0.05;
function doorBay(d: DoorDimensions, span: number, wallHeight: number): FaceRect | undefined {
  const dw = doorFraction(d, span);
  if (dw <= 0 || wallHeight <= 0) return undefined;
  const head = (d.threshold + d.height) / wallHeight;
  return {
    u0: 0.5 - dw / 2 - SURROUND,
    u1: 0.5 + dw / 2 + SURROUND,
    v0: 0,
    v1: head + LINTEL + 0.02,
  };
}

function Door({
  d,
  origin,
  along,
  wallHeight,
  span,
  shape = 'rect',
}: {
  d: DoorDimensions;
  origin: Pt;
  along: Pt;
  wallHeight: number;
  span: number;
  // The head the opening is cut with. A lancet is the arched door's own
  // geometry under a pointed head, so the Gothic porch can put a real door
  // in its arch rather than a hole (Phase 21D).
  shape?: 'rect' | 'arched' | 'lancet';
}) {
  const dw = doorFraction(d, span);
  if (dw <= 0 || wallHeight <= 0) return null;
  const v0 = d.threshold / wallHeight;
  const v1 = (d.threshold + d.height) / wallHeight;
  if (v1 > 1) return null;
  const h = v1 - v0;
  const u0 = 0.5 - dw / 2;
  const u1 = 0.5 + dw / 2;
  const at = (u: number, v: number) => facePoint(origin, along, wallHeight, u, v);
  const quad = (a: number, b: number, c: number, e: number) =>
    polyPoints([at(a, c), at(b, c), at(b, e), at(a, e)]);
  const transom = v0 + h * 0.72;
  const mull = dw * 0.035;
  const reveal = dw * 0.08;
  const bar = h * 0.045;
  if (shape !== 'rect') {
    const arch = (a: number, b: number, c: number, e: number) =>
      polyPoints(windowOutline(shape, a, b, c, e).map(([u, v]) => at(u, v)));
    const fan = polyPoints(
      windowOutline(shape, u0 + reveal, u1 - reveal, v0, v1 - h * 0.04).map(([u, v]) =>
        at(u, Math.max(v, transom + bar * 0.5)),
      ),
    );
    return (
      <>
        <polygon
          className="iso-door-surround"
          points={arch(u0 - SURROUND, u1 + SURROUND, v0, v1 + 0.012)}
        />
        <polygon className="iso-door" points={arch(u0, u1, v0, v1)} />
        <polygon
          className="iso-door-leaf"
          points={quad(u0 + reveal, 0.5 - mull, v0 + h * 0.02, transom - bar)}
        />
        <polygon
          className="iso-door-leaf"
          points={quad(0.5 + mull, u1 - reveal, v0 + h * 0.02, transom - bar)}
        />
        <polygon className="iso-door-bar" points={quad(u0, u1, transom - bar, transom)} />
        <polygon className="iso-door-glass" points={fan} />
      </>
    );
  }
  return (
    <>
      <polygon
        className="iso-door-surround"
        points={quad(u0 - SURROUND, u1 + SURROUND, v0, v1 + 0.012)}
      />
      <polygon className="iso-door" points={quad(u0, u1, v0, v1)} />
      <polygon
        className="iso-door-leaf"
        points={quad(u0 + reveal, 0.5 - mull, v0 + h * 0.02, transom - bar)}
      />
      <polygon
        className="iso-door-leaf"
        points={quad(0.5 + mull, u1 - reveal, v0 + h * 0.02, transom - bar)}
      />
      <polygon className="iso-door-bar" points={quad(u0, u1, transom - bar, transom)} />
      <polygon
        className="iso-door-glass"
        points={quad(u0 + reveal, u1 - reveal, transom + bar * 0.5, v1 - h * 0.04)}
      />
      <polygon
        className="iso-door-lintel"
        points={quad(u0 - SURROUND - 0.012, u1 + SURROUND + 0.012, v1 + 0.012, v1 + LINTEL)}
      />
    </>
  );
}

function EntranceSteps({
  d,
  centreCol,
  centreRow,
  outCol,
  outRow,
  span,
  stone,
}: {
  d: DoorDimensions;
  centreCol: number;
  centreRow: number;
  outCol: number;
  outRow: number;
  span: number;
  stone: StonePalette;
}) {
  if (d.treads <= 0 || d.threshold <= 0) return null;
  const stepStone = stone.trim === 'none' ? stone.towerStone : stone.trim;
  const halfW = Math.min(d.widthTiles, span * 0.6) / 2 + STEP_OVERHANG;
  const rise = d.threshold / d.treads;
  const out: React.JSX.Element[] = [];
  for (let i = d.treads - 1; i >= 0; i--) {
    const depth = (d.treads - i) * TREAD_DEPTH;
    const col = outCol !== 0 ? centreCol : centreCol - halfW;
    const row = outRow !== 0 ? centreRow : centreRow - halfW;
    const w = outCol !== 0 ? depth : halfW * 2;
    const h = outRow !== 0 ? depth : halfW * 2;
    const f = boxFaces(col, row, w, h, 0, (i + 1) * rise);
    out.push(
      <g key={i}>
        {sideFaces(f, shade(stepStone, 0.82), shade(stepStone, 0.68))}
        <polygon className="iso-step-tread" points={polyPoints(f.top)} />
      </g>,
    );
  }
  return <>{out}</>;
}

function RoofBox({
  col,
  row,
  w,
  h,
  base,
  height,
  tint,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  height: number;
  tint: string;
}) {
  const f = boxFaces(col, row, w, h, base, height);
  return (
    <>
      {sideFaces(f, shade(tint, 0.66), shade(tint, 0.56))}
      <polygon points={polyPoints(f.top)} fill={shade(tint, 0.8)} />
    </>
  );
}

function WallBand({
  origin,
  along,
  wallHeight,
  from,
  to,
  className,
  u0 = 0,
  u1 = 1,
}: {
  origin: Pt;
  along: Pt;
  wallHeight: number;
  from: number;
  to: number;
  className: string;
  u0?: number;
  u1?: number;
}) {
  if (wallHeight <= 0) return null;
  const v0 = Math.max(0, from) / wallHeight;
  const v1 = Math.min(wallHeight, to) / wallHeight;
  if (v1 <= v0) return null;
  return (
    <polygon
      className={className}
      points={polyPoints([
        facePoint(origin, along, wallHeight, u0, v0),
        facePoint(origin, along, wallHeight, u1, v0),
        facePoint(origin, along, wallHeight, u1, v1),
        facePoint(origin, along, wallHeight, u0, v1),
      ])}
    />
  );
}

function gableEnds(f: BoxFaces, alongW: boolean, rs: Pt, re: Pt, pal: Palette) {
  const ends: Array<[FaceDir, Pt[]]> = alongW
    ? [
        ['negCol', [f.NWt, f.SWt, rs]],
        ['posCol', [f.NEt, f.SEt, re]],
      ]
    : [
        ['negRow', [f.NWt, f.NEt, rs]],
        ['posRow', [f.SWt, f.SEt, re]],
      ];
  return ends.map(([dir, pts]) =>
    wallOf(f, dir).visible ? (
      <polygon key={dir} points={polyPoints(pts)} fill={pal.wall[dir]} />
    ) : null,
  );
}

function HippedRoof({
  col,
  row,
  w,
  h,
  base,
  rise,
  pal,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  rise: number;
  pal: Palette;
}) {
  const alongW = w >= h;
  const inset = Math.min(w, h) / 2;
  const At = lift(project(col, row), base);
  const Bt = lift(project(col + w, row), base);
  const Ct = lift(project(col + w, row + h), base);
  const Dt = lift(project(col, row + h), base);
  const rs = alongW
    ? lift(project(col + inset, row + h / 2), base + rise)
    : lift(project(col + w / 2, row + inset), base + rise);
  const re = alongW
    ? lift(project(col + w - inset, row + h / 2), base + rise)
    : lift(project(col + w / 2, row + h - inset), base + rise);
  return (
    <>
      <polygon points={polyPoints(alongW ? [At, Bt, re, rs] : [At, Bt, rs])} fill={pal.negRow} />
      <polygon points={polyPoints(alongW ? [At, Dt, rs] : [At, Dt, re, rs])} fill={pal.negCol} />
      <polygon points={polyPoints(alongW ? [Dt, Ct, re, rs] : [Dt, Ct, re])} fill={pal.posRow} />
      <polygon points={polyPoints(alongW ? [Bt, Ct, re] : [Bt, Ct, re, rs])} fill={pal.posCol} />
      <line className="iso-ridge" x1={rs.x} y1={rs.y} x2={re.x} y2={re.y} />
    </>
  );
}

function EndPavilion({
  col,
  row,
  w,
  h,
  base,
  pal,
  stone,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  pal: Palette;
  stone: StonePalette;
}) {
  const f = boxFaces(col, row, w, h, base, END_PAVILION_RISE);
  const over = COPING_OVERHANG * 0.5;
  const cap = boxFaces(
    col - over,
    row - over,
    w + over * 2,
    h + over * 2,
    base + END_PAVILION_RISE,
    COPING * 0.8,
  );
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {sideFaces(cap, shade(stone.trim, 0.78), shade(stone.trim, 0.66))}
      <polygon points={polyPoints(cap.top)} fill={shade(stone.trim, 0.9)} />
    </>
  );
}

function pavilionWidth(span: number): number {
  return Math.min(span * 0.5, (span / baysAcross(span)) * PAVILION_BAYS);
}

function CentrePavilion({
  col,
  row,
  w,
  h,
  wallHeight,
  outward,
  pal,
  door,
  sills,
  paneW,
  paneShape,
  glass,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  wallHeight: number;
  outward: FaceDir;
  pal: Palette;
  door: DoorDimensions | null;
  sills: number[];
  paneW: number;
  paneShape: WindowShape;
  glass: string;
}) {
  const span = wallSpan(w, h, outward);
  const width = pavilionWidth(span);
  const top = wallHeight + PAVILION_RISE;
  const bay = againstWall(col, row, w, h, outward, span / 2 - width / 2, width, PAVILION_DEPTH);
  const f = boxFaces(bay.col, bay.row, bay.w, bay.h, 0, top);
  const faces = attachmentFaces(f, outward, pal);
  const front = { o: faces.front.origin, a: faces.front.along };
  const apex = lift(
    { x: (front.o.x + front.a.x) / 2, y: (front.o.y + front.a.y) / 2 },
    top + PEDIMENT_RISE,
  );
  const frontTopL = lift(front.o, top);
  const frontTopR = lift(front.a, top);
  return (
    <>
      <polygon points={polyPoints(faces.side)} fill={faces.sideFill} />
      <polygon
        points={polyPoints([front.o, front.a, frontTopR, frontTopL])}
        fill={faces.frontFill}
      />
      <WallBand
        origin={front.o}
        along={front.a}
        wallHeight={top}
        from={0}
        to={PLINTH}
        className="iso-plinth"
      />
      <WallBand
        origin={front.o}
        along={front.a}
        wallHeight={top}
        from={wallHeight - CORNICE}
        to={wallHeight}
        className="iso-cornice"
      />
      {windows(
        front.o,
        front.a,
        top,
        width,
        sills,
        paneW,
        'pv',
        paneShape,
        glass,
        door ? doorBay(door, width, top) : undefined,
      )}
      {door && <Door d={door} origin={front.o} along={front.a} wallHeight={top} span={width} />}
      <polygon points={polyPoints(f.top)} fill={pal.roofDeck} />
      <polygon className="iso-pediment" points={polyPoints([frontTopL, frontTopR, apex])} />
    </>
  );
}

// WHERE THE COLUMNS STAND. Evenly, unless the portico is standing in front
// of a door: then the middle bay is widened to the door's own width and the
// shafts divide either side of it (Phase 21D). A four-column portico on a
// small pavilion put two shafts across its own doorway, so the entrance
// read as a block of stone with no way in — which is what the playtest saw
// on the Classical residence halls, the dining hall and the admin building.
// Widening the centre is also what the order itself does: the middle
// intercolumniation of a real portico is the wide one.
function shaftOffsets(width: number, columns: number, centreBay: number): number[] {
  const plan = PORTICO_COLUMN_PLAN;
  const half = width / 2;
  const even = () => {
    const gap = (width - plan) / (columns - 1);
    return Array.from({ length: columns }, (_, i) => -half + plan / 2 + i * gap);
  };
  if (centreBay <= 0 || columns < 4 || columns % 2 !== 0) return even();
  const inner = centreBay / 2 + plan / 2;
  const outer = half - plan / 2;
  if (inner >= outer) return even();
  const side = columns / 2;
  const step = side === 1 ? 0 : (outer - inner) / (side - 1);
  const right = Array.from({ length: side }, (_, i) => inner + i * step);
  return [...right.map((v) => -v).reverse(), ...right];
}

function Portico({
  centreCol,
  centreRow,
  width,
  outward,
  stone,
  columns = PORTICO_COLUMNS,
  height = PORTICO_HEIGHT,
  pediment = false,
  centreBay = 0,
}: {
  centreCol: number;
  centreRow: number;
  width: number;
  outward: FaceDir;
  stone: StonePalette;
  columns?: number;
  height?: number;
  pediment?: boolean;
  // How much clear width to leave in the middle, in tiles: the door behind.
  centreBay?: number;
}) {
  if (columns < 2 || width <= 0) return null;
  const half = width / 2;
  const shafts = shaftOffsets(width, columns, centreBay).map((along) =>
    isRowWall(outward)
      ? { col: centreCol + along - PORTICO_COLUMN_PLAN / 2, row: centreRow }
      : { col: centreCol, row: centreRow + along - PORTICO_COLUMN_PLAN / 2 },
  );
  const ent = isRowWall(outward)
    ? boxFaces(
        centreCol - half,
        centreRow - COPING_OVERHANG,
        width,
        PORTICO_COLUMN_PLAN + COPING_OVERHANG * 2,
        height,
        ENTABLATURE,
      )
    : boxFaces(
        centreCol - COPING_OVERHANG,
        centreRow - half,
        PORTICO_COLUMN_PLAN + COPING_OVERHANG * 2,
        width,
        height,
        ENTABLATURE,
      );
  return (
    <>
      {depthOrder(
        shafts.map((c) => ({ ...c, w: PORTICO_COLUMN_PLAN, h: PORTICO_COLUMN_PLAN })),
      ).map((c, i) => {
        const f = boxFaces(c.col, c.row, c.w, c.h, 0, height);
        return (
          <g key={i}>
            {sideFaces(f, shade(stone.towerStone, 0.96), shade(stone.towerStone, 0.78))}
            <polygon points={polyPoints(f.top)} fill={stone.towerStone} />
          </g>
        );
      })}
      {sideFaces(ent, shade(stone.towerStone, 0.92), shade(stone.towerStone, 0.74))}
      <polygon points={polyPoints(ent.top)} fill={shade(stone.towerStone, 1.02)} />
      {pediment &&
        (() => {
          const top = ENTABLATURE;
          const frontWall = wallOf(ent, outward);
          const [fo, fa] = [frontWall.origin, frontWall.along];
          const frontIsLeft = ent.dir.CD === outward;
          const mid = { x: (fo.x + fa.x) / 2, y: (fo.y + fa.y) / 2 };
          const apex = lift(mid, top + PEDIMENT_RISE);
          const inset = (q: Pt, sign: number) => ({ x: q.x + sign * 6, y: q.y });
          return (
            <>
              <polygon
                points={polyPoints([lift(fo, top), lift(fa, top), apex])}
                fill={shade(stone.towerStone, frontIsLeft ? 0.98 : 0.8)}
              />
              <polygon
                points={polyPoints([
                  inset(lift(fo, top + up(0.35)), 1),
                  inset(lift(fa, top + up(0.35)), -1),
                  lift(mid, top + PEDIMENT_RISE - up(0.4)),
                ])}
                fill={shade(stone.towerStone, frontIsLeft ? 0.86 : 0.7)}
              />
            </>
          );
        })()}
    </>
  );
}

function Porch({
  col,
  row,
  w,
  h,
  wallHeight,
  outward,
  pal,
  stone,
  door,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  wallHeight: number;
  outward: FaceDir;
  pal: Palette;
  stone: StonePalette;
  // The hall's own door, put INSIDE the porch's arch. Without it the arch
  // was a flat black void: no leaf, no reveal, no glass (Phase 21D).
  door: DoorDimensions | null;
}) {
  const span = wallSpan(w, h, outward);
  const width = pavilionWidth(span);
  const top = wallHeight * PORCH_HEIGHT_FRACTION;
  const bayAlong = span / 2 - width / 2;
  const bay = againstWall(col, row, w, h, outward, bayAlong, width, PAVILION_DEPTH);
  const f = boxFaces(bay.col, bay.row, bay.w, bay.h, 0, top);
  const faces = attachmentFaces(f, outward, pal);
  const front = { o: faces.front.origin, a: faces.front.along };
  const frontTopL = lift(front.o, top);
  const frontTopR = lift(front.a, top);
  const apex = lift(
    { x: (front.o.x + front.a.x) / 2, y: (front.o.y + front.a.y) / 2 },
    top + PORCH_GABLE_RISE,
  );
  const buttress = (nearSide: boolean) => {
    const along0 = bayAlong + (nearSide ? 0 : width - BUTTRESS_PLAN);
    const lowH = top * BUTTRESS_SETOFF_FRACTION;
    const lo = againstWall(col, row, w, h, outward, along0, BUTTRESS_PLAN, PAVILION_DEPTH);
    const lower = boxFaces(lo.col, lo.row, lo.w, lo.h, 0, lowH);
    const shrink = PAVILION_DEPTH * BUTTRESS_SETOFF_DEPTH;
    const hi = againstWall(col, row, w, h, outward, along0, BUTTRESS_PLAN, PAVILION_DEPTH - shrink);
    const upper = boxFaces(hi.col, hi.row, hi.w, hi.h, lowH, top - lowH);
    return (
      <>
        <polygon points={polyPoints(lower.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(lower.right)} fill={pal.wallRight} />
        <polygon points={polyPoints(lower.top)} fill={shade(stone.trim, 0.88)} />
        <polygon points={polyPoints(upper.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(upper.right)} fill={pal.wallRight} />
        <polygon points={polyPoints(upper.top)} fill={shade(stone.trim, 0.94)} />
      </>
    );
  };
  const archU0 = 0.5 - PORCH_ARCH_WIDTH / 2;
  const archU1 = 0.5 + PORCH_ARCH_WIDTH / 2;
  const REVEAL = 0.022;
  return (
    <>
      {buttress(false)}
      <polygon points={polyPoints(faces.side)} fill={faces.sideFill} />
      <polygon
        points={polyPoints([front.o, front.a, frontTopR, frontTopL])}
        fill={faces.frontFill}
      />
      <WallBand
        origin={front.o}
        along={front.a}
        wallHeight={top}
        from={0}
        to={PLINTH}
        className="iso-plinth"
      />
      {/* The order: a lancet reveal cut back into the porch, then the door
          itself standing in it, at the arch's own proportions rather than
          the wall's — a porch is built around its doorway. */}
      <polygon
        className="iso-door-surround"
        points={polyPoints(
          windowOutline(
            'lancet',
            archU0 - REVEAL,
            archU1 + REVEAL,
            0,
            PORCH_ARCH_HEIGHT + REVEAL,
          ).map(([u, v]) => facePoint(front.o, front.a, top, u, v)),
        )}
      />
      <Door
        d={{
          family: door?.family ?? 'formal',
          widthTiles: (archU1 - archU0) * width,
          height: PORCH_ARCH_HEIGHT * top,
          threshold: 0,
          treads: door?.treads ?? 0,
        }}
        origin={front.o}
        along={front.a}
        wallHeight={top}
        span={width}
        shape="lancet"
      />
      <polygon points={polyPoints(f.top)} fill={pal.roofDeck} />
      <polygon points={polyPoints([frontTopL, frontTopR, apex])} fill={shade(pal.roof, 1.04)} />
      {buttress(true)}
    </>
  );
}

function Arcade({
  col,
  row,
  w,
  h,
  outward,
  pal,
  stone,
  height = ARCADE_HEIGHT,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  outward: FaceDir;
  pal: Palette;
  stone: StonePalette;
  height?: number;
}) {
  const span = wallSpan(w, h, outward);
  const bays = Math.max(
    2,
    Math.min(ARCADE_MAX, Math.round((span * METRES_PER_TILE) / ARCADE_BAY_METRES)),
  );
  const walk = againstWall(col, row, w, h, outward, 0, span, ARCADE_DEPTH);
  const piers = depthOrder(
    Array.from({ length: bays + 1 }, (_, i) => {
      const at = Math.min(Math.max((i / bays) * span - ARCADE_PIER / 2, 0), span - ARCADE_PIER);
      return againstWall(col, row, w, h, outward, at, ARCADE_PIER, ARCADE_DEPTH);
    }),
  );
  const front = boxFaces(walk.col, walk.row, walk.w, walk.h, 0, height);
  const frontWall = wallOf(front, outward);
  const o = frontWall.origin;
  const a = frontWall.along;
  const RISE = up(1.3);
  const roof = leanToRoof(front, outward, height, RISE, pal);
  return (
    <>
      <polygon className="iso-undercroft" points={polyPoints(frontWall.poly)} />
      {Array.from({ length: bays }, (_, i) => {
        const u0 = (i + 0.09) / bays;
        const u1 = (i + 0.91) / bays;
        return (
          <polygon
            key={i}
            className="iso-undercroft"
            points={polyPoints(
              windowOutline('arched', u0, u1, 0.02, 0.9).map(([u, v]) =>
                facePoint(o, a, height, u, v),
              ),
            )}
          />
        );
      })}
      {piers.map((p, i) => {
        const f = boxFaces(p.col, p.row, p.w, p.h, 0, height);
        return <g key={i}>{sideFaces(f, shade(stone.trim, 0.94), shade(stone.trim, 0.76))}</g>;
      })}
      <polygon points={polyPoints(roof.endCap)} fill={roof.endCapFill} />
      <polygon points={polyPoints(roof.leanTo)} fill={roof.leanToFill} />
      <WallBand
        origin={o}
        along={a}
        wallHeight={height}
        from={height - COPING * 0.7}
        to={height}
        className="iso-cornice"
      />
    </>
  );
}
function arcadeHeight(wallHeight: number): number {
  return Math.min(ARCADE_HEIGHT, wallHeight - EAVES_COURSE - COPING - up(0.4));
}
function arcadeFits(wallHeight: number): boolean {
  return wallHeight >= STOREY * 1.6;
}

function Campanile({
  col,
  row,
  w,
  h,
  base,
  stone,
  pal,
  gilded,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  stone: StonePalette;
  pal: Palette;
  gilded: boolean;
}) {
  const plan = Math.min(CAMPANILE_PLAN, Math.min(w, h) * 0.38);
  const cc = col + w / 2;
  const cr = row + h / 2;
  const shaft = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, CAMPANILE_RISE);
  const belfryBase = base + CAMPANILE_RISE;
  const belfry = boxFaces(
    cc - plan / 2,
    cr - plan / 2,
    plan,
    plan,
    belfryBase,
    CAMPANILE_BELFRY_RISE,
  );
  const capBase = belfryBase + CAMPANILE_BELFRY_RISE;
  const At = lift(project(cc - plan / 2, cr - plan / 2), capBase);
  const Bt = lift(project(cc + plan / 2, cr - plan / 2), capBase);
  const Ct = lift(project(cc + plan / 2, cr + plan / 2), capBase);
  const Dt = lift(project(cc - plan / 2, cr + plan / 2), capBase);
  const tip = lift(project(cc, cr), capBase + CAMPANILE_CAP_RISE);
  const faces: Array<[Pt, Pt, number]> = [
    [At, Dt, 1.1],
    [At, Bt, 1.0],
    [Dt, Ct, 0.84],
    [Bt, Ct, 0.7],
  ];
  return (
    <>
      {sideFaces(shaft, shade(stone.towerStone, 0.97), shade(stone.towerStone, 0.8))}
      {sideFaces(belfry, shade(stone.towerStone, 0.93), shade(stone.towerStone, 0.77))}
      {[[belfry.D, belfry.C, 'cl'] as const, [belfry.C, belfry.B, 'cr'] as const].map(
        ([bo, ba, k]) =>
          [[0.14, 0.46] as const, [0.54, 0.86] as const].map(([u0, u1]) => (
            <polygon
              key={`${k}${u0}`}
              className="iso-undercroft"
              points={polyPoints(
                windowOutline('arched', u0, u1, 0.1, 0.9).map(([u, v]) =>
                  facePoint(bo, ba, CAMPANILE_BELFRY_RISE, u, v),
                ),
              )}
            />
          )),
      )}
      {faces.map(([fa, fb, k], i) => (
        <polygon key={i} points={polyPoints([fa, fb, tip])} fill={shade(pal.roof, k)} />
      ))}
      {gilded && <circle className="iso-dome" cx={tip.x} cy={tip.y - 3} r={2} fill={stone.gilt} />}
    </>
  );
}

function Archway({
  d,
  col,
  row,
  w,
  h,
  outward,
  wallHeight,
  pal,
  stone,
}: {
  d: DoorDimensions;
  col: number;
  row: number;
  w: number;
  h: number;
  outward: FaceDir;
  wallHeight: number;
  pal: Palette;
  stone: StonePalette;
}) {
  const top = Math.min(d.threshold + d.height + up(1.5), wallHeight - EAVES_COURSE - up(1.4));
  if (top <= d.threshold + d.height * 0.6) return null;
  const width = Math.max(d.widthTiles * 2.3, across(4.5));
  const span = wallSpan(w, h, outward);
  const porch = againstWall(col, row, w, h, outward, span / 2 - width / 2, width, PAVILION_DEPTH);
  const f = boxFaces(porch.col, porch.row, porch.w, porch.h, 0, top);
  const frontWall = wallOf(f, outward);
  const o = frontWall.origin;
  const a = frontWall.along;
  const roof = leanToRoof(f, outward, top, up(1.1), pal);
  const floor = d.threshold / top;
  const outline = (u0: number, u1: number, v1: number) =>
    polyPoints(
      windowOutline('arched', u0, u1, floor, v1).map(([u, v]) => facePoint(o, a, top, u, v)),
    );
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      <polygon points={outline(0.17, 0.83, 0.94)} fill={stone.trim} />
      <polygon className="iso-undercroft" points={outline(0.21, 0.79, 0.9)} />
      <polygon points={polyPoints(roof.endCap)} fill={roof.endCapFill} />
      <polygon points={polyPoints(roof.leanTo)} fill={roof.leanToFill} />
    </>
  );
}

function BellGable({
  origin,
  along,
  inward,
  wallHeight,
  span,
  centreU,
  sideAt,
  pal,
  stone,
  scale = 1,
}: {
  origin: Pt;
  along: Pt;
  inward: { origin: Pt; along: Pt };
  wallHeight: number;
  span: number;
  centreU: number;
  sideAt: 'u0' | 'u1';
  pal: Palette;
  stone: StonePalette;
  scale?: number;
}) {
  const at = (u: number, v: number) => facePoint(origin, along, wallHeight, u, v);
  const back = (u: number, v: number) => facePoint(inward.origin, inward.along, wallHeight, u, v);
  const widthTiles = Math.min(span * 0.36, across(10.5 * scale));
  const hw = widthTiles / span / 2;
  const u0 = centreU - hw;
  const u1 = centreU + hw;
  const V = (m: number) => 1 + up(m * scale) / wallHeight;
  const shoulder = V(1.4);
  const neck = V(4.0);
  const top = V(6.4);
  const peak = V(7.3);
  const q = hw * 0.48;
  const cove = (from: number, dir: 1 | -1): Array<[number, number]> =>
    Array.from({ length: 6 }, (_, i) => {
      const t = ((i + 1) / 6) * (Math.PI / 2);
      return [from + dir * q * (1 - Math.cos(t)), shoulder + (neck - shoulder) * Math.sin(t)];
    });
  const profile: Array<[number, number]> = [
    [u0, 1],
    [u0, shoulder],
    ...cove(u0, 1),
    [u0 + q, top],
    [centreU, peak],
    [u1 - q, top],
    ...cove(u1, -1).reverse(),
    [u1, shoulder],
    [u1, 1],
  ];
  const su = sideAt === 'u1' ? u1 : u0;
  const nu = sideAt === 'u1' ? u1 - q : u0 + q;
  const face = sideAt === 'u1' ? pal.wallLeft : pal.wallRight;
  const ret = sideAt === 'u1' ? pal.wallRight : pal.wallLeft;
  const bellU = hw * 0.3;
  const opening = windowOutline('arched', centreU - bellU, centreU + bellU, V(0.9), V(5.5));
  const finial = at(centreU, peak);
  const finialRise = wallHeight * (V(0.7) - 1);
  return (
    <>
      <polygon
        points={polyPoints([at(su, 1), at(su, shoulder), back(su, shoulder), back(su, 1)])}
        fill={ret}
      />
      <polygon
        points={polyPoints([at(nu, neck), at(nu, top), back(nu, top), back(nu, neck)])}
        fill={ret}
      />
      <polygon points={polyPoints(profile.map(([u, v]) => at(u, v)))} fill={face} />
      <polygon className="iso-undercroft" points={polyPoints(opening.map(([u, v]) => at(u, v)))} />
      <polygon
        points={polyPoints([
          at(centreU - bellU * 0.5, V(2.0)),
          at(centreU + bellU * 0.5, V(2.0)),
          at(centreU + bellU * 0.22, V(3.7)),
          at(centreU - bellU * 0.22, V(3.7)),
        ])}
        fill={stone.gilt}
      />
      <line
        x1={finial.x}
        y1={finial.y}
        x2={finial.x}
        y2={lift(finial, finialRise).y}
        stroke={stone.gilt}
        strokeWidth={1.2}
      />
      <circle cx={finial.x} cy={lift(finial, finialRise).y} r={1.6} fill={stone.gilt} />
    </>
  );
}

function Buttresses({
  col,
  row,
  w,
  h,
  height,
  outward,
  pal,
  stone,
  reserve,
  skipNear = 0,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  height: number;
  outward: FaceDir;
  pal: Palette;
  stone: StonePalette;
  reserve?: [number, number];
  skipNear?: number;
}) {
  const span = wallSpan(w, h, outward);
  const bays = baysAcross(span);
  if (bays < 2) return null;
  const depth = across(0.85);
  const shrink = depth * 0.42;
  const lowH = height * 0.5;
  const midH = height * 0.82;
  const out: React.JSX.Element[] = [];
  for (let b = 1; b < bays; b++) {
    const u = b / bays;
    if (reserve && u > reserve[0] - 0.03 && u < reserve[1] + 0.03) continue;
    const along = u * span;
    if (
      skipNear > 0 &&
      (outward === 'posRow' || outward === 'posCol') &&
      along > span - skipNear - BUTTRESS_PLAN
    )
      continue;
    const lo = againstWall(
      col,
      row,
      w,
      h,
      outward,
      along - BUTTRESS_PLAN / 2,
      BUTTRESS_PLAN,
      depth,
    );
    const lower = boxFaces(lo.col, lo.row, lo.w, lo.h, 0, lowH);
    const hi = againstWall(
      col,
      row,
      w,
      h,
      outward,
      along - BUTTRESS_PLAN / 2,
      BUTTRESS_PLAN,
      depth - shrink,
    );
    const upper = boxFaces(hi.col, hi.row, hi.w, hi.h, lowH, midH - lowH);
    out.push(
      <g key={`${outward}${b}`}>
        <polygon points={polyPoints(lower.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(lower.right)} fill={pal.wallRight} />
        <polygon points={polyPoints(lower.top)} fill={shade(stone.trim, 0.88)} />
        <polygon points={polyPoints(upper.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(upper.right)} fill={pal.wallRight} />
        <polygon points={polyPoints(upper.top)} fill={shade(stone.trim, 0.94)} />
      </g>,
    );
  }
  return <>{out}</>;
}

function Merlons({
  col,
  row,
  w,
  h,
  base,
  outward,
  pal,
  block = across(1.1),
  gap = across(0.9),
  rise = up(1.0),
  depth = across(0.5),
  fill,
  rail = false,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  outward: FaceDir;
  pal: Palette;
  block?: number;
  gap?: number;
  rise?: number;
  depth?: number;
  fill?: string;
  rail?: boolean;
}) {
  const span = wallSpan(w, h, outward);
  const n = Math.max(1, Math.floor((span - gap) / (block + gap)));
  const start = (span - (n * block + (n - 1) * gap)) / 2;
  const left = fill ? shade(fill, 0.96) : pal.wallLeft;
  const right = fill ? shade(fill, 0.8) : pal.wallRight;
  const top = fill ? fill : shade(pal.wallLeft, 1.08);
  const rb = againstWall(col, row, w, h, outward, start, span - start * 2, depth, depth);
  const railBox = boxFaces(rb.col, rb.row, rb.w, rb.h, base + rise, rise * 0.22);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const b = againstWall(
          col,
          row,
          w,
          h,
          outward,
          start + i * (block + gap),
          block,
          depth,
          depth,
        );
        const f = boxFaces(b.col, b.row, b.w, b.h, base, rise);
        return (
          <g key={i}>
            <polygon points={polyPoints(f.left)} fill={left} />
            <polygon points={polyPoints(f.right)} fill={right} />
            <polygon points={polyPoints(f.top)} fill={top} />
          </g>
        );
      })}
      {rail && (
        <>
          <polygon points={polyPoints(railBox.left)} fill={left} />
          <polygon points={polyPoints(railBox.right)} fill={right} />
          <polygon points={polyPoints(railBox.top)} fill={top} />
        </>
      )}
    </>
  );
}

function Balustrade({
  col,
  row,
  w,
  h,
  base,
  outward,
  pal,
  stone,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  outward: FaceDir;
  pal: Palette;
  stone: StonePalette;
}) {
  return (
    <Merlons
      col={col}
      row={row}
      w={w}
      h={h}
      base={base}
      outward={outward}
      pal={pal}
      block={across(0.32)}
      gap={across(0.5)}
      rise={up(0.95)}
      depth={across(0.32)}
      fill={stone.trim}
      rail
    />
  );
}

function Dome({
  col,
  row,
  w,
  h,
  base,
  stone,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  stone: StonePalette;
}) {
  const r = Math.min(across(9.5), Math.min(w, h) * 0.26);
  const cc = col + w / 2;
  const cr = row + h / 2;
  const DRUM = up(5.0);
  const RISE = up(6.5);
  const centre = project(cc, cr);
  const ring = projectedCircle(cc, cr, r, 48);
  const front = ring.filter((p) => p.y >= centre.y - 0.01).sort((a, b) => a.x - b.x);
  const lit = front.filter((p) => p.x <= centre.x + 0.01);
  const dark = front.filter((p) => p.x >= centre.x - 0.01);
  const wall = (pts: Pt[]) =>
    polyPoints([
      ...pts.map((p) => lift(p, base)),
      ...[...pts].reverse().map((p) => lift(p, base + DRUM)),
    ]);
  const rx = (Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x))) / 2;
  const top = lift(centre, base + DRUM);
  const cap = (scale: number, dx: number): string => {
    const pts: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      pts.push(
        `${(top.x + dx + Math.cos(a) * rx * scale).toFixed(2)},${(top.y + Math.sin(a) * RISE * scale * heightScale()).toFixed(2)}`,
      );
    }
    return pts.join(' ');
  };
  const lanternFoot = lift(top, RISE);
  return (
    <>
      <polygon points={wall(lit)} fill={shade(stone.towerStone, 0.97)} />
      <polygon points={wall(dark)} fill={shade(stone.towerStone, 0.8)} />
      <polygon
        points={polyPoints(ring.map((p) => lift(p, base + DRUM)))}
        fill={shade(stone.towerStone, 0.9)}
      />
      <polygon points={cap(1, 0)} fill={shade(stone.towerStone, 0.86)} />
      <polygon points={cap(0.78, -rx * 0.12)} fill={shade(stone.towerStone, 0.96)} />
      <rect
        x={lanternFoot.x - 3}
        y={lanternFoot.y - 7}
        width={6}
        height={8}
        fill={shade(stone.towerStone, 0.92)}
      />
      <line
        className="iso-finial"
        x1={lanternFoot.x}
        y1={lanternFoot.y - 7}
        x2={lanternFoot.x}
        y2={lanternFoot.y - 14}
        stroke={stone.gilt}
      />
      <circle cx={lanternFoot.x} cy={lanternFoot.y - 14} r={1.8} fill={stone.gilt} />
    </>
  );
}

function CornerTower({
  col,
  row,
  plan,
  height,
  pal,
  glass,
  sills,
  paneW,
  crenels,
  capRise,
}: {
  col: number;
  row: number;
  plan: number;
  height: number;
  pal: Palette;
  glass: string;
  sills: number[];
  paneW: number;
  crenels: boolean;
  capRise: number;
}) {
  const f = boxFaces(col, row, plan, plan, 0, height);
  const At = lift(project(col, row), height);
  const Bt = lift(project(col + plan, row), height);
  const Ct = lift(project(col + plan, row + plan), height);
  const Dt = lift(project(col, row + plan), height);
  const tip = lift(project(col + plan / 2, row + plan / 2), height + capRise);
  const faces: Array<[Pt, Pt, number]> = [
    [At, Dt, 1.1],
    [At, Bt, 1.0],
    [Dt, Ct, 0.84],
    [Bt, Ct, 0.7],
  ];
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {windows(f.D, f.C, height, f.spanLeft, sills, paneW * 0.6, 'tl', 'lancet', glass)}
      {windows(f.C, f.B, height, f.spanRight, sills, paneW * 0.6, 'tr', 'lancet', glass)}
      <WallBand
        origin={f.D}
        along={f.C}
        wallHeight={height}
        from={height - CORNICE}
        to={height}
        className="iso-cornice"
      />
      <WallBand
        origin={f.C}
        along={f.B}
        wallHeight={height}
        from={height - CORNICE}
        to={height}
        className="iso-cornice"
      />
      <polygon points={polyPoints(f.top)} fill={pal.roofDeck} />
      {!crenels &&
        faces.map(([a, b, k], i) => (
          <polygon key={i} points={polyPoints([a, b, tip])} fill={shade(pal.roof, k)} />
        ))}
      {crenels &&
        [visibleWalls().left, visibleWalls().right].map((dir) => (
          <Merlons
            key={dir}
            col={col}
            row={row}
            w={plan}
            h={plan}
            base={height}
            outward={dir}
            pal={pal}
          />
        ))}
    </>
  );
}

function StairCore({
  col,
  row,
  w,
  h,
  base,
  stone,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  stone: StonePalette;
}) {
  // A SERVICE CORE, not a slab (Phase 21D). It was a pale box with a paler
  // box on it, in two shades a few per cent apart, which at any zoom read as
  // one white rectangle standing on the roof. A core is a shaft with the
  // stairs glazed up one side, a parapet at its head and a slab that
  // overhangs — which is three pieces of geometry and reads as a building
  // rather than a gap in the picture.
  const plan = Math.min(CORE_PLAN, Math.min(w, h) * 0.34);
  const cc = col + w / 2;
  const cr = row + h / 2;
  const shaft = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, CORE_RISE);
  const capPlan = plan * 1.16;
  const cap = boxFaces(
    cc - capPlan / 2,
    cr - capPlan / 2,
    capPlan,
    capPlan,
    base + CORE_RISE,
    CORE_CAP_RISE * 0.45,
  );
  const slot = (origin: Pt, along: Pt, id: string) => (
    <CurtainWall
      key={id}
      origin={origin}
      along={along}
      wallHeight={CORE_RISE}
      spanTiles={plan}
      from={CORE_RISE * 0.12}
      to={CORE_RISE * 0.86}
      floors={[]}
      id={id}
      u0={0.3}
      u1={0.7}
    />
  );
  return (
    <>
      {sideFaces(shaft, shade(stone.towerStone, 1.0), shade(stone.towerStone, 0.68))}
      <polygon points={polyPoints(shaft.top)} fill={shade(stone.towerStone, 0.84)} />
      {slot(shaft.D, shaft.C, 'corel')}
      {slot(shaft.C, shaft.B, 'corer')}
      {/* the parapet the slab sits on */}
      {[[shaft.D, shaft.C] as const, [shaft.C, shaft.B] as const].map(([o, a], i) => (
        <WallBand
          key={`cb${i}`}
          origin={o}
          along={a}
          wallHeight={CORE_RISE}
          from={CORE_RISE * 0.88}
          to={CORE_RISE}
          className="iso-parapet"
        />
      ))}
      {sideFaces(cap, shade(stone.towerStone, 0.74), shade(stone.towerStone, 0.58))}
      <polygon points={polyPoints(cap.top)} fill={shade(stone.towerStone, 0.92)} />
    </>
  );
}

function Piers({
  col,
  row,
  w,
  h,
  height,
  outward,
  pal,
  stone,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  height: number;
  outward: FaceDir;
  pal: Palette;
  stone: StonePalette;
}) {
  const span = wallSpan(w, h, outward);
  const count = Math.max(2, Math.round((span * METRES_PER_TILE) / (BAY_METRES * 2)));
  const plan = across(PIER_WIDTH_METRES);
  return (
    <>
      {Array.from({ length: count + 1 }, (_, i) => {
        const pier = againstWall(
          col,
          row,
          w,
          h,
          outward,
          (i / count) * span - plan / 2,
          plan,
          PIER_PROJECTION,
        );
        const f = boxFaces(pier.col, pier.row, pier.w, pier.h, 0, height);
        return (
          <g key={i}>
            <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
            <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
            <polygon points={polyPoints(f.top)} fill={shade(stone.trim, 0.86)} />
          </g>
        );
      })}
    </>
  );
}

function Canopy({
  d,
  col,
  row,
  w,
  h,
  outward,
  wallHeight,
  stone,
  hood = false,
  roof,
}: {
  d: DoorDimensions;
  col: number;
  row: number;
  w: number;
  h: number;
  outward: FaceDir;
  wallHeight: number;
  stone: StonePalette;
  hood?: boolean;
  roof?: string;
}) {
  const canopyStone = stone.trim === 'none' ? stone.towerStone : stone.trim;
  const top = Math.min(d.threshold + d.height + up(0.6), wallHeight - EAVES_COURSE - CANOPY_SLAB);
  if (top <= d.threshold + d.height * 0.5) return null;
  const width = d.widthTiles * 1.7;
  const span = wallSpan(w, h, outward);
  const mid = span / 2;
  const plate = againstWall(col, row, w, h, outward, mid - width / 2, width, CANOPY_DEPTH);
  const slabT = CANOPY_SLAB * 0.55;
  const slab = boxFaces(plate.col, plate.row, plate.w, plate.h, top, slabT);
  const postAt = (sign: number) => {
    const along0 = mid + (sign < 0 ? -width / 2 : width / 2 - CANOPY_POST);
    const post = againstWall(
      col,
      row,
      w,
      h,
      outward,
      along0,
      CANOPY_POST,
      CANOPY_POST,
      -(CANOPY_DEPTH - CANOPY_POST),
    );
    return boxFaces(post.col, post.row, post.w, post.h, 0, top);
  };
  const shadowAt = shadowOffset(top);
  const shadow = boxFaces(
    plate.col + shadowAt.dcol,
    plate.row + shadowAt.drow,
    plate.w,
    plate.h,
    0,
    0,
  ).top;
  const gable =
    hood && roof
      ? (() => {
          const rise = up(1.2);
          const f = slab;
          const rIn = outsideWall(col, row, w, h, outward, mid, 0);
          const rOut = outsideWall(col, row, w, h, outward, mid, CANOPY_DEPTH);
          const ridgeIn = lift(project(rIn.col, rIn.row), top + rise);
          const ridgeOut = lift(project(rOut.col, rOut.row), top + rise);
          const halves: Array<[Pt[], number]> = isRowWall(outward)
            ? [
                [[f.NWt, ridgeIn, ridgeOut, f.SWt], 1.12],
                [[f.NEt, ridgeIn, ridgeOut, f.SEt], 0.84],
              ]
            : [
                [[f.NWt, ridgeIn, ridgeOut, f.NEt], 1.0],
                [[f.SWt, ridgeIn, ridgeOut, f.SEt], 0.7],
              ];
          const end = wallOf(f, outward);
          return (
            <>
              {halves.map(([pts, k], i) => (
                <polygon key={i} points={polyPoints(pts)} fill={shade(roof, k)} />
              ))}
              <polygon
                points={polyPoints([lift(end.origin, slabT), lift(end.along, slabT), ridgeOut])}
                fill={shade(canopyStone, 0.8)}
              />
            </>
          );
        })()
      : null;
  return (
    <>
      <polygon className="campus-building-shadow" points={polyPoints(shadow)} />
      {[-1, 1].map((sign) => (
        <g key={sign}>
          {sideFaces(postAt(sign), shade(canopyStone, 0.62), shade(canopyStone, 0.5))}
        </g>
      ))}
      {sideFaces(slab, shade(canopyStone, 0.66), shade(canopyStone, 0.56))}
      <polygon points={polyPoints(slab.top)} fill={shade(canopyStone, 0.9)} />
      {gable}
    </>
  );
}

function CurtainWall({
  origin,
  along,
  wallHeight,
  spanTiles,
  from,
  to,
  floors,
  id,
  u0 = 0,
  u1 = 1,
}: {
  origin: Pt;
  along: Pt;
  wallHeight: number;
  spanTiles: number;
  from: number;
  to?: number;
  floors: number[];
  id: string;
  u0?: number;
  u1?: number;
}) {
  if (wallHeight <= 0 || spanTiles <= 0 || u1 <= u0) return null;
  const v0 = from / wallHeight;
  const v1 = Math.min(1, (to ?? wallHeight) / wallHeight);
  if (v1 <= v0) return null;
  const quad = (a0: number, a1: number, a: number, b: number) =>
    polyPoints([
      facePoint(origin, along, wallHeight, a0, a),
      facePoint(origin, along, wallHeight, a1, a),
      facePoint(origin, along, wallHeight, a1, b),
      facePoint(origin, along, wallHeight, a0, b),
    ]);
  const bays = Math.max(1, Math.round(baysAcross(spanTiles) * (u1 - u0)));
  const mullion = Math.min(0.16 / bays, 0.01) * (u1 - u0);
  const transom = (FLOOR_COURSE * 0.35) / wallHeight;
  return (
    <>
      <polygon className="iso-curtain-glass" points={quad(u0, u1, v0, v1)} />
      {Array.from({ length: bays + 1 }, (_, i) => {
        const u = u0 + (i / bays) * (u1 - u0);
        return (
          <polygon
            key={`${id}m${i}`}
            className="iso-mullion"
            points={quad(Math.max(u0, u - mullion), Math.min(u1, u + mullion), v0, v1)}
          />
        );
      })}
      {floors
        .filter((at) => at > from && at / wallHeight < v1)
        .map((at, i) => (
          <polygon
            key={`${id}t${i}`}
            className="iso-mullion"
            points={quad(u0, u1, at / wallHeight - transom, at / wallHeight + transom)}
          />
        ))}
    </>
  );
}

function ClockTower({
  col,
  row,
  w,
  h,
  base,
  stone,
  apex,
  gilded,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  stone: StonePalette;
  apex: ApexPart;
  gilded: boolean;
}) {
  const plan = Math.min(TOWER_BASE_PLAN, Math.min(w, h) * 0.42);
  const drumPlan = plan * (TOWER_DRUM_PLAN / TOWER_BASE_PLAN);
  const cc = col + w / 2;
  const cr = row + h / 2;
  const shaft = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, TOWER_BASE_RISE);
  const drumBase = base + TOWER_BASE_RISE;
  const drum = boxFaces(
    cc - drumPlan / 2,
    cr - drumPlan / 2,
    drumPlan,
    drumPlan,
    drumBase,
    TOWER_DRUM_RISE,
  );
  const clock = (origin: Pt, along: Pt, key: string) => {
    const ru = CLOCK_RADIUS_TILES / plan;
    const rv = CLOCK_RADIUS / TOWER_BASE_RISE;
    const pts: Pt[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(
        facePoint(origin, along, TOWER_BASE_RISE, 0.5 + Math.cos(a) * ru, 0.56 + Math.sin(a) * rv),
      );
    }
    const centre = facePoint(origin, along, TOWER_BASE_RISE, 0.5, 0.56);
    const hand = (fu: number, fv: number) =>
      facePoint(origin, along, TOWER_BASE_RISE, 0.5 + ru * fu, 0.56 + rv * fv);
    const big = hand(0.1, 0.62);
    const small = hand(0.5, -0.18);
    return (
      <g key={key}>
        <polygon className="iso-clock-face" points={polyPoints(pts)} />
        <line className="iso-clock-hand" x1={centre.x} y1={centre.y} x2={big.x} y2={big.y} />
        <line className="iso-clock-hand" x1={centre.x} y1={centre.y} x2={small.x} y2={small.y} />
      </g>
    );
  };
  const domeCentre = lift(project(cc, cr), drumBase + TOWER_DRUM_RISE);
  const domeR = (drumPlan / 2) * 64 * 0.55;
  const dome: string[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI + (i / 18) * Math.PI;
    dome.push(
      `${(domeCentre.x + Math.cos(a) * domeR).toFixed(2)},${(domeCentre.y + Math.sin(a) * TOWER_DOME_RISE * heightScale()).toFixed(2)}`,
    );
  }
  const finialFoot = lift(domeCentre, TOWER_DOME_RISE);
  return (
    <>
      {sideFaces(shaft, shade(stone.towerStone, 0.98), shade(stone.towerStone, 0.82))}
      <WallBand
        origin={shaft.D}
        along={shaft.C}
        wallHeight={TOWER_BASE_RISE}
        from={TOWER_BASE_RISE - CORNICE}
        to={TOWER_BASE_RISE}
        className="iso-cornice"
      />
      <WallBand
        origin={shaft.C}
        along={shaft.B}
        wallHeight={TOWER_BASE_RISE}
        from={TOWER_BASE_RISE - CORNICE}
        to={TOWER_BASE_RISE}
        className="iso-cornice"
      />
      {clock(shaft.D, shaft.C, 'cl')}
      {clock(shaft.C, shaft.B, 'cr')}
      <polygon points={polyPoints(shaft.top)} fill={shade(stone.towerStone, 0.9)} />
      {apex === 'cupola' && (
        <>
          {sideFaces(drum, shade(stone.towerStone, 0.9), shade(stone.towerStone, 0.76))}
          {(() => {
            const cp = drumPlan * 0.16;
            const dc = cc - drumPlan / 2;
            const dr = cr - drumPlan / 2;
            const shafts = [
              [dc, dr + drumPlan - cp],
              [dc + drumPlan - cp, dr + drumPlan - cp],
              [dc + drumPlan - cp, dr],
              [dc + drumPlan / 2 - cp / 2, dr + drumPlan - cp],
              [dc + drumPlan - cp, dr + drumPlan / 2 - cp / 2],
            ] as const;
            return depthOrder(shafts.map(([c, r]) => ({ col: c, row: r, w: cp, h: cp }))).map(
              (c, i) => {
                const sf = boxFaces(c.col, c.row, c.w, c.h, drumBase, TOWER_DRUM_RISE);
                return (
                  <g key={`dc${i}`}>
                    {sideFaces(sf, shade(stone.towerStone, 1.02), shade(stone.towerStone, 0.88))}
                  </g>
                );
              },
            );
          })()}
          <polygon points={polyPoints(drum.top)} fill={shade(stone.towerStone, 1.03)} />
          <polygon
            className="iso-dome"
            points={dome.join(' ')}
            fill={gilded ? stone.gilt : shade(stone.towerStone, 0.92)}
          />
          {gilded && (
            <>
              <line
                className="iso-finial"
                x1={finialFoot.x}
                y1={finialFoot.y}
                x2={finialFoot.x}
                y2={lift(finialFoot, TOWER_FINIAL_RISE).y}
                stroke={stone.gilt}
              />
              <circle
                className="iso-dome"
                cx={finialFoot.x}
                cy={lift(finialFoot, TOWER_FINIAL_RISE).y}
                r={2.2}
                fill={stone.gilt}
              />
            </>
          )}
        </>
      )}
      {apex === 'spire' && <Spire cc={cc} cr={cr} base={drumBase} stone={stone} gilded={gilded} />}
    </>
  );
}

function Spire({
  cc,
  cr,
  base,
  stone,
  gilded,
}: {
  cc: number;
  cr: number;
  base: number;
  stone: StonePalette;
  gilded: boolean;
}) {
  const plan = TOWER_BELFRY_PLAN;
  const belfry = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, TOWER_BELFRY_RISE);
  const springs = base + TOWER_BELFRY_RISE;
  const At = lift(project(cc - plan / 2, cr - plan / 2), springs);
  const Bt = lift(project(cc + plan / 2, cr - plan / 2), springs);
  const Ct = lift(project(cc + plan / 2, cr + plan / 2), springs);
  const Dt = lift(project(cc - plan / 2, cr + plan / 2), springs);
  const tip = lift(project(cc, cr), springs + TOWER_SPIRE_RISE);
  const faces: Array<[Pt, Pt, number]> = [
    [At, Dt, 1.1],
    [At, Bt, 1.0],
    [Dt, Ct, 0.84],
    [Bt, Ct, 0.7],
  ];
  return (
    <>
      {sideFaces(belfry, shade(stone.towerStone, 0.94), shade(stone.towerStone, 0.8))}
      {[[belfry.D, belfry.C, 'bl'] as const, [belfry.C, belfry.B, 'br'] as const].map(
        ([o, a, k]) => (
          <polygon
            key={k}
            className="iso-louvre"
            points={polyPoints(
              windowOutline('lancet', 0.3, 0.7, 0.12, 0.88).map(([u, v]) =>
                facePoint(o, a, TOWER_BELFRY_RISE, u, v),
              ),
            )}
          />
        ),
      )}
      {depthOrder(
        [
          { col: cc - plan / 2, row: cr - plan / 2 },
          { col: cc + plan / 2 - TOWER_PINNACLE_PLAN, row: cr - plan / 2 },
          { col: cc - plan / 2, row: cr + plan / 2 - TOWER_PINNACLE_PLAN },
          { col: cc + plan / 2 - TOWER_PINNACLE_PLAN, row: cr + plan / 2 - TOWER_PINNACLE_PLAN },
        ].map((c) => ({ ...c, w: TOWER_PINNACLE_PLAN, h: TOWER_PINNACLE_PLAN })),
      ).map((c, i) => {
        const f = boxFaces(c.col, c.row, c.w, c.h, springs, TOWER_PINNACLE_RISE);
        const capFoot = lift(
          project(c.col + c.w / 2, c.row + c.h / 2),
          springs + TOWER_PINNACLE_RISE,
        );
        const capTip = lift(
          project(c.col + c.w / 2, c.row + c.h / 2),
          springs + TOWER_PINNACLE_RISE * 1.6,
        );
        return (
          <g key={i}>
            {sideFaces(f, shade(stone.towerStone, 0.92), shade(stone.towerStone, 0.76))}
            <line
              className="iso-finial"
              x1={capFoot.x}
              y1={capFoot.y}
              x2={capTip.x}
              y2={capTip.y}
              stroke={shade(stone.towerStone, 0.86)}
            />
          </g>
        );
      })}
      {faces.map(([a, b, k], i) => (
        <polygon key={i} points={polyPoints([a, b, tip])} fill={shade(stone.towerStone, k)} />
      ))}
      {gilded && (
        <>
          <line
            className="iso-finial"
            x1={tip.x}
            y1={tip.y}
            x2={tip.x}
            y2={lift(tip, TOWER_FINIAL_RISE).y}
            stroke={stone.gilt}
          />
          <circle
            className="iso-dome"
            cx={tip.x}
            cy={lift(tip, TOWER_FINIAL_RISE).y}
            r={1.8}
            fill={stone.gilt}
          />
        </>
      )}
    </>
  );
}

function Chimney({
  cc,
  cr,
  base,
  top,
  pal,
  stone,
}: {
  cc: number;
  cr: number;
  base: number;
  top: number;
  pal: Palette;
  stone: StonePalette;
}) {
  const plan = across(1.3);
  const f = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, top - base);
  const cap = boxFaces(
    cc - plan / 2 - 0.03,
    cr - plan / 2 - 0.03,
    plan + 0.06,
    plan + 0.06,
    top,
    up(0.3),
  );
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {sideFaces(cap, shade(stone.trim, 0.78), shade(stone.trim, 0.66))}
      <polygon points={polyPoints(cap.top)} fill={shade(stone.trim, 0.86)} />
    </>
  );
}

function ridgeChimneys({
  col,
  row,
  w,
  h,
  base,
  rise,
  at,
  ends = false,
  pal,
  stone,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  rise: number;
  at: number[];
  ends?: boolean;
  pal: Palette;
  stone: StonePalette;
}) {
  const alongW = w >= h;
  const inset = Math.min(w, h) / 2;
  const plan = across(1.3);
  const top = base + rise + up(2.2);
  const seg = (alongW ? w : h) - inset * 2;
  const positions = ends ? [-0.4 * inset, seg + 0.4 * inset] : at.map((u) => u * seg);
  return positions.map((d, i) => {
    const beyond = d < 0 ? -d : d > seg ? d - seg : 0;
    const foot = base + rise * (1 - beyond / inset) - rise * (plan / Math.min(w, h));
    const cc = alongW ? col + inset + d : col + w / 2;
    const cr = alongW ? row + h / 2 : row + inset + d;
    return (
      <Chimney
        key={`ch${i}`}
        cc={cc}
        cr={cr}
        base={foot}
        top={Math.max(top, foot + up(3))}
        pal={pal}
        stone={stone}
      />
    );
  });
}

function Dormers({
  col,
  row,
  w,
  h,
  base,
  rise,
  pal,
  stone,
  glass,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  base: number;
  rise: number;
  pal: Palette;
  stone: StonePalette;
  glass: string;
}) {
  const alongW = w >= h;
  const T = 0.34;
  const dw = across(2.0);
  const dd = across(1.6);
  const dh = up(2.4);
  const out: React.JSX.Element[] = [];
  const seen = visibleWalls();
  const faces: Array<{ outward: FaceDir; count: number }> = [seen.left, seen.right].map((dir) => ({
    outward: dir,
    count: isRowWall(dir) === alongW ? 3 : 1,
  }));
  for (const { outward, count } of faces) {
    for (let i = 0; i < count; i++) {
      const u = (i + 1) / (count + 1);
      const z = base + rise * T - up(0.4);
      const span = wallSpan(w, h, outward);
      const deep = isRowWall(outward) ? h : w;
      const b = againstWall(
        col,
        row,
        w,
        h,
        outward,
        span * u - dw / 2,
        dw,
        dd,
        T * (deep / 2) + dd / 2,
      );
      const f = boxFaces(b.col, b.row, b.w, b.h, z, dh);
      const frontWall = wallOf(f, outward);
      const front = { o: frontWall.origin, a: frontWall.along };
      const frontTopL = lift(front.o, dh);
      const frontTopR = lift(front.a, dh);
      const apex = lift(
        { x: (front.o.x + front.a.x) / 2, y: (front.o.y + front.a.y) / 2 },
        dh + up(1.1),
      );
      out.push(
        <g key={`${outward}${i}`}>
          <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
          <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
          <polygon
            className="iso-window"
            fill={glass}
            points={polyPoints(
              windowOutline('lancet', 0.3, 0.7, 0.15, 0.85).map(([a, b2]) =>
                facePoint(front.o, front.a, dh, a, b2),
              ),
            )}
          />
          <polygon points={polyPoints(f.top)} fill={shade(pal.roof, 1.06)} />
          <polygon
            points={polyPoints([frontTopL, frontTopR, apex])}
            fill={shade(stone.trim, 0.8)}
          />
        </g>,
      );
    }
  }
  return <>{out}</>;
}

// ---------------------------------------------------------------------
// THE MASS: one building, assembled from the vocabulary above.
// ---------------------------------------------------------------------
function BuildingMass({
  def,
  p,
  material,
  motif,
  shadeSeed,
  schoolName,
}: {
  def: BuildingDef;
  p: { row: number; col: number; w: number; h: number };
  material: Material;
  motif: Motif;
  shadeSeed: string;
  schoolName: string;
}) {
  const stone = stoneFor(motif);
  const paneShape = paneShapeOf(def, motif);
  const trim = hasTrim(motif);
  const entrance: EntrancePart = entrancePartOf(def, motif);
  const rooflineEnd = rooflineEndPartOf(motif);
  const apex = apexPartOf(motif);
  const parts = partsFor(motif);
  const hood = parts.hood === true;
  const chimneys = parts.chimneys === true;
  const dormers = parts.dormers === true;
  const bellGable = parts.bellGable === true;
  const buttresses = parts.buttresses === true;
  const turrets = parts.turrets === true;
  const crenellations = parts.crenellations === true;
  const lights: 1 | 2 = parts.pairedLights === true ? 2 : 1;
  const grandPortico = parts.grandPortico === true;
  const balustrade = parts.balustrade === true;
  const glazedCivic = parts.glazedCivic === true;
  const TOWER_PROUD = across(0.45);
  const shortArcadeFallback: EntrancePart =
    parts.entrance.residential === 'archway' ? 'archway' : 'canopy';
  const doorShape = paneShape === 'arched' ? 'arched' : 'rect';
  const eaves = eavesOf(motif);
  const form = def.form;
  const { row, col, w, h } = p;
  const pal = paletteFrom(material, wallShadeOf(def, shadeSeed));
  const seen = visibleWalls();
  const fronts: FaceDir[] = [seen.left, seen.right];
  const cornerInFront = project(col + w, row + h).y > project(col + w / 2, row + h / 2).y;
  const roofTint = material.roof;

  if (form === 'grounds') return <GroundField col={col} row={row} w={w} h={h} />;
  if (form === 'sign') {
    return <EntranceSign col={col} row={row} w={w} h={h} stone={stone} name={schoolName} />;
  }

  const H = wallHeightOf(def);
  const ridge = ridgeOf(def, motif);
  const f = boxFaces(col, row, w, h, 0, H);
  const ranks = windowRanksOf(def);
  const sills = storeysOf(def) > 0 ? rankSills(ranks) : [clerestorySill(H)];
  const paneW = windowWidthOf(def);
  const courses = floorLinesOf(def);
  const door = entrance === 'recess' ? null : doorOf(def);

  if (form === 'hall') {
    const parapet = parapetOf(motif);
    const WH = H + parapet;
    const entranceStandoff =
      entrance === 'portico'
        ? PAVILION_DEPTH + PORTICO_STANDOFF + PORTICO_COLUMN_PLAN
        : entrance === 'porch'
          ? PAVILION_DEPTH
          : 0;
    const flights = entrance !== 'arcade';
    const hf = boxFaces(col, row, w, h, 0, WH);
    const endPlan = Math.min(END_PAVILION_PLAN, Math.min(w, h) * 0.28);
    const towerPlan = Math.min(across(7.5), Math.min(w, h) * 0.26);
    const inset = parapet > 0 ? Math.min(0.3, Math.min(w, h) * 0.06) : 0;
    const band = (from: number, to: number, className: string, key: string) => (
      <>
        <WallBand
          key={`${key}l`}
          origin={hf.D}
          along={hf.C}
          wallHeight={WH}
          from={from}
          to={to}
          className={className}
        />
        <WallBand
          key={`${key}r`}
          origin={hf.C}
          along={hf.B}
          wallHeight={WH}
          from={from}
          to={to}
          className={className}
        />
      </>
    );
    const turretNode = (
      <CornerTower
        pal={pal}
        glass={stone.glass}
        paneW={paneW}
        col={col + w - towerPlan + TOWER_PROUD}
        row={row + h - towerPlan + TOWER_PROUD}
        plan={towerPlan}
        height={WH + STOREY * 1.9}
        sills={rankSills(ranks + 2)}
        crenels={crenellations}
        capRise={up(5.0)}
      />
    );
    return (
      <>
        {turrets && !cornerInFront && turretNode}
        <polygon points={polyPoints(hf.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(hf.right)} fill={pal.wallRight} />
        {trim && floorCourses(hf.D, hf.C, WH, courses, 'l')}
        {trim && floorCourses(hf.C, hf.B, WH, courses, 'r')}
        {trim && band(0, PLINTH, 'iso-plinth', 'p')}
        {trim && band(H - CORNICE, H, 'iso-cornice', 'c')}
        {trim && parapet > 0 && band(H, WH, 'iso-parapet', 'q')}
        {windows(
          hf.D,
          hf.C,
          WH,
          hf.spanLeft,
          sills,
          paneW,
          'l',
          paneShape,
          stone.glass,
          door ? doorBay(door, hf.spanLeft, WH) : undefined,
          lights,
        )}
        {windows(
          hf.C,
          hf.B,
          WH,
          hf.spanRight,
          sills,
          paneW,
          'r',
          paneShape,
          stone.glass,
          door ? doorBay(door, hf.spanRight, WH) : undefined,
          lights,
        )}
        {buttresses &&
          fronts.map((dir) => {
            const s = wallSpan(w, h, dir);
            return (
              <Buttresses
                key={dir}
                pal={pal}
                stone={stone}
                col={col}
                row={row}
                w={w}
                h={h}
                height={H}
                outward={dir}
                reserve={[0.5 - pavilionWidth(s) / s / 2, 0.5 + pavilionWidth(s) / s / 2]}
                skipNear={turrets ? towerPlan : 0}
              />
            );
          })}
        {parapet > 0 && (
          <polygon points={polyPoints(boxFaces(col, row, w, h, 0, WH).top)} fill={pal.roofDeck} />
        )}
        {eaves > 0 && band(H - up(0.9), H, 'iso-eaves-shadow', 's')}
        {ridge > 0 ? (
          <HippedRoof
            col={col + inset - eaves}
            row={row + inset - eaves}
            w={w - inset * 2 + eaves * 2}
            h={h - inset * 2 + eaves * 2}
            base={WH}
            rise={ridge}
            pal={pal}
          />
        ) : (
          <polygon
            points={polyPoints(
              boxFaces(col + inset, row + inset, w - inset * 2, h - inset * 2, WH, 0).top,
            )}
            fill={pal.roof}
          />
        )}
        {balustrade &&
          parapet > 0 &&
          fronts.map((dir) => (
            <Balustrade
              key={dir}
              pal={pal}
              stone={stone}
              col={col}
              row={row}
              w={w}
              h={h}
              base={WH}
              outward={dir}
            />
          ))}
        {chimneys &&
          ridgeChimneys({
            col: col + inset,
            row: row + inset,
            w: w - inset * 2,
            h: h - inset * 2,
            base: WH,
            rise: ridge,
            at: [],
            ends: true,
            pal,
            stone,
          })}
        {dormers && (
          <Dormers
            col={col + inset}
            row={row + inset}
            w={w - inset * 2}
            h={h - inset * 2}
            base={WH}
            rise={ridge}
            pal={pal}
            stone={stone}
            glass={stone.glass}
          />
        )}
        {rooflineEnd === 'pavilion' &&
          (
            [
              [col, row + h - END_PAVILION_DEPTH, endPlan, END_PAVILION_DEPTH],
              [col + w - endPlan, row + h - END_PAVILION_DEPTH, endPlan, END_PAVILION_DEPTH],
              [col + w - END_PAVILION_DEPTH, row, END_PAVILION_DEPTH, endPlan],
              [col + w - END_PAVILION_DEPTH, row + h - endPlan, END_PAVILION_DEPTH, endPlan],
            ] as const
          ).map(([ec, er, ew, eh], i) => (
            <EndPavilion
              stone={stone}
              key={`e${i}`}
              col={ec}
              row={er}
              w={ew}
              h={eh}
              base={WH}
              pal={pal}
            />
          ))}
        {turrets && cornerInFront && turretNode}
        {bellGable && !hasClockTower(def) && (
          <BellGable
            pal={pal}
            stone={stone}
            origin={hf.D}
            along={hf.C}
            inward={gableInward(col, row, w, h)}
            wallHeight={WH}
            span={hf.spanLeft}
            centreU={0.5}
            sideAt="u1"
          />
        )}
        {hasClockTower(def) && apex === 'campanile' && (
          <Campanile
            stone={stone}
            pal={pal}
            gilded={hasGilt(motif)}
            col={col}
            row={row}
            w={w}
            h={h}
            base={WH + ridge * 0.4}
          />
        )}
        {hasClockTower(def) && apex === 'dome' && (
          <Dome stone={stone} col={col} row={row} w={w} h={h} base={WH + ridge * 0.4} />
        )}
        {hasClockTower(def) && (apex === 'cupola' || apex === 'spire') && (
          <ClockTower
            stone={stone}
            apex={apex}
            gilded={hasGilt(motif)}
            col={col}
            row={row}
            w={w}
            h={h}
            base={WH + ridge * 0.4}
          />
        )}
        {hasClockTower(def) && apex === 'core' && (
          <StairCore stone={stone} col={col} row={row} w={w} h={h} base={WH} />
        )}
        {entrance === 'portico' && (
          <>
            {fronts.map((dir) => (
              <CentrePavilion
                key={dir}
                paneShape={paneShape}
                glass={stone.glass}
                col={col}
                row={row}
                w={w}
                h={h}
                wallHeight={H}
                outward={dir}
                pal={pal}
                door={door}
                sills={sills}
                paneW={paneW}
              />
            ))}
            {fronts.map((dir) => {
              const span = wallSpan(w, h, dir);
              const at = outsideWall(
                col,
                row,
                w,
                h,
                dir,
                span / 2,
                PAVILION_DEPTH + PORTICO_STANDOFF,
              );
              return (
                <Portico
                  key={dir}
                  stone={stone}
                  centreCol={at.col}
                  centreRow={at.row}
                  width={pavilionWidth(span) * (grandPortico ? 1.2 : 1)}
                  outward={dir}
                  columns={grandPortico ? 6 : PORTICO_COLUMNS}
                  height={grandPortico ? H - ENTABLATURE - up(0.3) : PORTICO_HEIGHT}
                  pediment={grandPortico}
                  centreBay={door ? door.widthTiles * 1.3 : 0}
                />
              );
            })}
          </>
        )}
        {entrance === 'canopy' && door && (
          <>
            <Door
              d={door}
              origin={hf.D}
              along={hf.C}
              wallHeight={WH}
              span={hf.spanLeft}
              shape={doorShape}
            />
            <Door
              d={door}
              origin={hf.C}
              along={hf.B}
              wallHeight={WH}
              span={hf.spanRight}
              shape={doorShape}
            />
            {fronts.map((dir) => (
              <Canopy
                key={dir}
                stone={stone}
                d={door}
                col={col}
                row={row}
                w={w}
                h={h}
                outward={dir}
                wallHeight={H}
                hood={hood}
                roof={material.roof}
              />
            ))}
          </>
        )}
        {entrance === 'porch' &&
          fronts.map((dir) => (
            <Porch
              key={dir}
              pal={pal}
              stone={stone}
              col={col}
              row={row}
              w={w}
              h={h}
              wallHeight={H}
              outward={dir}
              door={door}
            />
          ))}
        {entrance === 'arcade' &&
          fronts.map((dir) => (
            <Arcade
              key={dir}
              pal={pal}
              stone={stone}
              col={col}
              row={row}
              w={w}
              h={h}
              outward={dir}
              height={arcadeHeight(H)}
            />
          ))}
        {door &&
          flights &&
          fronts.map((dir) => {
            const span = wallSpan(w, h, dir);
            const at = outsideWall(col, row, w, h, dir, span / 2, entranceStandoff);
            const out = outwardOf(dir);
            return (
              <EntranceSteps
                key={dir}
                stone={stone}
                d={door}
                centreCol={at.col}
                centreRow={at.row}
                outCol={out.col}
                outRow={out.row}
                span={span}
              />
            );
          })}
      </>
    );
  }

  if (form === 'hangar') {
    // The fitness chain: a pier-and-panel box under a monitor roof, lit from
    // a clerestory band, a glazed bay round each door and a canopy over it.
    const alongW = w >= h;
    const SHED_GLASS = 'rgba(52, 72, 84, 0.6)';
    const clere = [clerestorySill(H)];
    const glassHead = Math.min(STOREY * 1.3, clerestorySill(H) - up(0.5));
    const left = { o: f.D, a: f.C, span: f.spanLeft };
    const right = { o: f.C, a: f.B, span: f.spanRight };
    const clerestory = (face: { o: Pt; a: Pt; span: number }, key: string) =>
      windows(
        face.o,
        face.a,
        H,
        face.span,
        clere,
        paneW,
        key,
        'ribbon',
        SHED_GLASS,
        door ? doorBay(door, face.span, H) : undefined,
      );
    const bay = (face: { o: Pt; a: Pt; span: number }, key: string) => {
      if (!door) return null;
      const dw = Math.min(door.widthTiles / face.span, 0.6);
      const extra = 1 / baysAcross(face.span);
      return (
        <CurtainWall
          origin={face.o}
          along={face.a}
          wallHeight={H}
          spanTiles={face.span}
          from={BASE_COURSE}
          to={glassHead}
          floors={[]}
          id={key}
          u0={Math.max(0.02, 0.5 - dw / 2 - extra)}
          u1={Math.min(0.98, 0.5 + dw / 2 + extra)}
        />
      );
    };
    const monitor = (() => {
      const mc = alongW ? col + w * 0.05 : col + w * 0.31;
      const mr = alongW ? row + h * 0.31 : row + h * 0.05;
      const mw = alongW ? w * 0.9 : w * 0.38;
      const mh = alongW ? h * 0.38 : h * 0.9;
      const rise = up(2.2);
      const box = boxFaces(mc, mr, mw, mh, H, rise);
      const light = boxFaces(
        mc + (alongW ? mw * 0.03 : mw * 0.3),
        mr + (alongW ? mh * 0.3 : mh * 0.03),
        alongW ? mw * 0.94 : mw * 0.4,
        alongW ? mh * 0.4 : mh * 0.94,
        H + rise,
        0,
      );
      return (
        <>
          {sideFaces(box, shade(pal.roof, 0.9), shade(pal.roof, 0.76))}
          <polygon points={polyPoints(box.top)} fill={pal.roofDeck} />
          <polygon className="iso-rooflight" points={polyPoints(light.top)} />
        </>
      );
    })();
    return (
      <>
        <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
        {fronts.map((dir) => (
          <Piers
            key={dir}
            stone={stone}
            col={col}
            row={row}
            w={w}
            h={h}
            height={H}
            outward={dir}
            pal={pal}
          />
        ))}
        {[[f.D, f.C] as const, [f.C, f.B] as const].map(([o, a], i) => (
          <g key={`b${i}`}>
            <WallBand
              origin={o}
              along={a}
              wallHeight={H}
              from={0}
              to={BASE_COURSE}
              className="iso-plinth"
            />
            <WallBand
              origin={o}
              along={a}
              wallHeight={H}
              from={H - EAVES_COURSE}
              to={H}
              className="iso-cornice"
            />
          </g>
        ))}
        {clerestory(left, 'l')}
        {clerestory(right, 'r')}
        {bay(left, 'gl')}
        {bay(right, 'gr')}
        {door && (
          <>
            <Door d={door} origin={f.D} along={f.C} wallHeight={H} span={f.spanLeft} />
            <Door d={door} origin={f.C} along={f.B} wallHeight={H} span={f.spanRight} />
            {fronts.map((dir) => {
              const span = wallSpan(w, h, dir);
              const at = outsideWall(col, row, w, h, dir, span / 2, 0);
              const out = outwardOf(dir);
              return (
                <EntranceSteps
                  key={dir}
                  stone={stone}
                  d={door}
                  centreCol={at.col}
                  centreRow={at.row}
                  outCol={out.col}
                  outRow={out.row}
                  span={span}
                />
              );
            })}
            {fronts.map((dir) => (
              <Canopy
                key={dir}
                stone={stone}
                d={door}
                col={col}
                row={row}
                w={w}
                h={h}
                outward={dir}
                wallHeight={H}
              />
            ))}
          </>
        )}
        <polygon points={polyPoints(f.top)} fill={pal.roof} />
        {monitor}
      </>
    );
  }

  // THE REST OF THE CATALOGUE: residential, portico, pavilion, works, block.
  const gabled = ridge > 0;
  const alongW = w >= h;
  const turretPlan =
    turrets && form === 'residential' && Math.min(w, h) >= 2.8 && gabled
      ? Math.min(across(4.8), Math.min(w, h) * 0.2)
      : 0;
  const porched =
    entrance === 'archway' ||
    (entrance === 'arcade' && !arcadeFits(H) && shortArcadeFallback === 'archway');
  const stepStandoff = porched
    ? PAVILION_DEPTH
    : entrance === 'portico'
      ? PORTICO_STANDOFF + PORTICO_COLUMN_PLAN
      : 0;
  const hipped = gabled && Math.min(w, h) >= 4;
  const rc = col - eaves;
  const rr = row - eaves;
  const rw = w + eaves * 2;
  const rh = h + eaves * 2;
  const rf = boxFaces(rc, rr, rw, rh, 0, H);
  const residentialTurret = turretPlan > 0 && (
    <CornerTower
      pal={pal}
      glass={stone.glass}
      paneW={paneW}
      col={col + w - turretPlan + TOWER_PROUD}
      row={row + h - turretPlan + TOWER_PROUD}
      plan={turretPlan}
      height={H + STOREY * 0.8}
      sills={rankSills(ranks + 1)}
      crenels={false}
      capRise={up(4.2)}
    />
  );
  const rs = lift(alongW ? project(rc, rr + rh / 2) : project(rc + rw / 2, rr), H + ridge);
  const re = lift(
    alongW ? project(rc + rw, rr + rh / 2) : project(rc + rw / 2, rr + rh),
    H + ridge,
  );

  return (
    <>
      {!cornerInFront && residentialTurret}
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {trim && floorCourses(f.D, f.C, H, courses, 'l')}
      {trim && floorCourses(f.C, f.B, H, courses, 'r')}
      {trim &&
        [[f.D, f.C] as const, [f.C, f.B] as const].map(([o, a], i) => (
          <g key={`b${i}`}>
            <WallBand
              origin={o}
              along={a}
              wallHeight={H}
              from={0}
              to={BASE_COURSE}
              className="iso-plinth"
            />
            <WallBand
              origin={o}
              along={a}
              wallHeight={H}
              from={H - EAVES_COURSE}
              to={H}
              className="iso-cornice"
            />
          </g>
        ))}
      {windows(
        f.D,
        f.C,
        H,
        f.spanLeft,
        sills,
        paneW,
        'l',
        paneShape,
        stone.glass,
        door ? doorBay(door, f.spanLeft, H) : undefined,
        lights,
      )}
      {windows(
        f.C,
        f.B,
        H,
        f.spanRight,
        sills,
        paneW,
        'r',
        paneShape,
        stone.glass,
        door ? doorBay(door, f.spanRight, H) : undefined,
        lights,
      )}
      {buttresses &&
        gabled &&
        door &&
        fronts.map((dir) => {
          const s = wallSpan(w, h, dir);
          return (
            <Buttresses
              key={dir}
              pal={pal}
              stone={stone}
              col={col}
              row={row}
              w={w}
              h={h}
              height={H}
              outward={dir}
              reserve={[0.5 - (door.widthTiles * 0.95) / s, 0.5 + (door.widthTiles * 0.95) / s]}
              skipNear={turretPlan}
            />
          );
        })}
      {door && (
        <Door
          d={door}
          origin={f.D}
          along={f.C}
          wallHeight={H}
          span={f.spanLeft}
          shape={doorShape}
        />
      )}
      {door && (
        <Door
          d={door}
          origin={f.C}
          along={f.B}
          wallHeight={H}
          span={f.spanRight}
          shape={doorShape}
        />
      )}
      {glazedCivic && form === 'portico' && (
        <>
          <CurtainWall
            origin={f.D}
            along={f.C}
            wallHeight={H}
            spanTiles={f.spanLeft}
            from={BASE_COURSE}
            to={H - EAVES_COURSE * 1.5}
            floors={courses}
            id="gcl"
            u0={0.03}
            u1={0.97}
          />
          <CurtainWall
            origin={f.C}
            along={f.B}
            wallHeight={H}
            spanTiles={f.spanRight}
            from={BASE_COURSE}
            to={H - EAVES_COURSE * 1.5}
            floors={courses}
            id="gcr"
            u0={0.03}
            u1={0.97}
          />
        </>
      )}
      {entrance === 'portico' &&
        door &&
        fronts.map((dir) => {
          const span = wallSpan(w, h, dir);
          const at = outsideWall(col, row, w, h, dir, span / 2, PORTICO_STANDOFF);
          return (
            <Portico
              stone={stone}
              key={`sp${dir}`}
              centreCol={at.col}
              centreRow={at.row}
              width={Math.min(door.widthTiles * 4.2, span * 0.7)}
              outward={dir}
              height={Math.min(PORTICO_HEIGHT, H - EAVES_COURSE * 2)}
              centreBay={door.widthTiles * 1.3}
            />
          );
        })}
      {entrance === 'colonnade' &&
        fronts.map((dir) => {
          const span = wallSpan(w, h, dir);
          const at = outsideWall(col, row, w, h, dir, span / 2, PORTICO_STANDOFF);
          return (
            <Portico
              stone={stone}
              key={dir}
              centreCol={at.col}
              centreRow={at.row}
              width={span * 0.9}
              outward={dir}
              columns={Math.max(
                2,
                2 *
                  Math.round(
                    Math.min(
                      COLONNADE_MAX,
                      Math.round((span * 0.9 * METRES_PER_TILE) / COLONNADE_BAY_METRES),
                    ) / 2,
                  ),
              )}
              height={Math.min(COLONNADE_HEIGHT, H - EAVES_COURSE * 2)}
              centreBay={door ? door.widthTiles * 1.3 : 0}
            />
          );
        })}
      {entrance === 'arcade' &&
        arcadeFits(H) &&
        fronts.map((dir) => (
          <Arcade
            key={dir}
            pal={pal}
            stone={stone}
            col={col}
            row={row}
            w={w}
            h={h}
            outward={dir}
            height={arcadeHeight(H)}
          />
        ))}
      {(entrance === 'canopy' ||
        (entrance === 'arcade' && !arcadeFits(H) && shortArcadeFallback === 'canopy')) &&
        door &&
        fronts.map((dir) => (
          <Canopy
            key={dir}
            stone={stone}
            d={door}
            col={col}
            row={row}
            w={w}
            h={h}
            outward={dir}
            wallHeight={H}
            hood={hood}
            roof={material.roof}
          />
        ))}
      {(entrance === 'archway' ||
        (entrance === 'arcade' && !arcadeFits(H) && shortArcadeFallback === 'archway')) &&
        door &&
        fronts.map((dir) => (
          <Archway
            key={dir}
            pal={pal}
            stone={stone}
            d={door}
            col={col}
            row={row}
            w={w}
            h={h}
            outward={dir}
            wallHeight={H}
          />
        ))}
      {door &&
        !(entrance === 'arcade' && arcadeFits(H)) &&
        fronts.map((dir) => {
          const span = wallSpan(w, h, dir);
          const at = outsideWall(col, row, w, h, dir, span / 2, stepStandoff);
          const out = outwardOf(dir);
          return (
            <EntranceSteps
              key={dir}
              stone={stone}
              d={door}
              centreCol={at.col}
              centreRow={at.row}
              outCol={out.col}
              outRow={out.row}
              span={span}
            />
          );
        })}
      {gabled &&
        eaves > 0 &&
        [[f.D, f.C] as const, [f.C, f.B] as const].map(([o, a], i) => (
          <WallBand
            key={`es${i}`}
            origin={o}
            along={a}
            wallHeight={H}
            from={H - up(0.9)}
            to={H}
            className="iso-eaves-shadow"
          />
        ))}
      {hipped ? (
        <>
          <HippedRoof col={rc} row={rr} w={rw} h={rh} base={H} rise={ridge} pal={pal} />
          {chimneys &&
            ridgeChimneys({
              col: rc,
              row: rr,
              w: rw,
              h: rh,
              base: H,
              rise: ridge,
              at: [0.25, 0.75],
              pal,
              stone,
            })}
        </>
      ) : gabled ? (
        <>
          <polygon
            points={polyPoints(alongW ? [rf.NWt, rf.NEt, re, rs] : [rf.NWt, rf.SWt, re, rs])}
            fill={alongW ? pal.negRow : pal.negCol}
          />
          <polygon
            points={polyPoints(alongW ? [rf.SWt, rf.SEt, re, rs] : [rf.NEt, rf.SEt, re, rs])}
            fill={alongW ? pal.posRow : pal.posCol}
          />
          {gableEnds(rf, alongW, rs, re, pal)}
          <line className="iso-ridge" x1={rs.x} y1={rs.y} x2={re.x} y2={re.y} />
          {chimneys &&
            [0.22, 0.78].map((u, i) => {
              const cc = alongW ? rc + rw * u : rc + rw / 2;
              const cr = alongW ? rr + rh / 2 : rr + rh * u;
              const plan = across(1.3);
              return (
                <Chimney
                  key={`gc${i}`}
                  cc={cc}
                  cr={cr}
                  base={H + ridge * (1 - plan / Math.min(rw, rh))}
                  top={H + ridge + up(2.0)}
                  pal={pal}
                  stone={stone}
                />
              );
            })}
        </>
      ) : (
        <>
          <polygon points={polyPoints(f.top)} fill={pal.roof} />
          {form === 'portico' &&
            [0.3, 0.5, 0.7].map((v) =>
              [0.3, 0.55].map((u) => (
                <polygon
                  key={`${u}-${v}`}
                  className="iso-rooflight"
                  points={polyPoints(
                    boxFaces(
                      col + w * u,
                      row + h * v,
                      Math.min(w * 0.12, across(6)),
                      Math.min(h * 0.1, across(4)),
                      H + 1,
                      0,
                    ).top,
                  )}
                />
              )),
            )}
          {form === 'works' &&
            (() => {
              const sp = across(1.2);
              const st = boxFaces(col + w * 0.88 - sp, row + h * 0.08, sp, sp, H, up(6));
              return (
                <>
                  {sideFaces(st, shade(roofTint, 0.82), shade(roofTint, 0.68))}
                  <polygon points={polyPoints(st.top)} fill={shade(roofTint, 0.45)} />
                </>
              );
            })()}
          {(form === 'works' || form === 'pavilion' || form === 'block') &&
            depthOrder(
              (form === 'works'
                ? [
                    [0.12, 0.18, 0.28, 0.26],
                    [0.48, 0.44, 0.32, 0.28],
                    [0.18, 0.6, 0.22, 0.22],
                  ]
                : form === 'block'
                  ? [
                      [0.08, 0.1, 0.3, 0.26],
                      [0.46, 0.12, 0.22, 0.18],
                      [0.1, 0.52, 0.24, 0.22],
                      [0.52, 0.56, 0.34, 0.32],
                    ]
                  : [
                      [0.18, 0.26, 0.26, 0.24],
                      [0.54, 0.52, 0.28, 0.22],
                    ]
              ).map(([fx, fy, fw, fh]) => ({ col: fx!, row: fy!, w: fw!, h: fh! })),
            )
              .filter((_, i) => Math.min(w, h) >= 4 || i === 0)
              .map((unit, i) => (
                <RoofBox
                  key={i}
                  col={col + w * unit.col}
                  row={row + h * unit.row}
                  w={Math.min(w * unit.w, across(5.5))}
                  h={Math.min(h * unit.h, across(4.5))}
                  base={H}
                  height={form === 'works' ? 12 : form === 'block' ? 15 : 9}
                  tint={roofTint}
                />
              ))}
        </>
      )}
      {turretPlan > 0 && cornerInFront && residentialTurret}
      {crenellations &&
        !gabled &&
        form === 'portico' &&
        fronts.map((dir) => (
          <Merlons key={dir} col={col} row={row} w={w} h={h} base={H} outward={dir} pal={pal} />
        ))}
      {balustrade &&
        !gabled &&
        form === 'portico' &&
        fronts.map((dir) => (
          <Balustrade
            key={dir}
            pal={pal}
            stone={stone}
            col={col}
            row={row}
            w={w}
            h={h}
            base={H}
            outward={dir}
          />
        ))}
      {bellGable && form === 'pavilion' && gabled && door && (
        <BellGable
          pal={pal}
          stone={stone}
          origin={f.D}
          along={f.C}
          inward={gableInward(col, row, w, h)}
          wallHeight={H}
          span={f.spanLeft}
          centreU={0.5}
          sideAt="u1"
          scale={0.8}
        />
      )}
    </>
  );
}

// THE ENTRANCE SIGN (Phase 21D). The one piece of the campus that says the
// school's name out loud. Two posts, a board between them in the school's
// own colours rather than the motif's, and the name across it — the same
// pair the founding screen hung on the facade, standing at the road.
//
// The name is drawn flat rather than laid on the board's face, which is the
// register the map already uses for every label it writes (CampusMap's
// BuildingLabel and the quads' names): type on this map is written across
// the thing, not painted onto it.
const SIGN_TEXT_CH = 0.62; // an average glyph, as a share of the font size
function EntranceSign({
  col,
  row,
  w,
  h,
  stone,
  name,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  stone: StonePalette;
  name: string;
}) {
  // The sign stands in the middle of its plot, turned the way the plot is.
  const alongW = w >= h;
  const postTop = up(SIGN_POST_METRES);
  const boardBase = postTop - SIGN_BOARD_RISE - up(0.25);
  const cc = col + w / 2;
  const cr = row + h / 2;
  const half = SIGN_BOARD_WIDTH / 2;
  const box = (along: number, span: number, deep: number, base: number, rise: number) =>
    alongW
      ? boxFaces(cc + along, cr - deep / 2, span, deep, base, rise)
      : boxFaces(cc - deep / 2, cr + along, deep, span, base, rise);
  const postAt = (near: boolean) =>
    box(near ? -half : half - SIGN_POST, SIGN_POST, SIGN_POST, 0, postTop);
  const board = box(-half, SIGN_BOARD_WIDTH, SIGN_BOARD_DEPTH, boardBase, SIGN_BOARD_RISE);
  const plinth = box(-SIGN_PLINTH_LONG / 2, SIGN_PLINTH_LONG, SIGN_PLINTH_DEEP, 0, SIGN_PLINTH);
  const centre = lift(project(cc, cr), boardBase + SIGN_BOARD_RISE * 0.5);
  const words = name.trim();
  // The type shrinks to the board rather than running off the ends of it.
  const ends = alongW
    ? [project(cc - half, cr), project(cc + half, cr)]
    : [project(cc, cr - half), project(cc, cr + half)];
  const boardWidth = Math.hypot(ends[1]!.x - ends[0]!.x, ends[1]!.y - ends[0]!.y) * 0.86;
  const size = words ? Math.max(3, boardWidth / Math.max(4, words.length * SIGN_TEXT_CH)) : 0;
  return (
    <g className="campus-sign">
      {sideFaces(plinth, shade(stone.towerStone, 0.86), shade(stone.towerStone, 0.72))}
      <polygon points={polyPoints(plinth.top)} fill={shade(stone.towerStone, 1.0)} />
      {[false, true].map((near) => {
        const f = postAt(near);
        return (
          <g key={String(near)}>
            {sideFaces(f, shade(stone.towerStone, 0.9), shade(stone.towerStone, 0.74))}
            <polygon points={polyPoints(f.top)} fill={shade(stone.towerStone, 1.04)} />
          </g>
        );
      })}
      {sideFaces(board, 'var(--school-primary)', 'var(--school-primary)')}
      <polygon points={polyPoints(board.top)} fill="var(--school-secondary)" />
      {words && (
        <text
          className="campus-sign-name"
          x={centre.x.toFixed(1)}
          y={centre.y.toFixed(1)}
          fontSize={size.toFixed(1)}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {words}
        </text>
      )}
    </g>
  );
}

// Snow lying on a roof is the roof going white, not a white roof: the
// slopes keep their light and shade, so a hipped roof under snow still
// reads as hipped (Phase 21E). A flat deck holds more than a pitch sheds,
// but at this scale one mix reads right for both.
const SNOW = '#eef2f5';
function underSnow(material: Material, snow: number): Material {
  if (snow <= 0) return material;
  return { ...material, roof: mix(material.roof, SNOW, 0.3 + 0.6 * snow) };
}

function BuildingMotif({
  def,
  p,
  material,
  motif,
  shadeSeed,
  schoolName,
  snow,
}: {
  def: BuildingDef;
  p: { row: number; col: number; w: number; h: number };
  material: Material;
  motif: Motif;
  shadeSeed: string;
  // Only the entrance sign reads it: the school's name, to write on it.
  schoolName: string;
  // How deep the winter is, 0–1 (sim/weather.ts).
  snow: number;
  // Compared by the memo below so an unchanged motif still redraws when the
  // view turns; the geometry reads the camera from the projection itself.
  camera: Camera;
}) {
  return (
    <BuildingMass
      def={def}
      p={p}
      material={underSnow(material, snow)}
      motif={motif}
      shadeSeed={shadeSeed}
      schoolName={schoolName}
    />
  );
}

// Memoised: a motif is a pure function of these props, and the map's render
// path runs on every mouse move.
export default memo(
  BuildingMotif,
  (a, b) =>
    a.def === b.def &&
    a.camera === b.camera &&
    a.material === b.material &&
    a.motif === b.motif &&
    a.schoolName === b.schoolName &&
    a.snow === b.snow &&
    a.shadeSeed === b.shadeSeed &&
    a.p.col === b.p.col &&
    a.p.row === b.p.row &&
    a.p.w === b.p.w &&
    a.p.h === b.p.h,
);

export { materialOf };
