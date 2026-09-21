// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { memo } from 'react';
import type { Buildable, Vernacular } from '../state/types';
import { TILE_W, boxFaces, facePoint, lift, polyPoints, project, projectedCircle, heightScale, visibleWalls, wallOf, type BoxFaces, type Camera, type FaceDir, type Pt } from './isoProjection';
import { depthOrder, occludes, type DepthBox } from './depthSort';
import { WALL_LIGHT, faceTone, shadowOffset } from './light';
import { METRES_PER_TILE, STOREY, across, up } from './campusScale';
import {
  BASE_COURSE, BAY_METRES, BLOCK_SPLIT_MIN_TILES, CANOPY_DEPTH, CROSS_ARM_METRES,
  CROSS_BAR_METRES, CANOPY_POST, CANOPY_SLAB, CLOCK_RADIUS,
  CLOCK_RADIUS_TILES, COLONNADE_BAY_METRES, COLONNADE_HEIGHT, COLONNADE_MAX, CORNICE,
  EAVES_COURSE, ENTABLATURE, PIER_PROJECTION, PIER_WIDTH_METRES,
  PORTICO_COLUMNS, SLAB_ROW_FRACTION, UNDERCROFT_STOREYS, WING_COL_FRACTION,
  WING_STOREY_FRACTION,
  PORTICO_COLUMN_PLAN, PORTICO_HEIGHT, PORTICO_STANDOFF, END_PAVILION_PLAN, END_PAVILION_RISE, FLOOR_COURSE,
  PORCH_GABLE_RISE, PORCH_ARCH_WIDTH, PORCH_ARCH_HEIGHT, PORCH_HEIGHT_FRACTION,
  RECESS_WIDTH, RECESS_DEPTH, RECESS_OVERHANG, CORE_PLAN, CORE_RISE, CORE_CAP_RISE,
  BUTTRESS_PLAN, BUTTRESS_SETOFF_FRACTION, BUTTRESS_SETOFF_DEPTH,
  COPING, COPING_OVERHANG, END_PAVILION_DEPTH, PAVILION_BAYS, PAVILION_DEPTH, PAVILION_RISE, PEDIMENT_RISE, PLINTH, STEP_OVERHANG,
  TOWER_BASE_PLAN, TOWER_BASE_RISE, TOWER_DOME_RISE, TOWER_DRUM_PLAN, TOWER_DRUM_RISE,
  TOWER_FINIAL_RISE, TOWER_PODIUM_STOREYS, TREAD_DEPTH, WINDOW_HEIGHT,
  TOWER_BELFRY_PLAN, TOWER_BELFRY_RISE, TOWER_SPIRE_RISE,
  TOWER_PINNACLE_PLAN, TOWER_PINNACLE_RISE,
  baysAcross, clerestorySill, doorDimensions, doorOf, floorLinesOf, floorsUnderConstruction, hasClockTower, motifOf,
  rankSills, ridgeOf, parapetOf, eavesOf, stoneFor, paneShapeOf, windowOutline,
  entrancePartOf, rooflineEndPartOf, apexPartOf, partsFor, type ApexPart, massingOf,
  STACK_LOWER_TOP, STACK_UPPER_INSET, STACK_UPPER_OVERHANG,
  ARCADE_HEIGHT, ARCADE_DEPTH, ARCADE_PIER, ARCADE_BAY_METRES, ARCADE_MAX,
  CAMPANILE_PLAN, CAMPANILE_RISE, CAMPANILE_BELFRY_RISE, CAMPANILE_CAP_RISE,
  hasTrim, hasGilt,
  storeysOf, wallHeightOf, wallShadeOf, windowRanksOf,
  windowWidthOf,
  type DoorDimensions, type EntrancePart, type Material, type StonePalette, type WindowShape,
} from './buildingSpec';
import GroundMarking, { GroundSite, RakedStand, StadiumField, type TilePt } from './groundMarkings';
import { shade } from './tint';
import { TreeAt } from './trees';

// Architectural motifs: what makes a placed Buildable read as a BUILDING
// rather than as a coloured shape with a name on it.
//
// The TAXONOMY below is projection-independent — a hall is a hall whether
// you see its roof or its front — and survived the move from the flat map
// unchanged. What changed is everything under motifOf: on an angled map a
// building is a mass with a roof and two visible walls, so the facade
// details that were simply wrong drawn flat (windows, entrances) are now
// correct, because there are walls to put them on.
//
// House rules as ever: hand-rolled inline SVG, no icon library, no external
// art, no new dependency. Geometry here, colour in styles.css — with one
// deliberate exception noted at paletteFrom: the roof and wall tones are
// DERIVED from each building's tint at runtime, because there are ~22 tints
// and hand-authoring five shades of each would be 110 values to keep in sync
// with each other forever.

// The motifs no longer carry a height, a ridge, a window-rank count or a
// window-bay count of their own. buildingSpec.ts derives all four: the first
// three from one storey count, and the fourth from the length of the wall the
// bays actually run along — so a building cannot be taller than the floors it
// has, and a window cannot change size because the wall it sits on is longer.

// Where a building's LABEL sits: the middle of its mass, not its apex. The
// full standing height (walls + ridge + any added floors) put the plate
// clear above the roof, where it read as floating rather than as naming the
// thing under it; half the ridge lands it on the roof's own centre.
//
// This is the only place a whole-building height is wanted — the cast shadow
// uses drawnHeightOf below, which accounts for construction state — so there
// is deliberately no general "how tall is this" helper to drift from it.
export function labelHeightOf(t: Buildable, v: Vernacular): number {
  return wallHeightOf(t) + ridgeOf(t, v) * 0.5;
}

// How tall the mass ACTUALLY stands right now — full height when finished,
// a frame barely off the ground while developing. Exported so the cast
// shadow is computed from the same number the mass is drawn at, rather than
// a second copy of the developing fraction that could drift from it.
//
// The RENOVATION case is the exception, and it is not a special case so much
// as the general rule applied honestly: 16% of full height is right for a
// site where nothing has been built yet, and wrong for a library adding a
// fourth floor to three that are standing. A building that is 'developing'
// because it is being EXTENDED is drawn at the height of the floors it
// already has — which is also why it is still open for business (see
// types.ts's servingPopulation). The scaffold then rises off the finished
// roof rather than off the grass, which is what a renovation looks like.
export function drawnHeightOf(t: Buildable, developing: boolean, v: Vernacular): number {
  if (motifOf(t) === 'grounds') return 0;
  const full = wallHeightOf(t);
  if (!developing) return full + ridgeOf(t, v);
  const inFlight = floorsUnderConstruction(t);
  // Nothing built yet: a frame barely off the ground, as before.
  if (inFlight === 0) return Math.max(4, full * 0.16);
  const standing = full - inFlight * STOREY;
  return standing > 0 ? standing : Math.max(4, full * 0.16);
}


// Roof faces are keyed by the GRID DIRECTION they point, not by a role like
// "lit" or "shade". A pitched roof has four faces and which of them catches
// the light depends on which way the ridge runs — so a palette that names them
// by role can only be right for one of the two orientations, and was wrong for
// the other. It is also the discipline a rotating camera needs: turn the view
// and the roles swap, while the directions do not.
export interface Palette {
  roof: string; roofDeck: string;
  negCol: string; negRow: string; posRow: string; posCol: string;
  // The wall tone by the GRID direction the wall faces — the camera-proof
  // form, for anything that knows which wall it is drawing.
  wall: Record<FaceDir, string>;
  // The same two tones, resolved for the two walls the CURRENT camera can
  // see: `wallLeft` is the visible left wall's, `wallRight` the right's.
  // What a motif that just draws `f.left` and `f.right` wants, and correct
  // at every azimuth because paletteFrom runs per render.
  wallLeft: string; wallRight: string;
}

// How bright a sloped face is, by the grid direction its outward normal
// points. The sun is fixed to the WORLD (see light.ts): it comes from -col
// mostly and a little from -row, which at the default camera is the upper
// left — the direction the flat map's own drop shadows already fell. So:
//
//        -col   faces the light head-on   brightest
//        -row   glancing                  bright
//        +row   glancing, away            dim
//        +col   faces away head-on        darkest
//
// Ordering these WRONG is not a subtle mis-tint: a roof whose -col face is
// darker than its -row one looks exactly like something is casting a
// shadow across it, and there is nothing there to cast one.
function SLOPE(roof: string) {
  return {
    negCol: shade(roof, 1.12),
    negRow: shade(roof, 1.0),
    posRow: shade(roof, 0.84),
    posCol: shade(roof, 0.7),
  };
}

// The same for WALLS, by the direction they face, from the same sun (the
// table is light.ts's WALL_LIGHT). Four tones for one sun, so that turning
// the camera never changes which side of a building is lit.
function WALLS(wall: string): Record<FaceDir, string> {
  return {
    negCol: shade(wall, WALL_LIGHT.negCol),
    negRow: shade(wall, WALL_LIGHT.negRow),
    posRow: shade(wall, WALL_LIGHT.posRow),
    posCol: shade(wall, WALL_LIGHT.posCol),
  };
}

// Tones from one MATERIAL — a wall colour and a roof colour, not one tint for
// both. That split is the whole of PR F on screen: roof tones used to be
// derived from the wall, so a gold hall stood under a gold roof and the two
// read as a single mass. Deriving each family's shades from its own base still
// keeps one source of truth per surface and guarantees every face on the map
// is lit from the same direction.
// The two visible walls of a small box — a chimney, a buttress, a coping, a
// roof unit — in tones authored for the +row and +col faces, the pair the
// default camera sees. `faceTone` (light.ts) gives the other two faces their
// place in the same sun, so when the camera turns and a different pair is
// visible, the box is still lit from the same side as everything else.
function sideFaces(f: BoxFaces, posRowTone: string, posColTone: string) {
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={faceTone(f.dir.CD, posRowTone, posColTone)} />
      <polygon points={polyPoints(f.right)} fill={faceTone(f.dir.BC, posRowTone, posColTone)} />
    </>
  );
}

// ---------------------------------------------------------------------
// WALLS BY DIRECTION. Everything that stands against a wall — a pavilion, a
// portico, an arcade, a canopy, the buttresses, the merlons on its head —
// used to take `outward: FaceDir`: the +row wall or the +col wall,
// the two walls the camera used to see. It now takes the wall by grid
// direction, and a mass draws its attachments on the two walls the CAMERA
// CAN SEE (isoProjection's visibleWalls), which at the opening camera are
// exactly those two. A building presents its entrances to the viewer from
// every side, the way its doors already did, and nothing is ever drawn
// against a wall that has turned away, where it would paint over the mass
// it belongs to.
// ---------------------------------------------------------------------
const isRowWall = (dir: FaceDir): boolean => dir === 'posRow' || dir === 'negRow';
function wallSpan(w: number, h: number, dir: FaceDir): number {
  return isRowWall(dir) ? w : h;
}
function opposite(dir: FaceDir): FaceDir {
  return dir === 'posRow' ? 'negRow' : dir === 'negRow' ? 'posRow' : dir === 'posCol' ? 'negCol' : 'posCol';
}
// The unit direction away from the building through this wall.
function outwardOf(dir: FaceDir): { col: number; row: number } {
  return dir === 'posRow' ? { col: 0, row: 1 } : dir === 'negRow' ? { col: 0, row: -1 }
    : dir === 'posCol' ? { col: 1, row: 0 } : { col: -1, row: 0 };
}
// A footprint standing against one wall of the box (col, row, w, h): from
// `along0` to `along0 + width` measured along the wall in grid order (col
// for a row wall, row for a col wall), `depth` tiles out from the wall's
// plane — or, with `sink`, that much into it, for a thing standing on the
// wall's head or cut into its face.
function againstWall(
  col: number, row: number, w: number, h: number, dir: FaceDir,
  along0: number, width: number, depth: number, sink = 0,
): DepthBox {
  switch (dir) {
    case 'posRow': return { col: col + along0, row: row + h - sink, w: width, h: depth };
    case 'negRow': return { col: col + along0, row: row - depth + sink, w: width, h: depth };
    case 'posCol': return { col: col + w - sink, row: row + along0, w: depth, h: width };
    default: return { col: col - depth + sink, row: row + along0, w: depth, h: width };
  }
}
// A grid point `along` the wall and `out` tiles beyond its plane.
function outsideWall(
  col: number, row: number, w: number, h: number, dir: FaceDir, along: number, out: number,
): { col: number; row: number } {
  switch (dir) {
    case 'posRow': return { col: col + along, row: row + h + out };
    case 'negRow': return { col: col + along, row: row - out };
    case 'posCol': return { col: col + w + out, row: row + along };
    default: return { col: col - out, row: row + along };
  }
}
// The visible faces of a box standing against wall `dir`: its FRONT (the
// face pointing `dir`, which the camera sees because it can see that wall)
// and its one visible SIDE, each in the wall tone for where it lands.
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
// The lean-to roof over a box standing against wall `dir`: one slope from
// its outer edge up to the wall behind it, tinted by the direction it
// faces, and the small triangle that closes the roof over its visible end.
function leanToRoof(f: BoxFaces, dir: FaceDir, height: number, rise: number, pal: Palette) {
  const front = wallOf(f, dir);
  const back = wallOf(f, opposite(dir));
  const frontIsLeft = f.dir.CD === dir;
  return {
    leanTo: [lift(front.origin, height), lift(front.along, height), lift(back.along, height + rise), lift(back.origin, height + rise)],
    leanToFill: pal[dir],
    endCap: frontIsLeft
      ? [lift(f.C, height), lift(f.B, height), lift(f.B, height + rise)]
      : [lift(f.C, height), lift(f.D, height), lift(f.D, height + rise)],
    endCapFill: frontIsLeft ? pal.wallRight : pal.wallLeft,
  };
}
// The set-back plane a bell-gable's return meets: the visible left wall,
// `across(0.6)` inside the building, oriented the way that wall is.
function gableInward(col: number, row: number, w: number, h: number): { origin: Pt; along: Pt } {
  const dir = visibleWalls().left;
  const strip = againstWall(col, row, w, h, dir, 0, wallSpan(w, h, dir), across(0.6), across(0.6));
  const back = wallOf(boxFaces(strip.col, strip.row, strip.w, strip.h, 0, 0), opposite(dir));
  return { origin: back.origin, along: back.along };
}

export function paletteFrom(m: Material, shadeFactor = 1): Palette {
  const wall = shadeFactor === 1 ? m.wall : shade(m.wall, shadeFactor);
  const walls = WALLS(wall);
  const seen = visibleWalls();
  return {
    roof: m.roof,
    // A raised flat deck (the hangar's clear-span roof), which faces straight
    // up and so takes no slope tone at all.
    roofDeck: shade(m.roof, 1.06),
    ...SLOPE(m.roof),
    wall: walls,
    wallLeft: walls[seen.left],
    wallRight: walls[seen.right],
  };
}

// A retail podium's street level is a shopfront, not a rank of flats: one
// tall opening per bay, sitting almost on the pavement. Its own two numbers
// rather than the ordinary window's, because that is genuinely what differs —
// the bay spacing it is set out on is the campus's.
const SHOPFRONT_SILL = up(0.5);
const SHOPFRONT_WIDTH = across(3.4);

// A rectangle in a wall's own (u, v) coordinates. Used to reserve the bay a
// door stands in so no window is drawn behind it.
interface FaceRect { u0: number; u1: number; v0: number; v1: number; }
function overlaps(a: FaceRect, b: FaceRect): boolean {
  return a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;
}

// Windows on one wall, at their REAL size.
//
// The wall's own (u along, v up) coordinates still do the projection work — a
// pane is a rectangle in (u, v) and comes out correctly skewed for free. What
// changed is where the rectangle's edges come from. They used to be a fraction
// of the wall in both directions, which is what made a window's size a
// property of the building rather than of the window. Now the width is a fixed
// number of TILES (converted to u by dividing by this wall's span) and the
// height is a fixed number of SCREEN UNITS (converted to v by dividing by this
// wall's height), so the same window is drawn everywhere and the conversion is
// the only thing that differs.
//
// `sills` is where each rank sits, in screen units above the base — one entry
// per storey for an ordinary building, one entry near the eaves for a
// clear-span volume (see buildingSpec's rankSills and clerestorySill).
//
// `reserved` is the door's bay. A wall does not have windows behind its door,
// so the grid skips those cells outright rather than drawing them and letting
// the door cover them — which left panes showing through wherever the door was
// the more transparent of the two.
function windows(
  origin: Pt, along: Pt, wallHeight: number, spanTiles: number,
  sills: number[], windowWidthTiles: number, key: string,
  shape: WindowShape, glass: string,
  reserved?: FaceRect,
  // Two lights to the bay instead of one — the Gothic grouping. The BAY is
  // unchanged (the door's reserved bay and the sill bounds are computed on
  // it); only what is drawn inside it changes.
  lights: 1 | 2 = 1,
) {
  const out: React.JSX.Element[] = [];
  if (wallHeight <= 0 || spanTiles <= 0) return out;
  const bays = baysAcross(spanTiles);
  // ONE <path> for the whole rank, not a <polygon> per pane. Every pane on a
  // wall has the same class and the same glass, and none overlap, so a
  // single path of closed subpaths draws exactly what the polygons did — at
  // one DOM node per wall instead of one per window, which on a built-out
  // campus was five thousand nodes, a third of the map.
  const panes: string[] = [];
  // A RIBBON fills its bay edge to edge so that neighbouring bays touch and
  // the rank reads as one continuous band. Every other shape is a window
  // with wall either side of it, and takes its own width.
  const halfU = shape === 'ribbon'
    ? 1 / bays / 2
    : Math.min(windowWidthTiles / spanTiles, 1 / bays) / 2;
  for (let r = 0; r < sills.length; r++) {
    const v0 = sills[r] / wallHeight;
    const v1 = (sills[r] + WINDOW_HEIGHT) / wallHeight;
    if (v1 > 1) continue;             // no rank above the eaves
    for (let b = 0; b < bays; b++) {
      const centre = (b + 0.5) / bays;
      const u0 = centre - halfU; const u1 = centre + halfU;
      if (reserved && overlaps({ u0, u1, v0, v1 }, reserved)) continue;
      // One light across the bay, or two narrower ones either side of a
      // mullion — each a little wider than half, so the pair reads as one
      // grouped window rather than two small ones.
      const spans: Array<[number, number]> = lights === 2
        ? [[centre - halfU * 1.08, centre - halfU * 0.12], [centre + halfU * 0.12, centre + halfU * 1.08]]
        : [[u0, u1]];
      // The BAY is still the same rectangle whatever the vernacular —
      // reserved-bay collision above, and the sill/eaves bounds, are
      // computed on it — and only the outline drawn inside it changes.
      for (const [a, c] of spans) {
        panes.push(`M${polyPoints(
          windowOutline(shape, a, c, v0, v1)
            .map(([u, v]) => facePoint(origin, along, wallHeight, u, v)),
        ).replace(/ /g, 'L')}Z`);
      }
    }
  }
  if (panes.length > 0) out.push(<path key={`${key}w`} className="iso-window" fill={glass} d={panes.join('')} />);
  return out;
}

// The band at each floor line, running the whole width of the wall.
//
// This is the horizontal structure a multi-storey facade needs, and it is the
// part that still reads at the zoom the game opens at, when the panes
// themselves are a few pixels across. It is also the honest way to draw what a
// rank of windows sits on: one course per storey boundary rather than a sill
// and a lintel around every opening, which would treble the polygon count for
// a line the eye reads as continuous anyway.
function floorCourses(
  origin: Pt, along: Pt, wallHeight: number, lines: number[], key: string,
) {
  if (wallHeight <= 0) return [];
  return lines.map((at, i) => {
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
  }).filter(Boolean);
}

// NO GLAZING BARS. This is worth recording, because the plan called for them
// and they were built before being taken out again.
//
// The idea was one <pattern> in <defs>, filled into every pane, so a sash
// window's muntins cost nothing per window on a campus that has several
// thousand of them. It works as arithmetic and fails as drawing: a pattern is
// laid out in the world's coordinates and a pane is a SKEWED rectangle in a
// wall's, so every pane samples a different part of the pattern. Some came out
// with a bright bar across a corner, some with none, and the rank as a whole
// read as irregular — which is precisely the complaint this PR exists to fix.
// The alternative, drawing each bar in the wall's own (u, v) space where it
// would align correctly, triples the polygon count for a detail that is under
// a pixel at the zoom the map is actually played at.
//
// So the panes are flat, and the facade's structure comes from the thing that
// genuinely does read at this size: the floor courses above.

// A rectangle in a wall's own (u, v) coordinates. Used to reserve the bay a
// door stands in so no window is drawn behind it.
// The scaffolding hatch, referenced by every site under construction. One
// <pattern> defined once for the whole map rather than per building — see
// SCAFFOLD_PATTERN_ID's use in CampusMap's <defs>.
export const SCAFFOLD_PATTERN_ID = 'campus-scaffold';
export function ScaffoldPattern() {
  return (
    <pattern id={SCAFFOLD_PATTERN_ID} width={14} height={14} patternUnits="userSpaceOnUse">
      <path className="scaffold-hatch" d="M-4,4 L4,-4 M0,14 L14,0 M10,18 L18,10" />
    </pattern>
  );
}

// Scaffold poles standing at the corners of a site, with a lift line between
// them. A hatch alone reads as a texture; the poles are what say "work is
// happening here" rather than "this rectangle is a different colour".
function Scaffolding({ col, row, w, h, height, base = 0 }: {
  col: number; row: number; w: number; h: number; height: number;
  // Where the poles are footed. Ground, for a site; the finished roof, for
  // a building being extended a storey (see BuildingMotif's `extending`).
  base?: number;
}) {
  const posts: [number, number][] = [
    [col + w * 0.06, row + h * 0.06], [col + w * 0.94, row + h * 0.06],
    [col + w * 0.94, row + h * 0.94], [col + w * 0.06, row + h * 0.94],
  ];
  const POLE = height * 2.6;
  const footAt = (c: number, r: number) => lift(project(c, r), base);
  return (
    <>
      {posts.map(([c, r], i) => {
        const foot = footAt(c, r);
        const head = lift(foot, POLE);
        return <line key={i} className="scaffold-pole" x1={foot.x} y1={foot.y} x2={head.x} y2={head.y} />;
      })}
      {/* One lift line along the back, where it reads against the sky rather
          than against the site's own hatch. */}
      <line
        className="scaffold-rail"
        x1={lift(footAt(posts[0][0], posts[0][1]), POLE * 0.72).x}
        y1={lift(footAt(posts[0][0], posts[0][1]), POLE * 0.72).y}
        x2={lift(footAt(posts[1][0], posts[1][1]), POLE * 0.72).x}
        y2={lift(footAt(posts[1][0], posts[1][1]), POLE * 0.72).y}
      />
    </>
  );
}

