// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { boxFaces, project, type FaceDir, type Pt } from './isoProjection';
import { shade } from './tint';

// THE SUN. One light for the whole campus, fixed to the WORLD — a direction
// across the grid — and not to the screen. That is the whole of what makes
// the lighting hold up when the camera turns: a building's south wall is
// the lit one from every side you look at it, and its shadow lies on the
// same lawn whichever way round the view stands. A light fixed to the
// screen would swing the shadows round with the camera and re-light every
// wall as you turned, which is what a sprite game does and what this map
// cannot, because it draws its walls rather than looking them up.
//
// Pure geometry and one table of tones; no React, no game state. The
// projection (isoProjection.ts) is what turns any of this into screen
// coordinates, so it is right at every azimuth and pitch by construction.

// Where the light comes FROM, as a unit direction across the grid: mostly
// from -col, a little from -row — at the default camera, from the upper
// left, which is where the flat map's drop shadows always said it was.
// The angle is the one the roof and wall tones (SLOPE, WALL_LIGHT) already
// implied: -col brightest, -row next, +row dimmer, +col darkest.
const FROM_ANGLE = (21 * Math.PI) / 180;
export const SUN_FROM = { col: -Math.cos(FROM_ANGLE), row: -Math.sin(FROM_ANGLE) };

// How far a cast shadow reaches per screen unit of HEIGHT (as authored at
// the default pitch — see campusScale.ts's `up`), in tiles along the ground.
// Fixed so that a nine-storey hall's shadow is the same length it always
// was; only its direction is now the sun's rather than the screen's.
const SHADOW_TILES_PER_UNIT = 0.006875;

// The ground offset a point at `height` casts its shadow to: away from the
// sun, further the higher it is. A world vector — project it, never add it
// to screen coordinates.
export function shadowOffset(height: number): { dcol: number; drow: number } {
  return {
    dcol: -SUN_FROM.col * SHADOW_TILES_PER_UNIT * height,
    drow: -SUN_FROM.row * SHADOW_TILES_PER_UNIT * height,
  };
}

// The shadow a box of this footprint and height throws on flat ground: the
// footprint translated away from the sun, projected. Not the swept hull of
// base and offset — the half under the mass is covered by it, since every
// shadow is drawn before every mass (see CampusMap's shadow pass) — so a
// plain translated rhombus reads exactly right for a fraction of the
// geometry.
export function castShadow(col: number, row: number, w: number, h: number, height: number): Pt[] {
  const { dcol, drow } = shadowOffset(height);
  return boxFaces(col + dcol, row + drow, w, h, 0, 0).top;
}

// Which way across the SCREEN the light comes from at the current camera,
// unit length — for the few things drawn as billboards rather than as
// projected geometry, like the lit cap on a tree's crown.
export function sunScreenDir(): Pt {
  const p = project(SUN_FROM.col, SUN_FROM.row);
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
}

// How bright a vertical face is by the grid direction it points, relative
// to the wall's own tone. The -col wall faces the sun and is brightest, +col
// faces away and is darkest, and the two row walls fall between with -row
// the lighter — exactly as the roof slopes do (buildingMotifs' SLOPE). The
// two the default camera sees (+row and +col) keep the tones they have
// always had; the two it never saw are set where the sun puts them. Four
// tones for one sun, so that turning the camera never changes which side of
// a building is lit.
export const WALL_LIGHT: Record<FaceDir, number> = { negCol: 1.14, negRow: 1.02, posRow: 0.98, posCol: 0.78 };

// The tone for a face pointing `dir`, given the two tones a motif authored
// for the +row and +col faces — the pair the default camera sees, which is
// how every box on the map was drawn before the camera could turn. The
// other two are derived from the +row tone by the same ratios as the walls.
export function faceTone(dir: FaceDir, posRow: string, posCol: string): string {
  switch (dir) {
    case 'posRow': return posRow;
    case 'posCol': return posCol;
    case 'negRow': return shade(posRow, WALL_LIGHT.negRow / WALL_LIGHT.posRow);
    default: return shade(posRow, WALL_LIGHT.negCol / WALL_LIGHT.posRow);
  }
}
