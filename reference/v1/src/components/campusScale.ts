// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { TILE_H, TILE_W } from './isoProjection';

// The campus's unit system: how a real dimension in METRES becomes a distance
// on this map. Pure arithmetic — no React, no game state, no colour — and the
// one place any above-ground size on the map is allowed to come from.
//
// WHY THIS EXISTS. The motifs used to carry three independent tables — a
// height per motif, a window COUNT per motif, and a door that was one tile
// wide and some fraction of whatever wall it landed on — and none of the three
// could be converted into either of the others. So nothing on a building was
// proportional to anything on another one, or even to the other wall of the
// same building: a storey was between 6.1 m and 26.3 m depending on which
// building you measured, a residence hall's windows came out 2.25x wider on
// its long wall than on its short one, and door aspect ratios spanned a factor
// of thirty. Those are three symptoms of one missing thing, and this module is
// that thing.
//
// TWO AXES, TWO CONVERSIONS. The map is drawn at an angle, so a metre ACROSS
// the ground and a metre UP are not the same distance on screen. `across`
// answers the first (in tiles, which is what everything on the grid already
// speaks), `up` the second (in the screen units heights are measured in).

// How much ground one tile covers, for DRAWING purposes.
//
// Not the 15 m that campusMap.ts's footprint comments cite: that figure was
// taken from the football stadium's footprint, and it is not the scale the
// buildings are actually drawn at. An academic hall covers 8 tiles, which at
// 15 m would be a 120 m facade — half as long again as the building these
// motifs are drawn from. At 9 m it is 72 m, which is a real academic hall.
//
// Footprints are unchanged and are not restated here; this is the scale of
// what stands ON them. The consequence is that the stadium reads a little
// small in absolute metres, which is an accepted stylisation — no system
// reads either number, and one honest drawing scale is worth more than a
// footprint rationale the art never obeyed.
export const METRES_PER_TILE = 9;

// The camera's pitch, and the vertical foreshortening that follows from it.
//
// DERIVED, NOT CHOSEN. isoProjection's `project` is an axonometric at azimuth
// 45 degrees, and its two constants already pin the camera completely: the
// uniform world scale is TILE_W / sqrt2, and the elevation satisfies
// sin(pitch) = TILE_H / TILE_W — 30 degrees at today's 64x32 tile. A vertical
// edge is then foreshortened by cos(pitch), so one tile of HEIGHT rises 39.19
// screen units, not the TILE_W / 2 = 32 a sprite artist would assume.
//
// That distinction is worth the arithmetic. An earlier draft of this module
// took the 32 shortcut and then needed a 1.2x "stylistic" vertical stretch to
// make the buildings look right — and 39.19 / 32 is 1.22. The exaggeration was
// the shortcut's own error wearing a justification. There is no exaggeration
// constant here: the scale is exact, and the storey height it produces lands
// on a textbook floor-to-floor by itself.
//
// It is also what the TILTING camera needs. Heights are authored in these
// units at the DEFAULT pitch, and isoProjection's `lift` foreshortens them
// by cos(pitch) / cos(DEFAULT_PITCH) at whatever pitch the camera stands at
// now — so every storey, sill, window head and door on the campus
// re-foreshortens correctly with no table touched.
export const PITCH = Math.asin(TILE_H / TILE_W);
export const UNITS_PER_TILE_UP = (TILE_W / Math.SQRT2) * Math.cos(PITCH);
const UNITS_PER_METRE = UNITS_PER_TILE_UP / METRES_PER_TILE;

// A metre measured ACROSS the ground, in tiles — the unit footprints, wall
// spans and anything else on the grid is already in.
export function across(metres: number): number {
  return metres / METRES_PER_TILE;
}

// A metre measured UP, in the screen units `lift` and the motifs' heights use.
export function up(metres: number): number {
  return metres * UNITS_PER_METRE;
}

// Floor to floor. Generous, because these are institutional buildings: a
// teaching hall, a residence hall and a hospital ward all sit near four
// metres, and one number for all of them is the point — a campus where a
// storey means the same thing everywhere is the whole of what "proportional"
// asks for.
export const STOREY_METRES = 3.9;

// One storey, on screen. Comes out at 16.98 — which is the STOREY_HEIGHT
// constant buildingMotifs.tsx already carried for a renovated library's added
// floors. That number was right; it simply was never used to derive anything,
// which is how the building it was adding a floor TO came to have storeys
// twice as tall as the floor being added.
export const STOREY = up(STOREY_METRES);
