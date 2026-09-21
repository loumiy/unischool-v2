// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../data/techData.
// v1 placement rules and grid helpers. Grid geometry is reference; the placement/siting rules are v1 sim logic and must not be ported.
import type {
  Buildable, FacilityType, Footprint, GameState, Placement, Placements, TileCoord,
} from './types';
import { CAMPUS_GRID_HEIGHT, CAMPUS_GRID_WIDTH, PLACEABLE_KINDS } from './types';
import { FOUNDERS_HALL_ID } from '../data/techData';

// Pure helpers for the campus map's placement rules, shared by the
// reducer's PLACE_BUILDABLE case, the save loader's placement hygiene, and
// the map UI so "can this go here" has exactly one definition (the same way
// techSystem.ts's canStartDevelopment is shared by the reducer and the
// Campus tab).
//
// PLACE_BUILDABLE is now the combined build-and-site action for placeable
// kinds (building/dorm/facility — see types.ts's PLACEABLE_KINDS): siting a
// location is no longer something that happens to an already-finished
// Buildable, it's how one starts. A placeable Buildable therefore gets its
// s.placements entry the SAME week it starts developing, not the week it
// finishes — that entry is the single source of truth for "where is this",
// exactly as s.developing stays the single source of truth for "how long
// left", for a placeable and a course alike (a course never has a
// placements entry, at any status, because it was never placeable). This is
// what makes an in-progress placeable renderable at its footprint and its
// tiles reserved from week one: footprintIsClear below reads every entry in
// s.placements regardless of the Buildable's status, so it already treats a
// developing placement as occupied, with no special case needed.
//
// Nothing here mutates state and nothing here ticks — placement is a
// player action interpreted by the reducer, not a system.

// Courses are never placeable; buildings, dorms, and facilities are.
export function isPlaceableKind(t: Buildable): boolean {
  return PLACEABLE_KINDS.includes(t.kind);
}

// ---------------------------------------------------------------------
// FOOTPRINTS. How many tiles a placed Buildable covers, in grid units.
// A school hall, a dorm block and a lab are not the same size on a real
// campus, and a map of uniform squares reads as a spreadsheet — so size
// varies by what the thing IS.
//
// This is a placement RULE keyed on the Buildable's existing data (kind;
// for facilities facilityType and, where the type's instances vary in
// scale, effects.servesPopulation or `tier`; for dorms
// effects.capacityBonus), NOT a new field on Buildable: the single
// Buildable model stays unforked, and `course` Buildables — which are
// never placeable — carry no vestigial map data (see
// docs/architecture/buildables.md).
//
// Sizes are pinned to 9m per tile — the scale the map actually DRAWS at (see
// components/campusScale.ts, which derives it from the projection). An earlier
// pass took 15m from the football stadium's own footprint and sized the rest
// against that, which left every athletics venue two-thirds the size it should
// be next to the buildings: a 400m running track needs 176m down the straight
// and had 108m to do it in. The venues below are sized from what they really
// are, at 9m, so a pitch, a ballpark and a teaching hall stand in something
// like their true proportions to each other.
//
// Footprints are pure geometry: a bigger building grants nothing extra and
// costs nothing extra. Placement is still visual-only.
//
// Retuning these numbers only affects buildings placed AFTERWARDS —
// a placement stores the footprint it was made with (see types.ts's
// Placement), so an existing save's layout can never silently reshape into
// an overlap.
// ---------------------------------------------------------------------

// Defensive fallback only. Every FacilityType below has a real entry —
// either a fixed one in FACILITY_FOOTPRINTS or a ladder in
// FACILITY_SIZE_LADDERS — so this is never actually read against today's
// catalogue; it exists so a future facilityType added without a table entry
// renders as a small building rather than a 1x1 speck beside a hospital.
// Sized like the smallest real facility (a lab).
const DEFAULT_FACILITY_FOOTPRINT: Footprint = { w: 3, h: 3 };