// A TOWER CRANE on a big site: a mast, a jib reaching over the plate, a
// short counter-jib, and a hook line. Screen-space lines like the scaffold
// poles — it is the one thing that says "building" from any distance, and a
// site is on the map for months.
function Crane({ col, row, w, h, height }: { col: number; row: number; w: number; h: number; height: number }) {
  const foot = project(col + w * 0.18, row + h * 0.82);
  const mastH = Math.max(height * 2.2, 70) + 40;
  const top = lift(foot, mastH);
  const reach = Math.min(w, h) * TILE_W * 0.42;
  const jibEnd = { x: top.x + reach, y: top.y - reach * 0.18 };
  const counter = { x: top.x - reach * 0.32, y: top.y + reach * 0.06 };
  const hook = { x: top.x + reach * 0.62, y: top.y - reach * 0.11 };
  return (
    <g className="site-crane">
      <line x1={foot.x} y1={foot.y} x2={top.x} y2={top.y} />
      <line x1={counter.x} y1={counter.y} x2={jibEnd.x} y2={jibEnd.y} />
      <line x1={top.x} y1={top.y - 10} x2={jibEnd.x} y2={jibEnd.y} className="site-crane-tie" />
      <line x1={top.x} y1={top.y - 10} x2={counter.x} y2={counter.y} className="site-crane-tie" />
      <line x1={hook.x} y1={hook.y} x2={hook.x} y2={hook.y + mastH * 0.45} className="site-crane-tie" />
      <polygon points={polyPoints([{ x: counter.x - 4, y: counter.y - 3 }, { x: counter.x + 4, y: counter.y - 3 }, { x: counter.x + 4, y: counter.y + 3 }, { x: counter.x - 4, y: counter.y + 3 }])} className="site-crane-weight" />
    </g>
  );
}

// The door's width as a fraction of the wall it is on. The width itself is a
// real measure (see buildingSpec's DOOR_FAMILIES); this only converts it into
// the wall's own u, which is the one thing that legitimately depends on how
// long that wall is. Capped so an entrance can never eat a short wall whole.
function doorFraction(d: DoorDimensions, span: number): number {
  if (d.widthTiles <= 0 || span <= 0) return 0;
  return Math.min(d.widthTiles / span, 0.6);
}

// The bay a door reserves on its wall, in that wall's (u, v) coordinates — the
// opening plus its surround and lintel, so windows clear the whole assembly
// rather than just the leaves. Reserved from the GROUND up rather than from
// the threshold, so nothing is drawn behind the steps either.
//
// A formal portal is taller than a storey, which means it reaches into the
// first floor and the rank up there clears it too. That is not a special case
// here: the rectangle is simply tall enough, and `overlaps` does the rest.
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

const SURROUND = 0.018;   // how far the frame stands proud of the opening, in u
const LINTEL = 0.05;      // the lintel's depth above the head, in v

// The way in.
//
// Drawn in the wall's own (u along, v up) coordinates so the whole assembly
// skews correctly like everything else on that face, with no projection maths
// of its own. Both visible walls get one: which of the two a building "fronts"
// onto depends on where the player put it and which way the paths run, and a
// blank wall beside a path reads as the back of the building wherever it
// happens to stand.
//
// The opening carries what makes a door legible at this size: a surround, a
// pair of leaves with a mull between them, and a fanlight over the transom.
// Handles and panel mouldings are below a pixel here and are not drawn. What
// IS drawn now, and was not, is the threshold the door sits on — see
// EntranceSteps below.
function Door({ d, origin, along, wallHeight, span, shape = 'rect' }: {
  d: DoorDimensions;
  origin: Pt; along: Pt; wallHeight: number;
  span: number;   // this wall's length in tiles, so the door is the same real size on both
  // Round-headed where the vernacular's windows are: a Mission door under a
  // square lintel was the one rectangle on an arched front.
  shape?: 'rect' | 'arched';
}) {
  const dw = doorFraction(d, span);
  if (dw <= 0 || wallHeight <= 0) return null;
  // The opening in this wall's v: a real height, converted once.
  const v0 = d.threshold / wallHeight;
  const v1 = (d.threshold + d.height) / wallHeight;
  if (v1 > 1) return null;            // taller than the wall it is on: draw nothing rather than overflow
  const h = v1 - v0;
  const u0 = 0.5 - dw / 2;
  const u1 = 0.5 + dw / 2;
  const at = (u: number, v: number) => facePoint(origin, along, wallHeight, u, v);
  const quad = (a: number, b: number, c: number, e: number) =>
    polyPoints([at(a, c), at(b, c), at(b, e), at(a, e)]);

  const transom = v0 + h * 0.72;    // head of the leaves; the fanlight sits above
  const mull = dw * 0.035;          // the centre post between the two leaves
  const reveal = dw * 0.08;         // how far the leaves sit inside the opening
  const bar = h * 0.045;            // the transom bar itself

  if (shape === 'arched') {
    const arch = (a: number, b: number, c: number, e: number) =>
      polyPoints(windowOutline('arched', a, b, c, e).map(([u, v]) => at(u, v)));
    // The fanlight fills the round head: the opening's own arch, inset by
    // the reveal, with its foot cut off at the transom.
    const fan = polyPoints(
      windowOutline('arched', u0 + reveal, u1 - reveal, v0, v1 - h * 0.04)
        .map(([u, v]) => at(u, Math.max(v, transom + bar * 0.5))),
    );
    return (
      <>
        <polygon className="iso-door-surround" points={arch(u0 - SURROUND, u1 + SURROUND, v0, v1 + 0.012)} />
        <polygon className="iso-door" points={arch(u0, u1, v0, v1)} />
        <polygon className="iso-door-leaf" points={quad(u0 + reveal, 0.5 - mull, v0 + h * 0.02, transom - bar)} />
        <polygon className="iso-door-leaf" points={quad(0.5 + mull, u1 - reveal, v0 + h * 0.02, transom - bar)} />
        <polygon className="iso-door-bar" points={quad(u0, u1, transom - bar, transom)} />
        <polygon className="iso-door-glass" points={fan} />
      </>
    );
  }

  return (
    <>
      {/* The surround, then the opening cut into it. */}
      <polygon className="iso-door-surround" points={quad(u0 - SURROUND, u1 + SURROUND, v0, v1 + 0.012)} />
      <polygon className="iso-door" points={quad(u0, u1, v0, v1)} />

      {/* Two leaves either side of the mull. */}
      <polygon className="iso-door-leaf" points={quad(u0 + reveal, 0.5 - mull, v0 + h * 0.02, transom - bar)} />
      <polygon className="iso-door-leaf" points={quad(0.5 + mull, u1 - reveal, v0 + h * 0.02, transom - bar)} />

      {/* The transom bar, and the fanlight over it. */}
      <polygon className="iso-door-bar" points={quad(u0, u1, transom - bar, transom)} />
      <polygon
        className="iso-door-glass"
        points={quad(u0 + reveal, u1 - reveal, transom + bar * 0.5, v1 - h * 0.04)}
      />

      {/* A lintel across the head. */}
      <polygon
        className="iso-door-lintel"
        points={quad(u0 - SURROUND - 0.012, u1 + SURROUND + 0.012, v1 + 0.012, v1 + LINTEL)}
      />
    </>
  );
}