// ---------------------------------------------------------------------
// SIZE LADDERS. The rule for everything whose instances differ in SCALE
// rather than in kind: a dining hall feeding 350 and one feeding 16,000 are
// not the same building, and neither are a 500-bed residence hall and a
// 5,000-bed tower. A ladder maps "how much does this instance hold" onto
// "how much ground does it cover", so a chain's capacity jumps are visible
// on the map instead of every rung being the same block with a bigger
// number in its tooltip.
//
// Read off data the Buildable ALREADY carries — effects.servesPopulation
// for a facility, effects.capacityBonus for a dorm — so this stays a
// placement rule keyed on existing fields, exactly as the single-threshold
// version footprintOf used for dining halls always was. No new field on
// Buildable, and `course` Buildables still carry no map data at all.
//
// Rungs are listed LARGEST FIRST and matched on `min`, so the last entry
// (min 0) is the floor and a ladder can never fail to match.
// ---------------------------------------------------------------------
// ODD WIDTHS, FOR EVERYTHING WITH A FRONT DOOR.
//
// A motif that draws a centred door on an even-width footprint centres it on
// the SEAM between two tiles: the door is half on one tile and half on the
// next, so nothing can arrive at it. A path stops one tile off, and a hall
// cannot line up with the quad it faces. An odd width puts the door on a
// tile, which is the thing a walkway can actually reach and the reason the
// quad ladder (9x9, 13x13) was odd already.
//
// The rule applies to every footprint whose Buildable has a door at all —
// buildingSpec.ts's doorFamilyOf, which is null for open ground, the
// stadium, and a village (whose houses each have their own). Those are
// exempt: there is no centred anything to land on a seam.
//
// Pinned by test/building-spec.test.ts, which walks the real catalogue
// rather than this table, so a new rung cannot quietly break it.
//
// NEW GAMES ONLY (decision 4). A Placement stores the footprint it was made
// with, so an existing campus keeps the ground its buildings already stand
// on; Founders Hall is pre-placed at founding, so a save from before this
// keeps its 8-wide hall for good. Re-footprinting a placed building can
// collide with whatever was built next to it, and there is no good automatic
// answer to that collision.
interface SizeRung { min: number; fp: Footprint }

function rungFootprint(rungs: SizeRung[], size: number): Footprint {
  return (rungs.find((r) => size >= r.min) ?? rungs[rungs.length - 1]).fp;
}

// Housing, by bed count (see campusData.ts's four size classes). The
// village is the one entry that is not a single building at all — it is a
// PLOT, which is why it covers more ground than the tower that sleeps three
// times as many people: the tower goes up, the village goes out.
const DORM_FOOTPRINTS: SizeRung[] = [
  { min: 5_000, fp: { w: 7, h: 7 } },    // residential tower: a small plan, very tall (see buildingMotifs' 'tower')
  { min: 1_500, fp: { w: 11, h: 10 } },  // village: a dozen small houses around shared green
  { min: 1_000, fp: { w: 11, h: 5 } },   // mid-game high-rise hall
  { min: 500, fp: { w: 9, h: 4 } },      // early four-storey hall
  { min: 0, fp: { w: 7, h: 3 } },        // the founding hall
];