// The flight up to a threshold, standing on the ground in front of the door.
//
// This is the piece the old drawing was missing entirely — its "step" was a
// three-pixel sliver in SCREEN space, which is the one measure on this map
// that means nothing. A real stair is boxes on the grid: each tread stands one
// rise higher and one tread-depth shallower than the one in front of it, so
// the flight climbs back toward the wall.
//
// `outCol`/`outRow` is the direction away from the building, in grid units —
// the left wall faces down-row, the right wall faces down-col. Treads are
// drawn from the top down, so the lowest (which projects furthest toward the
// camera) paints over the ones behind it.
function EntranceSteps({ d, centreCol, centreRow, outCol, outRow, span, stone }: {
  d: DoorDimensions;
  centreCol: number; centreRow: number;
  outCol: number; outRow: number;
  span: number; stone: StonePalette;
}) {
  if (d.treads <= 0 || d.threshold <= 0) return null;
  const stepStone = stone.trim === 'none' ? stone.towerStone : stone.trim;
  const halfW = Math.min(d.widthTiles, span * 0.6) / 2 + STEP_OVERHANG;
  const rise = d.threshold / d.treads;
  const out: React.JSX.Element[] = [];
  for (let i = d.treads - 1; i >= 0; i--) {
    // Tread i counts from the bottom, so it stands (i + 1) rises high and
    // reaches (d.treads - i) tread-depths out from the wall.
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

// A small box standing on a roof: plant, a stair head, a lift overrun — the
// thing you actually see on a flat roof from above and to one side.
function RoofBox({ col, row, w, h, base, height, tint }: {
  col: number; row: number; w: number; h: number; base: number; height: number; tint: string;
}) {
  const f = boxFaces(col, row, w, h, base, height);
  return (
    <>
      {sideFaces(f, shade(tint, 0.66), shade(tint, 0.56))}
      <polygon points={polyPoints(f.top)} fill={shade(tint, 0.8)} />
    </>
  );
}

// ---------------------------------------------------------------------
// THE ACADEMIC HALL. The campus's landmark, and the one motif drawn from a
// real reference building rather than from a description.
//
// Everything here is an element of that building — a stone plinth, a course at
// each floor, a cornice and parapet at the eaves, a shallow hipped roof set
// back behind them, a centre bay that projects and is capped with a pediment,
// raised blocks closing each end of the roofline, and (on Founders Hall alone)
// a clock tower with a gilded dome. Their DIMENSIONS all live in
// buildingSpec.ts; what is here is only how to turn them into polygons.
//
// This is why "the other academic halls in the same style, without the spire"
// is one flag and not a second motif: every hall gets the whole vocabulary,
// and hasClockTower decides the one element that is singular.
// ---------------------------------------------------------------------

// A horizontal band across a wall — a plinth, a cornice, a parapet. Same
// (u, v) trick as everything else on a face, so it skews for free.
// A band of applied stonework across a wall: a plinth, a cornice, a parapet,
// a floor course. `trim === 'none'` means this vernacular has no such thing
// and the band is not drawn — see Brutalist's note. Skipping is the point:
// a grey band on a grey wall is still a band, and this architecture's
// argument is that the wall is one undivided thing.
function WallBand({ origin, along, wallHeight, from, to, className, u0 = 0, u1 = 1 }: {
  origin: Pt; along: Pt; wallHeight: number; from: number; to: number; className: string;
  // A band usually runs the whole width of the wall. Giving it a u range is
  // what lets the parapet be RAISED over the end bays alone, which is how the
  // reference building closes each end of its roofline — a section of the wall
  // carried higher, not a block sitting on the roof.
  u0?: number; u1?: number;
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

// The gable ends of a ridged roof: vertical triangles from the eaves up to
// each end of the ridge, in the WALL's tone because a gable is the wall
// carried on up. Only the ends the camera can see are drawn — the far one is
// geometrically inside the far slope — and which those are is the camera's
// business, not the motif's: `wallOf` says whether the +col end (the ridge
// runs along col, `alongW`) or the +row end is facing us, and at the default
// camera exactly one of each pair is, the same one that was always drawn.
function gableEnds(f: BoxFaces, alongW: boolean, rs: Pt, re: Pt, pal: Palette) {
  // The ridge runs from rs to re, low-coordinate end first (see the callers).
  const ends: Array<[FaceDir, Pt[]]> = alongW
    ? [['negCol', [f.NWt, f.SWt, rs]], ['posCol', [f.NEt, f.SEt, re]]]
    : [['negRow', [f.NWt, f.NEt, rs]], ['posRow', [f.SWt, f.SEt, re]]];
  return ends.map(([dir, pts]) => (
    wallOf(f, dir).visible
      ? <polygon key={dir} points={polyPoints(pts)} fill={pal.wall[dir]} />
      : null
  ));
}

// A HIPPED roof: four slopes meeting at a ridge that stops short of both ends,
// rather than two slopes and a gable wall. This is what the reference building
// has, and at a shallow pitch behind a parapet it reads as a landmark where
// the old barn gable (a ridge deeper than a storey and a half) read as a shed.
//
// The ridge is inset from each end by half the SHORTER span, which is what
// makes the two end slopes proper hips rather than clipped triangles. Faces
// are tinted by the grid direction they point, like every other sloped surface
// on this map (see SLOPE) — so the roof is lit correctly whichever way it runs
// and, when the camera can eventually turn, whichever way it is looked at.
function HippedRoof({ col, row, w, h, base, rise, pal }: {
  col: number; row: number; w: number; h: number; base: number; rise: number; pal: Palette;
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

// A raised end of the roofline: the WALL carried up past the parapet and
// capped in stone.
//
// These were RoofBoxes, which shade a plain box three ways off one tint and
// are right for an air handler and wrong for a piece of a building — at the
// brick's own 0.66 they read as dark red slabs balanced on the roof. A section
// of wall takes the wall's own two tones, and its coping takes the same
// limestone as the plinth and the cornice, which is what ties it back to the
// vocabulary rather than leaving it an object sitting on top of one.
function EndPavilion({ col, row, w, h, base, pal, stone }: {
  col: number; row: number; w: number; h: number; base: number; pal: Palette; stone: StonePalette;
}) {
  const f = boxFaces(col, row, w, h, base, END_PAVILION_RISE);
  // A coping, not a slab: half the overhang and a shade below the trim. At
  // full trim white with a wide overhang, the four caps read from across the
  // map as four glaring white blocks on every hall's corners.
  const over = COPING_OVERHANG * 0.5;
  const cap = boxFaces(col - over, row - over, w + over * 2, h + over * 2, base + END_PAVILION_RISE, COPING * 0.8);
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {sideFaces(cap, shade(stone.trim, 0.78), shade(stone.trim, 0.66))}
      <polygon points={polyPoints(cap.top)} fill={shade(stone.trim, 0.9)} />
    </>
  );
}

// The centre bay: a shallow box projecting from the middle of a front, carried
// past the cornice and capped with a pediment. The building's door goes on
// ITS face rather than on the wall behind it, which is the whole point — an
// entrance that projects reads as the front of a building, where the same door
// flush in a seventy-metre wall reads as a hole in it.
//
// `outward` says which way the front faces: 'row' for the wall running along
// col, 'col' for the one running along row.
// How wide a centre bay is, in tiles: three structural bays of the wall it
// sits on, capped so it can never eat a short front. Shared by the pavilion
// and the portico that stands in front of it, so the two cannot disagree about
// where the middle of the building is.
function pavilionWidth(span: number): number {
  return Math.min(span * 0.5, (span / baysAcross(span)) * PAVILION_BAYS);
}

function CentrePavilion({ col, row, w, h, wallHeight, outward, pal, door, sills, paneW, paneShape, glass }: {
  col: number; row: number; w: number; h: number; wallHeight: number;
  outward: FaceDir;
  pal: Palette;
  door: DoorDimensions | null;
  sills: number[]; paneW: number; paneShape: WindowShape; glass: string;
}) {
  const span = wallSpan(w, h, outward);
  const width = pavilionWidth(span);
  const top = wallHeight + PAVILION_RISE;
  const bay = againstWall(col, row, w, h, outward, span / 2 - width / 2, width, PAVILION_DEPTH);
  const f = boxFaces(bay.col, bay.row, bay.w, bay.h, 0, top);
  // The face looking away from the building, and the one side of the bay
  // the camera can see.
  const faces = attachmentFaces(f, outward, pal);
  const front = { o: faces.front.origin, a: faces.front.along };
  const side = { poly: faces.side, fill: faces.sideFill };
  const frontFill = faces.frontFill;
  const apex = lift(
    { x: (front.o.x + front.a.x) / 2, y: (front.o.y + front.a.y) / 2 },
    top + PEDIMENT_RISE,
  );
  const frontTopL = lift(front.o, top);
  const frontTopR = lift(front.a, top);
  return (
    <>
      <polygon points={polyPoints(side.poly)} fill={side.fill} />
      <polygon points={polyPoints([front.o, front.a, frontTopR, frontTopL])} fill={frontFill} />
      <WallBand origin={front.o} along={front.a} wallHeight={top} from={0} to={PLINTH} className="iso-plinth" />
      <WallBand origin={front.o} along={front.a} wallHeight={top} from={wallHeight - CORNICE} to={wallHeight} className="iso-cornice" />
      {windows(front.o, front.a, top, width, sills, paneW, 'pv', paneShape, glass, door ? doorBay(door, width, top) : undefined)}
      {door && <Door d={door} origin={front.o} along={front.a} wallHeight={top} span={width} />}
      <polygon points={polyPoints(f.top)} fill={pal.roofDeck} />
      {/* The pediment, on the face the door is in. */}
      <polygon className="iso-pediment" points={polyPoints([frontTopL, frontTopR, apex])} />
    </>
  );
}

// The portico: columns standing clear of the centre bay, under an entablature.
//
// Drawn in front of the pavilion and behind the steps, which is where it
// stands: you climb the flight, pass between the columns, and reach the door.
// Columns are boxes rather than cylinders — a round shaft at this size is
// three or four pixels across, and the shading that would make it read as
// round costs more than the difference is worth. What does read is the RHYTHM:
// four uprights, evenly spaced, carrying one horizontal.
//
// `outward` matches CentrePavilion's: 'row' for the front on the col-running
// wall, 'col' for the one on the row-running wall.
function Portico({ centreCol, centreRow, width, outward, stone, columns = PORTICO_COLUMNS, height = PORTICO_HEIGHT, pediment = false }: {
  centreCol: number; centreRow: number; width: number; outward: FaceDir;
  stone: StonePalette; columns?: number; height?: number;
  // A pediment over the entablature: the Classical temple front.
  pediment?: boolean;
}) {
  if (columns < 2 || width <= 0) return null;
  const gap = (width - PORTICO_COLUMN_PLAN) / (columns - 1);
  const half = width / 2;
  const shafts = Array.from({ length: columns }, (_, i) => {
    const along = -half + PORTICO_COLUMN_PLAN / 2 + i * gap;
    return isRowWall(outward)
      ? { col: centreCol + along - PORTICO_COLUMN_PLAN / 2, row: centreRow }
      : { col: centreCol, row: centreRow + along - PORTICO_COLUMN_PLAN / 2 };
  });
  const ent = isRowWall(outward)
    ? boxFaces(centreCol - half, centreRow - COPING_OVERHANG, width, PORTICO_COLUMN_PLAN + COPING_OVERHANG * 2, height, ENTABLATURE)
    : boxFaces(centreCol - COPING_OVERHANG, centreRow - half, PORTICO_COLUMN_PLAN + COPING_OVERHANG * 2, width, height, ENTABLATURE);
  return (
    <>
      {/* Back to front, so a near column paints over the entablature's
          underside rather than the other way round. */}
      {depthOrder(shafts.map((c) => ({ ...c, w: PORTICO_COLUMN_PLAN, h: PORTICO_COLUMN_PLAN })))
        .map((c, i) => {
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
      {pediment && (() => {
        // The gable in the plane of the entablature's front, with the
        // tympanum a shade darker inside it. The roof behind it is the
        // hall's own, which the pediment stands against.
        // The entablature's corners are already at its base (boxFaces
        // lifts them), so the gable springs ENTABLATURE above them.
        const top = ENTABLATURE;
        const frontWall = wallOf(ent, outward);
        const [fo, fa] = [frontWall.origin, frontWall.along];
        const frontIsLeft = ent.dir.CD === outward;
        const mid = { x: (fo.x + fa.x) / 2, y: (fo.y + fa.y) / 2 };
        const apex = lift(mid, top + PEDIMENT_RISE);
        const inset = (q: Pt, sign: number) => ({ x: q.x + sign * 6, y: q.y });
        return (
          <>
            <polygon points={polyPoints([lift(fo, top), lift(fa, top), apex])} fill={shade(stone.towerStone, frontIsLeft ? 0.98 : 0.8)} />
            <polygon
              points={polyPoints([inset(lift(fo, top + up(0.35)), 1), inset(lift(fa, top + up(0.35)), -1), lift(mid, top + PEDIMENT_RISE - up(0.4))])}
              fill={shade(stone.towerStone, frontIsLeft ? 0.86 : 0.7)}
            />
          </>
        );
      })()}
    </>
  );
}

// THE PORCH. A projecting gabled entrance bay with a pointed arch in it,
// flanked by two buttresses — the Gothic entrance, standing where Georgian
// puts a portico.
//
// The difference between the two is the whole difference between the
// vocabularies: a portico is free-standing columns carrying a horizontal
// entablature, and a porch is a piece of the BUILDING pushed forward and
// roofed. So this draws mass and a gable where Portico draws shafts and a
// slab, and takes the wall's own palette rather than the tower's stone,
// because it is part of the wall it stands against.
function Porch({ col, row, w, h, wallHeight, outward, pal, stone }: {
  col: number; row: number; w: number; h: number; wallHeight: number;
  outward: FaceDir;
  pal: Palette; stone: StonePalette;
}) {
  // Same plan as CentrePavilion, deliberately: this IS the centre bay, so
  // it has to sit on the wall exactly where the Georgian one does or the
  // door bay reserved on the main wall lines up with nothing.
  const span = wallSpan(w, h, outward);
  const width = pavilionWidth(span);
  // Lower than the wall behind it — see PORCH_HEIGHT_FRACTION.
  const top = wallHeight * PORCH_HEIGHT_FRACTION;
  const bayAlong = span / 2 - width / 2;
  const bay = againstWall(col, row, w, h, outward, bayAlong, width, PAVILION_DEPTH);
  const f = boxFaces(bay.col, bay.row, bay.w, bay.h, 0, top);

  const faces = attachmentFaces(f, outward, pal);
  const front = { o: faces.front.origin, a: faces.front.along };
  const side = { poly: faces.side, fill: faces.sideFill };
  const frontFill = faces.frontFill;
  const frontTopL = lift(front.o, top);
  const frontTopR = lift(front.a, top);
  // The gable: steep, and rising off the bay's own head rather than off a
  // cornice, because there is no cornice to rise off in this vernacular.
  const apex = lift(
    { x: (front.o.x + front.a.x) / 2, y: (front.o.y + front.a.y) / 2 },
    top + PORCH_GABLE_RISE,
  );

  // A buttress at each front corner of the bay, flush with its sides. Two
  // stacked boxes: the upper one shallower, so the set-off reads as a step
  // rather than as a change of colour.
  const buttress = (nearSide: boolean) => {
    // At one end of the bay or the other, flush with its side.
    const along0 = bayAlong + (nearSide ? 0 : width - BUTTRESS_PLAN);
    const lowH = top * BUTTRESS_SETOFF_FRACTION;
    const lo = againstWall(col, row, w, h, outward, along0, BUTTRESS_PLAN, PAVILION_DEPTH);
    const lower = boxFaces(lo.col, lo.row, lo.w, lo.h, 0, lowH);
    // Stepping back means losing DEPTH — the projecting dimension — not span.
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

  return (
    <>
      {buttress(false)}
      <polygon points={polyPoints(side.poly)} fill={side.fill} />
      <polygon points={polyPoints([front.o, front.a, frontTopR, frontTopL])} fill={frontFill} />
      <WallBand origin={front.o} along={front.a} wallHeight={top} from={0} to={PLINTH} className="iso-plinth" />
      {/* ONE OPENING AND NOTHING ELSE on this face. A rank of windows around
          the doorway is what made this bay read as a Georgian pavilion with
          a Gothic arch stuck on it; an entrance bay is an entrance. */}
      <polygon
        className="iso-door"
        points={polyPoints(
          windowOutline('lancet', archU0, archU1, 0, PORCH_ARCH_HEIGHT)
            .map(([u, v]) => facePoint(front.o, front.a, top, u, v)),
        )}
      />
      <polygon points={polyPoints(f.top)} fill={pal.roofDeck} />
      {/* The gable, last on this bay so it closes the roof rather than
          disappearing behind it. */}
      <polygon points={polyPoints([frontTopL, frontTopR, apex])} fill={shade(pal.roof, 1.04)} />
      {buttress(true)}
    </>
  );
}

// A STACKED MASS: a set-back base, a main slab cantilevering out over it on
// every side, and a plant room stepped back on top.
//
// This is the one thing a vernacular changes that is NOT ornament (see
// buildingSpec's Massing). Brutalism cannot be done by swapping a portico
// for a recess and repainting the walls, because what makes these buildings
// what they are is the shape: slabs of different plan piled up, with the
// shadow line under the overhang doing the work a cornice does elsewhere.
//
// The overhang is the BASE PULLING IN rather than the slab pushing out, so
// every volume stays inside the footprint and a stacked building cannot
// reach over the tiles beside it.
function StackedMass({ col, row, w, h, height, pal, stone, paneShape, paneW, ranks }: {
  col: number; row: number; w: number; h: number; height: number;
  pal: Palette; stone: StonePalette; paneShape: WindowShape; paneW: number; ranks: number;
}) {
  const lowTop = height * STACK_LOWER_TOP;
  const upH = height - lowTop;
  // Step on the LONGER axis, so the offset has room to read.
  const alongW = w >= h;
  const inset = (alongW ? w : h) * STACK_UPPER_INSET;
  const over = (alongW ? h : w) * STACK_UPPER_OVERHANG;

  const low = boxFaces(col, row, w, h, 0, lowTop);
  // The upper slab pulls back from the far end and cantilevers a little past
  // the near one, so its soffit shows against the base below it.
  const uc = alongW ? col + inset : col - over;
  const ur = alongW ? row - over : row + inset;
  const uw = alongW ? w - inset : w + over;
  const uh = alongW ? h + over : h - inset;
  const up = boxFaces(uc, ur, uw, uh, lowTop, upH);

  const lowBands = Math.max(1, Math.round(ranks * STACK_LOWER_TOP));
  const upBands = Math.max(1, ranks - lowBands);
  const lowSills = rankSills(lowBands).map((v) => (v / (lowBands * STOREY)) * lowTop);
  const upSills = rankSills(upBands).map((v) => (v / (upBands * STOREY)) * upH);

  return (
    <>
      {/* The broad base. */}
      <polygon points={polyPoints(low.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(low.right)} fill={pal.wallRight} />
      {windows(low.D, low.C, lowTop, low.spanLeft, lowSills, paneW, 'sl', paneShape, stone.glass)}
      {windows(low.C, low.B, lowTop, low.spanRight, lowSills, paneW, 'sr', paneShape, stone.glass)}
      <polygon points={polyPoints(low.top)} fill={pal.roof} />

      {/* The soffit: the underside of the slab where it hangs past the base.
          One dark face, and the only thing that says "cantilever" from
          above — without it the upper volume just looks like it starts
          higher up. */}
      <polygon className="iso-undercroft" points={polyPoints(
        alongW
          ? [lift(project(uc, ur), lowTop), lift(project(uc + uw, ur), lowTop),
            lift(project(uc + uw, row), lowTop), lift(project(uc, row), lowTop)]
          : [lift(project(uc, ur), lowTop), lift(project(uc, ur + uh), lowTop),
            lift(project(col, ur + uh), lowTop), lift(project(col, ur), lowTop)],
      )} />

      {/* The upper slab, stepped back on one axis. */}
      <polygon points={polyPoints(up.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(up.right)} fill={pal.wallRight} />
      {windows(up.D, up.C, upH, up.spanLeft, upSills, paneW, 'ul', paneShape, stone.glass)}
      {windows(up.C, up.B, upH, up.spanRight, upSills, paneW, 'ur', paneShape, stone.glass)}
      <polygon points={polyPoints(up.top)} fill={pal.roof} />
    </>
  );
}

// THE ARCADE. A covered walk of round arches along the front of a building,
// on square piers standing clear of the wall.
//
// Where a portico gathers columns into a centre bay you pass THROUGH, an
// arcade runs the length of the front and you walk ALONG it — which is how
// every one of these campuses is actually organised, and why the part is
// worth having rather than tinting a colonnade terracotta. Lower than a
// portico too: you are meant to be in its shade.
function Arcade({ col, row, w, h, outward, pal, stone, height = ARCADE_HEIGHT }: {
  col: number; row: number; w: number; h: number;
  outward: FaceDir; pal: Palette; stone: StonePalette;
  // Clamped by the caller under the eaves of the wall it stands against. At
  // its full 7.2 m an arcade rose above a one-storey dining hall's roof and
  // the building became a red slab on posts.
  height?: number;
}) {
  const span = wallSpan(w, h, outward);
  const bays = Math.max(2, Math.min(ARCADE_MAX,
    Math.round((span * METRES_PER_TILE) / ARCADE_BAY_METRES)));
  const walk = againstWall(col, row, w, h, outward, 0, span, ARCADE_DEPTH);

  // The piers, back to front so a near one paints over the arch behind it.
  // Whitewashed — the trim — against the wall, as the reference campuses
  // have them.
  const piers = depthOrder(Array.from({ length: bays + 1 }, (_, i) => {
    const at = Math.min(Math.max((i / bays) * span - ARCADE_PIER / 2, 0), span - ARCADE_PIER);
    return againstWall(col, row, w, h, outward, at, ARCADE_PIER, ARCADE_DEPTH);
  }));

  const front = boxFaces(walk.col, walk.row, walk.w, walk.h, 0, height);
  const frontWall = wallOf(front, outward);
  const o = frontWall.origin;
  const a = frontWall.along;

  // The tiled lean-to over the walk: one sloped face from the arcade's
  // outer edge up to the wall, in the roof's own tile and lit by the way it
  // faces, with the eaves line along its foot. It was a flat red slab. And
  // the end nearest the camera: the small triangle that closes the roof
  // over the last bay.
  const RISE = up(1.3);
  const roof = leanToRoof(front, outward, height, RISE, pal);

  return (
    <>
      {/* The shaded walk behind the arches. */}
      <polygon className="iso-undercroft" points={polyPoints(frontWall.poly)} />
      {/* One round-headed opening per bay, cut in the arcade's own front. */}
      {Array.from({ length: bays }, (_, i) => {
        // Most of the bay is opening: an arcade is arches carried on piers,
        // and the first drawing had it the other way about, piers with a
        // small arch between.
        const u0 = (i + 0.09) / bays;
        const u1 = (i + 0.91) / bays;
        return (
          <polygon
            key={i}
            className="iso-undercroft"
            points={polyPoints(
              windowOutline('arched', u0, u1, 0.02, 0.9)
                .map(([u, v]) => facePoint(o, a, height, u, v)),
            )}
          />
        );
      })}
      {piers.map((p, i) => {
        const f = boxFaces(p.col, p.row, p.w, p.h, 0, height);
        return (
          <g key={i}>
            {sideFaces(f, shade(stone.trim, 0.94), shade(stone.trim, 0.76))}
          </g>
        );
      })}
      <polygon points={polyPoints(roof.endCap)} fill={roof.endCapFill} />
      <polygon points={polyPoints(roof.leanTo)} fill={roof.leanToFill} />
      <WallBand origin={o} along={a} wallHeight={height} from={height - COPING * 0.7} to={height} className="iso-cornice" />
    </>
  );
}


// How tall an arcade can be against THIS wall: its own height, or as much of
// the wall as leaves the eaves course clear above it. A wall too short for
// even a stunted arcade gets a canopy instead — see arcadeFits.
function arcadeHeight(wallHeight: number): number {
  return Math.min(ARCADE_HEIGHT, wallHeight - EAVES_COURSE - COPING - up(0.4));
}
function arcadeFits(wallHeight: number): boolean {
  return wallHeight >= STOREY * 1.6;
}

// THE CAMPANILE. A square bell tower: a plain shaft, an open belfry with a
// round-arched opening on each face, and a shallow pyramid of tile.
//
// Taller and plainer than a cupola, which is what a bell tower is next to a
// dome — the ornament is the OPENING, not the crown.
function Campanile({ col, row, w, h, base, stone, pal, gilded }: {
  col: number; row: number; w: number; h: number; base: number;
  stone: StonePalette; pal: Palette; gilded: boolean;
}) {
  const plan = Math.min(CAMPANILE_PLAN, Math.min(w, h) * 0.38);
  const cc = col + w / 2; const cr = row + h / 2;
  const shaft = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, CAMPANILE_RISE);
  const belfryBase = base + CAMPANILE_RISE;
  const belfry = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, belfryBase, CAMPANILE_BELFRY_RISE);
  const capBase = belfryBase + CAMPANILE_BELFRY_RISE;

  const At = lift(project(cc - plan / 2, cr - plan / 2), capBase);
  const Bt = lift(project(cc + plan / 2, cr - plan / 2), capBase);
  const Ct = lift(project(cc + plan / 2, cr + plan / 2), capBase);
  const Dt = lift(project(cc - plan / 2, cr + plan / 2), capBase);
  const tip = lift(project(cc, cr), capBase + CAMPANILE_CAP_RISE);
  const faces: Array<[Pt, Pt, number]> = [
    [At, Dt, 1.10], [At, Bt, 1.00], [Dt, Ct, 0.84], [Bt, Ct, 0.70],
  ];

  return (
    <>
      {sideFaces(shaft, shade(stone.towerStone, 0.97), shade(stone.towerStone, 0.8))}
      {sideFaces(belfry, shade(stone.towerStone, 0.93), shade(stone.towerStone, 0.77))}
      {/* Two arches a face, on a shared centre pier: the arcaded belfry of
          the reference towers rather than a single hole. */}
      {([[belfry.D, belfry.C, 'cl'] as const, [belfry.C, belfry.B, 'cr'] as const]).map(([bo, ba, k]) => (
        [[0.14, 0.46] as const, [0.54, 0.86] as const].map(([u0, u1]) => (
          <polygon
            key={`${k}${u0}`}
            className="iso-undercroft"
            points={polyPoints(
              windowOutline('arched', u0, u1, 0.1, 0.9)
                .map(([u, v]) => facePoint(bo, ba, CAMPANILE_BELFRY_RISE, u, v)),
            )}
          />
        ))
      ))}
      {/* A shallow pyramid of the same tile as the roofs below it. */}
      {faces.map(([fa, fb], i) => (
        <polygon key={i} points={polyPoints([fa, fb, tip])} fill={shade(pal.roof, faces[i][2])} />
      ))}
      {gilded && (
        <circle className="iso-dome" cx={tip.x} cy={tip.y - 3} r={2} fill={stone.gilt} />
      )}
    </>
  );
}

// THE ARCHWAY. A Mission residence hall's way in: a small porch in the
// wall's own stucco with one round-headed opening in its front and a
// lean-to of tile over it — the canopy's job, done in the vernacular's own
// materials. Its floor is the door's threshold, so the flight in front
// climbs to the porch and the porch leads to the door, and the plinth under
// the opening is that raised floor seen from outside.
function Archway({ d, col, row, w, h, outward, wallHeight, pal, stone }: {
  d: DoorDimensions; col: number; row: number; w: number; h: number; outward: FaceDir;
  wallHeight: number; pal: Palette; stone: StonePalette;
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
  const RISE = up(1.1);
  const roof = leanToRoof(f, outward, top, RISE, pal);
  const floor = d.threshold / top;
  const outline = (u0: number, u1: number, v1: number) =>
    polyPoints(windowOutline('arched', u0, u1, floor, v1).map(([u, v]) => facePoint(o, a, top, u, v)));
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {/* A whitewashed surround, and the shaded walk behind the arch. */}
      <polygon points={outline(0.17, 0.83, 0.94)} fill={stone.trim} />
      <polygon className="iso-undercroft" points={outline(0.21, 0.79, 0.9)} />
      <polygon points={polyPoints(roof.endCap)} fill={roof.endCapFill} />
      <polygon points={polyPoints(roof.leanTo)} fill={roof.leanToFill} />
    </>
  );
}

// THE ESPADAÑA. The Mission bell-gable: the front wall carried up past the
// eaves at its centre, a cove shoulder each side of a bell in a round-headed
// opening, and a small gable on top. The reference campuses all wear one,
// and without it a Mission front is a Tuscan one. No cross: the bell is the
// campus's, not a chapel's.
//
// Drawn in the wall's own plane above v = 1 and AFTER the roof, so it
// stands in front of the slope behind it; `inward` is the same face set
// back by the gable's thickness, which gives it a lit return so it reads as
// a wall and not a cut-out.
function BellGable({ origin, along, inward, wallHeight, span, centreU, sideAt, pal, stone, scale = 1 }: {
  origin: Pt; along: Pt; inward: { origin: Pt; along: Pt };
  wallHeight: number; span: number; centreU: number;
  // Which end of the gable shows its return: the +u end on the left wall,
  // the -u end on the right, since that is the way each faces the camera.
  sideAt: 'u0' | 'u1';
  pal: Palette; stone: StonePalette;
  // A pavilion's is smaller than a hall's, in every dimension at once.
  scale?: number;
}) {
  const at = (u: number, v: number) => facePoint(origin, along, wallHeight, u, v);
  const back = (u: number, v: number) => facePoint(inward.origin, inward.along, wallHeight, u, v);
  const widthTiles = Math.min(span * 0.36, across(10.5 * scale));
  const hw = widthTiles / span / 2;
  const u0 = centreU - hw; const u1 = centreU + hw;
  const V = (m: number) => 1 + up(m * scale) / wallHeight;
  const shoulder = V(1.4); const neck = V(4.0); const top = V(6.4); const peak = V(7.3);
  const q = hw * 0.48;           // how far each shoulder steps in
  // A cove: a quarter of a circle from the outer edge up into the neck.
  const cove = (from: number, dir: 1 | -1): Array<[number, number]> =>
    Array.from({ length: 6 }, (_, i) => {
      const t = (i + 1) / 6 * Math.PI / 2;
      return [from + dir * q * (1 - Math.cos(t)), shoulder + (neck - shoulder) * Math.sin(t)];
    });
  const profile: Array<[number, number]> = [
    [u0, 1], [u0, shoulder], ...cove(u0, 1),
    [u0 + q, top], [centreU, peak], [u1 - q, top],
    ...cove(u1, -1).reverse(), [u1, shoulder], [u1, 1],
  ];
  const su = sideAt === 'u1' ? u1 : u0;
  const nu = sideAt === 'u1' ? u1 - q : u0 + q;
  const face = sideAt === 'u1' ? pal.wallLeft : pal.wallRight;
  const ret = sideAt === 'u1' ? pal.wallRight : pal.wallLeft;
  const bellU = hw * 0.3;
  const opening = windowOutline('arched', centreU - bellU, centreU + bellU, V(0.9), V(5.5));
  const finial = { x: at(centreU, peak).x, y: at(centreU, peak).y };
  const finialRise = wallHeight * (V(0.7) - 1);
  return (
    <>
      {/* The returns first: the outer edge below the shoulder, and the neck. */}
      <polygon points={polyPoints([at(su, 1), at(su, shoulder), back(su, shoulder), back(su, 1)])} fill={ret} />
      <polygon points={polyPoints([at(nu, neck), at(nu, top), back(nu, top), back(nu, neck)])} fill={ret} />
      <polygon points={polyPoints(profile.map(([u, v]) => at(u, v)))} fill={face} />
      <polygon className="iso-undercroft" points={polyPoints(opening.map(([u, v]) => at(u, v)))} />
      {/* The bell: a small trapezoid of bronze hanging in the opening. */}
      <polygon points={polyPoints([at(centreU - bellU * 0.5, V(2.0)), at(centreU + bellU * 0.5, V(2.0)), at(centreU + bellU * 0.22, V(3.7)), at(centreU - bellU * 0.22, V(3.7))])} fill={stone.gilt} />
      {/* A small bronze finial at the peak, the same one the campanile wears. */}
      <line x1={finial.x} y1={finial.y} x2={finial.x} y2={lift(finial, finialRise).y} stroke={stone.gilt} strokeWidth={1.2} />
      <circle cx={finial.x} cy={lift(finial, finialRise).y} r={1.6} fill={stone.gilt} />
    </>
  );
}

// BUTTRESSES down a wall: a stepped pier at every bay line, clear of the
// entrance bay and of a corner a tower already holds. Two set-offs, as the
// porch's have, shallower above than below. They are what makes a stone
// wall read as Gothic construction rather than a Georgian wall painted
// grey: the structure is on the outside.
function Buttresses({ col, row, w, h, height, outward, pal, stone, reserve, skipNear = 0 }: {
  col: number; row: number; w: number; h: number; height: number; outward: FaceDir;
  pal: Palette; stone: StonePalette;
  // The stretch of this wall, in u, that its entrance takes.
  reserve?: [number, number];
  // How much of the wall's near end, in tiles, a corner tower occupies.
  skipNear?: number;
}) {
  const span = wallSpan(w, h, outward);
  const bays = baysAcross(span);
  if (bays < 2) return null;
  const depth = across(0.85);
  const shrink = depth * 0.42;
  const lowH = height * 0.5; const midH = height * 0.82;
  const out: React.JSX.Element[] = [];
  for (let b = 1; b < bays; b++) {
    const u = b / bays;
    if (reserve && u > reserve[0] - 0.03 && u < reserve[1] + 0.03) continue;
    const along = u * span;
    // The corner tower stands at the +col, +row corner, so only those two
    // walls run into it.
    if (skipNear > 0 && (outward === 'posRow' || outward === 'posCol') && along > span - skipNear - BUTTRESS_PLAN) continue;
    const lo = againstWall(col, row, w, h, outward, along - BUTTRESS_PLAN / 2, BUTTRESS_PLAN, depth);
    const lower = boxFaces(lo.col, lo.row, lo.w, lo.h, 0, lowH);
    const hi = againstWall(col, row, w, h, outward, along - BUTTRESS_PLAN / 2, BUTTRESS_PLAN, depth - shrink);
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

// MERLONS along the head of a wall: a crenellated parapet, as real blocks
// standing on the wall top rather than a zigzag painted on its face, so
// they catch the light the way the wall does.
//
// The same row of blocks, made thin and pale and given a rail, is a
// BALUSTRADE — the Classical parapet — which is why the sizes are props.
function Merlons({ col, row, w, h, base, outward, pal, block = across(1.1), gap = across(0.9), rise = up(1.0), depth = across(0.5), fill, rail = false }: {
  col: number; row: number; w: number; h: number; base: number; outward: FaceDir; pal: Palette;
  block?: number; gap?: number; rise?: number; depth?: number;
  // A stone other than the wall's, for a balustrade cut in trim.
  fill?: string;
  rail?: boolean;
}) {
  const span = wallSpan(w, h, outward);
  const m = block; const g = gap;
  const n = Math.max(1, Math.floor((span - g) / (m + g)));
  const start = (span - (n * m + (n - 1) * g)) / 2;
  const left = fill ? shade(fill, 0.96) : pal.wallLeft;
  const right = fill ? shade(fill, 0.8) : pal.wallRight;
  const top = fill ? fill : shade(pal.wallLeft, 1.08);
  const rb = againstWall(col, row, w, h, outward, start, span - start * 2, depth, depth);
  const railBox = boxFaces(rb.col, rb.row, rb.w, rb.h, base + rise, rise * 0.22);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const along = start + i * (m + g);
        const b = againstWall(col, row, w, h, outward, along, m, depth, depth);
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

// A BALUSTRADE along the head of a parapet: thin balusters under a rail,
// cut in trim. Merlons with the proportions changed, and the Classical
// answer to Gothic's crenellations — the same place on the building,
// closed with ornament instead of with defence.
function Balustrade({ col, row, w, h, base, outward, pal, stone }: {
  col: number; row: number; w: number; h: number; base: number; outward: FaceDir;
  pal: Palette; stone: StonePalette;
}) {
  return (
    <Merlons col={col} row={row} w={w} h={h} base={base} outward={outward} pal={pal}
      block={across(0.32)} gap={across(0.5)} rise={up(0.95)} depth={across(0.32)} fill={stone.trim} rail />
  );
}

// THE DOME. A broad stone dome on a low drum, standing on the roof of the
// campus's one landmark — Low Library, MIT's Great Dome, the Rotunda. Not
// the gilded cupola on its clock tower: this is the building's own crown
// and most of its silhouette, in stone, with a small gilt lantern on top.
function Dome({ col, row, w, h, base, stone }: {
  col: number; row: number; w: number; h: number; base: number; stone: StonePalette;
}) {
  const r = Math.min(across(9.5), Math.min(w, h) * 0.26);
  const cc = col + w / 2; const cr = row + h / 2;
  const DRUM = up(5.0); const RISE = up(6.5);
  const centre = project(cc, cr);
  const ring = projectedCircle(cc, cr, r, 48);
  // The drum's visible half is the half of the ring nearer the camera,
  // split at the centre line into a lit and a shaded face.
  const front = ring.filter((p) => p.y >= centre.y - 0.01).sort((a, b) => a.x - b.x);
  const lit = front.filter((p) => p.x <= centre.x + 0.01);
  const dark = front.filter((p) => p.x >= centre.x - 0.01);
  const wall = (pts: Pt[]) => polyPoints([...pts.map((p) => lift(p, base)), ...[...pts].reverse().map((p) => lift(p, base + DRUM))]);
  const rx = (Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x))) / 2;
  const top = lift(centre, base + DRUM);
  const cap = (scale: number, dx: number): string => {
    const pts: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      pts.push(`${(top.x + dx + Math.cos(a) * rx * scale).toFixed(2)},${(top.y + Math.sin(a) * RISE * scale * heightScale()).toFixed(2)}`);
    }
    return pts.join(' ');
  };
  const lanternFoot = lift(top, RISE);
  return (
    <>
      <polygon points={wall(lit)} fill={shade(stone.towerStone, 0.97)} />
      <polygon points={wall(dark)} fill={shade(stone.towerStone, 0.8)} />
      <polygon points={polyPoints(ring.map((p) => lift(p, base + DRUM)))} fill={shade(stone.towerStone, 0.9)} />
      {/* The dome, and a lit crescent on its left shoulder. */}
      <polygon points={cap(1, 0)} fill={shade(stone.towerStone, 0.86)} />
      <polygon points={cap(0.78, -rx * 0.12)} fill={shade(stone.towerStone, 0.96)} />
      {/* The lantern, and the gilt finial on it. */}
      <rect x={lanternFoot.x - 3} y={lanternFoot.y - 7} width={6} height={8} fill={shade(stone.towerStone, 0.92)} />
      <line className="iso-finial" x1={lanternFoot.x} y1={lanternFoot.y - 7} x2={lanternFoot.x} y2={lanternFoot.y - 14} stroke={stone.gilt} />
      <circle cx={lanternFoot.x} cy={lanternFoot.y - 14} r={1.8} fill={stone.gilt} />
    </>
  );
}

// A TOWER at the near corner of a building: square, in the wall's own
// stone, standing a little proud of both walls and rising past the eaves,
// lancets up its faces, and a slate pyramid on top — inside a crenellated
// head on the halls, plain on the residence halls. The corner tower is
// what says "collegiate Gothic" from across the map: Duke's and Chicago's
// quads are all corners like this, and it is the piece the set was missing
// when it read as Georgian in grey.
//
// At the NEAR corner deliberately. Its two drawn faces lie a hand's breadth
// in front of the building's own two visible walls, so nothing of it is
// ever painted where the building should show through; a tower at either
// far corner would have a face inside the mass behind it.
function CornerTower({ col, row, plan, height, pal, glass, sills, paneW, crenels, capRise }: {
  col: number; row: number; plan: number; height: number;
  pal: Palette; glass: string; sills: number[]; paneW: number;
  crenels: boolean; capRise: number;
}) {
  const f = boxFaces(col, row, plan, plan, 0, height);
  // A crenellated tower is flat-topped — the leads behind the parapet —
  // and a plain one carries a slate pyramid. A pyramid inside a parapet
  // read as nothing at all against the hall's own slate behind it.
  const At = lift(project(col, row), height);
  const Bt = lift(project(col + plan, row), height);
  const Ct = lift(project(col + plan, row + plan), height);
  const Dt = lift(project(col, row + plan), height);
  const tip = lift(project(col + plan / 2, row + plan / 2), height + capRise);
  const faces: Array<[Pt, Pt, number]> = [[At, Dt, 1.10], [At, Bt, 1.00], [Dt, Ct, 0.84], [Bt, Ct, 0.70]];
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {windows(f.D, f.C, height, f.spanLeft, sills, paneW * 0.6, 'tl', 'lancet', glass)}
      {windows(f.C, f.B, height, f.spanRight, sills, paneW * 0.6, 'tr', 'lancet', glass)}
      <WallBand origin={f.D} along={f.C} wallHeight={height} from={height - CORNICE} to={height} className="iso-cornice" />
      <WallBand origin={f.C} along={f.B} wallHeight={height} from={height - CORNICE} to={height} className="iso-cornice" />
      <polygon points={polyPoints(f.top)} fill={pal.roofDeck} />
      {!crenels && faces.map(([a, b, k], i) => <polygon key={i} points={polyPoints([a, b, tip])} fill={shade(pal.roof, k)} />)}
      {crenels && [visibleWalls().left, visibleWalls().right].map((dir) => (
        <Merlons key={dir} col={col} row={row} w={plan} h={plan} base={height} outward={dir} pal={pal} />
      ))}
    </>
  );
}

// THE RECESS. The Brutalist way in: the ground floor cut away across the
// middle of the front, with the mass above left oversailing it on a slab.
//
// It is the one entrance in this vocabulary that ADDS nothing — no columns,
// no bay, no canopy. What you see is a dark undercut and the shadow line of
// the slab over it, which is exactly how these buildings are entered.
function Recess({ col, row, w, h, wallHeight, outward, pal }: {
  col: number; row: number; w: number; h: number; wallHeight: number;
  outward: FaceDir; pal: Palette;
}) {
  const span = wallSpan(w, h, outward);
  const width = span * RECESS_WIDTH;
  const height = Math.min(wallHeight * 0.3, STOREY * 1.25);
  const along0 = span / 2 - width / 2;

  // The cut-away itself: a dark box sunk into the wall's own plane. Drawn as
  // the two faces you can actually see into, which is what makes it read as
  // depth rather than as a black rectangle painted on the front.
  const c = againstWall(col, row, w, h, outward, along0, width, RECESS_DEPTH, RECESS_DEPTH);
  const cut = boxFaces(c.col, c.row, c.w, c.h, 0, height);
  // The slab that oversails it, projecting past the wall.
  const sl = againstWall(col, row, w, h, outward, along0 - RECESS_OVERHANG, width + RECESS_OVERHANG * 2, RECESS_DEPTH + RECESS_OVERHANG, RECESS_DEPTH);
  const slab = boxFaces(sl.col, sl.row, sl.w, sl.h, height, CANOPY_SLAB * 1.6);

  return (
    <>
      <polygon className="iso-undercroft" points={polyPoints(cut.left)} />
      <polygon className="iso-undercroft" points={polyPoints(cut.right)} />
      <polygon className="iso-undercroft" points={polyPoints(cut.top)} />
      {sideFaces(slab, shade(pal.wallLeft, 0.92), shade(pal.wallRight, 0.92))}
      <polygon points={polyPoints(slab.top)} fill={shade(pal.wallLeft, 1.04)} />
    </>
  );
}

// THE STAIR CORE. What a Brutalist landmark tops out with, which is to say
// barely anything: a blind concrete shaft carrying the stairs and the lift
// overrun past the roof slab.
//
// Deliberately NOT a landmark. Georgian gilds its tower and Gothic points
// it; this architecture puts the one thing that has to be up there up there
// and leaves it blank, and the campus's landmark is the mass itself.
function StairCore({ col, row, w, h, base, stone }: {
  col: number; row: number; w: number; h: number; base: number; stone: StonePalette;
}) {
  const plan = Math.min(CORE_PLAN, Math.min(w, h) * 0.34);
  const cc = col + w / 2; const cr = row + h / 2;
  const shaft = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, CORE_RISE);
  const capPlan = plan * 0.55;
  const cap = boxFaces(cc - capPlan / 2, cr - capPlan / 2, capPlan, capPlan, base + CORE_RISE, CORE_CAP_RISE);
  return (
    <>
      {sideFaces(shaft, shade(stone.towerStone, 0.97), shade(stone.towerStone, 0.79))}
      <polygon points={polyPoints(shaft.top)} fill={shade(stone.towerStone, 0.9)} />
      {sideFaces(cap, shade(stone.towerStone, 0.9), shade(stone.towerStone, 0.74))}
      <polygon points={polyPoints(cap.top)} fill={shade(stone.towerStone, 0.86)} />
    </>
  );
}

// BUTTRESS PIERS along a clear-span wall. A sports hall's walls are held up
// at bay centres, and those piers are most of what you actually see of a gym
// from outside — without them a hangar is a blank box with one stripe of glass
// across it. Shallow boxes standing against the wall rather than bands painted
// on it, so they catch the light on one face and not the other, which is the
// whole reason they read as depth.
function Piers({ col, row, w, h, height, outward, pal, stone }: {
  col: number; row: number; w: number; h: number; height: number;
  outward: FaceDir; pal: Palette; stone: StonePalette;
}) {
  const span = wallSpan(w, h, outward);
  const count = Math.max(2, Math.round((span * METRES_PER_TILE) / (BAY_METRES * 2)));
  const plan = across(PIER_WIDTH_METRES);
  return (
    <>
      {Array.from({ length: count + 1 }, (_, i) => {
        const at = (i / count) * span - plan / 2;
        const pier = againstWall(col, row, w, h, outward, at, plan, PIER_PROJECTION);
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

// A CANOPY over a door: a slab on two posts. What a dining hall, a clinic or a
// union puts over its entrance, and the cheapest way to make a low pavilion
// read as somewhere you go IN rather than as a shed with a door in it.
function Canopy({ d, col, row, w, h, outward, wallHeight, stone, hood = false, roof }: {
  d: DoorDimensions; col: number; row: number; w: number; h: number; outward: FaceDir;
  wallHeight: number; stone: StonePalette;
  // A pitched hood — a small gable over the door — instead of a flat slab.
  // The Gothic set's canopy; `roof` is the slate it is tiled in.
  hood?: boolean; roof?: string;
}) {
  // A vernacular with no trim (Modern) still has canopies: they are cast
  // in the same pale concrete as its stair core.
  const canopyStone = stone.trim === 'none' ? stone.towerStone : stone.trim;
  // Clamped under the eaves. The smallest pavilion on the campus is ONE storey
  // — the founding dining hall — and a civic door plus its threshold plus the
  // clearance this wanted came to more than that wall is tall, so the slab
  // floated above the roof of the building it was supposed to be attached to.
  // Same class of mistake as a door taller than its own wall, and caught the
  // same way: by measuring rather than by looking.
  const top = Math.min(d.threshold + d.height + up(0.6), wallHeight - EAVES_COURSE - CANOPY_SLAB);
  if (top <= d.threshold + d.height * 0.5) return null;
  const width = d.widthTiles * 1.7;
  const span = wallSpan(w, h, outward);
  const mid = span / 2;
  const plate = againstWall(col, row, w, h, outward, mid - width / 2, width, CANOPY_DEPTH);
  // THIN, and a shade below the trim. The first slab was pure trim white and
  // as thick as a step, on two tall posts, and standing on the lawn in front
  // of every pavilion and residence hall it read as a picnic table. A canopy
  // is a thin plate with a dark underside, and its shadow on the ground is
  // most of what says it is up in the air.
  const slabT = CANOPY_SLAB * 0.55;
  const slab = boxFaces(plate.col, plate.row, plate.w, plate.h, top, slabT);
  const postAt = (sign: number) => {
    // A post at each end of the plate, at its outer edge.
    const along0 = mid + (sign < 0 ? -width / 2 : width / 2 - CANOPY_POST);
    const post = againstWall(col, row, w, h, outward, along0, CANOPY_POST, CANOPY_POST, -(CANOPY_DEPTH - CANOPY_POST));
    return boxFaces(post.col, post.row, post.w, post.h, 0, top);
  };
  // The shadow the plate throws, away from the sun like every shadow on the
  // map (see light.ts). Drawn here rather than in the map's shadow pass
  // because it is the canopy's own, on the ground it hangs over.
  const shadowAt = shadowOffset(top);
  const shadow = boxFaces(plate.col + shadowAt.dcol, plate.row + shadowAt.drow, plate.w, plate.h, 0, 0).top;

  const gable = hood && roof ? (() => {
    // A little pitched roof: ridge running out from the wall, two slopes
    // either side of it — each pointing along the wall, and tinted by the
    // grid direction it points — and the gable end facing the path.
    const rise = up(1.2);
    const f = slab;
    const rIn = outsideWall(col, row, w, h, outward, mid, 0);
    const rOut = outsideWall(col, row, w, h, outward, mid, CANOPY_DEPTH);
    const ridgeIn = lift(project(rIn.col, rIn.row), top + rise);
    const ridgeOut = lift(project(rOut.col, rOut.row), top + rise);
    const halves: Array<[Pt[], number]> = isRowWall(outward)
      ? [[[f.NWt, ridgeIn, ridgeOut, f.SWt], 1.12], [[f.NEt, ridgeIn, ridgeOut, f.SEt], 0.84]]
      : [[[f.NWt, ridgeIn, ridgeOut, f.NEt], 1.0], [[f.SWt, ridgeIn, ridgeOut, f.SEt], 0.7]];
    const end = wallOf(f, outward);
    return (
      <>
        {halves.map(([pts, k], i) => <polygon key={i} points={polyPoints(pts)} fill={shade(roof, k)} />)}
        <polygon points={polyPoints([lift(end.origin, slabT), lift(end.along, slabT), ridgeOut])} fill={shade(canopyStone, 0.8)} />
      </>
    );
  })() : null;

  return (
    <>
      <polygon className="campus-building-shadow" points={polyPoints(shadow)} />
      {[-1, 1].map((sign) => {
        const f = postAt(sign);
        return (
          <g key={sign}>
            {sideFaces(f, shade(canopyStone, 0.62), shade(canopyStone, 0.5))}
          </g>
        );
      })}
      {sideFaces(slab, shade(canopyStone, 0.66), shade(canopyStone, 0.56))}
      <polygon points={polyPoints(slab.top)} fill={shade(canopyStone, 0.9)} />
      {gable}
    </>
  );
}

// A CURTAIN WALL: a continuous field of glass divided by mullions, rather than
// openings punched in a wall.
//
// That distinction is the whole reason the hospital's public wing needed its
// own treatment. Punched windows say "masonry with holes in it"; a curtain
// wall says the wall IS the glazing, which is what a hospital's entrance front
// and an atrium actually are. The mullions sit on the same bay grid every
// window on the campus uses, so the two systems agree about where the
// structure is even though they look nothing alike.
function CurtainWall({ origin, along, wallHeight, spanTiles, from, to, floors, id, u0 = 0, u1 = 1 }: {
  origin: Pt; along: Pt; wallHeight: number; spanTiles: number;
  from: number;          // the head of the undercroft: glazing starts here
  to?: number;           // and stops here — the eaves unless the glazing is a
                         // ground-floor band (a shed's concourse, an entrance bay)
  floors: number[];      // floor lines, for the transoms
  id: string;            // NOT `key`: React reserves that, and passing it here
                         // reaches the component as undefined
  // The stretch of the wall the glazing covers, in the wall's own u. The
  // whole face by default; an entrance bay is a few bays around the door.
  u0?: number; u1?: number;
}) {
  if (wallHeight <= 0 || spanTiles <= 0 || u1 <= u0) return null;
  const v0 = from / wallHeight;
  const v1 = Math.min(1, (to ?? wallHeight) / wallHeight);
  if (v1 <= v0) return null;
  const quad = (a0: number, a1: number, a: number, b: number) => polyPoints([
    facePoint(origin, along, wallHeight, a0, a),
    facePoint(origin, along, wallHeight, a1, a),
    facePoint(origin, along, wallHeight, a1, b),
    facePoint(origin, along, wallHeight, a0, b),
  ]);
  // Mullions on the same bay grid every window on the campus uses, so a
  // partial run still lines up with the punched openings beside it.
  const bays = Math.max(1, Math.round(baysAcross(spanTiles) * (u1 - u0)));
  const mullion = Math.min(0.16 / bays, 0.01) * (u1 - u0);
  const transom = FLOOR_COURSE * 0.35 / wallHeight;
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
      {floors.filter((at) => at > from && at / wallHeight < v1).map((at, i) => (
        <polygon
          key={`${id}t${i}`}
          className="iso-mullion"
          points={quad(u0, u1, at / wallHeight - transom, at / wallHeight + transom)}
        />
      ))}
    </>
  );
}

// The red cross. One shape, in the wall's own (u, v) — so it skews with the
// face it is painted on like everything else, and stays a cross.
function RedCross({ origin, along, wallHeight, spanTiles, centreU, centreV, scale = 1 }: {
  origin: Pt; along: Pt; wallHeight: number; spanTiles: number;
  centreU: number; centreV: number;
  // The clinic's cross is a sign over a door, not the hospital's emblem.
  scale?: number;
}) {
  const armU = across(CROSS_ARM_METRES * scale) / spanTiles / 2;
  const armV = up(CROSS_ARM_METRES * scale) / wallHeight / 2;
  const barU = across(CROSS_BAR_METRES * scale) / spanTiles / 2;
  const barV = up(CROSS_BAR_METRES * scale) / wallHeight / 2;
  const quad = (u0: number, u1: number, v0: number, v1: number) => polyPoints([
    facePoint(origin, along, wallHeight, u0, v0),
    facePoint(origin, along, wallHeight, u1, v0),
    facePoint(origin, along, wallHeight, u1, v1),
    facePoint(origin, along, wallHeight, u0, v1),
  ]);
  return (
    <>
      <polygon className="iso-cross" points={quad(centreU - barU, centreU + barU, centreV - armV, centreV + armV)} />
      <polygon className="iso-cross" points={quad(centreU - armU, centreU + armU, centreV - barV, centreV + barV)} />
    </>
  );
}

// THE CLOCK TOWER. Founders Hall and nothing else (see hasClockTower).
//
// Four pieces, bottom to top: a square base rising out of the roof with a
// clock face on each visible side, a colonnaded drum set back from it, a
// gilded dome, and a finial.
//
// The DOME is drawn in SCREEN space rather than projected onto the grid, for
// the same reason trees.tsx draws a crown that way: it is a mass in the air,
// not a marking on the ground. Projecting a hemisphere gives a 2:1 squashed
// ellipse, which is right for something lying flat and exactly wrong for
// something round — it would read as a dinner plate balanced on a drum. A
// roughly spherical thing looks roughly circular from every direction.
function ClockTower({ col, row, w, h, base, stone, apex, gilded }: {
  col: number; row: number; w: number; h: number; base: number;
  stone: StonePalette; apex: ApexPart; gilded: boolean;
}) {
  const plan = Math.min(TOWER_BASE_PLAN, Math.min(w, h) * 0.42);
  const drumPlan = plan * (TOWER_DRUM_PLAN / TOWER_BASE_PLAN);
  const cc = col + w / 2; const cr = row + h / 2;
  const shaft = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, TOWER_BASE_RISE);
  const drumBase = base + TOWER_BASE_RISE;
  const drum = boxFaces(cc - drumPlan / 2, cr - drumPlan / 2, drumPlan, drumPlan, drumBase, TOWER_DRUM_RISE);

  // A clock face on a wall, in that wall's own (u, v) — sampled as a polygon
  // because a circle on a skewed face is an ellipse whose axes are not screen
  // aligned, and sampling needs no rotation maths and stays right if the
  // projection is ever retuned. Same reasoning as projectedCircle's.
  const clock = (origin: Pt, along: Pt, key: string) => {
    // A ROUND face, which means converting its radius separately on each axis:
    // u runs along the wall in tiles and v is a fraction of the wall's height,
    // so one number for both gives an ellipse. (An earlier pass did exactly
    // that, and the two faces read as a pair of eyes.)
    const ru = CLOCK_RADIUS_TILES / plan;
    const rv = CLOCK_RADIUS / TOWER_BASE_RISE;
    const pts: Pt[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(facePoint(origin, along, TOWER_BASE_RISE, 0.5 + Math.cos(a) * ru, 0.56 + Math.sin(a) * rv));
    }
    // Hands, and a dot at their centre. Without them two white circles side by
    // side on a tower read unmistakably as a pair of eyes — which is what an
    // earlier pass produced, and is very hard to stop seeing afterwards.
    const centre = facePoint(origin, along, TOWER_BASE_RISE, 0.5, 0.56);
    const hand = (fu: number, fv: number) => facePoint(
      origin, along, TOWER_BASE_RISE, 0.5 + ru * fu, 0.56 + rv * fv,
    );
    const big = hand(0.1, 0.62); const small = hand(0.5, -0.18);
    return (
      <g key={key}>
        <polygon className="iso-clock-face" points={polyPoints(pts)} />
        <line className="iso-clock-hand" x1={centre.x} y1={centre.y} x2={big.x} y2={big.y} />
        <line className="iso-clock-hand" x1={centre.x} y1={centre.y} x2={small.x} y2={small.y} />
      </g>
    );
  };

  const domeCentre = lift(project(cc, cr), drumBase + TOWER_DRUM_RISE);
  const domeR = (drumPlan / 2) * TILE_W * 0.55;
  const dome: string[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI + (i / 18) * Math.PI;          // a half circle, flat side down
    dome.push(`${(domeCentre.x + Math.cos(a) * domeR).toFixed(2)},${(domeCentre.y + Math.sin(a) * TOWER_DOME_RISE * heightScale()).toFixed(2)}`);
  }
  const finialFoot = lift(domeCentre, TOWER_DOME_RISE);

  return (
    <>
      {sideFaces(shaft, shade(stone.towerStone, 0.98), shade(stone.towerStone, 0.82))}
      <WallBand origin={shaft.D} along={shaft.C} wallHeight={TOWER_BASE_RISE} from={TOWER_BASE_RISE - CORNICE} to={TOWER_BASE_RISE} className="iso-cornice" />
      <WallBand origin={shaft.C} along={shaft.B} wallHeight={TOWER_BASE_RISE} from={TOWER_BASE_RISE - CORNICE} to={TOWER_BASE_RISE} className="iso-cornice" />
      {clock(shaft.D, shaft.C, 'cl')}
      {clock(shaft.C, shaft.B, 'cr')}
      <polygon points={polyPoints(shaft.top)} fill={shade(stone.towerStone, 0.9)} />

      {apex === 'cupola' && (
        <>
          {/* The colonnaded drum, a shade brighter than the base it stands
              on — and actually colonnaded: a shaft at each visible corner
              and one in the middle of each visible face, standing proud of
              the drum, is what makes it a cupola rather than a hat box. */}
          {sideFaces(drum, shade(stone.towerStone, 0.9), shade(stone.towerStone, 0.76))}
          {(() => {
            const cp = drumPlan * 0.16;
            const dc = cc - drumPlan / 2; const dr = cr - drumPlan / 2;
            const shafts = [
              [dc, dr + drumPlan - cp], [dc + drumPlan - cp, dr + drumPlan - cp], [dc + drumPlan - cp, dr],
              [dc + drumPlan / 2 - cp / 2, dr + drumPlan - cp], [dc + drumPlan - cp, dr + drumPlan / 2 - cp / 2],
            ];
            return depthOrder(shafts.map(([c, r]) => ({ col: c, row: r, w: cp, h: cp }))).map((c, i) => {
              const sf = boxFaces(c.col, c.row, c.w, c.h, drumBase, TOWER_DRUM_RISE);
              return (
                <g key={`dc${i}`}>
                  {sideFaces(sf, shade(stone.towerStone, 1.02), shade(stone.towerStone, 0.88))}
                </g>
              );
            });
          })()}
          <polygon points={polyPoints(drum.top)} fill={shade(stone.towerStone, 1.03)} />

          <polygon className="iso-dome" points={dome.join(' ')} fill={gilded ? stone.gilt : shade(stone.towerStone, 0.92)} />
          {gilded && (
            <>
              <line
                className="iso-finial"
                x1={finialFoot.x} y1={finialFoot.y}
                x2={finialFoot.x} y2={lift(finialFoot, TOWER_FINIAL_RISE).y}
                stroke={stone.gilt}
              />
              <circle className="iso-dome" cx={finialFoot.x} cy={lift(finialFoot, TOWER_FINIAL_RISE).y} r={2.2} fill={stone.gilt} />
            </>
          )}
        </>
      )}

      {apex === 'spire' && (
        <Spire cc={cc} cr={cr} base={drumBase} stone={stone} gilded={gilded} />
      )}
    </>
  );
}

// THE SPIRE. A belfry stage with louvred openings, four corner pinnacles and
// a tapering pyramid — the Gothic answer to the drum, dome and finial above,
// standing on the same clock stage.
//
// Drawn as a PYRAMID rather than as a cone: the tower below it is square, a
// spire springs from the walls it stands on, and four flat faces shaded by
// the direction they point is both truer and the same lighting rule the
// roofs use (see SLOPE). A cone would need a gradient to read as round at
// all, which is a different drawing vocabulary from everything else here.
function Spire({ cc, cr, base, stone, gilded }: {
  cc: number; cr: number; base: number; stone: StonePalette; gilded: boolean;
}) {
  const plan = TOWER_BELFRY_PLAN;
  const belfry = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, TOWER_BELFRY_RISE);
  const springs = base + TOWER_BELFRY_RISE;

  // The four corners the spire springs from, and its point.
  const At = lift(project(cc - plan / 2, cr - plan / 2), springs);
  const Bt = lift(project(cc + plan / 2, cr - plan / 2), springs);
  const Ct = lift(project(cc + plan / 2, cr + plan / 2), springs);
  const Dt = lift(project(cc - plan / 2, cr + plan / 2), springs);
  const tip = lift(project(cc, cr), springs + TOWER_SPIRE_RISE);

  // Same lighting rule as SLOPE: -col faces the light head-on and is
  // brightest, +col faces away. Getting these backwards makes a spire look
  // like it is lit from underneath.
  const faces: Array<[Pt, Pt, number]> = [
    [At, Dt, 1.10],   // -col, up-left
    [At, Bt, 1.00],   // -row, up-right
    [Dt, Ct, 0.84],   // +row, down-left
    [Bt, Ct, 0.70],   // +col, down-right
  ];

  return (
    <>
      {/* The belfry, with a tall louvred opening on each visible face. */}
      {sideFaces(belfry, shade(stone.towerStone, 0.94), shade(stone.towerStone, 0.8))}
      {([[belfry.D, belfry.C, 'bl'] as const, [belfry.C, belfry.B, 'br'] as const]).map(([o, a, k]) => (
        <polygon
          key={k}
          className="iso-louvre"
          points={polyPoints(
            windowOutline('lancet', 0.3, 0.7, 0.12, 0.88)
              .map(([u, v]) => facePoint(o, a, TOWER_BELFRY_RISE, u, v)),
          )}
        />
      ))}

      {/* Pinnacles at the four corners, drawn before the spire so it stands
          in front of the far pair and behind the near pair is not an issue —
          they are all shorter than the taper beside them. */}
      {depthOrder([
        { col: cc - plan / 2, row: cr - plan / 2 },
        { col: cc + plan / 2 - TOWER_PINNACLE_PLAN, row: cr - plan / 2 },
        { col: cc - plan / 2, row: cr + plan / 2 - TOWER_PINNACLE_PLAN },
        { col: cc + plan / 2 - TOWER_PINNACLE_PLAN, row: cr + plan / 2 - TOWER_PINNACLE_PLAN },
      ].map((c) => ({ ...c, w: TOWER_PINNACLE_PLAN, h: TOWER_PINNACLE_PLAN }))).map((c, i) => {
        const f = boxFaces(c.col, c.row, c.w, c.h, springs, TOWER_PINNACLE_RISE);
        const capFoot = lift(project(c.col + c.w / 2, c.row + c.h / 2), springs + TOWER_PINNACLE_RISE);
        const capTip = lift(project(c.col + c.w / 2, c.row + c.h / 2), springs + TOWER_PINNACLE_RISE * 1.6);
        return (
          <g key={i}>
            {sideFaces(f, shade(stone.towerStone, 0.92), shade(stone.towerStone, 0.76))}
            <line
              className="iso-finial"
              x1={capFoot.x} y1={capFoot.y} x2={capTip.x} y2={capTip.y}
              stroke={shade(stone.towerStone, 0.86)}
            />
          </g>
        );
      })}

      {faces.map(([a, b], i) => (
        <polygon key={i} points={polyPoints([a, b, tip])} fill={shade(stone.towerStone, faces[i][2])} />
      ))}
      {/* The weathervane. Whatever metal a Gothic landmark shows is here and
          nowhere else — see the note on gothic's `gilt`. A vernacular with no
          metal at all shows none. */}
      {gilded && (
        <>
          <line
            className="iso-finial"
            x1={tip.x} y1={tip.y} x2={tip.x} y2={lift(tip, TOWER_FINIAL_RISE).y}
            stroke={stone.gilt}
          />
          <circle className="iso-dome" cx={tip.x} cy={lift(tip, TOWER_FINIAL_RISE).y} r={1.8} fill={stone.gilt} />
        </>
      )}
    </>
  );
}

// A CHIMNEY STACK standing on a ridge: the one piece of a brick-and-slate
// roofline nothing on the campus carried. Four polygons, and one of the
// strongest period signals available at any zoom.
function Chimney({ cc, cr, base, top, pal, stone }: {
  cc: number; cr: number; base: number; top: number; pal: Palette; stone: StonePalette;
}) {
  const plan = across(1.3);
  const f = boxFaces(cc - plan / 2, cr - plan / 2, plan, plan, base, top - base);
  const cap = boxFaces(cc - plan / 2 - 0.03, cr - plan / 2 - 0.03, plan + 0.06, plan + 0.06, top, up(0.3));
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {sideFaces(cap, shade(stone.trim, 0.78), shade(stone.trim, 0.66))}
      <polygon points={polyPoints(cap.top)} fill={shade(stone.trim, 0.86)} />
    </>
  );
}

// Where the ridge of a hipped roof runs, and a chimney's footing on it: a
// stack on the ridge line stands with its foot a little below the ridge so
// its near faces meet the slope rather than hanging over it.
function ridgeChimneys({ col, row, w, h, base, rise, at, ends = false, pal, stone }: {
  col: number; row: number; w: number; h: number; base: number; rise: number;
  // Positions along the ridge, 0..1. With `ends`, the stacks stand on the
  // two hip slopes instead, a little way down from each end of the ridge —
  // the end-stack arrangement of a Georgian hall, and clear of whatever
  // (a clock tower) stands at the ridge's middle.
  at: number[]; ends?: boolean; pal: Palette; stone: StonePalette;
}) {
  const alongW = w >= h;
  const inset = Math.min(w, h) / 2;
  const plan = across(1.3);
  const top = base + rise + up(2.2);
  const seg = (alongW ? w : h) - inset * 2;
  const positions = ends ? [-0.4 * inset, seg + 0.4 * inset] : at.map((u) => u * seg);
  return positions.map((d, i) => {
    // Down the hip: the roof falls from the ridge to the eaves over `inset`.
    const beyond = d < 0 ? -d : d > seg ? d - seg : 0;
    const foot = base + rise * (1 - beyond / inset) - rise * (plan / Math.min(w, h));
    const cc = alongW ? col + inset + d : col + w / 2;
    const cr = alongW ? row + h / 2 : row + inset + d;
    return <Chimney key={`ch${i}`} cc={cc} cr={cr} base={foot} top={Math.max(top, foot + up(3))} pal={pal} stone={stone} />;
  });
}

// DORMERS in the two slopes of a hall's roof that face the camera. A small
// gabled box standing on the slope with one lancet in its front: the most
// Gothic thing a roof can carry, and what breaks a bare dark pyramid up.
function Dormers({ col, row, w, h, base, rise, pal, stone, glass }: {
  col: number; row: number; w: number; h: number; base: number; rise: number;
  pal: Palette; stone: StonePalette; glass: string;
}) {
  const alongW = w >= h;
  const T = 0.34;                    // how far up the slope, eaves to ridge
  const dw = across(2.0); const dd = across(1.6); const dh = up(2.4);
  const out: React.JSX.Element[] = [];
  // The near long slope, and the near short slope.
  // On the two slopes the camera can see: three along the long one, one on
  // the short.
  const seen = visibleWalls();
  const faces: Array<{ outward: FaceDir; count: number }> = [seen.left, seen.right]
    .map((dir) => ({ outward: dir, count: isRowWall(dir) === alongW ? 3 : 1 }));
  for (const { outward, count } of faces) {
    for (let i = 0; i < count; i++) {
      const u = (i + 1) / (count + 1);
      const z = base + rise * T - up(0.4);
      const span = wallSpan(w, h, outward);
      const deep = isRowWall(outward) ? h : w;
      const b = againstWall(col, row, w, h, outward, span * u - dw / 2, dw, dd, T * (deep / 2) + dd / 2);
      const f = boxFaces(b.col, b.row, b.w, b.h, z, dh);
      const frontWall = wallOf(f, outward);
      const front = { o: frontWall.origin, a: frontWall.along };
      const frontTopL = lift(front.o, dh); const frontTopR = lift(front.a, dh);
      const apex = lift({ x: (front.o.x + front.a.x) / 2, y: (front.o.y + front.a.y) / 2 }, dh + up(1.1));
      out.push(
        <g key={`${outward}${i}`}>
          <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
          <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
          <polygon
            className="iso-window"
            fill={glass}
            points={polyPoints(windowOutline('lancet', 0.3, 0.7, 0.15, 0.85).map(([a, b]) => facePoint(front.o, front.a, dh, a, b)))}
          />
          <polygon points={polyPoints(f.top)} fill={shade(pal.roof, 1.06)} />
          <polygon points={polyPoints([frontTopL, frontTopR, apex])} fill={shade(stone.trim, 0.8)} />
        </g>,
      );
    }
  }
  return <>{out}</>;
}

// ---------------------------------------------------------------------
// A SMALL GABLED HOUSE, standing on its own. The unit a residential village
// is made of — six to twelve of these around shared green, rather than one
// more slab (see campusData.ts's village rung). Its own component because a
// village draws many of them and each needs the full walls-plus-roof
// treatment the main motif gives one building, at a size where windows
// would be sub-pixel and are deliberately left off.
// ---------------------------------------------------------------------
function VillageHouse({ col, row, w, h, height, ridge, pal, stone, glass, paneShape, chimney, door }: {
  col: number; row: number; w: number; h: number; height: number; ridge: number; pal: Palette;
  stone: StonePalette; glass: string; paneShape: WindowShape; chimney: boolean; door: 'row' | 'col' | 'none';
}) {
  const f = boxFaces(col, row, w, h, 0, height);
  const alongW = w >= h;
  const rs = lift(alongW ? project(col, row + h / 2) : project(col + w / 2, row), height + ridge);
  const re = lift(alongW ? project(col + w, row + h / 2) : project(col + w / 2, row + h), height + ridge);
  // One rank of small windows per storey on both faces, and a domestic door
  // on the face toward the green. Legible at anything past the default zoom,
  // and at the default zoom a house with a few pale marks on it still reads
  // as a house where a blank box read as a shed.
  const storeys = Math.max(1, Math.round(height / STOREY));
  const sills = rankSills(storeys).filter((v) => v + WINDOW_HEIGHT * 0.7 < height);
  const pane = (o: Pt, a: Pt, span: number, key: string, skipMiddle: boolean) => {
    const bays = Math.max(1, Math.round(span * METRES_PER_TILE / 3.2));
    const out: React.JSX.Element[] = [];
    for (let r = 0; r < sills.length; r++) {
      for (let bIdx = 0; bIdx < bays; bIdx++) {
        if (skipMiddle && r === 0 && bIdx === Math.floor(bays / 2)) continue;
        const c = (bIdx + 0.5) / bays; const hw = Math.min(0.09, 0.32 / bays);
        const v0 = sills[r] / height; const v1 = (sills[r] + WINDOW_HEIGHT * 0.7) / height;
        out.push(
          <polygon key={`${key}${r}-${bIdx}`} className="iso-window" fill={glass}
            points={polyPoints(windowOutline(paneShape, c - hw, c + hw, v0, v1).map(([u, v]) => facePoint(o, a, height, u, v)))} />,
        );
      }
    }
    return out;
  };
  const doorOn = (o: Pt, a: Pt) => (
    <polygon className="iso-door" points={polyPoints([
      facePoint(o, a, height, 0.44, 0), facePoint(o, a, height, 0.56, 0),
      facePoint(o, a, height, 0.56, Math.min(0.9, up(2.1) / height)), facePoint(o, a, height, 0.44, Math.min(0.9, up(2.1) / height)),
    ])} />
  );
  const plan = across(1.0);
  const stackAt = alongW ? { cc: col + w * 0.3, cr: row + h / 2 } : { cc: col + w / 2, cr: row + h * 0.3 };
  return (
    <>
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {pane(f.D, f.C, f.spanLeft, 'l', door === 'row')}
      {pane(f.C, f.B, f.spanRight, 'r', door === 'col')}
      {door === 'row' && doorOn(f.D, f.C)}
      {door === 'col' && doorOn(f.C, f.B)}
      {ridge > 0 ? (
        <>
          <polygon
            points={polyPoints(alongW ? [f.NWt, f.NEt, re, rs] : [f.NWt, f.SWt, re, rs])}
            fill={alongW ? pal.negRow : pal.negCol}
          />
          <polygon
            points={polyPoints(alongW ? [f.SWt, f.SEt, re, rs] : [f.NEt, f.SEt, re, rs])}
            fill={alongW ? pal.posRow : pal.posCol}
          />
          {gableEnds(f, alongW, rs, re, pal)}
          <line className="iso-ridge" x1={rs.x} y1={rs.y} x2={re.x} y2={re.y} />
          {chimney && (
            <Chimney cc={stackAt.cc} cr={stackAt.cr} base={height + ridge * (1 - plan / Math.min(w, h))} top={height + ridge + up(1.6)} pal={pal} stone={stone} />
          )}
        </>
      ) : (
        <polygon points={polyPoints(f.top)} fill={pal.roof} />
      )}
    </>
  );
}

// Where a village's houses stand on its plot, in NORMALISED footprint
// coordinates (u across, v down, 0..1) — so the same arrangement comes out
// correctly proportioned whether the plot was placed landscape or rotated.
//
// Two ranks facing each other across a green, a third rank closing the far
// end, and a long block along the near side: the courtyard arrangement a
// real student village uses. The houses VARY — in size, in which way their
// ridge runs, in how many storeys they have, and two of them are L-shaped
// (a house and a wing sharing a corner) — because ten identical gabled
// boxes in three ranks read as a storage-unit lot, which is what this was.
// `s` is storeys, `d` which face the door is on.
interface VillageLot { u: number; v: number; uw: number; vh: number; s: number; d: 'row' | 'col' | 'none' }
const VILLAGE_HOUSES: VillageLot[] = [
  // The far rank, facing the green: three houses, one of them an L.
  { u: 0.05, v: 0.05, uw: 0.20, vh: 0.16, s: 2, d: 'row' },
  { u: 0.31, v: 0.06, uw: 0.13, vh: 0.20, s: 3, d: 'col' },
  { u: 0.50, v: 0.05, uw: 0.24, vh: 0.15, s: 2, d: 'row' },
  { u: 0.50, v: 0.20, uw: 0.09, vh: 0.14, s: 2, d: 'none' },   // its wing
  // The middle rank, across the green.
  { u: 0.06, v: 0.42, uw: 0.16, vh: 0.20, s: 3, d: 'col' },
  { u: 0.29, v: 0.44, uw: 0.22, vh: 0.14, s: 2, d: 'row' },
  { u: 0.57, v: 0.41, uw: 0.15, vh: 0.21, s: 3, d: 'col' },
  // The near rank.
  { u: 0.05, v: 0.76, uw: 0.24, vh: 0.15, s: 2, d: 'row' },
  { u: 0.36, v: 0.74, uw: 0.13, vh: 0.19, s: 2, d: 'col' },
  { u: 0.55, v: 0.77, uw: 0.20, vh: 0.14, s: 2, d: 'row' },
  { u: 0.75, v: 0.63, uw: 0.09, vh: 0.14, s: 2, d: 'none' },   // a wing on the last one
  // The long block closing the east side.
  { u: 0.86, v: 0.12, uw: 0.09, vh: 0.62, s: 3, d: 'col' },
];

// The village's planting: a few trees on the green and at the corners, in
// the same authored-not-random spirit as the quad's (see groundMarkings).
const VILLAGE_TREES: Array<[number, number, 'canopy' | 'ornamental' | 'conifer', number]> = [
  [0.27, 0.32, 'canopy', 0.9], [0.62, 0.33, 'ornamental', 0.85], [0.80, 0.86, 'canopy', 0.95],
  [0.24, 0.66, 'ornamental', 0.8], [0.03, 0.97, 'conifer', 0.9], [0.96, 0.04, 'conifer', 0.85],
];

// ---------------------------------------------------------------------
// A CHAPTER HOUSE'S LETTERS.
//
// A Greek chapter has always been named out of the alphabet it is named for
// — "Alpha Beta Gamma" — and the name has always been stored in English
// words. That is right in a list of organisations and wrong on a building:
// what goes over a chapter house's door is ΑΒΓ, in letters, and it is the
// one thing that tells you which house on the map belongs to whom.
//
// The pediment rises ABOVE the wall rather than sitting inside it. The
// smallest chapter house is a one-storey pavilion whose door, threshold and
// canopy already use most of that wall (see Canopy's own note on the same
// problem), so a tympanum fitted under the eaves would have had nowhere to
// go. A pedimented parapet always has room, and is a real thing a fraternity
// house does to announce itself.
// ---------------------------------------------------------------------
// Sized off the WALL rather than the door. A chapter house's door is a
// domestic one, barely a quarter of a tile wide, and a pediment scaled from
// it came out narrower than the letters it was meant to hold. What a house
// actually does is carry its letters across the front.
// Sized off the WALL rather than the door. A chapter house's door is a
// domestic one, barely a quarter of a tile wide, and a pediment scaled from
// it came out narrower than the three letters it exists to hold.
const PEDIMENT_SPAN = 0.62;    // share of the wall the assembly covers
const FRIEZE_DEPTH = 0.16;     // the lettered band, as a share of its own width
const PEDIMENT_PITCH = 0.17;   // and the gable above it
// However tall the arithmetic makes it, a nameplate never eats more than
// this much of the wall it stands on — the smallest chapter house is two
// storeys, and a parapet half as tall again as the building is a folly.
const PEDIMENT_MAX_OF_WALL = 0.5;

function ChapterPediment({ glyphs, origin, along, wallHeight, span, doorWidth, cast = false }: {
  glyphs: string;
  origin: Pt; along: Pt;     // the wall's two ends, at its BASE
  wallHeight: number;
  span: number;              // the wall's length in tiles
  doorWidth: number;         // the door's width in tiles
  // Letters CAST INTO THE WALL rather than carried on a pediment — for a
  // vernacular with no applied stonework. Brutalism's chapter houses lost
  // their letters entirely when the pediment was gated on a door the
  // recess entrance does not have; the letters are the one thing that says
  // whose house it is, so a set with no pediment still gets them.
  cast?: boolean;
}) {
  if (!glyphs || span <= 0) return null;
  if (cast) {
    const l = facePoint(origin, along, wallHeight, 0.5 - PEDIMENT_SPAN / 2, 0.72);
    const r = facePoint(origin, along, wallHeight, 0.5 + PEDIMENT_SPAN / 2, 0.72);
    const width = Math.hypot(r.x - l.x, r.y - l.y);
    const slope = (r.y - l.y) / (r.x - l.x || 1);
    const seat = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    return (
      <text
        className="chapter-letters chapter-letters-cast"
        transform={`matrix(1 ${slope} 0 1 ${seat.x} ${seat.y})`}
        textAnchor="middle"
        fontSize={Math.max(5, Math.min(width * 0.26, wallHeight * 0.2))}
      >
        {glyphs}
      </text>
    );
  }
  if (doorWidth <= 0) return null;
  const half = PEDIMENT_SPAN / 2;
  const left = facePoint(origin, along, wallHeight, 0.5 - half, 1);
  const right = facePoint(origin, along, wallHeight, 0.5 + half, 1);
  const width = Math.hypot(right.x - left.x, right.y - left.y);
  if (width <= 0) return null;

  const fit = Math.min(1, (wallHeight * PEDIMENT_MAX_OF_WALL) / (width * (FRIEZE_DEPTH + PEDIMENT_PITCH)));
  const frieze = width * FRIEZE_DEPTH * fit;
  const rise = width * PEDIMENT_PITCH * fit;

  const bandLeft = lift(left, frieze);
  const bandRight = lift(right, frieze);
  const apex = lift({ x: (bandLeft.x + bandRight.x) / 2, y: (bandLeft.y + bandRight.y) / 2 }, rise);

  // The wall's own slope, which is what the letters have to lie in to read
  // as cut INTO it rather than floating in front of it. On this projection
  // a wall running along the columns falls one unit for every two across
  // and one running along the rows climbs at the same rate, so the shear is
  // simply the line between the band's two ends.
  const slope = (right.y - left.y) / (right.x - left.x || 1);
  const seat = lift({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }, frieze * 0.5);

  return (
    <>
      {/* The frieze carries the letters and the gable sits on it, which is
          the order a real one is built in — and the reason the letters get a
          rectangle rather than the pinched middle of a triangle. */}
      <polygon className="chapter-pediment" points={polyPoints([left, right, bandRight, bandLeft])} />
      <polygon className="chapter-pediment" points={polyPoints([bandLeft, bandRight, apex])} />
      <text
        className="chapter-letters"
        transform={`matrix(1 ${slope} 0 1 ${seat.x} ${seat.y})`}
        textAnchor="middle"
        fontSize={Math.max(5, Math.min(width * 0.26, frieze * 0.88))}
      >
        {glyphs}
      </text>
    </>
  );
}

// A building being EXTENDED, not a building site.
//
// The library is renovated by adding a floor to the building already
// standing (see the reducer's RENOVATE_LIBRARY), which puts the SAME node
// back into 'developing' — and 'developing' meant a footprint pegged out and
// a frame barely off the ground, so three built floors of library
// disappeared for the six months the fourth took, and came back at the end.
// A renovation is drawn as what it is: the finished floors standing at their
// full height, still wearing their windows, with the scaffold rising off
// their roof rather than off the grass.
//
// It is the same building that stays OPEN through the work — see types.ts's
// servingPopulation, which is the other half of this PR.
function BuildingMotif({ t, p, material, vernacular, developing, glyphs }: {
  t: Buildable;
  p: { row: number; col: number; w: number; h: number };
  material: Material;
  // The architecture the campus was built in. PR D passed the resolved
  // StonePalette here; PR E needs the vernacular ITSELF, because a ridge, a
  // parapet and a window's shape are all read off it too, and threading
  // four resolved values would be four chances to pass a mismatched set.
  // One string in, every lookup done at the point of use.
  vernacular: Vernacular;
  developing: boolean;
  // A Greek chapter's letters, for the one Buildable that wears any (see
  // ChapterPediment). Passed in rather than stored on the Buildable: the
  // chapter is the thing that has a name, and a chapter house that read its
  // own letters off a copy would keep them after a scandal renamed or
  // disbanded the chapter that owned them.
  glyphs?: string;
  // The camera this is drawn at. Not read here — the geometry reads it from
  // the projection itself — but compared by the memo below, so a motif that
  // is otherwise unchanged still redraws when the view turns.
  camera?: Camera;
}) {
  const extending = developing && floorsUnderConstruction(t) > 0 && motifOf(t) !== 'grounds';
  if (!extending) return <BuildingMass t={t} p={p} material={material} vernacular={vernacular} developing={developing} glyphs={glyphs} />;

  const { col, row, w, h } = p;
  const roof = drawnHeightOf(t, true, vernacular);
  return (
    <>
      <BuildingMass t={t} p={p} material={material} vernacular={vernacular} developing glyphs={glyphs} />
      {/* The work, where the work is. Boarding over the finished roof and
          poles standing off it — at ground level both would say the wrong
          thing about a building that is open underneath them. */}
      <polygon points={polyPoints(boxFaces(col, row, w, h, roof, 0).top)} fill={`url(#${SCAFFOLD_PATTERN_ID})`} />
      <Scaffolding col={col} row={row} w={w} h={h} height={STOREY * 0.5} base={roof} />
    </>
  );
}

function BuildingMass({ t, p, material, vernacular, developing, glyphs }: {
  t: Buildable;
  p: { row: number; col: number; w: number; h: number };
  material: Material;
  vernacular: Vernacular;
  developing: boolean;
  glyphs?: string;
}) {
  // Resolved ONCE for this building, then handed to the parts that draw
  // masonry. Both are stable references off the VERNACULARS table (see
  // buildingSpec's note), so this costs nothing per render.
  const stone: StonePalette = stoneFor(vernacular);
  // 'rect' for the six motifs no vernacular restyles — see paneShapeOf.
  const paneShape = paneShapeOf(t, vernacular);
  // What this vernacular puts in each of the three ornament slots (see
  // buildingSpec's VernacularParts). The branches below ask what goes HERE
  // rather than what motif this is, which is the whole point of the table:
  // a second set is a table row, not another `motif === ...` arm.
  // Whether this vernacular HAS applied stonework at all. Brutalism does
  // not, and every band below is skipped rather than recoloured.
  const trim = hasTrim(vernacular);
  const entrance = entrancePartOf(t, vernacular);
  const rooflineEnd = rooflineEndPartOf(vernacular);
  const apex = apexPartOf(vernacular);
  const hood = partsFor(vernacular).hood === true;
  const chimneys = partsFor(vernacular).chimneys === true;
  const dormers = partsFor(vernacular).dormers === true;
  const bellGable = partsFor(vernacular).bellGable === true;
  const buttresses = partsFor(vernacular).buttresses === true;
  const turrets = partsFor(vernacular).turrets === true;
  const crenellations = partsFor(vernacular).crenellations === true;
  const lights: 1 | 2 = partsFor(vernacular).pairedLights === true ? 2 : 1;
  const grandPortico = partsFor(vernacular).grandPortico === true;
  const balustrade = partsFor(vernacular).balustrade === true;
  const glazedCivic = partsFor(vernacular).glazedCivic === true;
  // How far a corner tower stands proud of the walls it rises from.
  const TOWER_PROUD = across(0.45);
  // What a wall too short for an arcade gets instead: the same small porch
  // the vernacular puts on its residence halls if it has one, else a
  // canopy. Mission's one-storey dining hall wore a Georgian slab on posts.
  const shortArcadeFallback: EntrancePart =
    partsFor(vernacular).entrance.residential === 'archway' ? 'archway' : 'canopy';
  // The door's head follows the windows': round where they are round.
  const doorShape = paneShape === 'arched' ? 'arched' : 'rect';
  // How far a pitched roof oversails its walls in this vernacular (Mission's
  // deep tile eaves); zero everywhere else.
  const eaves = eavesOf(vernacular);
  const motif = motifOf(t);
  // How much of this mass is not built yet, and so what `developing` means
  // for it: a SITE has nothing standing, while a building being extended
  // has everything but the top floor (see BuildingMotif above). Every
  // construction branch below is the site case.
  const inFlight = developing ? floorsUnderConstruction(t) : 0;
  const site = developing && inFlight === 0;
  const { row, col, w, h } = p;
  const pal = paletteFrom(material, wallShadeOf(t));
  // The two walls the camera can see, left then right: where every entrance
  // and everything that stands against a wall goes (see WALLS BY DIRECTION).
  const seen = visibleWalls();
  const fronts: FaceDir[] = [seen.left, seen.right];
  // Whether the +col, +row corner — where a corner tower stands — is nearer
  // the camera than the middle of the mass. If it is, the tower is painted
  // after the mass, as it always was; if the camera has come round behind,
  // it is painted first, so the mass covers its foot rather than the other
  // way about.
  const cornerInFront = project(col + w, row + h).y > project(col + w / 2, row + h / 2).y;
  // What the solid helpers below shade from. A roof unit, a stair tread and a
  // stand are not made of the wall they stand on — plant is roof-coloured,
  // stonework is trim — so each takes the surface it actually belongs to.
  const tint = pal.wallLeft;
  const roofTint = material.roof;

  // Open ground has no mass at all, so none of the raising below applies to
  // it — but it does have a construction state, and it is GroundMarking's
  // own (see groundMarkings.tsx's GroundSite). The mass rising is how a
  // BUILDING shows progress; what shows it on a plate is that the finished
  // surface is not there yet.
  if (motif === 'grounds') {
    return (
      <GroundMarking
        facilityType={t.facilityType}
        tier={t.tier}
        col={col}
        row={row}
        w={w}
        h={h}
        developing={site}
      />
    );
  }

  // A site under construction is a footprint pegged out and a frame barely
  // off the ground, not a building with the roof left off. The mass RISING
  // is what completion looks like — which is a thing an angled map can show
  // and a flat one never could.
  // What is STANDING, which for an extension is everything below the floor
  // going up. Used by the motifs below wherever they raise real mass.
  const full = wallHeightOf(t) - inFlight * STOREY;
  const H = site ? Math.max(4, wallHeightOf(t) * 0.16) : full;
  const ridge = site ? 0 : ridgeOf(t, vernacular);
  const f = boxFaces(col, row, w, h, 0, H);
  // One rank of windows per storey, always — including the storeys a
  // renovation added, which is what makes that growth legible rather than
  // just making the building taller. A clear-span volume has no storeys and
  // gets one band near its eaves instead (see buildingSpec's clerestorySill).
  // Minus the rank that has nowhere to go yet: a renovation's new floor gets
  // its windows when it has walls to put them in.
  const ranks = windowRanksOf(t) - inFlight;
  const sills = storeysOf(t) - inFlight > 0 ? rankSills(ranks) : [clerestorySill(H)];
  const paneW = windowWidthOf(t);
  const courses = floorLinesOf(t);
  // A recess IS the way in — it is a piece of the wall cut away, so a flat
  // door leaf and a flight of steps would both be drawn inside the undercut
  // rather than in front of it.
  const door = entrance === 'recess' ? null : doorOf(t);

  if (motif === 'village') {
    // A PLOT, not a building: lawn, walks between the ranks, and ten small
    // houses standing on it (see VILLAGE_HOUSES). Drawn back-to-front by
    // each house's own distance from the camera, exactly as CampusMap sorts
    // whole buildings, so a near house correctly overlaps the one behind it.
    // Houses and trees in one depth-ordered list, so a tree on the green
    // stands correctly in front of the rank behind it.
    const items = depthOrder([
      ...VILLAGE_HOUSES.map((lot) => ({
        kind: 'house' as const, col: col + w * lot.u, row: row + h * lot.v, w: w * lot.uw, h: h * lot.vh, lot,
      })),
      ...VILLAGE_TREES.map(([u, v, species, scale]) => ({
        kind: 'tree' as const, col: col + w * u - 0.5, row: row + h * v - 0.5, w: 1, h: 1, species, scale,
        lot: undefined as VillageLot | undefined,
      })),
    ]);

    if (site) {
      return (
        <>
          <polygon points={polyPoints(f.top)} fill={shade(tint, 0.9)} />
          <polygon points={polyPoints(f.top)} fill={`url(#${SCAFFOLD_PATTERN_ID})`} />
          <Scaffolding col={col} row={row} w={w} h={h} height={H} />
        </>
      );
    }
    return (
      <>
        <polygon className="ground-lawn" points={polyPoints(boxFaces(col, row, w, h, 0, 0).top)} />
        {/* Mowing stripes on the green, as the quad has. */}
        {[0.2, 0.5, 0.8].map((v) => (
          <polygon key={v} className="ground-mow" points={polyPoints(boxFaces(col, row + h * (v - 0.06), w, h * 0.08, 0, 0).top)} />
        ))}
        {/* The walks: a loop round the green with a spur to each rank, so
            every door is on a path, and the two cross walks between the
            ranks. One connected network rather than two strips. */}
        {([
          [0.02, 0.26, 0.82, 0.05], [0.02, 0.66, 0.82, 0.05],
          [0.02, 0.26, 0.04, 0.45], [0.80, 0.26, 0.04, 0.45],
          [0.26, 0.26, 0.04, 0.45], [0.53, 0.26, 0.04, 0.45],
          [0.02, 0.98, 0.82, 0.02],
        ] as const).map(([u, v, uw, vh], i) => (
          <polygon key={`wk${i}`} className="ground-walk-fill" points={polyPoints(boxFaces(col + w * u, row + h * v, w * uw, h * vh, 0, 0).top)} />
        ))}
        {/* A hedge along the plot's far edges. */}
        <polygon className="ground-hedge-top" points={polyPoints(boxFaces(col, row, w * 0.84, 0.18, 0, 0).top.map((q) => lift(q, 5)))} />
        <polygon className="ground-hedge-top" points={polyPoints(boxFaces(col, row, 0.18, h, 0, 0).top.map((q) => lift(q, 5)))} />
        {items.map((it, i) => (it.kind === 'tree' ? (
          <TreeAt key={i} col={it.col + 0.5} row={it.row + 0.5} species={it.species} scale={it.scale} />
        ) : (
          <VillageHouse
            key={i}
            col={it.col} row={it.row} w={it.w} h={it.h}
            height={Math.min(full, it.lot!.s * STOREY)}
            ridge={ridge * (it.lot!.s >= 3 ? 1 : 0.85)}
            pal={pal} stone={stone} glass={stone.glass} paneShape={paneShape}
            chimney={chimneys} door={it.lot!.d}
          />
        )))}
      </>
    );
  }

  if (motif === 'tower') {
    // A RETAIL PODIUM with a tower on it. The podium is the whole footprint,
    // two storeys of shopfront (which is the part of a residential tower the
    // campus around it actually uses — see campusData.ts's TOWER_RETAIL_SERVES);
    // the shaft is inset from it and carried the rest of the way up, which is
    // what stops a 190-unit mass reading as a single blank obelisk.
    const PODIUM_H = TOWER_PODIUM_STOREYS * STOREY;
    // The way into a tower is its podium's shopfront, measured against the
    // PODIUM's own height rather than the shaft's. The old table said its
    // height fraction was small because the mass was 190 units tall, and then
    // applied that fraction to the 34-unit podium — which is how a 24 m
    // opening came to be 0.88 m high.
    const podiumDoor = doorDimensions('shopfront');
    const inset = 0.17;
    const sc = col + w * inset; const sr = row + h * inset;
    const sw = w * (1 - inset * 2); const sh = h * (1 - inset * 2);

    if (site) {
      return (
        <>
          <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
          <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
          <polygon points={polyPoints(f.top)} fill={shade(tint, 0.9)} />
          <polygon points={polyPoints(f.top)} fill={`url(#${SCAFFOLD_PATTERN_ID})`} />
          <Scaffolding col={col} row={row} w={w} h={h} height={H} />
        </>
      );
    }

    const pod = boxFaces(col, row, w, h, 0, PODIUM_H);
    const shaft = boxFaces(sc, sr, sw, sh, PODIUM_H, H - PODIUM_H);
    // The shaft carries every storey the tower has except the podium's.
    const shaftRanks = Math.max(1, storeysOf(t) - TOWER_PODIUM_STOREYS);
    const shaftSills = rankSills(shaftRanks);
    const shaftW = windowWidthOf(t);
    return (
      <>
        {/* Podium: glazed at street level, so its "windows" are one tall
            rank of shopfront rather than the shaft's ranks of flats. */}
        {sideFaces(pod, shade(tint, 0.88), shade(tint, 0.70))}
        {windows(pod.D, pod.C, PODIUM_H, pod.spanLeft, [SHOPFRONT_SILL], SHOPFRONT_WIDTH, 'pl', paneShape, stone.glass, doorBay(podiumDoor, pod.spanLeft, PODIUM_H))}
        {windows(pod.C, pod.B, PODIUM_H, pod.spanRight, [SHOPFRONT_SILL], SHOPFRONT_WIDTH, 'pr', paneShape, stone.glass, doorBay(podiumDoor, pod.spanRight, PODIUM_H))}
        <Door d={podiumDoor} origin={pod.D} along={pod.C} wallHeight={PODIUM_H} span={pod.spanLeft} />
        <Door d={podiumDoor} origin={pod.C} along={pod.B} wallHeight={PODIUM_H} span={pod.spanRight} />
        <polygon points={polyPoints(pod.top)} fill={pal.roofDeck} />

        {/* The shaft, ranked floor by floor. */}
        <polygon points={polyPoints(shaft.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(shaft.right)} fill={pal.wallRight} />
        {windows(shaft.D, shaft.C, H - PODIUM_H, shaft.spanLeft, shaftSills, shaftW, 'tl', paneShape, stone.glass)}
        {windows(shaft.C, shaft.B, H - PODIUM_H, shaft.spanRight, shaftSills, shaftW, 'tr', paneShape, stone.glass)}
        <polygon points={polyPoints(shaft.top)} fill={pal.roof} />
        {/* Lift overrun and plant on the roof — what tells a tower's top
            from a flat lid at this distance. */}
        <RoofBox
          col={sc + sw * 0.24} row={sr + sh * 0.24} w={sw * 0.5} h={sh * 0.5}
          base={H} height={16} tint={tint}
        />
      </>
    );
  }

  if (motif === 'bowl') {
    // FOUR RAKED BANKS AROUND A GRIDIRON, standing on a concourse — not a
    // box with a hole in it.
    //
    // The previous version mitred the four banks into a solid ring, which
    // is what made it read as a tray: a stadium's corners are OPEN, with the
    // concourse showing between the ends of the stands, and that gap is the
    // single strongest "stadium, not box" signal from above. The banks also
    // used to be the same height all round; a college stadium has a tall
    // home side — two decks, a press box on top — and a lower visitor side,
    // and that asymmetry is most of its silhouette. Floodlight masts at the
    // corners are the tallest things on any campus and are what make it
    // recognisable at the zoom the game opens at.
    const d = Math.min(w, h) * 0.2;           // stand depth, in tiles
    const iCol = col + d; const iRow = row + d;
    const iW = w - d * 2; const iH = h - d * 2;
    const bottom = H * 0.18;
    const fills = (f: number) => ({
      rakeFill: shade(tint, f),
      wallFill: shade(tint, f * 0.82),
      seatStroke: 'rgba(42, 56, 28, 0.30)',
    });
    const concourse = shade(tint, 0.9);
    const T = (c: number, r: number): TilePt => [c, r];

    // A site under construction is the bowl's earthworks, not a stadium.
    if (site) {
      return (
        <>
          <GroundSite col={col} row={row} w={w} h={h} />
          <Scaffolding col={col} row={row} w={w} h={h} height={H} />
        </>
      );
    }

    // The far banks climb away from the camera and show their steps; the
    // near two show their backs and the tops of their treads.
    const north = (
      <RakedStand outer={[T(iCol, row), T(iCol + iW, row)]} inner={[T(iCol, iRow), T(iCol + iW, iRow)]}
        bottomH={bottom} topH={H * 0.85} rows={7} aisles={3} {...fills(1.0)} />
    );
    const south = (
      <RakedStand outer={[T(iCol, row + h), T(iCol + iW, row + h)]} inner={[T(iCol, iRow + iH), T(iCol + iW, iRow + iH)]}
        bottomH={bottom} topH={H * 0.85} rows={7} aisles={3} wall {...fills(0.8)} />
    );
    // The visitors' side: lower.
    const east = (
      <RakedStand outer={[T(col + w, iRow), T(col + w, iRow + iH)]} inner={[T(iCol + iW, iRow), T(iCol + iW, iRow + iH)]}
        bottomH={bottom} topH={H * 0.62} rows={5} aisles={2} wall {...fills(0.72)} />
    );
    // The home side: a lower deck over the inner part of the bank, an upper
    // deck stepped back over its rear, the shadowed soffit between them, and
    // the press box along the top.
    const lowerBack = col + d * 0.42;
    const upperFront = col + d * 0.5;
    const lowerTop = H * 0.7;
    const upperBase = H * 0.86;
    const upperTop = H * 1.32;
    const at = (c: number, r: number, z: number) => lift(project(c, r), z);
    const pressBox = boxFaces(col + 0.05, row + h * 0.32, Math.min(0.75, d * 0.25), h * 0.36, upperTop, up(3.2));
    const west = (
      <>
        <RakedStand outer={[T(col, iRow), T(col, iRow + iH)]} inner={[T(upperFront, iRow), T(upperFront, iRow + iH)]}
          bottomH={upperBase} topH={upperTop} rows={6} aisles={3} {...fills(1.04)} />
        <polygon className="iso-undercroft" points={polyPoints([
          at(lowerBack, iRow, lowerTop), at(lowerBack, iRow + iH, lowerTop),
          at(upperFront, iRow + iH, upperBase), at(upperFront, iRow, upperBase),
        ])} />
        <RakedStand outer={[T(lowerBack, iRow), T(lowerBack, iRow + iH)]} inner={[T(iCol, iRow), T(iCol, iRow + iH)]}
          bottomH={bottom} topH={lowerTop} rows={6} aisles={3} {...fills(1.0)} />
        {sideFaces(pressBox, shade(stone.trim, 0.82), shade(stone.trim, 0.7))}
        <WallBand origin={pressBox.C} along={pressBox.B} wallHeight={up(3.2)} from={up(0.9)} to={up(2.6)} className="iso-undercroft" />
        <polygon points={polyPoints(pressBox.top)} fill={shade(stone.trim, 0.95)} />
      </>
    );

    // Floodlights: a mast at each corner of the concourse, with a bank of
    // lamps on top, drawn in screen space like a tree's trunk.
    const mast = (c: number, r: number, key: string) => {
      const foot = project(c, r);
      const top = lift(foot, H * 2.3);
      return (
        <g key={key}>
          <line className="ground-mast" x1={foot.x} y1={foot.y} x2={top.x} y2={top.y} />
          <polygon className="ground-mast-head" points={polyPoints([
            { x: top.x - 8, y: top.y + 1 }, { x: top.x + 8, y: top.y + 1 }, { x: top.x + 8, y: top.y - 5 }, { x: top.x - 8, y: top.y - 5 },
          ])} />
        </g>
      );
    };
    const m = d * 0.45;

    // The scoreboard, on posts behind the north end.
    const board = (() => {
      const bw = Math.min(3.2, iW * 0.3); const bd = 0.35;
      const bc = col + w / 2 - bw / 2; const br = row + d * 0.12;
      const base = H * 0.98; const height = up(4.6);
      const f = boxFaces(bc, br, bw, bd, base, height);
      return (
        <>
          <line className="ground-post" x1={project(bc + 0.2, br + bd / 2).x} y1={project(bc + 0.2, br + bd / 2).y} x2={project(bc + 0.2, br + bd / 2).x} y2={project(bc + 0.2, br + bd / 2).y - base} />
          <line className="ground-post" x1={project(bc + bw - 0.2, br + bd / 2).x} y1={project(bc + bw - 0.2, br + bd / 2).y} x2={project(bc + bw - 0.2, br + bd / 2).x} y2={project(bc + bw - 0.2, br + bd / 2).y - base} />
          <polygon points={polyPoints(f.left)} fill="#3a3d40" />
          <polygon points={polyPoints(f.right)} fill="#2d2f31" />
          <polygon points={polyPoints(f.top)} fill="#4a4d50" />
          <WallBand origin={f.D} along={f.C} wallHeight={height} from={height * 0.18} to={height * 0.82} className="ground-scoreboard-face" />
        </>
      );
    })();

    return (
      <>
        {/* The concourse the whole thing stands on, so the open corners show
            concrete rather than lawn. */}
        <polygon points={polyPoints(f.top)} fill={concourse} />
        {mast(col + m, row + m, 'm0')}
        {mast(col + w - m, row + m, 'm1')}
        {board}
        {north}
        {west}
        <StadiumField col={iCol} row={iRow} w={iW} h={iH} />
        {south}
        {east}
        {mast(col + m, row + h - m, 'm2')}
        {mast(col + w - m, row + h - m, 'm3')}
      </>
    );
  }

  if (motif === 'block' && !site && Math.min(w, h) >= BLOCK_SPLIT_MIN_TILES) {
    // THE HOSPITAL: a tall ward slab across the back, with a lower, fully
    // glazed public wing standing in front of it — the entrance, the atrium,
    // the outpatient front. That stepped massing is most of what makes a
    // hospital recognisable from a distance; drawn as one box it read as a
    // very large pavilion with plant on the roof.
    //
    // Only the large instances split. `block` also carries the computing
    // research centre, which is a 4x3 building — two slivers read worse than
    // one honest box (see BLOCK_SPLIT_MIN_TILES).
    const slabStoreys = storeysOf(t);
    const wingStoreys = Math.max(2, Math.round(slabStoreys * WING_STOREY_FRACTION));
    const slabH = slabStoreys * STOREY;
    const wingH = wingStoreys * STOREY;
    const undercroft = UNDERCROFT_STOREYS * STOREY;
    const slab = { col, row, w, h: h * SLAB_ROW_FRACTION };
    const wing = {
      col, row: row + h * SLAB_ROW_FRACTION,
      w: w * WING_COL_FRACTION, h: h * (1 - SLAB_ROW_FRACTION),
    };
    const sf = boxFaces(slab.col, slab.row, slab.w, slab.h, 0, slabH);
    const wf = boxFaces(wing.col, wing.row, wing.w, wing.h, 0, wingH);
    const lines = (storeys: number) => Array.from({ length: storeys - 1 }, (_, i) => (i + 1) * STOREY);
    const slabSills = rankSills(slabStoreys).filter((v) => v >= undercroft);
    const undercroftBand = (o: Pt, a: Pt, wh: number) => (
      <WallBand origin={o} along={a} wallHeight={wh} from={0} to={undercroft} className="iso-undercroft" />
    );
    const eaves = (o: Pt, a: Pt, wh: number) => (
      <WallBand origin={o} along={a} wallHeight={wh} from={wh - EAVES_COURSE} to={wh} className="iso-cornice" />
    );

    // Whichever of the two stands nearer the camera is painted second, and
    // the wing's entrance goes on a visible wall of its own — never the one
    // it shares with the slab.
    const wingInFront = occludes(wing, slab) !== -1;
    const wingFront = seen.left === 'negRow' ? seen.right : seen.left;
    const wingWall = wallOf(wf, wingFront);
    const wingSpan = wallSpan(wing.w, wing.h, wingFront);
    const slabNode = (
      <>
        {/* The ward slab, across the back. */}
        <polygon points={polyPoints(sf.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(sf.right)} fill={pal.wallRight} />
        {floorCourses(sf.D, sf.C, slabH, lines(slabStoreys), 'sl')}
        {floorCourses(sf.C, sf.B, slabH, lines(slabStoreys), 'sr')}
        {windows(sf.D, sf.C, slabH, sf.spanLeft, slabSills, paneW, 'sl', paneShape, stone.glass)}
        {windows(sf.C, sf.B, slabH, sf.spanRight, slabSills, paneW, 'sr', paneShape, stone.glass)}
        {undercroftBand(sf.D, sf.C, slabH)}
        {undercroftBand(sf.C, sf.B, slabH)}
        {eaves(sf.D, sf.C, slabH)}
        {eaves(sf.C, sf.B, slabH)}
        <polygon points={polyPoints(sf.top)} fill={pal.roofDeck} />
        {[[0.08, 0.16, 0.26, 0.34], [0.40, 0.12, 0.22, 0.30], [0.70, 0.20, 0.24, 0.36]]
          .map(([fx, fy, fw, fh], i) => (
            <RoofBox
              key={i} col={slab.col + slab.w * fx} row={slab.row + slab.h * fy}
              w={slab.w * fw} h={slab.h * fh} base={slabH} height={15} tint={roofTint}
            />
          ))}
        {(() => {
          // The helipad: a ring and an H on the slab's deck, in the slab's
          // own plane. The one piece of signage on the campus besides the
          // cross, and like the cross a shape rather than a word.
          const hc = slab.col + slab.w * 0.5; const hr = slab.row + slab.h * 0.76;
          const R = across(4.5);
          const ring = projectedCircle(hc, hr, R, 28).map((q) => lift(q, slabH));
          const bar = (c0: number, r0: number, c1: number, r1: number) => polyPoints(boxFaces(c0, r0, c1 - c0, r1 - r0, slabH, 0).top);
          const a = R * 0.42; const th = R * 0.16;
          return (
            <>
              <polygon className="iso-helipad" points={polyPoints(ring)} />
              <polygon className="iso-helipad-mark" points={bar(hc - a, hr - a, hc - a + th, hr + a)} />
              <polygon className="iso-helipad-mark" points={bar(hc + a - th, hr - a, hc + a, hr + a)} />
              <polygon className="iso-helipad-mark" points={bar(hc - a, hr - th / 2, hc + a, hr + th / 2)} />
            </>
          );
        })()}
      </>
    );
    const wingNode = (
      <>
        {/* The glazed public wing, in front of it. Its long face is a curtain
            wall; its short end is the white panel the cross goes on, which is
            exactly where the reference building puts it. */}
        <polygon points={polyPoints(wf.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(wf.right)} fill={pal.wallRight} />
        <CurtainWall
          origin={wingWall.origin} along={wingWall.along} wallHeight={wingH} spanTiles={wingSpan}
          from={undercroft} floors={lines(wingStoreys)} id="wl"
        />
        {undercroftBand(wf.D, wf.C, wingH)}
        {undercroftBand(wf.C, wf.B, wingH)}
        {eaves(wf.D, wf.C, wingH)}
        {eaves(wf.C, wf.B, wingH)}
        <polygon points={polyPoints(wf.top)} fill={pal.roofDeck} />
        <RedCross
          origin={wf.C} along={wf.B} wallHeight={wingH} spanTiles={wf.spanRight}
          centreU={0.5} centreV={(wingH - STOREY * 1.1) / wingH}
        />

        {/* The way in, under the glazed front. */}
        {door && <Door d={door} origin={wingWall.origin} along={wingWall.along} wallHeight={wingH} span={wingSpan} />}
        {door && (
          <Canopy stone={stone}
            d={door} col={wing.col} row={wing.row} w={wing.w} h={wing.h}
            outward={wingFront} wallHeight={wingH}
          />
        )}
      </>
    );
    return wingInFront ? <>{slabNode}{wingNode}</> : <>{wingNode}{slabNode}</>;
  }

  if (motif === 'hall' && !site && massingOf(t, vernacular) === 'stacked') {
    // A STACKED HALL. No wall-plus-roof and no applied bands: the shape is
    // the whole of it. The entrance and the apex still come from the parts
    // table, because a recess and a stair core are things you put ON a mass
    // however that mass is put together.
    return (
      <>
        <StackedMass
          col={col} row={row} w={w} h={h} height={H}
          pal={pal} stone={stone} paneShape={paneShape} paneW={paneW}
          ranks={windowRanksOf(t)}
        />
        {hasClockTower(t) && apex === 'core' && (
          <StairCore stone={stone} col={col} row={row} w={w} h={h} base={H} />
        )}
        {entrance === 'recess' && (
          <>
            {fronts.map((dir) => <Recess key={dir} pal={pal} col={col} row={row} w={w} h={h} wallHeight={H * STACK_LOWER_TOP} outward={dir} />)}
          </>
        )}
      </>
    );
  }

  if (motif === 'hall' && !site) {
    // THE ACADEMIC HALL, assembled from the vocabulary above. The order is the
    // order you would build it in, which is also the order it has to be
    // painted in: mass, then what is applied to the mass, then what stands on
    // top of it, then what stands in front of it.
    //
    // The wall runs to the top of the PARAPET, not to the cornice, and every
    // band and window below is a fraction of that one height. Computing the
    // parapet as a second box over the first is what an earlier pass did, and
    // it drew a full-height blank wall straight over the windows, the courses
    // and the plinth — a parapet is the top of this wall, not another one.
    const parapet = parapetOf(vernacular);
    const WH = H + parapet;
    // How far in front of the wall the entrance's own face stands: the
    // columns of a portico, the bay of a porch, and the wall itself where
    // the way in is cut into it. An arcade is walked into at grade and gets
    // no flight at all — the one drawn a bay's depth out stood on the lawn
    // in front of the arches, climbing to nothing.
    const entranceStandoff = entrance === 'portico'
      ? PAVILION_DEPTH + PORTICO_STANDOFF + PORTICO_COLUMN_PLAN
      : entrance === 'porch' ? PAVILION_DEPTH : 0;
    const flights = entrance !== 'arcade';
    const hf = boxFaces(col, row, w, h, 0, WH);
    const endPlan = Math.min(END_PAVILION_PLAN, Math.min(w, h) * 0.28);
    // The corner tower's plan, a real size capped by the hall's own.
    const towerPlan = Math.min(across(7.5), Math.min(w, h) * 0.26);
    // The roof is set BACK behind the parapet, which is what a parapet is
    // for — so a vernacular with NO parapet gets no setback either. Leaving
    // it in drew a pale ring of roof deck all the way round a Gothic hall,
    // which is a Georgian gutter on a building that has nothing to gutter
    // behind: there the roof springs straight off the eaves.
    const inset = parapet > 0 ? Math.min(0.3, Math.min(w, h) * 0.06) : 0;

    const band = (from: number, to: number, className: string, key: string) => (
      <>
        <WallBand key={`${key}l`} origin={hf.D} along={hf.C} wallHeight={WH} from={from} to={to} className={className} />
        <WallBand key={`${key}r`} origin={hf.C} along={hf.B} wallHeight={WH} from={from} to={to} className={className} />
      </>
    );
    const turretNode = (
      <CornerTower pal={pal} glass={stone.glass} paneW={paneW}
        col={col + w - towerPlan + TOWER_PROUD} row={row + h - towerPlan + TOWER_PROUD} plan={towerPlan}
        height={WH + STOREY * 1.9} sills={rankSills(ranks + 2)} crenels={crenellations} capRise={up(5.0)}
      />
    );
    return (
      <>
        {turrets && !cornerInFront && turretNode}
        <polygon points={polyPoints(hf.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(hf.right)} fill={pal.wallRight} />

        {/* A course at every floor, a stone base under them all, a cornice
            over them and the parapet above that — the horizontals that give a
            long brick front its structure, and the reason the reference
            building reads as storeys rather than as a wall with holes in it. */}
        {trim && floorCourses(hf.D, hf.C, WH, courses, 'l')}
        {trim && floorCourses(hf.C, hf.B, WH, courses, 'r')}
        {trim && band(0, PLINTH, 'iso-plinth', 'p')}
        {trim && band(H - CORNICE, H, 'iso-cornice', 'c')}
        {trim && parapet > 0 && band(H, WH, 'iso-parapet', 'q')}

        {/* The door's bay is reserved on the main wall even though the door
            itself goes on the pavilion in front of it — otherwise a rank of
            windows sits behind the entrance. */}
        {windows(hf.D, hf.C, WH, hf.spanLeft, sills, paneW, 'l', paneShape, stone.glass, door ? doorBay(door, hf.spanLeft, WH) : undefined, lights)}
        {windows(hf.C, hf.B, WH, hf.spanRight, sills, paneW, 'r', paneShape, stone.glass, door ? doorBay(door, hf.spanRight, WH) : undefined, lights)}
        {/* Buttresses at the bay lines, clear of the entrance bay and of
            the corner the tower holds. */}
        {buttresses && (
          <>
            {fronts.map((dir) => { const s = wallSpan(w, h, dir); return (
              <Buttresses key={dir} pal={pal} stone={stone} col={col} row={row} w={w} h={h} height={H} outward={dir}
                reserve={[0.5 - pavilionWidth(s) / s / 2, 0.5 + pavilionWidth(s) / s / 2]} skipNear={turrets ? towerPlan : 0} />
              ); })}
          </>
        )}

        {/* The flat between the parapet and the eaves. Without it the roof's
            inset leaves a ring of nothing at the head of the wall, and the
            LAWN shows through it — a green stripe running right round the
            building where its roof should meet its walls. A parapet roof has a
            gutter behind it; this is that gutter. */}
        {parapet > 0 && (
          <polygon points={polyPoints(boxFaces(col, row, w, h, 0, WH).top)} fill={pal.roofDeck} />
        )}
        {/* Deep eaves throw a shadow on the wall under them: the band at
            the head of the wall is that shadow, and the roof oversails the
            walls by the vernacular's eaves. */}
        {eaves > 0 && band(H - up(0.9), H, 'iso-eaves-shadow', 's')}
        {ridge > 0 ? (
          <HippedRoof
            col={col + inset - eaves} row={row + inset - eaves} w={w - inset * 2 + eaves * 2} h={h - inset * 2 + eaves * 2}
            base={WH} rise={ridge} pal={pal}
          />
        ) : (
          // A hall with no ridge (Modern) has a flat roof behind its thin
          // parapet: one deck, not four coplanar facets in four shades.
          <polygon points={polyPoints(boxFaces(col + inset, row + inset, w - inset * 2, h - inset * 2, WH, 0).top)} fill={pal.roof} />
        )}
        {balustrade && parapet > 0 && (
          <>
            {fronts.map((dir) => <Balustrade key={dir} pal={pal} stone={stone} col={col} row={row} w={w} h={h} base={WH} outward={dir} />)}
          </>
        )}
        {chimneys && ridgeChimneys({ col: col + inset, row: row + inset, w: w - inset * 2, h: h - inset * 2, base: WH, rise: ridge, at: [], ends: true, pal, stone })}
        {dormers && <Dormers col={col + inset} row={row + inset} w={w - inset * 2} h={h - inset * 2} base={WH} rise={ridge} pal={pal} stone={stone} glass={stone.glass} />}
        {/* Each end of the roofline closed by carrying the wall itself higher.
            Real blocks hugging the wall rather than a band painted over it —
            an earlier pass drew these as a translucent band from the ground up,
            which washed brown over the windows underneath instead of standing
            above them. Drawn AFTER the roof, so they close it rather than
            disappear behind it. */}
        {rooflineEnd === 'pavilion' && ([
          // [col, row, w, h] of each raised end, hugging the wall it caps.
          [col, row + h - END_PAVILION_DEPTH, endPlan, END_PAVILION_DEPTH],
          [col + w - endPlan, row + h - END_PAVILION_DEPTH, endPlan, END_PAVILION_DEPTH],
          [col + w - END_PAVILION_DEPTH, row, END_PAVILION_DEPTH, endPlan],
          [col + w - END_PAVILION_DEPTH, row + h - endPlan, END_PAVILION_DEPTH, endPlan],
        ] as const).map(([ec, er, ew, eh], i) => (
          <EndPavilion stone={stone} key={`e${i}`} col={ec} row={er} w={ew} h={eh} base={WH} pal={pal} />
        ))}

        {/* The corner tower, after the roof it rises past and before the
            porch, which stands further forward still. Nearly two storeys
            above the eaves, crenellated and flat-topped, with two ranks of
            lancets more than the hall. */}
        {turrets && cornerInFront && turretNode}
        {/* The bell-gable over the centre of the front, on every hall but
            the one that carries the campanile. */}
        {bellGable && !hasClockTower(t) && (
          <BellGable pal={pal} stone={stone}
            origin={hf.D} along={hf.C}
            inward={gableInward(col, row, w, h)}
            wallHeight={WH} span={hf.spanLeft} centreU={0.5} sideAt="u1"
          />
        )}
        {/* The campus's one landmark tops out. hasClockTower still decides
            WHICH building (Founders Hall, and nothing else); the vernacular
            decides WHAT stands there. */}
        {hasClockTower(t) && apex === 'campanile' && (
          <Campanile stone={stone} pal={pal} gilded={hasGilt(vernacular)}
            col={col} row={row} w={w} h={h} base={WH + ridge * 0.4} />
        )}
        {hasClockTower(t) && apex === 'dome' && (
          <Dome stone={stone} col={col} row={row} w={w} h={h} base={WH + ridge * 0.4} />
        )}
        {hasClockTower(t) && apex !== 'none' && apex !== 'core' && apex !== 'campanile' && apex !== 'dome' && (
          <ClockTower stone={stone} apex={apex} gilded={hasGilt(vernacular)} col={col} row={row} w={w} h={h} base={WH + ridge * 0.4} />
        )}
        {hasClockTower(t) && apex === 'core' && (
          <StairCore stone={stone} col={col} row={row} w={w} h={h} base={WH} />
        )}

        {/* Last, because they project toward the camera and must paint over
            the wall they stand against.

            THE CENTRE BAY IS PART OF THE ENTRANCE, not a fixture underneath
            it. It used to be drawn unconditionally, which left a Gothic hall
            wearing a Georgian pavilion — windows and a classical pediment —
            with a porch parked in front of it. Each vernacular now brings its
            own bay. */}
        {entrance === 'portico' && (
          <>
            {fronts.map((dir) => (
              <CentrePavilion key={dir} paneShape={paneShape} glass={stone.glass}
                col={col} row={row} w={w} h={h} wallHeight={H} outward={dir}
                pal={pal} door={door} sills={sills} paneW={paneW}
              />
            ))}
            {/* Georgian's portico stops at the second-floor line on four
                columns; the Classical one runs the height of the wall on
                six, under a pediment — the temple front. */}
            {fronts.map((dir) => {
              const span = wallSpan(w, h, dir);
              const at = outsideWall(col, row, w, h, dir, span / 2, PAVILION_DEPTH + PORTICO_STANDOFF);
              return (
                <Portico key={dir} stone={stone}
                  centreCol={at.col} centreRow={at.row}
                  width={pavilionWidth(span) * (grandPortico ? 1.2 : 1)} outward={dir}
                  columns={grandPortico ? 6 : PORTICO_COLUMNS}
                  height={grandPortico ? H - ENTABLATURE - up(0.3) : PORTICO_HEIGHT} pediment={grandPortico}
                />
              );
            })}
          </>
        )}
        {entrance === 'canopy' && door && (
          <>
            <Door d={door} origin={hf.D} along={hf.C} wallHeight={WH} span={hf.spanLeft} shape={doorShape} />
            <Door d={door} origin={hf.C} along={hf.B} wallHeight={WH} span={hf.spanRight} shape={doorShape} />
            {fronts.map((dir) => <Canopy key={dir} stone={stone} d={door} col={col} row={row} w={w} h={h} outward={dir} wallHeight={H} hood={hood} roof={material.roof} />)}
          </>
        )}
        {entrance === 'porch' && (
          <>
            {fronts.map((dir) => (
              <Porch key={dir} pal={pal} stone={stone}
                col={col} row={row} w={w} h={h} wallHeight={H} outward={dir}
              />
            ))}
          </>
        )}
        {entrance === 'recess' && (
          <>
            {fronts.map((dir) => <Recess key={dir} pal={pal} col={col} row={row} w={w} h={h} wallHeight={H} outward={dir} />)}
          </>
        )}
        {entrance === 'arcade' && (
          <>
            {fronts.map((dir) => <Arcade key={dir} pal={pal} stone={stone} col={col} row={row} w={w} h={h} outward={dir} height={arcadeHeight(H)} />)}
          </>
        )}
        {/* The flight lands at whatever the entrance actually presents: the
            front of the columns where there is a portico, the front of the
            bay where there is a porch. A porch's steps standing a portico's
            depth out would float on the lawn. */}
        {door && flights && fronts.map((dir) => {
          const span = wallSpan(w, h, dir);
          const at = outsideWall(col, row, w, h, dir, span / 2, entranceStandoff);
          const out = outwardOf(dir);
          return (
            <EntranceSteps key={dir} stone={stone}
              d={door} centreCol={at.col} centreRow={at.row}
              outCol={out.col} outRow={out.row} span={span}
            />
          );
        })}
      </>
    );
  }

  if (motif === 'hangar' && !site) {
    // THE CLEAR-SPAN SHEDS. One vocabulary — a pier-and-panel wall under a
    // clear-span roof, lit from a band up near the eaves — and four
    // silhouettes, because a fitness centre, an arena, a pool hall and a
    // sound stage are four different buildings and used to be one grey box
    // at four sizes:
    //
    //   fitness    the rec centre, the gym, the athletics complex: the box,
    //              a monitor roof, a glazed entrance bay and a canopy
    //   arena      a barrel vault over a glazed concourse
    //   natatorium a fully glazed long face with the pool showing through
    //              it, under a monopitch roof, with a flue at the back
    //   studio     a blank sound stage with a roller door and no windows
    //
    // Invariant across the vernaculars, like everything else in this
    // motif: these are engineering, not architecture.
    const kind: 'fitness' | 'arena' | 'natatorium' | 'studio' =
      t.facilityType === 'athleticsArena' ? 'arena'
        : t.facilityType === 'athleticsNatatorium' ? 'natatorium'
          : t.id === 'LAB-FILM' ? 'studio' : 'fitness';
    const alongW = w >= h;
    const SHED_GLASS = 'rgba(52, 72, 84, 0.6)';
    const clere = [clerestorySill(H)];
    const glassHead = Math.min(STOREY * 1.3, clerestorySill(H) - up(0.5));
    const left = { o: f.D, a: f.C, span: f.spanLeft };
    const right = { o: f.C, a: f.B, span: f.spanRight };
    const longFace = alongW ? left : right;
    const shortFace = alongW ? right : left;

    const courses = ([[f.D, f.C] as const, [f.C, f.B] as const]).map(([o, a], i) => (
      <g key={`b${i}`}>
        <WallBand origin={o} along={a} wallHeight={H} from={0} to={BASE_COURSE} className="iso-plinth" />
        <WallBand origin={o} along={a} wallHeight={H} from={H - EAVES_COURSE} to={H} className="iso-cornice" />
      </g>
    ));
    const piers = (
      <>
        {fronts.map((dir) => <Piers key={dir} stone={stone} col={col} row={row} w={w} h={h} height={H} outward={dir} pal={pal} />)}
      </>
    );
    const doors = door && (
      <>
        <Door d={door} origin={f.D} along={f.C} wallHeight={H} span={f.spanLeft} />
        <Door d={door} origin={f.C} along={f.B} wallHeight={H} span={f.spanRight} />
        {fronts.map((dir) => {
          const span = wallSpan(w, h, dir);
          const at = outsideWall(col, row, w, h, dir, span / 2, 0);
          const out = outwardOf(dir);
          return <EntranceSteps key={dir} stone={stone} d={door} centreCol={at.col} centreRow={at.row} outCol={out.col} outRow={out.row} span={span} />;
        })}
      </>
    );
    // The clerestory: one continuous band under the eaves, not a rank of
    // punched squares — a clear-span hall is lit along its length.
    const clerestory = (face: { o: Pt; a: Pt; span: number }, key: string) =>
      windows(face.o, face.a, H, face.span, clere, paneW, key, 'ribbon', SHED_GLASS, door ? doorBay(door, face.span, H) : undefined);

    // THE MONITOR: a raised strip along the ridge with a rooflight on top.
    // Drawn as a BOX — two visible faces and a top — where it used to be a
    // single parallelogram floating nine units over the roof with nothing
    // joining it to the deck, which read as a paler stripe printed slightly
    // off register.
    const monitor = (() => {
      const mc = alongW ? col + w * 0.05 : col + w * 0.31;
      const mr = alongW ? row + h * 0.31 : row + h * 0.05;
      const mw = alongW ? w * 0.9 : w * 0.38;
      const mh = alongW ? h * 0.38 : h * 0.9;
      const rise = up(2.2);
      const box = boxFaces(mc, mr, mw, mh, H, rise);
      const light = boxFaces(
        mc + (alongW ? mw * 0.03 : mw * 0.3), mr + (alongW ? mh * 0.3 : mh * 0.03),
        alongW ? mw * 0.94 : mw * 0.4, alongW ? mh * 0.4 : mh * 0.94, H + rise, 0,
      );
      return (
        <>
          {sideFaces(box, shade(pal.roof, 0.9), shade(pal.roof, 0.76))}
          <polygon points={polyPoints(box.top)} fill={pal.roofDeck} />
          <polygon className="iso-rooflight" points={polyPoints(light.top)} />
        </>
      );
    })();

    if (kind === 'arena') {
      // A barrel vault down the long axis, in facets shaded by the way each
      // one faces (see SLOPE), closed at the near end by a wall the same
      // colour as the face below it; a glazed concourse wraps the ground
      // floor of both visible faces.
      const VAULT = up(6.5);
      const N = 7;
      const along0 = 0.015; const along1 = 0.985;
      const pt = (a: number, c: number, z: number) => lift(
        alongW ? project(col + w * a, row + h * c) : project(col + w * c, row + h * a), z,
      );
      const zAt = (c: number) => H + VAULT * Math.sin(Math.PI * c);
      const facets = Array.from({ length: N }, (_, i) => {
        const c0 = i / N; const c1 = (i + 1) / N; const cm = (c0 + c1) / 2;
        return (
          <polygon
            key={i}
            points={polyPoints([pt(along0, c0, zAt(c0)), pt(along1, c0, zAt(c0)), pt(along1, c1, zAt(c1)), pt(along0, c1, zAt(c1))])}
            fill={shade(pal.roof, 1.14 - 0.44 * cm)}
          />
        );
      });
      const endFace = (
        <polygon
          points={polyPoints(Array.from({ length: N + 1 }, (_, i) => pt(along1, i / N, zAt(i / N))))}
          fill={alongW ? pal.wallRight : pal.wallLeft}
        />
      );
      return (
        <>
          <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
          <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
          {piers}
          {courses}
          <CurtainWall origin={f.D} along={f.C} wallHeight={H} spanTiles={f.spanLeft} from={BASE_COURSE} to={glassHead} floors={[]} id="al" />
          <CurtainWall origin={f.C} along={f.B} wallHeight={H} spanTiles={f.spanRight} from={BASE_COURSE} to={glassHead} floors={[]} id="ar" />
          {doors}
          <polygon points={polyPoints(f.top)} fill={pal.roof} />
          {facets}
          {endFace}
        </>
      );
    }

    if (kind === 'natatorium') {
      // The long face is glass from plinth to eaves, with the pool showing
      // as a blue band low in it; the roof is a single pitch falling toward
      // that glass, and a flue stands at the back corner.
      const RISE = up(3.0);
      // Grid-fixed corners: the roof is high along the -row (or -col) edge
      // whichever way the camera happens to be looking at it.
      const NW = f.NWt; const NE = f.NEt; const SE = f.SEt; const SW = f.SWt;
      const roof = alongW
        ? [lift(NW, RISE), lift(NE, RISE), SE, SW]      // high along the -row edge
        : [lift(NW, RISE), NE, SE, lift(SW, RISE)];     // high along the -col edge
      // The short wall becomes a trapezoid: the extra triangle above the
      // eaves. There is one at each end; only a visible one is drawn, and at
      // an azimuth where the wall is edge-on it has no width anyway.
      const gableEnd = (dir: FaceDir) => {
        if (!wallOf(f, dir).visible) return null;
        const pts = dir === 'posCol' ? [SE, NE, lift(NE, RISE)]
          : dir === 'negCol' ? [SW, NW, lift(NW, RISE)]
            : dir === 'posRow' ? [SW, SE, lift(SW, RISE)]
              : [NE, NW, lift(NW, RISE)];
        return <polygon key={dir} points={polyPoints(pts)} fill={pal.wall[dir]} />;
      };
      const gable = alongW ? ['posCol', 'negCol'] as const : ['posRow', 'negRow'] as const;
      // The long wall under the roof's HIGH edge is a storey taller than the
      // eaves wall opposite: the strip between them, when the camera has
      // come round to see it. The opening camera never did.
      const highWall = alongW ? 'negRow' as const : 'negCol' as const;
      const highStrip = wallOf(f, highWall).visible
        ? (
          <polygon
            points={polyPoints(alongW ? [NW, NE, lift(NE, RISE), lift(NW, RISE)] : [NW, SW, lift(SW, RISE), lift(NW, RISE)])}
            fill={pal.wall[highWall]}
          />
        )
        : null;
      const flue = boxFaces(col + 0.25, row + 0.25, 0.45, 0.45, H + RISE * 0.9, up(4.5));
      const roofFill = alongW ? pal.negRow : pal.negCol;
      return (
        <>
          <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
          <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
          {piers}
          {courses}
          <CurtainWall origin={longFace.o} along={longFace.a} wallHeight={H} spanTiles={longFace.span} from={BASE_COURSE} floors={[]} id="nl" />
          <WallBand origin={longFace.o} along={longFace.a} wallHeight={H} from={up(1.1)} to={up(2.4)} className="iso-pool-glimpse" u0={0.06} u1={0.94} />
          {clerestory(shortFace, 'ns')}
          {doors}
          {highStrip}
          {gable.map(gableEnd)}
          <polygon points={polyPoints(roof)} fill={roofFill} />
          {sideFaces(flue, shade(roofTint, 0.8), shade(roofTint, 0.66))}
          <polygon points={polyPoints(flue.top)} fill={shade(roofTint, 0.5)} />
        </>
      );
    }

    if (kind === 'studio') {
      // A sound stage has no windows. A roller door on the long face is the
      // one opening it wants, beside the ordinary one.
      return (
        <>
          <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
          <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
          {piers}
          {courses}
          <WallBand origin={longFace.o} along={longFace.a} wallHeight={H} from={0} to={H * 0.6} className="iso-roller" u0={0.66} u1={0.88} />
          <WallBand origin={longFace.o} along={longFace.a} wallHeight={H} from={H * 0.6} to={H * 0.6 + up(0.4)} className="iso-cornice" u0={0.65} u1={0.89} />
          {doors}
          <polygon points={polyPoints(f.top)} fill={pal.roof} />
          {monitor}
        </>
      );
    }

    // The fitness chain: the box, with a glazed bay round each door and a
    // canopy over it.
    const bay = (face: { o: Pt; a: Pt; span: number }, key: string) => {
      if (!door) return null;
      const dw = Math.min(door.widthTiles / face.span, 0.6);
      const extra = 1 / baysAcross(face.span);
      return (
        <CurtainWall
          origin={face.o} along={face.a} wallHeight={H} spanTiles={face.span}
          from={BASE_COURSE} to={glassHead} floors={[]} id={key}
          u0={Math.max(0.02, 0.5 - dw / 2 - extra)} u1={Math.min(0.98, 0.5 + dw / 2 + extra)}
        />
      );
    };
    return (
      <>
        <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
        <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
        {piers}
        {courses}
        {clerestory(left, 'l')}
        {clerestory(right, 'r')}
        {bay(left, 'gl')}
        {bay(right, 'gr')}
        {doors}
        {door && fronts.map((dir) => <Canopy key={dir} stone={stone} d={door} col={col} row={row} w={w} h={h} outward={dir} wallHeight={H} />)}
        <polygon points={polyPoints(f.top)} fill={pal.roof} />
        {monitor}
      </>
    );
  }

  const gabled = ridge > 0;
  const alongW = w >= h;
  // The stair turret at a residence hall's near corner: smaller than a
  // hall's tower, plain-capped, and only where there is a wall long enough
  // to hold one beside the door.
  const turretPlan = turrets && motif === 'residential' && Math.min(w, h) >= 2.8 && gabled
    ? Math.min(across(4.8), Math.min(w, h) * 0.2)
    : 0;
  // Whether this door is reached through an archway's porch (its own, or
  // the one a too-short arcade falls back to), which is where its flight lands.
  const porched = entrance === 'archway' || (entrance === 'arcade' && !arcadeFits(H) && shortArcadeFallback === 'archway');
  // Where this door's flight lands: the porch front, the portico's columns,
  // or the wall.
  const stepStandoff = porched ? PAVILION_DEPTH : entrance === 'portico' ? PORTICO_STANDOFF + PORTICO_COLUMN_PLAN : 0;
  // A gable for a house-sized block, a hip for anything broad: a 3x3 café
  // or a 7x3 founding hall gables; a 9x4 residence hall and every larger
  // pavilion hips, as the academic halls do.
  const hipped = gabled && Math.min(w, h) >= 4;
  // The roof's own footprint: the wall's, plus the eaves it oversails by.
  const rc = col - eaves; const rr = row - eaves; const rw = w + eaves * 2; const rh = h + eaves * 2;
  const rf = boxFaces(rc, rr, rw, rh, 0, H);
  // The residence hall's corner turret: after the roof it rises past when
  // its corner is toward the camera, before the walls when it is not.
  const residentialTurret = turretPlan > 0 && (
    <CornerTower pal={pal} glass={stone.glass} paneW={paneW}
      col={col + w - turretPlan + TOWER_PROUD} row={row + h - turretPlan + TOWER_PROUD} plan={turretPlan}
      height={H + STOREY * 0.8} sills={rankSills(ranks + 1)} crenels={false} capRise={up(4.2)}
    />
  );
  const rs = lift(alongW ? project(rc, rr + rh / 2) : project(rc + rw / 2, rr), H + ridge);
  const re = lift(alongW ? project(rc + rw, rr + rh / 2) : project(rc + rw / 2, rr + rh), H + ridge);

  return (
    <>
      {!site && !cornerInFront && residentialTurret}
      <polygon points={polyPoints(f.left)} fill={pal.wallLeft} />
      <polygon points={polyPoints(f.right)} fill={pal.wallRight} />
      {!site && trim && floorCourses(f.D, f.C, H, courses, 'l')}
      {!site && trim && floorCourses(f.C, f.B, H, courses, 'r')}
      {/* The base course and the eaves course every roofed building on this
          campus shares with the halls. One set of parts, assembled
          differently — which is the whole of what makes a library and a lab
          read as the same campus. */}
      {!site && trim && ([[f.D, f.C] as const, [f.C, f.B] as const]).map(([o, a], i) => (
        <g key={`b${i}`}>
          <WallBand origin={o} along={a} wallHeight={H} from={0} to={BASE_COURSE} className="iso-plinth" />
          <WallBand origin={o} along={a} wallHeight={H} from={H - EAVES_COURSE} to={H} className="iso-cornice" />
        </g>
      ))}
      {/* The left wall runs w tiles along col, the right wall h tiles along
          row. Each gets its bay count from its OWN length — which is the whole
          point: the same window then goes in both, instead of one wall's
          windows coming out wider than the other's by the ratio of the two
          spans. */}
      {!site && windows(f.D, f.C, H, f.spanLeft, sills, paneW, 'l', paneShape, stone.glass, door ? doorBay(door, f.spanLeft, H) : undefined, lights)}
      {!site && windows(f.C, f.B, H, f.spanRight, sills, paneW, 'r', paneShape, stone.glass, door ? doorBay(door, f.spanRight, H) : undefined, lights)}
      {/* Buttresses down the walls of the pitched-roof buildings — the
          residence halls and pavilions — clear of the door and its canopy,
          and of the corner the turret holds. The flat-roofed civic set
          gets a crenellated head instead, below. */}
      {!site && buttresses && gabled && door && (
        <>
          {fronts.map((dir) => { const s = wallSpan(w, h, dir); return (
            <Buttresses key={dir} pal={pal} stone={stone} col={col} row={row} w={w} h={h} height={H} outward={dir}
              reserve={[0.5 - door.widthTiles * 0.95 / s, 0.5 + door.widthTiles * 0.95 / s]} skipNear={turretPlan} />
            ); })}
        </>
      )}
      {/* A grocery's front is a shopfront: continuous glazing at street
          level on both faces, over the punched windows the rank would
          otherwise put there. */}
      {!site && t.facilityType === 'grocery' && (
        <>
          <CurtainWall origin={f.D} along={f.C} wallHeight={H} spanTiles={f.spanLeft} from={BASE_COURSE} to={Math.min(STOREY * 0.85, H - EAVES_COURSE * 2)} floors={[]} id="sfl" u0={0.04} u1={0.96} />
          <CurtainWall origin={f.C} along={f.B} wallHeight={H} spanTiles={f.spanRight} from={BASE_COURSE} to={Math.min(STOREY * 0.85, H - EAVES_COURSE * 2)} floors={[]} id="sfr" u0={0.04} u1={0.96} />
        </>
      )}
      {!site && door && <Door d={door} origin={f.D} along={f.C} wallHeight={H} span={f.spanLeft} shape={doorShape} />}
      {!site && door && <Door d={door} origin={f.C} along={f.B} wallHeight={H} span={f.spanRight} shape={doorShape} />}
      {/* The health chain's sign. The hospital carries its cross on the
          slab; the clinic and the counselling centre carry a smaller one
          over the door, so the three read as one chain. */}
      {!site && t.facilityType === 'healthCenter' && door && (
        <>
          <RedCross origin={f.D} along={f.C} wallHeight={H} spanTiles={f.spanLeft} centreU={0.5} centreV={Math.min(0.9, (door.threshold + door.height + up(1.6)) / H)} scale={0.45} />
          <RedCross origin={f.C} along={f.B} wallHeight={H} spanTiles={f.spanRight} centreU={0.5} centreV={Math.min(0.9, (door.threshold + door.height + up(1.6)) / H)} scale={0.45} />
        </>
      )}
      {/* The civic set's colonnade: the hall's own columns, run the length of
          the front rather than gathered into a centre bay. That is the
          difference between a building with an entrance and a building that
          IS one, which is what a library and a concert hall are. */}
      {/* A glass box: the Modern civic set's walls are curtain wall from
          plinth to eaves, over the ribbon rank the wall would otherwise
          carry, with the panel showing only as the frame around it. */}
      {!site && glazedCivic && motif === 'portico' && (
        <>
          <CurtainWall origin={f.D} along={f.C} wallHeight={H} spanTiles={f.spanLeft} from={BASE_COURSE} to={H - EAVES_COURSE * 1.5} floors={courses} id="gcl" u0={0.03} u1={0.97} />
          <CurtainWall origin={f.C} along={f.B} wallHeight={H} spanTiles={f.spanRight} from={BASE_COURSE} to={H - EAVES_COURSE * 1.5} floors={courses} id="gcr" u0={0.03} u1={0.97} />
        </>
      )}
      {/* A small portico over a pavilion's or a residence hall's door: four
          columns and an entablature at the second-floor line, or under the
          eaves where the wall is lower. */}
      {!site && entrance === 'portico' && door && fronts.map((dir) => {
        const span = wallSpan(w, h, dir);
        const at = outsideWall(col, row, w, h, dir, span / 2, PORTICO_STANDOFF);
        return (
          <Portico stone={stone}
            key={`sp${dir}`}
            centreCol={at.col} centreRow={at.row}
            width={Math.min(door.widthTiles * 3.2, span * 0.6)}
            outward={dir}
            height={Math.min(PORTICO_HEIGHT, H - EAVES_COURSE * 2)}
          />
        );
      })}
      {!site && entrance === 'colonnade' && fronts.map((dir) => {
        const span = wallSpan(w, h, dir);
        const at = outsideWall(col, row, w, h, dir, span / 2, PORTICO_STANDOFF);
        return (
          <Portico stone={stone}
            key={dir}
            centreCol={at.col} centreRow={at.row}
            width={span * 0.9}
            outward={dir}
            columns={Math.max(2, Math.min(COLONNADE_MAX,
              Math.round((span * 0.9 * METRES_PER_TILE) / COLONNADE_BAY_METRES)))}
            height={Math.min(COLONNADE_HEIGHT, H - EAVES_COURSE * 2)}
          />
        );
      })}
      {/* A canopy over the door. A pavilion has always had one; a residence
          hall now does too, because the way INTO a building is the thing a
          long brick block was most obviously missing — a slab with ranked
          windows and a flush opening is a barn, and the canopy is most of
          what turns it into somewhere people live. */}
      {!site && entrance === 'recess' && (
        <>
          {fronts.map((dir) => <Recess key={dir} pal={pal} col={col} row={row} w={w} h={h} wallHeight={H} outward={dir} />)}
        </>
      )}
      {!site && entrance === 'arcade' && arcadeFits(H) && (
        <>
          {fronts.map((dir) => <Arcade key={dir} pal={pal} stone={stone} col={col} row={row} w={w} h={h} outward={dir} height={arcadeHeight(H)} />)}
        </>
      )}
      {!site && (entrance === 'canopy' || (entrance === 'arcade' && !arcadeFits(H) && shortArcadeFallback === 'canopy')) && door && (
        <>
          {fronts.map((dir) => <Canopy key={dir} stone={stone} d={door} col={col} row={row} w={w} h={h} outward={dir} wallHeight={H} hood={hood} roof={material.roof} />)}
        </>
      )}
      {!site && (entrance === 'archway' || (entrance === 'arcade' && !arcadeFits(H) && shortArcadeFallback === 'archway')) && door && (
        <>
          {fronts.map((dir) => <Archway key={dir} pal={pal} stone={stone} d={door} col={col} row={row} w={w} h={h} outward={dir} wallHeight={H} />)}
        </>
      )}
      {/* The flights, on the ground in front of each door. Drawn after the
          walls so they stand in front of the mass they climb to, and after
          both doors so neither one's steps are cut by the other's wall.
          They land at the face the entrance presents: the wall under a
          canopy, the front of an archway's porch — and where the door is
          reached through an arcade, at grade, there is no flight, because
          the one drawn at the wall stood inside the arcade. */}
      {!site && door && !(entrance === 'arcade' && arcadeFits(H)) && fronts.map((dir) => {
        const span = wallSpan(w, h, dir);
        const at = outsideWall(col, row, w, h, dir, span / 2, stepStandoff);
        const out = outwardOf(dir);
        return (
          <EntranceSteps key={dir} stone={stone}
            d={door} centreCol={at.col} centreRow={at.row}
            outCol={out.col} outRow={out.row} span={span}
          />
        );
      })}

      {gabled && eaves > 0 && ([[f.D, f.C] as const, [f.C, f.B] as const]).map(([o, a], i) => (
        <WallBand key={`es${i}`} origin={o} along={a} wallHeight={H} from={H - up(0.9)} to={H} className="iso-eaves-shadow" />
      ))}
      {hipped ? (
        <>
          <HippedRoof col={rc} row={rr} w={rw} h={rh} base={H} rise={ridge} pal={pal} />
          {chimneys && ridgeChimneys({ col: rc, row: rr, w: rw, h: rh, base: H, rise: ridge, at: [0.25, 0.75], pal, stone })}
        </>
      ) : gabled ? (
        <>
          {/* The two long slopes. When the ridge runs along col (alongW) they
              are the -row and +row faces; when it runs along row they are
              -col and +col. Same polygons as before, tones now chosen by
              which way each one actually points. */}
          <polygon
            points={polyPoints(alongW ? [rf.NWt, rf.NEt, re, rs] : [rf.NWt, rf.SWt, re, rs])}
            fill={alongW ? pal.negRow : pal.negCol}
          />
          <polygon
            points={polyPoints(alongW ? [rf.SWt, rf.SEt, re, rs] : [rf.NEt, rf.SEt, re, rs])}
            fill={alongW ? pal.posRow : pal.posCol}
          />
          {/* ONE gable end — the near one. These are vertical triangles
              capping the ridge, not hips, and only the near one can be seen:
              the far one is geometrically inside the front slope. It was
              being drawn anyway, and drawn LAST, so painter's order put an
              occluded face over the roof and the roof read as transparent.
              Its tone is the wall's, not a slope's, because a gable end is
              the wall below it carried on up — same plane, same light. Which
              end is the near one is the camera's to say (see gableEnds). */}
          {gableEnds(rf, alongW, rs, re, pal)}
          <line className="iso-ridge" x1={rs.x} y1={rs.y} x2={re.x} y2={re.y} />
          {chimneys && [0.22, 0.78].map((u, i) => {
            const cc = alongW ? rc + rw * u : rc + rw / 2;
            const cr = alongW ? rr + rh / 2 : rr + rh * u;
            const plan = across(1.3);
            return <Chimney key={`gc${i}`} cc={cc} cr={cr} base={H + ridge * (1 - plan / Math.min(rw, rh))} top={H + ridge + up(2.0)} pal={pal} stone={stone} />;
          })}
        </>
      ) : (
        <>
          <polygon points={polyPoints(f.top)} fill={pal.roof} />
          {/* Scaffolding hatch over the site's own deck: the diagonal
              boarding you see looking down into a half-built frame. */}
          {site && <polygon points={polyPoints(f.top)} fill={`url(#${SCAFFOLD_PATTERN_ID})`} />}
          {site && <Scaffolding col={col} row={row} w={w} h={h} height={H} />}
          {site && Math.max(w, h) >= 5 && <Crane col={col} row={row} w={w} h={h} height={wallHeightOf(t)} />}
          {!site && motif === 'portico' && [0.3, 0.5, 0.7].map((v) => (
            // Libraries and galleries are top-lit. Rooflights are both true
            // and the thing that tells them apart from a plain shed — but a
            // rooflight is a rooflight-sized thing, not a fifth of the roof.
            [0.3, 0.55].map((u) => (
              <polygon
                key={`${u}-${v}`}
                className="iso-rooflight"
                points={polyPoints(boxFaces(col + w * u, row + h * v, Math.min(w * 0.12, across(6)), Math.min(h * 0.1, across(4)), H + 1, 0).top)}
              />
            ))
          ))}
          {!site && t.facilityType === 'performingArtsCenter' && (() => {
            // THE FLY TOWER. A concert hall and theatre is the one civic
            // building whose silhouette is not its front: the blank box over
            // the stage, a storey and a half above the roof across the back
            // third of the plan, is what says "theatre" — and without it the
            // performing arts centre was a larger library.
            const fw = w * 0.34; const fh = h * 0.56;
            const fly = boxFaces(col + w * 0.06, row + h * 0.22, fw, fh, H, STOREY * 1.6);
            return (
              <>
                <polygon points={polyPoints(fly.left)} fill={pal.wallLeft} />
                <polygon points={polyPoints(fly.right)} fill={pal.wallRight} />
                {trim && <WallBand origin={fly.D} along={fly.C} wallHeight={STOREY * 1.6} from={STOREY * 1.6 - EAVES_COURSE} to={STOREY * 1.6} className="iso-cornice" />}
                {trim && <WallBand origin={fly.C} along={fly.B} wallHeight={STOREY * 1.6} from={STOREY * 1.6 - EAVES_COURSE} to={STOREY * 1.6} className="iso-cornice" />}
                <polygon points={polyPoints(fly.top)} fill={pal.roof} />
              </>
            );
          })()}
          {!site && motif === 'works' && (() => {
            // The exhaust stack at the back corner: the universal lab
            // signal, and four polygons.
            const sp = across(1.2);
            const st = boxFaces(col + w * 0.88 - sp, row + h * 0.08, sp, sp, H, up(6));
            return (
              <>
                {sideFaces(st, shade(roofTint, 0.82), shade(roofTint, 0.68))}
                <polygon points={polyPoints(st.top)} fill={shade(roofTint, 0.45)} />
              </>
            );
          })()}
          {!site && (motif === 'works' || motif === 'pavilion' || motif === 'block') && (
            // A lab's roof is the most crowded on campus; a pavilion's
            // carries a unit or two; a hospital's carries the heaviest plant
            // of all plus a helipad-sized deck, which is what reads as
            // "hospital" rather than "very large pavilion" from above.
            // Back to front, like everything else that stands on this map.
            // These are authored in the order that reads best on the page, not
            // in the order they have to be painted in — a lab's three units
            // were listed 0.30, 0.92, 0.78 deep, so the nearest was drawn
            // before the farthest and the farthest painted over it. Sorted
            // through the map's own comparator (depthSort.ts), in the
            // building's own footprint fractions: it is scale-free, so the
            // same relation that orders two halls orders two air handlers.
            depthOrder(
              (motif === 'works'
                ? [[0.12, 0.18, 0.28, 0.26], [0.48, 0.44, 0.32, 0.28], [0.18, 0.6, 0.22, 0.22]]
                : motif === 'block'
                  ? [[0.08, 0.10, 0.30, 0.26], [0.46, 0.12, 0.22, 0.18], [0.10, 0.52, 0.24, 0.22], [0.52, 0.56, 0.34, 0.32]]
                  : [[0.18, 0.26, 0.26, 0.24], [0.54, 0.52, 0.28, 0.22]]
              ).map(([fx, fy, fw, fh]) => ({ col: fx, row: fy, w: fw, h: fh })),
            ).filter((_, i) => Math.min(w, h) >= 4 || i === 0).map((unit, i) => (
              // Capped at a real size: a unit is an air handler about 5 m by
              // 4 m, not a fraction of whatever roof it lands on — on a 3x3
              // café two of them covered a third of the roof.
              <RoofBox
                key={i}
                col={col + w * unit.col} row={row + h * unit.row}
                w={Math.min(w * unit.w, across(5.5))} h={Math.min(h * unit.h, across(4.5))}
                base={H} height={motif === 'works' ? 12 : motif === 'block' ? 15 : 9}
                tint={roofTint}
              />
            ))
          )}
        </>
      )}
      {/* The residence hall's corner turret, after the roof it rises past. */}
      {!site && turretPlan > 0 && cornerInFront && residentialTurret}
      {/* The crenellated head of the flat-roofed civic set: merlons along
          both visible walls, standing on the roof's edge. */}
      {!site && crenellations && !gabled && motif === 'portico' && (
        <>
          {fronts.map((dir) => <Merlons key={dir} col={col} row={row} w={w} h={h} base={H} outward={dir} pal={pal} />)}
        </>
      )}
      {/* The balustrade along the same edge in the Classical set. */}
      {!site && balustrade && !gabled && motif === 'portico' && (
        <>
          {fronts.map((dir) => <Balustrade key={dir} pal={pal} stone={stone} col={col} row={row} w={w} h={h} base={H} outward={dir} />)}
        </>
      )}
      {/* The bell-gable over a pavilion's door: the one-storey dining hall,
          clinic and chapter house become the small chapel fronts of the
          reference campuses. After the roof, which it rises past; on the
          left face only, since a bell-gable is a front and a building has
          one. A chapter house keeps its letters instead. */}
      {!site && bellGable && motif === 'pavilion' && gabled && door && !glyphs && (
        <BellGable pal={pal} stone={stone}
          origin={f.D} along={f.C}
          inward={gableInward(col, row, w, h)}
          wallHeight={H} span={f.spanLeft} centreU={0.5} sideAt="u1" scale={0.8}
        />
      )}
      {/* The chapter's letters, over both doors — a house announces itself
          to whichever way you walk up to it.

          LAST, after the roof. The pediment is a parapet: it rises above
          the eaves rather than fitting under them, so anything drawn after
          it covers it, and the roof slab is drawn after everything else. */}
      {!site && glyphs && (door || entrance === 'recess') && (
        <>
          <ChapterPediment
            glyphs={glyphs} origin={f.D} along={f.C}
            wallHeight={H} span={f.spanLeft} doorWidth={door?.widthTiles ?? 0} cast={!trim}
          />
          <ChapterPediment
            glyphs={glyphs} origin={f.C} along={f.B}
            wallHeight={H} span={f.spanRight} doorWidth={door?.widthTiles ?? 0} cast={!trim}
          />
        </>
      )}
    </>
  );
}

// MEMOISED, and by PR C it has to be. A wall's windows are now set out on real
// bays rather than on a fixed count of eight, so an eleven-tile hospital wall
// carries twenty-two bays over eight storeys instead of ten over five — the
// campus draws roughly three times the polygons it used to. The map's render
// path runs on every mouse move (hover is React state), and re-reconciling
// every pane on every pointer event is the difference between a smooth pan and
// a janky one.
//
// A motif is a pure function of these four things, so the comparison is exact
// rather than a heuristic. `p` is rebuilt on every render (see CampusMap's
// drawnFootprint), which is why its fields are compared rather than its
// identity; `t` genuinely is the same object until the reducer runs.
export default memo(BuildingMotif, (a, b) => (
  a.t === b.t
  && a.camera === b.camera
  && a.material === b.material
  && a.vernacular === b.vernacular
  && a.developing === b.developing
  && a.glyphs === b.glyphs
  && a.p.col === b.p.col && a.p.row === b.p.row
  && a.p.w === b.p.w && a.p.h === b.p.h
));

// Colour lives in buildingSpec.ts's MATERIALS now, not here and not in
// styles.css. A stylesheet cannot derive five shades of a surface at runtime,
// which is why the tints were ever in this file; and a material is a fact
// about a BUILDING, not about how it is drawn, which is why they are in the
// spec rather than in the renderer. See the note above materialOf.
export { materialOf } from './buildingSpec';