// Facilities whose footprint steps with how many students they serve.
// Everything NOT here has one fixed size in FACILITY_FOOTPRINTS below,
// because its instances don't vary in scale — there is exactly one
// natatorium, and a tennis court is a tennis court.
const FACILITY_SIZE_LADDERS: Partial<Record<FacilityType, SizeRung[]>> = {
  // Eight halls from a 350-seat campus restaurant to a 16,000-seat market
  // hall (facilitiesData.ts's DINING_RUNGS). Density climbs with size on
  // purpose: the big halls are multi-storey, so they feed more people per
  // tile than the single-storey café at the bottom of the chain.
  diningHall: [
    { min: 14_000, fp: { w: 11, h: 9 } },
    { min: 10_000, fp: { w: 11, h: 7 } },
    { min: 7_000, fp: { w: 9, h: 6 } },
    { min: 4_000, fp: { w: 7, h: 6 } },
    { min: 2_500, fp: { w: 7, h: 5 } },
    { min: 1_200, fp: { w: 5, h: 4 } },
    { min: 700, fp: { w: 5, h: 3 } },
    { min: 0, fp: { w: 3, h: 3 } },
  ],
  // The health chain's three rungs, and the clearest case for a ladder:
  // a counselling centre, a clinic and a teaching hospital are three
  // different institutions (see facilitiesData.ts's health block).
  healthCenter: [
    { min: 20_000, fp: { w: 11, h: 11 } }, // University Hospital — the largest BUILDING on campus
    { min: 4_000, fp: { w: 5, h: 5 } },    // University Clinic
    { min: 0, fp: { w: 3, h: 3 } },        // Health & Counseling Center
  ],
  // The research library is a bigger building than the general one, not
  // the same one relabelled. (Renovating tier 1 adds STOREYS rather than
  // ground — see facilitiesData.ts's nextLibraryFloor — so its footprint
  // deliberately stays put as it grows.)
  library: [
    { min: 2_000, fp: { w: 9, h: 6 } },
    { min: 0, fp: { w: 7, h: 5 } },
  ],
  studentCenter: [
    { min: 2_000, fp: { w: 7, h: 5 } },    // the Student Union Expansion
    { min: 0, fp: { w: 5, h: 4 } },
  ],
  // recCenter covers both ends of the fitness chain: the modest Recreation
  // Center a young campus opens with, and the Athletics Complex capstone.
  recCenter: [
    { min: 2_000, fp: { w: 7, h: 5 } },
    { min: 0, fp: { w: 5, h: 4 } },
  ],
};

// The quad is the one ladder keyed on `tier` rather than on a capacity: it
// has no servesPopulation at all (its contribution is a flat bonus that
// never scales — see facilitiesData.ts), so there is no size to read.
// Both rungs are large. A campus quad is the open middle of the place, and
// at 7x7 the first one was smaller than the library beside it.
const QUAD_FOOTPRINTS: SizeRung[] = [
  { min: 2, fp: { w: 13, h: 13 } },  // Grand Quad & Gardens
  { min: 0, fp: { w: 9, h: 9 } },    // Campus Quad
];

// Academic halls are the campus's landmarks. Rectangular rather than the
// old 9x9 square: a square hall reads as a block, and this is both closer to
// the proportions of a real academic building and a shape rotation actually
// does something to. At 9m to a tile that is about 63m by 45m — a large
// teaching building, which is what these are.
//
// ODD, and this is the note's own example: at 8 wide Founders Hall centred
// its formal door on the seam between two tiles, so no walkway could arrive
// at it and it could not line up with the quad it faces.
const SCHOOL_BUILDING_FOOTPRINT: Footprint = { w: 7, h: 5 };

// Per facility type, for everything that ISN'T on a ladder above. Sized
// against a rough 15m to a tile, which is what the football stadium (a real
// one is about 220m by 180m) pins down.
const FACILITY_FOOTPRINTS: Partial<Record<FacilityType, Footprint>> = {
  lab: { w: 5, h: 3 },           // a teaching/research lab building — one per lab-gated major
  grocery: { w: 5, h: 4 },       // a full supermarket, not a corner shop
  // Between the Recreation Center (5x4) and the Athletics Complex (7x5) in
  // ground as it is in the chain. Square, so its door sits on a tile whichever
  // way it is turned.
  gym: { w: 5, h: 5 },
  tennisCourts: { w: 12, h: 4 }, // six courts in a row, which is ~110m by 36m — open ground, no door to centre
  pool: { w: 7, h: 4 },          // a 50m pool and its deck
  // performingArtsCenter is the landmark of this batch: a concert hall and
  // theater reads as a real building — grand, and on more ground than a
  // teaching hall.
  performingArtsCenter: { w: 9, h: 7 },
  artGallery: { w: 5, h: 3 },    // small, but no longer a bare utility box

  // Varsity athletics venues (facilitiesData.ts): real competition venues,
  // sized from what they actually are rather than from each other.
  // athleticsField is deliberately RECTANGULAR and LONG — it carries a
  // 400m track now (see groundMarkings.tsx), and a 400m track is 176m down
  // the straight, so 10 tiles was never enough to hold one. The football
  // stadium stays the largest footprint of any Buildable in the game,
  // bigger even than the hospital — the pinnacle venue should read as one
  // on the map, not just in its cost.
  // A 400m track is 176m down each straight with 36m radius bends, so its
  // envelope is about 176 by 92 — which is what this is, and what 12 by 7
  // could not have been at any scale.
  // 22 by 13 rather than 20 by 11: a 400 m track is 176 by 92 m and its
  // stand needs a margin down one straight, and at 20 by 11 the oval was
  // drawn at three-quarters of the plot to make room, which shrank the
  // pitch inside it to 70 m. On 22 by 13 the oval fills the plot's width
  // and the pitch inside it is a real 105 by 68.
  athleticsField: { w: 22, h: 13 },
  athleticsArena: { w: 11, h: 9 },        // ~100m by 80m, the footprint of a real arena bowl
  athleticsDiamond: { w: 14, h: 14 },     // ~125m, a real outfield being ~120m to the fence
  athleticsNatatorium: { w: 7, h: 5 },    // a 50m competition pool, its deck and its stand
  footballStadium: { w: 24, h: 20 },      // ~220m by 180m: still the largest footprint in the game
  fieldHouse: { w: 9, h: 6 },             // an indoor training floor and the rooms around it (Plan 21's PR Q)
};

export function footprintOf(t: Buildable): Footprint {
  if (t.kind === 'building') return SCHOOL_BUILDING_FOOTPRINT;
  if (t.kind === 'dorm') return rungFootprint(DORM_FOOTPRINTS, t.effects?.capacityBonus ?? 0);
  if (t.kind === 'facility' && t.facilityType) {
    if (t.facilityType === 'quad') return rungFootprint(QUAD_FOOTPRINTS, t.tier ?? 1);
    const ladder = FACILITY_SIZE_LADDERS[t.facilityType];
    if (ladder) return rungFootprint(ladder, t.effects?.servesPopulation ?? 0);
    return FACILITY_FOOTPRINTS[t.facilityType] ?? DEFAULT_FACILITY_FOOTPRINT;
  }
  return DEFAULT_FACILITY_FOOTPRINT;
}

// ---------------------------------------------------------------------
// ROTATION. A building picked up for siting can be turned 90 degrees before
// it's set down (see CampusMap.tsx's 'R' hotkey / rotate control). There is
// no separate "orientation" field anywhere: rotating just swaps which of a
// Buildable's own footprintOf() dimensions is w and which is h, and THAT
// swapped {row,col,w,h} is what PLACE_BUILDABLE writes into `placements` —
// the same field that already exists and is already saved. One source of
// truth, and the reason the v13 -> v14 migration needs no placement-shape
// change at all (see persistence.ts).
// ---------------------------------------------------------------------

// A square footprint reads identically rotated or not — offering a rotate
// control for one would be a control that visibly does nothing.
export function canRotate(fp: Footprint): boolean {
  return fp.w !== fp.h;
}

export function rotateFootprint(fp: Footprint): Footprint {
  return { w: fp.h, h: fp.w };
}

// The footprint actually being sited right now: a Buildable's base
// footprint, swapped if the player has rotated it. Square footprints never
// change regardless of `rotated` (see canRotate above).
export function orientedFootprint(t: Buildable, rotated: boolean): Footprint {
  const fp = footprintOf(t);
  return rotated && canRotate(fp) ? rotateFootprint(fp) : fp;
}

// ---------------------------------------------------------------------
// Bounds and occupancy
// ---------------------------------------------------------------------

export function isInBounds(row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col)
    && row >= 0 && row < CAMPUS_GRID_HEIGHT
    && col >= 0 && col < CAMPUS_GRID_WIDTH;
}

// The whole footprint must fit, not just its anchor tile: a 2x2 anchored on
// the last column hangs off the edge even though the anchor itself is fine.
export function footprintFits(row: number, col: number, fp: Footprint): boolean {
  return Number.isInteger(fp.w) && Number.isInteger(fp.h) && fp.w >= 1 && fp.h >= 1
    && isInBounds(row, col)
    && isInBounds(row + fp.h - 1, col + fp.w - 1);
}

// Every tile a placement covers, anchor first. The one definition of "which
// tiles is this thing on", used by occupancy, placement and rendering alike.
export function placementTiles(p: Placement): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let r = 0; r < p.h; r++) {
    for (let c = 0; c < p.w; c++) tiles.push({ row: p.row + r, col: p.col + c });
  }
  return tiles;
}

export function placementCovers(p: Placement, row: number, col: number): boolean {
  return row >= p.row && row < p.row + p.h && col >= p.col && col < p.col + p.w;
}

// The Buildable id covering a tile, or undefined if the tile is empty.
// Linear over `placements`, which holds at most one entry per placeable
// Buildable (67 today) — no index worth keeping in state for that.
export function occupantAt(placements: Placements, row: number, col: number): string | undefined {
  for (const [id, p] of Object.entries(placements)) {
    if (placementCovers(p, row, col)) return id;
  }
  return undefined;
}

// Would this footprint, anchored here, sit entirely on empty in-bounds
// tiles? Split out from canPlace so the map can preview a hovered/dragged
// footprint without re-deriving the rule.
export function footprintIsClear(placements: Placements, row: number, col: number, fp: Footprint): boolean {
  if (!footprintFits(row, col, fp)) return false;
  for (const tile of placementTiles({ row, col, ...fp })) {
    if (occupantAt(placements, tile.row, tile.col) !== undefined) return false;
  }
  return true;
}

// The one definition of a legal placement TARGET: a placeable Buildable
// that hasn't started construction yet (status 'available') — OR one that's
// already 'done' but never got a location (see needsSiting below) — and
// isn't already sited, whose WHOLE footprint lands on empty, in-bounds
// tiles. `fp` is the footprint actually being sited —
// orientedFootprint(t, rotated) for a rotatable siting flow, or plain
// footprintOf(t) for anything that doesn't care about rotation — rather
// than always re-deriving the unrotated one, so a rotated footprint that no
// longer fits is refused exactly as an unrotated overflow already is.
//
// Deliberately geometry + status only — it says nothing about whether the
// school can actually AFFORD to start this Buildable (see
// techSystem.ts's canStartDevelopment, the one gate for that, which every
// call site here combines this with before actually committing a build —
// see the reducer's PLACE_BUILDABLE case), nor about the flat retroactive
// fee a 'done' item's siting is gated on instead (canSiteRetroactively,
// below). That split is the same one START_DEVELOPMENT and the old
// cosmetic-only PLACE_BUILDABLE always had between them; collapsing the two
// actions into one for placeable kinds didn't collapse the two CONCERNS, it
// just moved where they're combined.
export function canPlace(s: GameState, t: Buildable, row: number, col: number, fp: Footprint): boolean {
  return isPlaceableKind(t)
    && (t.status === 'available' || t.status === 'done')
    && !(t.id in s.placements)
    && footprintIsClear(s.placements, row, col, fp);
}

// A placeable Buildable that's already 'done' but has no home on the map.
// The founding dorm opens 'done' AND pre-placed (see actions.ts's
// createInitialState), so it is not one of these; today this covers only an
// old save that predates the logic that places founding Buildables
// automatically (see persistence.ts's v17 -> v18 migration). A chapter
// house (eventData.ts's 'greek-housing') used to be manufactured 'done' and
// auto-placed the same way, with this as its documented pathological
// fallback when no room was found — it is revealed 'available' and
// player-placed instead now, the same pattern a varsity venue already used
// (see types.ts's Buildable.chapterHouse), so it never reaches this path.
// Distinct from an ordinary 'available' row: there's no construction left to
// start, only a location to mark, so the build menu offers it for the flat
// RETROACTIVE_SITING_COST below instead of its own (much larger) founding
// cost, which was already paid — or folded into the starting baseline —
// once.
export function needsSiting(s: GameState, t: Buildable): boolean {
  return isPlaceableKind(t) && t.status === 'done' && !(t.id in s.placements);
}

// A nominal fee, not a construction cost — see needsSiting above. Kept
// small and flat (unlike every other Buildable's authored cost) since the
// building itself isn't being bought here, only sited; still nonzero so
// siting reads as a real decision rather than a freebie.
export const RETROACTIVE_SITING_COST = 2_000;

// What siting THIS 'done' Buildable charges. Founders Hall is the one
// exception to the flat fee: a guided founding leaves it unsited so that
// placing it is the walkthrough's first step (see state/
// opening.ts), and the founding hall's ground came with the charter — a
// first click that costs money would be a walkthrough that starts with a
// bill. Everything else that reaches needsSiting pays the fee.
export function sitingFeeOf(t: Buildable): number {
  return t.id === FOUNDERS_HALL_ID ? 0 : RETROACTIVE_SITING_COST;
}

export function canSiteRetroactively(s: GameState, t: Buildable): boolean {
  return needsSiting(s, t) && s.finance.cash >= sitingFeeOf(t);
}

// The middle of the grid, for a footprint: where createInitialState puts
// Founders Hall in a headless founding and where skipOpening puts it for a
// player who declined the walk. Math.floor keeps the anchor on a whole
// tile; the footprint is odd or even against the grid dimensions, so this
// lands as close to dead centre as the tile grid allows.
export function centredPlacement(fp: Footprint): Placement {
  return placementFor(
    Math.floor((CAMPUS_GRID_HEIGHT - fp.h) / 2),
    Math.floor((CAMPUS_GRID_WIDTH - fp.w) / 2),
    fp,
  );
}

// A deterministic "first empty spot" scan: top-left to bottom-right, the
// first anchor whose footprint lands entirely on clear tiles. This is NOT
// part of the ordinary player-facing placement flow — an ordinary
// PLACE_BUILDABLE always names the row/col the player chose. It exists for
// the handful of places a Buildable needs a location nobody was ever asked
// to pick: the founding Buildables that start already 'done' (see
// actions.ts's createInitialState), the headless balance sim (which has no
// player to click a tile), and an authored event that manufactures a
// finished Buildable on the spot (eventData.ts's chapter house). The full catalogue covers under a third of the grid (see
// types.ts's CAMPUS_GRID_WIDTH/HEIGHT comment), so in every case this is
// actually used for today, room is always found; callers still handle a
// null result rather than assuming it.
export function firstFreeSpot(placements: Placements, fp: Footprint): TileCoord | null {
  for (let row = 0; row + fp.h <= CAMPUS_GRID_HEIGHT; row++) {
    for (let col = 0; col + fp.w <= CAMPUS_GRID_WIDTH; col++) {
      if (footprintIsClear(placements, row, col, fp)) return { row, col };
    }
  }
  return null;
}

// The placement PLACE_BUILDABLE writes: the anchor the player picked plus
// the footprint (already oriented — see orientedFootprint) it gets, frozen
// in at the moment of placement.
export function placementFor(row: number, col: number, fp: Footprint): Placement {
  return { row, col, ...fp };
}

// ---------------------------------------------------------------------
// PATHWAYS. See types.ts's Pathways block for the tile-identification
// scheme (a drawn path fills a whole tile, the same TileCoord unit
// everything else on the grid uses). Everything below is pure geometry,
// shared by the reducer's ADD_PATH_TILE/REMOVE_PATH_TILE cases, the save
// loader's tile hygiene, and the map UI — same one-definition rationale as
// footprintOf and friends. Bounds-checking a path tile is just isInBounds
// (above) — there is no separate edge-shaped bounds rule to keep in step
// with it any more.
// ---------------------------------------------------------------------

// The one string form a path tile is ever stored or looked up by — a
// Pathways key. Also what makes drawing the same tile twice idempotent: two
// calls with the same tile produce the same key, so writing it a second
// time overwrites rather than duplicates.
export function pathTileKey(t: TileCoord): string {
  return `${t.row},${t.col}`;
}

// The inverse of pathTileKey, for reading a saved Pathways record back into
// tiles (rendering, migration hygiene). Returns null for a key that isn't
// shaped like one this version ever wrote — a defensive read, not a parser
// for a format with variants.
export function parsePathTileKey(key: string): TileCoord | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const [rowStr, colStr] = parts;
  const row = Number(rowStr);
  const col = Number(colStr);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  return { row, col };
}
