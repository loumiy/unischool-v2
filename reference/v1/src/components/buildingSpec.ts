// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import type { Buildable, FacilityType, Vernacular } from '../state/types';
import { METRES_PER_TILE, STOREY, across, up } from './campusScale';

// WHAT a placed Buildable is, dimensionally: which architectural motif it
// wears, how many floors it has, and therefore how tall it stands.
//
// Deliberately free of JSX. This module answers questions about buildings;
// buildingMotifs.tsx turns those answers into polygons. The split is not
// tidiness — it is the half of the map that would SURVIVE a renderer change.
// A procedural building generator in three dimensions needs a footprint, a
// storey count, a storey height, a bay spacing, a door with real dimensions
// and a material; everything in that list either lives here already or is
// scheduled to, while nothing here knows what an SVG polygon is.
//
// Everything below is a RULE KEYED ON DATA THE BUILDABLE ALREADY CARRIES —
// kind, facilityType, effects.capacityBonus, effects.servesPopulation, tier,
// floorsAdded — exactly as campusMap.ts's footprintOf is. No new field on
// Buildable, no forked model, and a `course` Buildable still carries no map
// data of any kind.

export type Motif =
  | 'hall'         // academic halls: the campus's landmarks — a deep gabled roof
  | 'residential'  // dorms up to 1,000 beds: one long gable down a block, ranked windows
  | 'village'      // a residential village: many small houses on one plot, around green
  | 'tower'        // a residential tower: a small plan carried very high, over a retail podium
  | 'portico'      // library / performing arts / gallery: flat roof, rooflights
  | 'block'        // the university hospital: a big institutional mass, flat-roofed, rooftop plant
  | 'pavilion'     // student centre, dining, health, grocery: low, a unit or two
  | 'hangar'       // rec centre, gym, arena, natatorium: clear-span vault
  | 'works'        // labs: low, flat, crowded with rooftop plant
  | 'grounds'      // quad, field, courts, diamond, pool: markings, no mass
  | 'bowl';        // the football stadium: stands around a gridiron

const FACILITY_MOTIFS: Record<FacilityType, Motif> = {
  library: 'portico',
  studentCenter: 'pavilion',
  diningHall: 'pavilion',
  recCenter: 'hangar',
  healthCenter: 'pavilion',
  quad: 'grounds',
  lab: 'works',
  gym: 'hangar',
  tennisCourts: 'grounds',
  // The rec pool is an open-air deck; the natatorium is a roofed competition
  // venue. Same water, different building — the same distinction styles.css
  // already draws between their two blues.
  pool: 'grounds',
  performingArtsCenter: 'portico',
  artGallery: 'portico',
  athleticsField: 'grounds',
  athleticsArena: 'hangar',
  athleticsDiamond: 'grounds',
  athleticsNatatorium: 'hangar',
  footballStadium: 'bowl',
  fieldHouse: 'hangar',
  grocery: 'pavilion',
};

// Research facilities that are not laboratories.
//
// Every facility that lets a school do research carries facilityType 'lab',
// because that string is the GATE — techData.ts, researchData.ts and the
// Research tab all read it to decide what can host work. Four of them are not
// labs in any other sense: an institute with archives, a studio with sound
// stages, a computing centre, a behavioural lab suite. Drawn on the map they
// were all the same low industrial shed.
//
// Keyed by id rather than given facilityTypes of their own precisely so the
// gate stays one string. Adding four new types would mean widening every
// `=== 'lab'` test in three modules to keep one building from looking wrong,
// which is a lot of load-bearing code touched for a roof. This is the same
// shape as the health chain's split below: one facilityType, more than one
// building.
const RESEARCH_FACILITY_MOTIFS: Partial<Record<string, Motif>> = {
  // Archives and reading rooms — the library's own language.
  'LAB-HIST': 'portico',
  // Sound stages are clear-span volumes, which is what a hangar is.
  'LAB-FILM': 'hangar',
  // A compute cluster is an institutional mass with plant on the roof.
  'LAB-COMP': 'block',
  // Behavioural labs and simulation suites: a couple of rooms, not a works.
  'LAB-ECON': 'pavilion',
};

// Bed counts at which housing stops being a hall, and the serve count at which
// the health chain stops being a clinic. The same numbers campusMap.ts's
// DORM_FOOTPRINTS and FACILITY_SIZE_LADDERS step their footprints on, read off
// the same fields — so a village gets a village's plot AND a village's motif
// AND a village's storeys from one fact about the building, with no third
// place to keep in step. Kept as literals rather than imported: campusMap.ts
// is placement geometry and this is drawing, and neither should have to import
// the other to agree about what 5,000 beds looks like.
const DORM_VILLAGE_MIN_BEDS = 1_500;
const DORM_TOWER_MIN_BEDS = 5_000;
const HOSPITAL_MIN_SERVES = 20_000;
const CLINIC_MIN_SERVES = 4_000;
const RESEARCH_LIBRARY_MIN_SERVES = 2_000;
const STUDENT_CENTRE_EXPANDED_MIN_SERVES = 2_000;

export function motifOf(t: Buildable): Motif {
  if (t.kind === 'building') return 'hall';
  if (t.kind === 'dorm') {
    const beds = t.effects?.capacityBonus ?? 0;
    if (beds >= DORM_TOWER_MIN_BEDS) return 'tower';
    if (beds >= DORM_VILLAGE_MIN_BEDS) return 'village';
    return 'residential';
  }
  if (t.kind === 'facility' && t.facilityType) {
    const research = RESEARCH_FACILITY_MOTIFS[t.id];
    if (research) return research;
    // The health chain is three different institutions, not one building
    // relabelled twice (see facilitiesData.ts): a counselling centre and a
    // clinic are pavilions, a teaching hospital is not.
    if (t.facilityType === 'healthCenter' && (t.effects?.servesPopulation ?? 0) >= HOSPITAL_MIN_SERVES) return 'block';
    return FACILITY_MOTIFS[t.facilityType] ?? 'pavilion';
  }
  return 'pavilion';
}

// ---------------------------------------------------------------------
// STOREYS. The one number a building's height is allowed to come from.
//
// Height used to be an absolute per-motif constant and the number of window
// ranks a separate per-motif constant, with no arithmetic connecting them. So
// a storey was 6.1 m in a residential tower, 13.1 m in an academic hall and
// 26.3 m in a gym — which is the whole of "the height of buildings and the
// number of floors it has don't seem to be proportional", and it was not a
// tuning problem, it was a missing equation.
//
// The equation is `wallHeightOf = storeysOf * STOREY` and
// `windowRanksOf = storeysOf`. Both are below, both derive from this one
// function, and that is what makes the two impossible to disagree again.
//
// A ladder reads a capacity off the Buildable and maps it onto a floor count,
// exactly as campusMap.ts maps the same capacity onto ground. Between the two,
// a chain's capacity jumps are visible on the map twice over: a bigger rung
// covers more ground AND stands taller, instead of being the same block with a
// bigger number in its tooltip.
// ---------------------------------------------------------------------

// Storeys added after the fact. The library is renovated by adding FLOORS to
// the building already standing rather than by siting a second one (see
// facilitiesData's nextLibraryFloor and the reducer's RENOVATE_LIBRARY) — the
// one upgrade in the game whose whole point is that the same building gets
// bigger.
//
// This used to add 17 units per floor to a library whose own storeys were 34
// units tall, so a floor the player paid for arrived at half the height of the
// floors beside it. Now there is only one storey height on the map and this
// adds one of those, so the renovation reads as the extra floor it is.
//
// Read generically off Buildable.floorsAdded rather than keyed to the library,
// so anything else that ever gains floors gets the same treatment without
// another branch here.
function addedFloors(t: Buildable): number {
  return Math.max(0, t.floorsAdded ?? 0);
}

// How many of those floors are not built yet.
//
// floorsAdded is bumped when the renovation STARTS (see the reducer's
// RENOVATE_LIBRARY), so storeysOf already counts the floor going up. That is
// right for everything that asks how tall the building will be and wrong for
// the one thing that asks how tall it is standing today.
//
// One at a time, because that is what a renovation commits to: nextLibraryFloor
// plans exactly one floor per RENOVATE_LIBRARY, and a second cannot be
// started while the first is running (the node is not 'done').
export function floorsUnderConstruction(t: Buildable): number {
  return t.renovatingFrom !== undefined ? 1 : 0;
}

// Every academic hall stands four storeys: Founders Hall and the eleven of
// the chain alike (the two professional-school buildings that stood a
// storey taller left with Plan 14's PR E).
const ACADEMIC_HALL_STOREYS = 4;

// A residential tower is a shaft on a retail podium, and the two are counted
// separately because they are drawn separately (see buildingMotifs' 'tower').
export const TOWER_PODIUM_STOREYS = 2;
const TOWER_SHAFT_STOREYS = 12;

function dormStoreys(beds: number): number {
  if (beds >= DORM_TOWER_MIN_BEDS) return TOWER_PODIUM_STOREYS + TOWER_SHAFT_STOREYS;
  // A village is a plot of small houses, so its storey count is one HOUSE's.
  if (beds >= DORM_VILLAGE_MIN_BEDS) return 2;
  if (beds >= 1_000) return 6;   // the mid-game high-rise hall
  if (beds >= 500) return 4;     // "a four-storey residence hall" — campusData.ts says so, and now it is
  return 3;                      // the founding hall: modest, and reads it
}

function facilityStoreys(t: Buildable): number {
  const serves = t.effects?.servesPopulation ?? 0;
  switch (t.facilityType) {
    case 'library':
      return serves >= RESEARCH_LIBRARY_MIN_SERVES ? 4 : 3;
    case 'performingArtsCenter': return 3;
    case 'artGallery': return 2;
    case 'healthCenter':
      if (serves >= HOSPITAL_MIN_SERVES) return 8;   // the teaching hospital: the tallest thing that isn't a tower
      if (serves >= CLINIC_MIN_SERVES) return 3;
      return 2;
    case 'diningHall':
      if (serves >= 10_000) return 3;
      if (serves >= 2_500) return 2;
      return 1;                                      // the founding campus restaurant
    case 'studentCenter':
      return serves >= STUDENT_CENTRE_EXPANDED_MIN_SERVES ? 3 : 2;
    case 'grocery': return 1;                        // a supermarket is one storey, and looks it
    case 'lab': return 2;
    default: return 2;
  }
}

// How many floors this building has. Zero means it HAS no floors — open ground
// with nothing standing on it, or a clear-span volume whose height comes from
// CLEAR_SPAN_METRES below instead. A gym does not have storeys, and pretending
// it had one is how it ended up carrying the tallest windows on campus.
export function storeysOf(t: Buildable): number {
  const motif = motifOf(t);
  if (motif === 'grounds' || motif === 'hangar' || motif === 'bowl') return 0;
  if (motif === 'tower') return dormStoreys(t.effects?.capacityBonus ?? 0);
  if (t.kind === 'building') {
    return ACADEMIC_HALL_STOREYS + addedFloors(t);
  }
  if (t.kind === 'dorm') return dormStoreys(t.effects?.capacityBonus ?? 0) + addedFloors(t);
  if (t.kind === 'facility') return facilityStoreys(t) + addedFloors(t);
  return 2;
}

// The two motifs that have a height but no floors, in metres.
//
// A sports hall, a pool hall and a sound stage are ONE volume tall enough to
// throw a ball across — about two and a half storeys — and a stadium's stands
// climb to a rim well above that. Stated in metres like everything else here,
// so they re-foreshorten with the rest of the campus if the camera ever tilts.
const CLEAR_SPAN_METRES: Partial<Record<Motif, number>> = {
  hangar: 10,
  bowl: 16,
};

// How tall this building's WALLS stand, in screen units — the mass, before any
// roof rises off it.
export function wallHeightOf(t: Buildable): number {
  const motif = motifOf(t);
  if (motif === 'grounds') return 0;
  const storeys = storeysOf(t);
  if (storeys > 0) return storeys * STOREY;
  return up(CLEAR_SPAN_METRES[motif] ?? 0);
}

// How many ranks of windows go on those walls. Equal to the storey count by
// construction — that is the whole point — except on a clear-span volume,
// which gets a single continuous band of glazing rather than ranks, because
// that is what actually lights one.
export function windowRanksOf(t: Buildable): number {
  const storeys = storeysOf(t);
  return storeys > 0 ? storeys : 1;
}

// How far a pitched roof's ridge rises above the eaves, in metres. Everything
// not listed is flat-roofed, which is what those buildings actually are.
const GEORGIAN_RIDGE_METRES: Partial<Record<Motif, number>> = {
  // Shallow, because an academic hall's roof is a HIP set back behind a
  // parapet, not a barn gable. The 6.0 m this carried was a ridge deeper than
  // a storey and a half, which is what made the campus's landmarks read as
  // sheds with windows.
  hall: 2.2,
  village: 3.0,
  // A refectory, a union and a clinic are halls with roofs. They were flat
  // — the one motif in a brick-and-slate campus with a slab lid — and a
  // Georgian dining hall under a flat deck read as a warehouse.
  pavilion: 2.0,
};

// A residence hall's roof, by how big the hall IS — the one motif whose ridge
// is not a constant.
//
// The academic halls were fixed by the note above and the dorms were left at
// 4.6 m, a ridge a storey and a third deep carried the length of a block, so
// every rung of the chain from the founding hall to a 1,000-bed slab wore the
// same barn roof at a different size. A roofline is one of the two things (the
// other being ground) that tell you a building's size and kind at a glance,
// and using it for neither was a waste of both.
//
// The ladder now genuinely changes shape as it climbs: a three-storey hall is
// a HOUSE and keeps a real domestic pitch; four and five storeys are an
// institutional hall and get the same shallow hip the academic halls wear; six
// and up is a block, and keeps that hip — see the note in the function.
function georgianResidentialRidgeMetres(storeys: number): number {
  if (storeys <= 3) return 4.2;
  if (storeys <= 5) return 2.4;
  // A six-storey hall is still roofed in a pitched vernacular: the same
  // shallow hip the academic halls wear. Flat was the postwar answer, and
  // it made the biggest residence halls on a Georgian campus read as
  // parking structures.
  return 2.2;
}

// Both tables above are GEORGIAN's answers, and since Plan 07's PR E they
// are reached through the vernacular rather than read directly — see
// VERNACULARS below. They stay declared here, beside the reasoning that
// produced them, because that reasoning is about what an academic hall or a
// residence hall IS; a second vernacular disagreeing about the numbers does
// not make the argument for these ones wrong.
export function ridgeOf(t: Buildable, v: Vernacular): number {
  const roof = roofFor(v);
  const motif = motifOf(t);
  if (motif === 'residential') return up(roof.residentialRidgeMetres(storeysOf(t)));
  return up(roof.ridgeMetres[motif] ?? 0);
}

// ---------------------------------------------------------------------
// BAYS AND WINDOWS. The second half of what "proportional" asks for.
//
// Windows used to be a COUNT per motif — eight along a wall, whatever that
// wall's length. A window's width was therefore the wall's length divided by
// eight, which made it depend on the building rather than on the window. The
// two visible walls of one residence hall came out 5.94 m and 2.64 m wide, and
// rotating the building (which swaps w and h) resized every window on it.
// Heights were the same mistake on the other axis: a fraction of the wall, so
// a single-storey supermarket carried an 8.66 m pane and a residential tower a
// 2.68 m one.
//
// A window is a fixed real size. A wall gets as many BAYS as it has room for,
// and the same window goes in every one of them — on both walls of a building,
// on every building, at every footprint, rotated or not.
// ---------------------------------------------------------------------

// One structural bay. Two per tile at 9 m, which puts sixteen bays on the
// eight-tile facade of an academic hall — the bay count the building these
// motifs are drawn from actually has.
export const BAY_METRES = 4.5;

// The window itself. Tall and narrow — a sash window in a masonry wall, which
// is what most of this campus is built of, and the proportion the reference
// building's windows actually have: roughly one to one and three quarters,
// filling about a third of its bay. An earlier pass had these nearly square at
// 1.8 x 2.2, which read as punched holes rather than as windows.
const WINDOW_W_METRES = 1.5;
const WINDOW_H_METRES = 2.4;
const SILL_METRES = 0.85;

// The two families that are glazed rather than punched — a curtain-walled
// tower shaft and a hospital's ribbon windows. They get a WIDER window in the
// SAME bay, so they read as glassier without reading as a different scale. One
// dimension varies across the whole campus, and this is it.
const WIDE_WINDOW_W_METRES = 2.8;
const WIDE_WINDOW_MOTIFS: Motif[] = ['tower', 'block'];

// A clerestory's head sits this far below the eaves. A clear-span volume is
// lit from high up rather than through ranks (see windowRanksOf), because
// that is what actually lights a sports hall or a pool.
const CLERESTORY_HEAD_DROP_METRES = 1.4;

export const WINDOW_HEIGHT = up(WINDOW_H_METRES);
export const SILL_HEIGHT = up(SILL_METRES);

// How thick the band at each floor line is. A string course this size is what
// gives a multi-storey facade its horizontal structure, and it is the part
// that still reads when the panes themselves are a few pixels across.
export const FLOOR_COURSE = up(0.42);

// How many bays fit along a wall of this many tiles. At least one, so a
// footprint smaller than a single bay still gets a window rather than none.
export function baysAcross(spanTiles: number): number {
  return Math.max(1, Math.round((spanTiles * METRES_PER_TILE) / BAY_METRES));
}

// A window's width, in TILES — the unit a wall span is already measured in, so
// the caller needs no conversion of its own.
export function windowWidthOf(t: Buildable): number {
  return across(WIDE_WINDOW_MOTIFS.includes(motifOf(t)) ? WIDE_WINDOW_W_METRES : WINDOW_W_METRES);
}

// The sill height of each rank, in screen units above the building's base.
// One entry per storey, each one storey above the last — so a window's height
// above its own floor is the same on the ground floor and the eighth.
export function rankSills(ranks: number): number[] {
  return Array.from({ length: Math.max(0, ranks) }, (_, i) => i * STOREY + SILL_HEIGHT);
}

// A clear-span volume's single band, hung from the eaves rather than stacked
// from the ground.
export function clerestorySill(wallHeight: number): number {
  return Math.max(0, wallHeight - up(CLERESTORY_HEAD_DROP_METRES) - WINDOW_HEIGHT);
}

// Where the floor lines fall, in screen units above the base — one band per
// storey boundary, so a four-storey building shows three. Empty for a
// clear-span volume, which has no floors to mark.
export function floorLinesOf(t: Buildable): number[] {
  const storeys = storeysOf(t);
  return Array.from({ length: Math.max(0, storeys - 1) }, (_, i) => (i + 1) * STOREY);
}

// ---------------------------------------------------------------------
// DOORS. Six families, each a fixed real size.
//
// There used to be one door — a single parametric shape handed a width and a
// height and stretched into whatever box it was given. The boxes were a tile
// of width (so the same on every wall, which was right) and a FRACTION OF THE
// WALL'S HEIGHT (so a hall's door was 18.11 m tall, a lab's 7.03 m, and a
// retail podium's 0.88 m). Aspect ratios ran from 0.83 to 27.38. "The same
// shape stretched different ways" was not an impression; it was literally the
// implementation.
//
// A door is now a member of a family, and a family has one real width and one
// real height. Four of the six sit between 0.62 and 0.89 — one family of
// proportions, which is what a door looks like. The two that are wide are wide
// because the things they are, a shop window and an ambulance bay, are wide.
// ---------------------------------------------------------------------

export type DoorFamily = 'formal' | 'civic' | 'residential' | 'service' | 'shopfront' | 'canopy';

interface DoorSpec {
  widthMetres: number;
  heightMetres: number;
  // How far the threshold stands above grade, and how many treads climb to it.
  // A formal entrance is approached up a broad flight — it is the most
  // recognisable thing about the front of an academic building, and the old
  // three-pixel sliver of a step was the least.
  thresholdMetres: number;
  treads: number;
}

const DOOR_FAMILIES: Record<DoorFamily, DoorSpec> = {
  // The formal portal: double height, reaching into the first floor, which is
  // what an academic entrance IS. Up a flight of five.
  formal: { widthMetres: 4.0, heightMetres: 5.4, thresholdMetres: 1.4, treads: 5 },
  // Sized to fit a SINGLE STOREY UNDER ITS EAVES COURSE, because its smallest
  // user is exactly that: the founding campus restaurant is one storey of
  // 3.9 m. This family has been retuned twice by the test rather than by eye.
  // First it was 3.6 m of opening over a 0.45 m threshold — taller than the
  // wall itself, so Door declined to draw it and that building rendered with
  // no way in at all. Then, once PR G gave every building the shared eaves
  // course, the head ran into it. Every family has to fit its shortest user
  // with the applied stonework already on the wall, and this is the only one
  // where that bites.
  civic: { widthMetres: 2.6, heightMetres: 3.0, thresholdMetres: 0.25, treads: 1 },
  residential: { widthMetres: 2.2, heightMetres: 3.0, thresholdMetres: 0.3, treads: 1 },
  service: { widthMetres: 1.6, heightMetres: 2.6, thresholdMetres: 0.15, treads: 1 },
  // A glazed bay, not a door with windows beside it.
  shopfront: { widthMetres: 6.0, heightMetres: 3.4, thresholdMetres: 0, treads: 0 },
  // An ambulance entrance drives straight in, so there is nothing to climb.
  canopy: { widthMetres: 8.0, heightMetres: 4.2, thresholdMetres: 0, treads: 0 },
};

// Which family a building's entrance belongs to, or null for something with no
// single front door — open ground, a stadium, and a village, whose houses each
// have their own (drawn by the motif).
export function doorFamilyOf(t: Buildable): DoorFamily | null {
  const motif = motifOf(t);
  if (motif === 'grounds' || motif === 'bowl' || motif === 'village') return null;
  if (t.kind === 'building') return 'formal';
  if (t.kind === 'dorm') return motif === 'tower' ? 'shopfront' : 'residential';
  switch (t.facilityType) {
    // Every lab-gated building takes a service door whatever roof its id
    // earned it (see RESEARCH_FACILITY_MOTIFS): an institute and a compute
    // centre are still back-of-house buildings to walk into.
    case 'lab': return 'service';
    case 'library':
    case 'performingArtsCenter': return 'formal';
    case 'grocery': return 'shopfront';
    case 'healthCenter':
      return (t.effects?.servesPopulation ?? 0) >= HOSPITAL_MIN_SERVES ? 'canopy' : 'civic';
    default: return 'civic';
  }
}

// A door's width in TILES and its height, threshold and tread count in screen
// units — the units the wall it goes on is already measured in.
export interface DoorDimensions {
  family: DoorFamily;
  widthTiles: number;
  height: number;
  threshold: number;
  treads: number;
}

export function doorOf(t: Buildable): DoorDimensions | null {
  const family = doorFamilyOf(t);
  if (!family) return null;
  return doorDimensions(family);
}

export function doorDimensions(family: DoorFamily): DoorDimensions {
  const d = DOOR_FAMILIES[family];
  return {
    family,
    widthTiles: across(d.widthMetres),
    height: up(d.heightMetres),
    threshold: up(d.thresholdMetres),
    treads: d.treads,
  };
}

// How deep one tread is, and how far the flight stands proud of the opening on
// each side. Both real measures, so a stair is the same stair everywhere.
export const TREAD_DEPTH = across(0.42);
export const STEP_OVERHANG = across(0.8);

// ---------------------------------------------------------------------
// THE ACADEMIC HALL'S VOCABULARY.
//
// Every element of the reference building, as a real dimension. They belong
// here rather than in the drawing because they are what the building IS: a
// three-dimensional renderer would need this exact list and these exact
// numbers, and would throw away only the polygons.
//
// All of it goes on the shared `hall` motif, which is what makes "the other
// academic buildings in the same style, without the spire" one flag rather
// than a second motif. Only the clock tower is singular.
// ---------------------------------------------------------------------

// The stone base the brick stands on, and the band that caps it at the eaves.
// Deliberately shallower than a ground-floor sill (SILL_METRES above): a base
// course runs UNDER the windows, and at 1.15 m against a 0.85 m sill it ate
// the bottom of every ground-floor opening on the campus's landmarks.
export const PLINTH = up(0.7);
export const CORNICE = up(1.05);
// The wall carries on a little above the cornice, so the roof sits BEHIND
// something rather than springing straight off the top of the windows.
// Per-vernacular since Plan 07's PR E — read it through parapetOf(v), which
// is allowed to answer zero. See VERNACULARS below.

// The centre bay projects from the middle of each front, rises past the
// cornice and is capped with a pediment. This is what makes an entrance read
// as the front of a building rather than as a hole in a long wall.
export const PAVILION_DEPTH = across(1.9);
export const PAVILION_BAYS = 4;
export const PAVILION_RISE = up(2.1);
export const PEDIMENT_RISE = up(2.9);

// THE PORTICO. A rank of columns standing clear of the centre bay, carrying an
// entablature across their heads — the thing that makes an academic entrance
// read as one from across a lawn, and the most recognisable feature of the
// reference building's front after the tower itself.
//
// Four columns (a tetrastyle portico), because at this scale six read as a
// fence and two do not read as a portico at all. They are cut from the same
// limestone as the clock tower, not from the wall behind them.
export const PORTICO_COLUMNS = 4;
export const PORTICO_HEIGHT = up(10.4);         // up to the second-floor line, as in the reference
export const PORTICO_COLUMN_PLAN = across(1.4);  // a column is round; this is its square
// How far clear of the pavilion face the columns stand. Small on purpose: this
// is an ENGAGED portico, shallow against the centre bay, not a freestanding
// one out on the lawn. At 2.2 m the columns read as a detached porch parked in
// front of the building; at 0.4 they read as part of its front.
// THE PORCH, the Gothic entrance. It is the CENTRE BAY ITSELF, not something
// standing in front of one: same projection and same width as Georgian's
// centre pavilion, but carrying one tall pointed arch instead of a rank of
// windows, and capped by a steep gable instead of a pediment.
//
// It was first drawn as a small separate object parked in front of the
// pavilion, which was wrong twice over on the rendered map: the Georgian bay
// behind it still showed its own windows and its own classical pediment
// around the edges, and the two buttresses meant to flank the arch ended up
// standing clear of it, reading as a pair of columns — which is precisely
// the classical thing a Gothic entrance does not have.
// A PORCH IS LOWER THAN THE WALL IT STANDS AGAINST, which is most of what
// makes it read as a porch rather than as a slab of blank stone. Georgian's
// centre pavilion rises the full height and earns it with four ranks of
// windows and a pediment; this face carries one door and nothing else, so at
// full height it came out as a grey cliff with a small hole at the bottom.
// Two thirds leaves the main wall's own lancets showing above the gable.
// THE RECESS, an entrance cut into the mass: no bay pushed forward and nothing
// applied, just a piece of the ground floor cut away and a slab left
// oversailing it. The way in is a shadow under an overhang, which is the
// only entrance move this architecture makes.
// THE ARCADE: a covered walk of round arches along the front of a building,
// standing clear of the wall on square piers. Lower and deeper than a
// portico, because you walk ALONG it rather than through it.
export const ARCADE_HEIGHT = up(7.2);
export const ARCADE_DEPTH = across(2.6);
export const ARCADE_PIER = across(0.75);
export const ARCADE_BAY_METRES = 6.0;   // wider than a window bay: an arch, not a pier with a gap
export const ARCADE_MAX = 10;
// THE CAMPANILE: a square bell tower with an open belfry and a shallow
// pyramid of tile. Taller and plainer than a cupola, which is what a bell
// tower is next to a dome.
export const CAMPANILE_PLAN = across(7.0);
export const CAMPANILE_RISE = up(13.0);
export const CAMPANILE_BELFRY_RISE = up(5.0);
export const CAMPANILE_CAP_RISE = up(4.4);

export const RECESS_WIDTH = 0.44;      // share of the wall it occupies
export const RECESS_DEPTH = across(2.0);
export const RECESS_OVERHANG = across(1.1);
// THE STAIR CORE, the Modern apex: a blind concrete shaft with the lift
// overrun on top. It is the only thing on such a building that rises above
// the parapet, and it is deliberately not a landmark.
export const CORE_PLAN = across(6.0);
export const CORE_RISE = up(15.0);
export const CORE_CAP_RISE = up(2.4);

export const PORCH_HEIGHT_FRACTION = 0.66;
export const PORCH_GABLE_RISE = up(6.0);
// The arch, as a fraction of the bay's width and height. Sized to read as a
// DOORWAY: at 0.46 x 0.74 the bay was mostly opening and came out as a large
// dark hole in a stone slab rather than as a way into a building. A Gothic
// arch wants to be tall for its width — the proportion is what makes it
// Gothic — but it is still a door in a wall.
export const PORCH_ARCH_WIDTH = 0.36;
export const PORCH_ARCH_HEIGHT = 0.66;
// Buttresses at the bay's own front corners, flush with its sides rather
// than standing off them, stepping back once as they climb. The set-off is
// most of what tells a buttress from a pilaster at this distance.
export const BUTTRESS_PLAN = across(1.15);
export const BUTTRESS_SETOFF_FRACTION = 0.58;
export const BUTTRESS_SETOFF_DEPTH = 0.45;

export const PORTICO_STANDOFF = across(0.4);
export const ENTABLATURE = up(1.5);

// Raised brick blocks closing each end of the roofline.
export const END_PAVILION_PLAN = across(12.0);
export const END_PAVILION_RISE = up(1.9);
// How far into the plan a raised end reaches — enough to read as a section of
// wall carried up, not as a slab balanced on the roof.
export const END_PAVILION_DEPTH = across(4.0);
// The stone coping that caps a raised end, and how far it oversails the brick
// it sits on. A coping always projects — that overhang is what stops the top
// of a wall reading as a cut edge.
export const COPING = up(0.45);
export const COPING_OVERHANG = across(0.35);

// ---------------------------------------------------------------------
// THE CLOCK TOWER. Founders Hall only.
//
// Keyed by id, the same way RESEARCH_FACILITY_MOTIFS gives four lab-gated
// buildings four different roofs without widening the `=== 'lab'` gate that
// three other modules read. The id is techData's exported FOUNDERS_HALL_ID;
// spelled as a literal here rather than imported because this module is
// drawing geometry and that one is course content, and neither should have to
// depend on the other to agree about which building is the founding one.
// ---------------------------------------------------------------------
const CLOCK_TOWER_ID = 'BLDG-GENSTUDIES';

export function hasClockTower(t: Buildable): boolean {
  return t.kind === 'building' && t.id === CLOCK_TOWER_ID;
}

// The tower, bottom to top: a square brick-and-stone base rising out of the
// roof, a shorter colonnaded drum set back from it, a dome, and a finial.
export const TOWER_BASE_PLAN = across(11);
export const TOWER_BASE_RISE = up(12.5);
export const TOWER_DRUM_PLAN = across(8);
export const TOWER_DRUM_RISE = up(3.6);
export const TOWER_DOME_RISE = up(5.2);
export const TOWER_FINIAL_RISE = up(3.0);
// THE SPIRE, the Gothic answer to the drum and dome above. A belfry stage
// with louvred openings, then a tall tapering pyramid — a spire is mostly
// the taper, which is why this is so much deeper than TOWER_DOME_RISE.
export const TOWER_BELFRY_PLAN = across(8.4);
export const TOWER_BELFRY_RISE = up(5.4);
export const TOWER_SPIRE_RISE = up(17.0);
// The little pinnacles at the belfry's corners. A bare pyramid on a box
// reads as a funnel; the pinnacles are what make it read as masonry.
export const TOWER_PINNACLE_PLAN = across(1.5);
export const TOWER_PINNACLE_RISE = up(4.2);
// The clock face. A real radius, converted separately for the two axes of a
// wall's own coordinates — across the wall it is a distance in tiles, up it a
// distance in screen units, and they are not the same number.
const CLOCK_RADIUS_METRES = 2.1;
export const CLOCK_RADIUS = up(CLOCK_RADIUS_METRES);
export const CLOCK_RADIUS_TILES = across(CLOCK_RADIUS_METRES);

// ---------------------------------------------------------------------
// MATERIALS. What a building is MADE of, rather than what colour it was
// assigned.
//
// The campus used to carry twenty-two tints: one per facility type plus four
// for housing plus a landmark gold, each chosen against nothing in particular.
// Of the 253 pairs those 23 form, 40 sit within an RGB distance of 22 — the
// library and the gym are 4.7 apart, a difference no player will ever see —
// and not one of them is a material. Twenty-two near-neighbours is not a
// palette, it is a colour chart, and it is why a campus of well-drawn
// buildings still did not read as one place.
//
// Five materials instead, each with its own WALL and its own ROOF. That
// second field is the change that matters most on screen: roof tones used to
// be derived from the wall tint, so an academic hall was a gold box under a
// gold roof and the two read as one mass. Slate over brick is a building
// under a roof.
//
// The trim is shared by everything. A plinth, a cornice, a pediment and a
// window surround are the same limestone wherever they appear, which is what
// makes the vocabulary read as one vocabulary across a campus of five
// different walls.
// ---------------------------------------------------------------------

export interface Material {
  wall: string;
  roof: string;
}

// Slate and lead, on everything. A campus does not roof each building in a
// different colour, and the one place the map needs variety — which building
// is which — is answered by the walls.
const SLATE = '#5f6b5f';
// The campus's LIGHT roof. Flat roofs wear it because you are looking at the
// deck rather than at a slope turned away from the light — and so do the
// residence halls, whose walls are the one dark material on the map (see
// brickDark below). Dark brick under dark slate is one mass with a line
// across it, which is exactly the failure the wall/roof split exists to
// prevent; dark brick under a pale lead roof is a building. Two uses, one
// tone, because a third grey would be the colour chart creeping back.
const DECK = '#7c8377';

// THE NAMED WALLS A VERNACULAR HAS TO SUPPLY. Same seven keys whatever the
// vernacular, different values behind them: the civic set is limestone in
// Georgian and grey ashlar in Gothic, but it is always whatever THAT
// vernacular calls its civic stone. materialOf below maps a Buildable onto
// one of these seven names and never onto a colour, which is the whole
// reason a second vernacular is a table entry rather than a rewrite.
export interface MaterialSet {
  brickRed: Material;
  brickBuff: Material;
  limestone: Material;
  render: Material;
  curtain: Material;
  brickDark: Material;
  clinical: Material;
}

const GEORGIAN_MATERIALS = {
  // The campus's default, and the reference building's own: warm red brick.
  brickRed: { wall: '#a2564a', roof: SLATE },
  // The support buildings — refectories, shops, the union. Buff brick reads
  // as the same family of construction at a lower key.
  brickBuff: { wall: '#bb9468', roof: SLATE },
  // The civic set: ashlar stone, for the buildings a campus puts its name on.
  limestone: { wall: '#d8cdb4', roof: DECK },
  // Rendered blockwork: labs, works, sheds. Deliberately the dullest wall on
  // the map, because that is what these buildings are.
  render: { wall: '#b0a992', roof: DECK },
  // Glass and steel, for the two things that are actually curtain-walled.
  curtain: { wall: '#93a9b4', roof: DECK },
  // The residence halls, and the one wall on the map that is DARK. They used
  // to be the same red brick as the academic halls, which is how a campus of
  // nine landmarks and a dozen dorms came to read as one long row of the same
  // building: the halls lost their standing and the dorms looked like barns.
  // Dark brick is the empty slot in this palette — every other wall here sits
  // in the top half of the range — so the residential quarter now reads as a
  // different KIND of place from across the map rather than as more of the
  // same at a different size. It also earns the trim: the plinth, the cornice
  // and the floor courses are pale limestone, and against a dark wall they
  // are bands you can see rather than a 22%-white ghost on red.
  brickDark: { wall: '#6d4b3c', roof: DECK },
  // The health chain. A modern hospital is white panel and glazing rather than
  // stone, and it is the one building type on this campus that genuinely is a
  // different construction from everything around it — which is worth a
  // material of its own rather than being dressed as a library.
  clinical: { wall: '#eef1f2', roof: '#c2ccd1' },
} as const satisfies MaterialSet;

// The limestone every building's stonework is cut from, whatever its walls
// are made of — see the note above. Used by the motifs' entrance steps,
// which are the one piece of trim drawn as a solid rather than as a band.
const GEORGIAN_TRIM = '#efe9da';

// The pale fill a painted sash window has always had — translucent, so the
// wall behind tints it and a red brick hall's windows sit warmer than a
// limestone library's. Shared by the sets whose windows are painted frames.
const PAINTED_SASH = 'rgba(255, 253, 246, 0.5)';

// The gilding, and the only place it appears: the dome and finial of Founders
// Hall's clock tower. This is the campus's old BUILDING_TINT, which used to be
// the colour of all nine academic halls. It is not deleted, it is
// concentrated — a landmark reads as one because it is the single gilded
// thing in view, not because it is the ninth building painted gold.
//
// A vernacular is allowed to have NO gilding. Brutalism will not want a
// gold dome and must not be given a grey one instead: the campus's one
// gilded thing is simply absent there, which is a statement about the
// vernacular rather than a gap in its table.
const GEORGIAN_GILT = '#c9a227';

// The clock tower is painted STONE, not brick — it is white in the reference
// photograph, and a white tower over a red building is most of what makes that
// building recognisable. Kept beside the trim it is cut from rather than given
// a material of its own, since nothing else on the campus is built of it.
const GEORGIAN_TOWER_STONE = '#e4dcc8';

// ---------------------------------------------------------------------
// THE VERNACULAR. Which architecture this campus was built in.
//
// Not to be confused with Motif above, which is the other axis and the
// reason this one is not called a "motif set": a Motif is what a building
// IS (a hall, a shed, a stadium), a Vernacular is how the whole campus is
// BUILT. Every campus has one vernacular and eleven motifs.
//
// There is exactly one today, and that is deliberate — this seam is put in
// while it can still be proved invisible (see test/building-spec.test.ts,
// which asserts Georgian's table equals the constants the campus was drawn
// with before the table existed). Plan 07's PRs G, H and I add the rest.
//
// SIX OF THE ELEVEN MOTIFS WILL NOT VARY, whatever gets added here:
// `grounds`, `bowl`, `hangar`, `works`, `block` and `tower`. That is not a
// shortcut, it is true of real campuses — a Gothic university's gym is
// still a shed and its teaching hospital is still a modern hospital. What
// varies is `hall`, `portico`, `residential`, `village` and, lightly,
// `pavilion`.
// ---------------------------------------------------------------------

// The stonework that is NOT a wall: the trim every building's plinth,
// cornice and pediment is cut from, the one gilded thing on the campus, and
// the clock tower's own stone. Grouped because they travel together —
// everything that draws one of them is drawing masonry rather than a
// building's material.
export interface StonePalette {
  trim: string;
  gilt: string;
  towerStone: string;
  // WHAT IS BEHIND THE GLASS. A painted sash window reads pale against a
  // wall; a continuous ribbon of curtain glazing reads dark, because you are
  // looking into a room rather than at a painted frame. It lived in
  // styles.css as `.iso-window`'s fill until Plan 07's PR H needed the two
  // to differ — and it could not stay there, because a class rule beats the
  // presentation attribute a motif passes, which is the same trap `.iso-dome`
  // sprang in PR G.
  glass: string;
}

// HOW THIS VERNACULAR ROOFS A BUILDING. The single loudest signal at map
// zoom after wall colour: a steep slate roof and a flat parapeted one read
// as different campuses from across the screen, before a single window or
// column is legible.
export interface VernacularRoof {
  // Ridge rise above the eaves, in METRES, by motif. Absent means flat,
  // which is what those buildings actually are. Gothic will steepen `hall`
  // several times over; Brutalism will empty this table entirely.
  ridgeMetres: Partial<Record<Motif, number>>;
  // A residence hall's ridge by storey count — the one motif whose ridge is
  // not a constant, because the ladder from a three-storey house to a
  // six-storey block genuinely changes shape as it climbs.
  residentialRidgeMetres(storeys: number): number;
  // How far the wall carries above the cornice, in UNITS, so the roof sits
  // behind something rather than springing off the top of the windows.
  // ZERO means this vernacular has no parapet — which is not a missing
  // value but a real architectural statement: a Gothic roof springs
  // straight from its eaves, and giving it a parapet would be drawing a
  // Georgian building with a steeper hat.
  parapet: number;
  // How far a pitched roof oversails its walls, in METRES. Absent means the
  // roof stops at the wall. Mission's deep tile eaves, and the shadow they
  // throw on the wall, are the set's other signature.
  eavesMetres?: number;
}

// The shape of a single opening. One branch inside windows(), and the
// cheapest per-vernacular signal there is — the pane is already being drawn,
// this only changes which points it is drawn through.
export type WindowShape =
  | 'rect'     // a sash window: four corners
  | 'arched'   // round-headed, springing from the upper third
  | 'lancet'   // pointed, the Gothic light
  | 'slot'     // a deep narrow opening in a concrete wall
  | 'ribbon';  // a continuous horizontal strip of glazing

// ---------------------------------------------------------------------
// THE ORNAMENT SLOTS. What a vernacular puts in the three places a campus
// building is decorated, as names rather than as components — so adding a
// set is a table row, and so the renderer stops asking "is this a hall?"
// and starts asking "what goes at this building's entrance?".
//
// THERE IS NO EAVES SLOT, and its absence is deliberate rather than an
// oversight. How a wall meets its roof is already answered by
// VernacularRoof.parapet above (PR E): a positive parapet is a Georgian
// eaves, zero is a Gothic one. A slot here would restate that in a second
// place, and two places that must agree about one fact is exactly the
// failure this table exists to prevent.
// ---------------------------------------------------------------------

// What stands at a building's way in. Keyed per MOTIF as well as per
// vernacular, because Georgian already varies it: a hall gets a portico, a
// library IS an entrance and gets a colonnade, a dining hall gets a canopy.
export type EntrancePart =
  | 'portico'    // a rank of columns standing clear of a projecting centre bay
  | 'colonnade'  // the same columns, run the length of the front
  | 'canopy'     // a slab on two posts
  | 'porch'      // buttressed, pointed-arched — the Gothic way in
  | 'arcade'     // round-arched, walked under — Mission
  | 'archway'    // a small masonry porch with one round-headed opening — the Mission door
  | 'recess'     // an opening set back under an overhang
  | 'none';

// What closes the ends of a pitched roofline. Georgian raises the wall into
// a small pavilion at each end; a Gothic gable end closes itself and wants
// nothing here.
export type RooflineEndPart = 'pavilion' | 'none';

// What stands on top of the campus's one landmark (see hasClockTower).
export type ApexPart =
  | 'cupola'     // drum, dome and finial — the gilded thing
  | 'spire'      // Gothic
  | 'campanile'  // Mission
  | 'dome'       // a broad stone dome on a drum — Classical
  | 'core'       // a blank stair core — Modern
  | 'none';

export interface VernacularParts {
  // Only the five varying motifs appear. An absent motif means 'none',
  // which is also what every invariant motif gets: a gym has no applied
  // entrance in any vernacular.
  entrance: Partial<Record<Motif, EntrancePart>>;
  rooflineEnd: RooflineEndPart;
  apex: ApexPart;
  // A pitched hood over a canopied door instead of a flat slab — the Gothic
  // way of sheltering a doorway. Absent means a slab.
  hood?: boolean;
  // Chimney stacks on the pitched roofs, which the brick-and-slate sets
  // have and the concrete and tile ones do not.
  chimneys?: boolean;
  // Dormers in the long slopes of a hall's roof.
  dormers?: boolean;
  // A bell-gable — the espadaña — carried up past the eaves at the centre
  // of a hall's and a pavilion's front. The Mission signature after the
  // arcade, and the piece that tells a Mission front from a Tuscan one.
  bellGable?: boolean;
  // THE CASTLE PARTS, which are what collegiate Gothic is recognised by
  // and what the set was missing when it read as Georgian in grey.
  // Stepped buttresses at every bay line down the long walls.
  buttresses?: boolean;
  // A square tower at the near corner of every hall and residence hall,
  // rising past the eaves under a slate pyramid.
  turrets?: boolean;
  // A crenellated head on the towers and on the flat-roofed civic set.
  crenellations?: boolean;
  // Two lights to a bay under one head, instead of one window.
  pairedLights?: boolean;
  // THE CLASSICAL PARTS. A hall's portico runs the full height of the
  // wall on six columns under a pediment, instead of Georgian's two-storey
  // four; and a balustrade runs along every parapet.
  grandPortico?: boolean;
  balustrade?: boolean;
  // THE MODERN PART. The civic set — library, gallery, concert hall — is a
  // glass box: its walls are curtain wall from plinth to eaves.
  glazedCivic?: boolean;
}

// HOW A BUILDING IS MASSED, which is the one axis that is not ornament.
//
// 'solid' is a single mass with whatever roof its ridge gives it — every
// campus before the war. 'stacked' is the postwar move: two or three slabs
// of different plan piled up, the middle one cantilevering out past the base
// it stands on. It is the difference between a building that is decorated
// and a building whose decoration IS its shape, which is why Brutalism
// cannot be done with the palette and the parts table alone.
export type Massing = 'solid' | 'stacked';

export interface VernacularSpec {
  materials: MaterialSet;
  stone: StonePalette;
  roof: VernacularRoof;
  windowShape: WindowShape;
  parts: VernacularParts;
  massing: Massing;
}

const GEORGIAN: VernacularSpec = {
  materials: GEORGIAN_MATERIALS,
  stone: {
    trim: GEORGIAN_TRIM,
    gilt: GEORGIAN_GILT,
    towerStone: GEORGIAN_TOWER_STONE,
    glass: PAINTED_SASH,
  },
  roof: {
    ridgeMetres: GEORGIAN_RIDGE_METRES,
    residentialRidgeMetres: georgianResidentialRidgeMetres,
    parapet: up(0.85),
  },
  windowShape: 'rect',
  parts: {
    entrance: {
      hall: 'portico',
      portico: 'colonnade',
      pavilion: 'canopy',
      residential: 'canopy',
      // A village house has a door and no applied entrance — the houses are
      // the ornament (see VillageHouse).
      village: 'none',
    },
    rooflineEnd: 'pavilion',
    apex: 'cupola',
    chimneys: true,
  },
  massing: 'solid',
};

// ---------------------------------------------------------------------
// COLLEGIATE GOTHIC. Princeton, Yale's older courts, Duke, Chicago.
//
// The set that changes the SILHOUETTE, which is why it is the first one
// added: every other vernacular in this plan is a different way of dressing
// roughly the same massing, and this one is not. A Gothic hall is grey
// ashlar under a roof steep enough to be half the building, with no parapet
// hiding it and a spire on the landmark instead of a dome.
//
// THREE MATERIALS ARE DELIBERATELY IDENTICAL TO GEORGIAN'S — `render`,
// `curtain` and `clinical` — and that is not laziness. Those three are the
// walls the INVARIANT motifs are made of: the labs, the gyms, the stadium,
// the natatorium, the residential tower and the teaching hospital. A campus
// whose gym changed colour with its founding century would be claiming its
// 1970s sports hall was built in 1890. materialsMatchOnInvariantMotifs in
// test/building-spec.test.ts enforces this rather than trusting the comment.
// ---------------------------------------------------------------------

// Gothic roofs are the point of the set, so they get their own slate: bluer
// than Georgian's green-grey, and at the SAME LIGHTNESS rather than darker.
//
// Darker was tried first (#4a5261) on the reasoning that real Gothic slate
// is nearly black, and it was wrong for a reason only visible on the
// rendered map: SLOPE shades a roof's four faces MULTIPLICATIVELY off this
// one colour, so a dark roof has no room to separate them. At #4a5261 a
// steep hip — the whole point of the set — read as one flat dark plate,
// because the brightest and darkest faces were barely 40 apart. Matched to
// Georgian's own facet spread instead (68.9 against 68.8), which is what
// makes a pitched roof legible as pitched.
const GOTHIC_SLATE = '#5a6270';
// The flat-roofed buildings keep Georgian's own lead deck, and deliberately
// the SAME one rather than a greyed variant. Three of the seven materials
// are pinned to Georgian by the invariant motifs (see below) and already
// wear this deck, so inventing a fourth roof tone for the two free
// flat-roofed materials would push the campus to four roofs — past the
// three the palette discipline allows, and for a difference nobody could
// see against a building's own walls. A lead deck is a lead deck.
const GOTHIC_DECK = '#7c8377';

const GOTHIC_MATERIALS = {
  // The academic halls: grey limestone ashlar, coursed and weathered. This
  // is the one that carries the set — nine buildings wear it. Cooled and
  // lightened from #8b8779 once the slate above was lightened, to stay
  // clear of `render`, which is pinned to Georgian's value and sits close
  // to any warm grey.
  brickRed: { wall: '#8a8b86', roof: GOTHIC_SLATE },
  // The support buildings, in a warmer sandstone: the same construction at
  // a lower key, exactly as buff brick is to red in Georgian.
  // Pushed warmer than it first read: at #a89573 it sat 32.8 from the
  // halls' ashlar and 37 from `render`, under the 35 the palette check
  // demands and close enough that a refectory and a lab would have been the
  // same building at map zoom. Section 16 caught it; it was not visible by
  // eye in the table.
  brickBuff: { wall: '#b8975f', roof: GOTHIC_SLATE },
  // The civic set — library, performing arts, gallery — in pale dressed
  // stone. The buildings a campus puts its name on are the ones it cuts
  // cleanly.
  limestone: { wall: '#cbc5b0', roof: GOTHIC_DECK },
  // INVARIANT, see above.
  render: { wall: '#b0a992', roof: '#7c8377' },
  curtain: { wall: '#93a9b4', roof: '#7c8377' },
  clinical: { wall: '#eef1f2', roof: '#c2ccd1' },
  // The residence halls, and still the one DARK wall on the map: a
  // dark-grey weathered stone rather than dark brick. Same job as
  // Georgian's brickDark — the residential quarter has to read as a
  // different KIND of place from across the map.
  brickDark: { wall: '#585448', roof: GOTHIC_DECK },
} as const satisfies MaterialSet;

const GOTHIC: VernacularSpec = {
  materials: GOTHIC_MATERIALS,
  stone: {
    // Dressed stone for the trim, cooler than Georgian's cream limestone so
    // the bands read against a grey wall rather than disappearing into it.
    glass: PAINTED_SASH,
    trim: '#e6e3d6',
    // NOT gold. Gothic's landmark is a spire, and a spire is lead and stone;
    // what little metal shows is the weathervane. Kept as a pale lead rather
    // than dropped, because the finial still has to be visible against the
    // sky.
    gilt: '#b9bcc4',
    towerStone: '#d9d5c4',
  },
  roof: {
    ridgeMetres: {
      // Georgian's hall is 2.2 m — a hip set back behind a parapet. Gothic's
      // roof IS the building: unhidden, and about three storeys deep on a
      // four-storey hall.
      //
      // First drawn at 7.4, which is more than three times Georgian's and
      // still read as a shallow lid on the map — a hall is 7x5 tiles, so a
      // hip has 20-odd metres of span to climb across and a ridge that
      // sounds deep in metres comes out gentle on screen. Judged from the
      // rendered campus rather than from the number.
      hall: 13.0,
      village: 6.0,
      // The support buildings pitched too: a flat slate roof is a
      // contradiction, and it is what these wore.
      pavilion: 5.0,
    },
    // A steeper version of the same ladder: a house keeps a real pitch, and
    // an institutional hall of any height gets the hall's own roof.
    residentialRidgeMetres: (storeys: number) => {
      if (storeys <= 3) return 7.5;
      return 6.5;
    },
    // NO PARAPET, and this is the half of the silhouette the ridge does not
    // do. A Georgian roof hides behind its wall; a Gothic roof springs
    // straight from the eaves, and leaving a parapet on would be a Georgian
    // building wearing a steeper hat.
    parapet: 0,
  },
  windowShape: 'lancet',
  parts: {
    entrance: {
      // A gabled, buttressed porch instead of a colonnaded portico.
      hall: 'porch',
      // The civic set keeps a run of columns — a cloister walk is as Gothic
      // as a colonnade is classical, and the geometry is the same rank of
      // shafts. Substituting here would be a different building, not a
      // different style.
      portico: 'colonnade',
      pavilion: 'canopy',
      residential: 'canopy',
      village: 'none',
    },
    // A gable end closes its own roofline; raised end pavilions are a
    // parapet-roof device and have nothing to cap here.
    rooflineEnd: 'none',
    apex: 'spire',
    hood: true,
    chimneys: true,
    dormers: true,
    // The castle: towers at the corners, buttresses down the walls, a
    // crenellated head where the roof is flat, and the windows grouped in
    // pairs. Same palette as before — the blue slate and grey ashlar were
    // right for Duke, Chicago and Yale; it was the massing that was
    // Georgian.
    buttresses: true,
    turrets: true,
    crenellations: true,
    pairedLights: true,
  },
  massing: 'solid',
};

// ---------------------------------------------------------------------
// MODERN. The postwar campus done in light rather than in concrete —
// Harvey Mudd, Cal Poly, the half of MIT that is not the dome, and the
// science and engineering quarters of a hundred others. It replaces the
// Brutalist set, which turned out to describe one campus in twenty and
// was liked the least of the four.
//
// THE SET THAT SUBTRACTS, still. There is no pitched roof anywhere, no
// applied stone trim, and no gilding: the trim classes take a `none` and
// the landmark's gold is absent rather than repainted. What it adds back
// is a THIN PARAPET, so the flat roofs read as roofs, glass — ribbon
// glazing on every varying motif and a fully glazed civic set — and a flat
// slab canopy over every door, which is the one entrance move of the
// period. Massing is solid: a Modern hall is a clean box, and the stacked
// slabs went with the concrete.
//
// It is also the set that proves white is not a palette. The obvious
// version — seven whites and greys — fails the palette check outright:
// they all sit within 30 of each other and of `render`, which is pinned to
// Georgian's value by the labs. Real Modern campuses are not monochrome
// either; Cal Poly is burnt-orange brick against white panel, and that is
// what makes this legible.
// ---------------------------------------------------------------------

// A lead-grey deck, and deliberately Georgian's own: three of the seven
// materials are pinned to it by the invariant motifs, and a fourth roof
// tone is past what the palette discipline allows.
const MODERN_DECK = '#7c8377';

const MODERN_MATERIALS = {
  // The academic halls: white render, the palest wall on any campus here,
  // and far enough above `clinical` (the hospital's panel) to stay a
  // different white.
  brickRed: { wall: '#dcd9cf', roof: MODERN_DECK },
  // The support buildings in burnt-orange brick — Cal Poly's colour, and
  // the warm note a white campus needs.
  brickBuff: { wall: '#b5623f', roof: MODERN_DECK },
  // The civic set in slate-blue panel behind its glass; the hospital's
  // paler deck over it, since a blue-grey roof on a blue-grey wall is one
  // mass with a line across it.
  limestone: { wall: '#5f7d8c', roof: '#c2ccd1' },
  // INVARIANT — the labs, gyms, stadium, natatorium, tower and hospital.
  render: { wall: '#b0a992', roof: '#7c8377' },
  curtain: { wall: '#93a9b4', roof: '#7c8377' },
  clinical: { wall: '#eef1f2', roof: '#c2ccd1' },
  // The residence halls: charcoal panel, and still the one DARK wall.
  brickDark: { wall: '#4d4f52', roof: '#7c8377' },
} as const satisfies MaterialSet;

const MODERN: VernacularSpec = {
  materials: MODERN_MATERIALS,
  stone: {
    // NO TRIM. A plinth, a cornice and a floor course are devices for
    // breaking a wall into storeys, and a Modern wall is one plane with
    // glass in it. The motifs read this as 'none' and skip the bands; the
    // canopy and the steps fall back to towerStone.
    trim: 'none',
    gilt: 'none',
    // White concrete: the stair core, the canopies and the flights.
    towerStone: '#e8e6df',
    // Dark blue-green glass, the tint the period's glazing actually has.
    glass: 'rgba(40, 60, 75, 0.7)',
  },
  roof: {
    // Nothing on this campus is pitched.
    ridgeMetres: {},
    residentialRidgeMetres: () => 0,
    // A THIN parapet: the roof is flat and still reads as one, which the
    // Brutalist set's bare slab edge never quite did.
    parapet: up(0.6),
  },
  windowShape: 'ribbon',
  parts: {
    entrance: {
      // A flat slab on two slim posts over every door, the whole entrance
      // move of the period.
      hall: 'canopy',
      portico: 'canopy',
      pavilion: 'canopy',
      residential: 'canopy',
      village: 'none',
    },
    rooflineEnd: 'none',
    apex: 'core',
    glazedCivic: true,
  },
  massing: 'solid',
};

// ---------------------------------------------------------------------
// CLASSICAL. Columbia, Jefferson's Virginia, MIT's limestone half, the
// Beaux-Arts campuses — stone and columns. Georgian's grander cousin: the
// same parapet-and-hip discipline, but the walls are limestone rather
// than brick, the portico is the full height of the hall on six columns
// under a pediment, a balustrade runs along every parapet, and the
// landmark is a broad stone dome rather than a gilded cupola.
// ---------------------------------------------------------------------

// Weathered copper, the roof of every reference campus's halls.
const COPPER_GREEN = '#5f7a63';
const CLASSICAL_DECK = '#7c8377';

const CLASSICAL_MATERIALS = {
  // The academic halls in pale limestone — the set's carrying colour, and
  // the reason the civic set below is a warmer stone rather than a paler one.
  brickRed: { wall: '#d6cfbb', roof: COPPER_GREEN },
  // The support buildings in red brick with stone dressings, as Virginia
  // and Columbia both do behind their limestone fronts.
  brickBuff: { wall: '#9e5a48', roof: COPPER_GREEN },
  // The civic set in warm sandstone under a lead deck.
  limestone: { wall: '#c9a86a', roof: CLASSICAL_DECK },
  // INVARIANT — see Gothic's note.
  render: { wall: '#b0a992', roof: '#7c8377' },
  curtain: { wall: '#93a9b4', roof: '#7c8377' },
  clinical: { wall: '#eef1f2', roof: '#c2ccd1' },
  // The residence halls in dark brick, the one DARK wall.
  brickDark: { wall: '#6e3f36', roof: CLASSICAL_DECK },
} as const satisfies MaterialSet;

const CLASSICAL: VernacularSpec = {
  materials: CLASSICAL_MATERIALS,
  stone: {
    // Cut limestone, a shade whiter than the halls' walls so the courses
    // and the balustrade read against them.
    trim: '#f3eee1',
    gilt: GEORGIAN_GILT,
    towerStone: '#e9e2d0',
    glass: PAINTED_SASH,
  },
  roof: {
    // Georgian's own discipline: a low hip set back behind a parapet.
    ridgeMetres: { hall: 2.4, village: 3.0, pavilion: 2.0 },
    residentialRidgeMetres: (storeys: number) => (storeys <= 3 ? 4.2 : 2.4),
    parapet: up(0.85),
  },
  windowShape: 'rect',
  parts: {
    entrance: {
      hall: 'portico',
      portico: 'colonnade',
      // Even the pavilions and residence halls are entered between
      // columns: Jefferson's Lawn is ten porticoed pavilions.
      pavilion: 'portico',
      residential: 'portico',
      village: 'none',
    },
    // A balustrade closes the roofline; raised end pavilions are Georgian's.
    rooflineEnd: 'none',
    apex: 'dome',
    grandPortico: true,
    balustrade: true,
  },
  massing: 'solid',
};

// ---------------------------------------------------------------------

// Red clay tile: the whole point of the set. Its facet spread — how far
// SLOPE's brightest face sits from its darkest — comes out at 73.9 against
// Georgian slate's 68.8, so a Mission hip reads as pitched for the same
// reason a Georgian one does (see GOTHIC_SLATE's note for what happens when
// it does not).
const CLAY_TILE = '#9c4f3a';
const MISSION_DECK = '#7c8377';

const MISSION_MATERIALS = {
  // The academic halls: cream lime stucco, the palest walls on any campus
  // here. It can be this pale because the roof above it is doing the work.
  brickRed: { wall: '#e3d6b6', roof: CLAY_TILE },
  // The support buildings in adobe — the same construction a shade earthier.
  brickBuff: { wall: '#b98763', roof: CLAY_TILE },
  // The civic set in warm ochre stone. NOT the palest, because `clinical` is
  // pinned at near-white by the hospital and a white civic wall would sit
  // 16 from it.
  limestone: { wall: '#d4b276', roof: MISSION_DECK },
  // INVARIANT — labs, gyms, stadium, natatorium, tower, hospital.
  render: { wall: '#b0a992', roof: MISSION_DECK },
  curtain: { wall: '#93a9b4', roof: MISSION_DECK },
  clinical: { wall: '#eef1f2', roof: '#c2ccd1' },
  // The residence halls, and still the one DARK wall: a deep weathered
  // adobe. Darker than it would like to be — a mid adobe lands within 40 of
  // the clay tile above it, and dark walls under a dark roof is the mass
  // Georgian's own brickDark note warns about.
  brickDark: { wall: '#5f5347', roof: CLAY_TILE },
} as const satisfies MaterialSet;

const MISSION: VernacularSpec = {
  materials: MISSION_MATERIALS,
  stone: {
    // Whitewashed lime, a touch warmer than Georgian's limestone.
    trim: '#fbf4e2',
    // The bell and its cross. Mission keeps a metal, but it is a warmer,
    // duller bronze than Georgian's gilding.
    gilt: '#b08d3f',
    towerStone: '#ece0c4',
    glass: PAINTED_SASH,
  },
  roof: {
    // Shallower than Georgian's and much shallower than Gothic's — a tile
    // roof cannot be steep, because the tiles slide off. The pitch is low
    // and the EAVES are deep, which is the opposite trade from Gothic.
    ridgeMetres: { hall: 3.4, village: 3.6, pavilion: 3.0 },
    residentialRidgeMetres: (storeys: number) => {
      if (storeys <= 3) return 3.6;
      return 3.0;
    },
    // No parapet: a tile roof oversails its walls rather than hiding behind
    // them, and the shadow under that overhang is the set's other signature.
    parapet: 0,
    eavesMetres: 0.9,
  },
  windowShape: 'arched',
  parts: {
    entrance: {
      // An arcade: the round-arched walk that every one of these campuses is
      // organised around. Where Georgian gathers columns into a portico and
      // Gothic pushes a porch forward, Mission runs a covered walk along the
      // front and lets you arrive out of the sun.
      hall: 'arcade',
      portico: 'arcade',
      pavilion: 'arcade',
      // A residence hall is entered through a small stuccoed porch with one
      // round-headed opening, not under a slab on posts — the slab was the
      // one Georgian part a Mission dormitory still wore.
      residential: 'archway',
      village: 'none',
    },
    rooflineEnd: 'none',
    apex: 'campanile',
    bellGable: true,
  },
  massing: 'solid',
};

export const VERNACULARS: Record<Vernacular, VernacularSpec> = {
  georgian: GEORGIAN,
  gothic: GOTHIC,
  classical: CLASSICAL,
  mission: MISSION,
  modern: MODERN,
};

// A vernacular that has no trim says so with this, rather than with a colour
// nobody can see. Everything that draws a band checks it first.
export const NO_STONE = 'none';
export function hasTrim(v: Vernacular): boolean {
  return stoneFor(v).trim !== NO_STONE;
}
export function hasGilt(v: Vernacular): boolean {
  return stoneFor(v).gilt !== NO_STONE;
}

export function roofFor(v: Vernacular): VernacularRoof {
  return VERNACULARS[v].roof;
}

export function windowShapeOf(v: Vernacular): WindowShape {
  return VERNACULARS[v].windowShape;
}

// THE SIX MOTIFS NO VERNACULAR MAY RESTYLE, as a list rather than as a
// sentence in a comment — because a rule that only exists in prose is a rule
// the next set PR gets to reinterpret.
//
// This is not a shortcut taken to make Plan 07 cheaper. It is true of real
// campuses: a Gothic university's gym is a clear-span shed, its teaching
// hospital is a modern hospital, its 5,000-bed apartment tower is curtain
// wall, and its football field is a football field. Building those in the
// founding vernacular would be the fiction, not the other way round.
export const VERNACULAR_INVARIANT_MOTIFS = [
  'grounds',  // a gridiron is a gridiron
  'bowl',     // a concrete stadium in every era
  'hangar',   // clear-span sheds are engineering, not architecture
  'works',    // the dullest wall on the map, by design
  'block',    // a teaching hospital is a modern hospital
  'tower',    // a late-game apartment tower postdates the founding campus
] as const satisfies readonly Motif[];

export function variesByVernacular(m: Motif): boolean {
  return !(VERNACULAR_INVARIANT_MOTIFS as readonly Motif[]).includes(m);
}

// What shape THIS building's openings are. The one call the renderer makes,
// so the invariance above is enforced in the taxonomy rather than being
// re-decided at each of the eleven places a window gets drawn.
export function paneShapeOf(t: Buildable, v: Vernacular): WindowShape {
  return variesByVernacular(motifOf(t)) ? windowShapeOf(v) : 'rect';
}

export function massingOf(t: Buildable, v: Vernacular): Massing {
  // The invariant six are massed the way they are built, not the way the
  // campus was founded — a gym is one clear span whatever the century.
  return variesByVernacular(motifOf(t)) ? VERNACULARS[v].massing : 'solid';
}

// THE STACK, as fractions of the footprint and of the full height.
//
// TWO VOLUMES, STEPPED ON ONE AXIS ONLY, and the "one axis" is the whole
// trick. The first attempt inset a middle slab on all four sides, which
// draws concentric rectangles: from above that reads as a pancake with a
// skirt, not as a cantilever. Stepping on a single axis leaves a real
// L-shaped profile that is legible from this camera, which is the only
// test that matters for a shape.
//
// Both volumes stay INSIDE the footprint, so a stacked building occupies
// exactly the tiles it is placed on and can never overhang its neighbour.
export const STACK_LOWER_TOP = 0.54;   // where the broad base stops
export const STACK_UPPER_INSET = 0.34; // how far the upper slab pulls back, on one axis
export const STACK_UPPER_OVERHANG = 0.10; // and how far it cantilevers past the other end

// WHAT THE FOUNDING SCREEN CALLS EACH SET, and the order it offers them in.
//
// Here rather than in the component because the label and the palette are
// two halves of one fact: adding a vernacular without naming it should not
// compile, and this is what makes that true. The blurbs name what the player
// will actually SEE on the map — a roof, a wall, a tower — rather than the
// architectural period, because the period is not what they are choosing
// between at a glance.
export interface VernacularChoice {
  id: Vernacular;
  label: string;
  blurb: string;
}

export const VERNACULAR_CHOICES: VernacularChoice[] = [
  { id: 'georgian', label: 'Georgian', blurb: 'Red brick and white trim, under a gilded cupola.' },
  { id: 'gothic', label: 'Collegiate Gothic', blurb: 'Grey ashlar and steep slate, under a spire.' },
  { id: 'classical', label: 'Classical', blurb: 'Limestone and columns under copper roofs, and a stone dome.' },
  { id: 'mission', label: 'Mission', blurb: 'Cream stucco and red tile, around a shaded arcade.' },
  { id: 'modern', label: 'Modern', blurb: 'White panel, glass and burnt-orange brick, under flat roofs.' },
];

export function partsFor(v: Vernacular): VernacularParts {
  return VERNACULARS[v].parts;
}

// What goes at THIS building's entrance. The invariant six always get
// 'none' — the same gate paneShapeOf uses, applied to the other axis, so
// there is one answer to "does the vernacular reach this building?" rather
// than two that can drift.
export function entrancePartOf(t: Buildable, v: Vernacular): EntrancePart {
  const motif = motifOf(t);
  if (!variesByVernacular(motif)) return 'none';
  return partsFor(v).entrance[motif] ?? 'none';
}

export function rooflineEndPartOf(v: Vernacular): RooflineEndPart {
  return partsFor(v).rooflineEnd;
}

export function apexPartOf(v: Vernacular): ApexPart {
  return partsFor(v).apex;
}

// WHICH PARTS ACTUALLY HAVE GEOMETRY BEHIND THEM, so a vernacular cannot
// name one that nothing draws.
//
// The types above name every part the four planned sets need; only
// Georgian's three are built. That asymmetry is on purpose and is NOT the
// call PR E made for window shapes: an outline is a dozen lines of pure
// (u, v) arithmetic that can be checked without rendering, while a spire is
// eighty lines of iso SVG that can only be checked by looking at it. Naming
// them costs nothing and writing them blind would be inventing three
// buildings nobody has seen.
//
// The lists below are what makes the asymmetry safe rather than sloppy:
// test/building-spec.test.ts asserts every part named by a vernacular in
// VERNACULARS is on them, so PR G adding `apex: 'spire'` fails loudly until
// PR G also draws a spire.
export const IMPLEMENTED_ENTRANCE_PARTS: EntrancePart[] = ['portico', 'colonnade', 'canopy', 'porch', 'recess', 'arcade', 'archway', 'none'];
export const IMPLEMENTED_ROOFLINE_END_PARTS: RooflineEndPart[] = ['pavilion', 'none'];
export const IMPLEMENTED_APEX_PARTS: ApexPart[] = ['cupola', 'spire', 'core', 'campanile', 'dome', 'none'];

// How far the wall carries above the cornice. Zero is a real answer.
// DOES THIS VERNACULAR HAVE A ROOF AT ALL, as distinct from a top?
//
// Derived rather than declared, on purpose: a flag would be a switch for
// turning off the palette check that guards it, and this file already warns
// (see section 12's note in the test) that a bar which follows the palette
// around is not a bar. A vernacular that pitches nothing and carries no
// parapet genuinely has no roof — what you look down onto is the top of the
// mass, in the same material — and the "a roof must read against its own
// walls" rule is about buildings that have one.
export function hasRoofForm(v: Vernacular): boolean {
  const r = roofFor(v);
  return Object.keys(r.ridgeMetres).length > 0 || r.parapet > 0;
}

export function parapetOf(v: Vernacular): number {
  return VERNACULARS[v].roof.parapet;
}

// How far a pitched roof oversails the wall, in tiles.
export function eavesOf(v: Vernacular): number {
  return across(VERNACULARS[v].roof.eavesMetres ?? 0);
}

// ---------------------------------------------------------------------
// THE OPENING ITSELF, as a closed outline in the wall face's own (u, v).
//
// Pure geometry and deliberately free of JSX, like everything else in this
// module: the caller turns (u, v) pairs into screen points through
// facePoint, which is what makes this correct on a skewed face without
// knowing anything about the projection.
//
// EVERY SHAPE STAYS INSIDE THE BOX it is given — the same [u0,u1] x [v0,v1]
// a rectangular pane would have occupied. An arch that bulged past its own
// bay would collide with its neighbour, and a lancet that rose past v1
// would punch through the floor course above it; both are invisible in the
// numbers and obvious on the map, which is why the test pins the bound
// rather than the appearance.
//
// NOTE the v axis runs UP the wall: v1 is the head of the window, v0 the
// sill. An earlier reading of this had arches opening downward.
// ---------------------------------------------------------------------

// How much of an arched or lancet opening is straight-sided wall before the
// head begins. Two thirds leaves a head that reads as a head at map zoom
// without the opening becoming mostly arch.
const ARCH_SPRING = 0.66;
// Points around the round head. Six is enough for an arc a few pixels
// across and keeps the campus's polygon count honest.
const ARCH_STEPS = 6;
// A concrete slot is inset from its own bay: the reveal is most of what
// makes it read as punched through a thick wall rather than as a pane.
const SLOT_INSET = 0.22;
// A RIBBON fills its bay edge to edge, so neighbouring bays touch and the
// row reads as one continuous band rather than as a row of panes. What makes
// it a ribbon is that it is SHORT — the glazing is a horizontal slot in a
// wall, not a window with a wall between it and the next one.
const RIBBON_HEIGHT = 0.46;
const RIBBON_DROP = 0.30;   // where the band sits within its own rank

export function windowOutline(
  shape: WindowShape, u0: number, u1: number, v0: number, v1: number,
): Array<[number, number]> {
  const uc = (u0 + u1) / 2;
  const half = (u1 - u0) / 2;
  switch (shape) {
    case 'rect':
      // The four corners, in the order the campus has always drawn them.
      return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    case 'arched': {
      const spring = v0 + (v1 - v0) * ARCH_SPRING;
      const head: Array<[number, number]> = [];
      for (let i = 0; i <= ARCH_STEPS; i++) {
        const a = Math.PI * (i / ARCH_STEPS);
        head.push([uc + half * Math.cos(a), spring + (v1 - spring) * Math.sin(a)]);
      }
      // Up the right jamb, over the head right-to-left, down the left jamb.
      return [[u0, v0], [u1, v0], [u1, spring], ...head.slice(1, ARCH_STEPS), [u0, spring]];
    }
    case 'lancet': {
      const spring = v0 + (v1 - v0) * ARCH_SPRING;
      return [[u0, v0], [u1, v0], [u1, spring], [uc, v1], [u0, spring]];
    }
    case 'slot': {
      const i = half * SLOT_INSET;
      return [[u0 + i, v0], [u1 - i, v0], [u1 - i, v1], [u0 + i, v1]];
    }
    case 'ribbon': {
      // Full bay width — see RIBBON_HEIGHT. windows() widens u0/u1 to the
      // bay edges for this shape, so touching neighbours are the intent
      // rather than an overlap bug.
      const span = v1 - v0;
      const lo = v0 + span * RIBBON_DROP;
      return [[u0, lo], [u1, lo], [u1, lo + span * RIBBON_HEIGHT], [u0, lo + span * RIBBON_HEIGHT]];
    }
  }
}

export function materialsFor(v: Vernacular): MaterialSet {
  return VERNACULARS[v].materials;
}

// The plan called this trimFor(). It returns all three stones rather than
// the trim alone because nothing ever wants just one of them: a motif that
// reaches for the trim is drawing masonry, and the gilding and the tower's
// stone are the same decision made about two smaller pieces of it.
export function stoneFor(v: Vernacular): StonePalette {
  return VERNACULARS[v].stone;
}

export function materialOf(t: Buildable, v: Vernacular): Material {
  const MATERIALS = materialsFor(v);
  if (t.kind === 'building') return MATERIALS.brickRed;
  if (t.kind === 'dorm') {
    return motifOf(t) === 'tower' ? MATERIALS.curtain : MATERIALS.brickDark;
  }
  switch (t.facilityType) {
    case 'library':
    case 'performingArtsCenter':
    case 'artGallery':
      return MATERIALS.limestone;
    case 'healthCenter':
      return MATERIALS.clinical;
    case 'diningHall':
    case 'grocery':
    case 'studentCenter':
      return MATERIALS.brickBuff;
    case 'athleticsNatatorium':
      return MATERIALS.curtain;
    case 'lab':
    case 'gym':
    case 'recCenter':
    case 'athleticsArena':
    case 'fieldHouse':
      return MATERIALS.render;
    // Open ground and the venues drawn as markings take a wall colour only so
    // their props (a stand, a fence, a fountain kerb) have something to shade
    // from; nothing of theirs is actually a wall.
    default:
      return MATERIALS.render;
  }
}

// Neighbouring residence halls should not be identical. The old tints gave
// housing four separate colours hashed off the id; that variety is worth
// keeping and a whole extra colour is not, so the SAME brick is nudged a few
// percent either way instead. A hall still differs from the one beside it,
// and both are still obviously brick.
const DORM_SHADE_STEPS = [0.94, 1.0, 1.06, 1.11];

export function wallShadeOf(t: Buildable): number {
  if (t.kind !== 'dorm') return 1;
  let h = 0;
  for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) % 1000003;
  return DORM_SHADE_STEPS[h % DORM_SHADE_STEPS.length];
}

// ---------------------------------------------------------------------
// THE REST OF THE CATALOGUE. PR G: the vocabulary the academic hall proved
// out, applied to every other roofed motif.
//
// The point is not to make every building look like a hall. It is that a
// campus should be built of ONE set of parts — a base course, a cornice, a
// bay, a door from six families — assembled differently. A library has a
// colonnade and a lab does not; both stand on the same plinth and are capped
// by the same cornice, and that is what makes them read as the same campus
// rather than as a collection of separately-drawn objects.
// ---------------------------------------------------------------------

// Every roofed motif gets these two. A flat-roofed building's cornice is the
// slab edge; a gabled one's is the eaves course. Both are the same stone as
// the halls'.
export const BASE_COURSE = up(0.55);
export const EAVES_COURSE = up(0.5);

// A COLONNADE, for the civic set — library, performing arts, gallery. The same
// columns the hall's portico is built from, run the length of the front
// instead of gathered into a centre bay: that is the difference between a
// building with an entrance and a building that IS an entrance, which is what
// these are.
export const COLONNADE_HEIGHT = up(8.2);
export const COLONNADE_BAY_METRES = 6.5;   // wider spacing than a window bay
export const COLONNADE_MAX = 9;

// PIERS, for the clear-span sheds. A big hall's walls are held up by
// buttresses at bay centres, and they are most of what you see of a gym from
// outside — without them a hangar is a blank box with a stripe of glass.
export const PIER_WIDTH_METRES = 1.1;
export const PIER_PROJECTION = across(0.5);

// A CANOPY over a pavilion's door: a slab on two posts, which is what a
// dining hall, a clinic or a union puts over its entrance.
export const CANOPY_DEPTH = across(2.6);
export const CANOPY_SLAB = up(0.45);
export const CANOPY_POST = across(0.35);

// ---------------------------------------------------------------------
// THE HOSPITAL. The `block` motif's large instances.
//
// A teaching hospital is not one mass. It is a tall ward slab with a lower,
// fully glazed public wing against it — the entrance, the atrium, the
// outpatient front — and that stepped massing is most of what makes one
// recognisable from a distance. Drawn as a single box it read as a very large
// pavilion with plant on the roof.
//
// Only the LARGE instances get it. `block` also carries the computing research
// centre, which is a 4x3 building: splitting that into two wings would give
// each of them about a tile and a half of frontage, and two slivers read worse
// than one honest box.
// ---------------------------------------------------------------------

export const BLOCK_SPLIT_MIN_TILES = 7;

// How the plan divides. The ward slab takes the FAR half of the footprint at
// full width; the glazed public wing sits in front of it, across the near-left,
// leaving the near-right corner as the forecourt an ambulance entrance needs.
//
// Which half is "far" matters, and getting it backwards is invisible in the
// numbers: on this projection increasing row runs toward the camera, so the
// wing has to take the HIGH rows to stand in front. An earlier pass put it at
// low col instead, which is up-LEFT — away — and the glazed front ended up
// tucked behind the slab where almost none of it could be seen.
export const SLAB_ROW_FRACTION = 0.5;
export const WING_COL_FRACTION = 0.62;
// The public wing is this much of the slab's height, rounded to whole storeys
// so it still lines up with the floors beside it.
export const WING_STOREY_FRACTION = 0.6;

// The recessed, glazed ground floor both wings stand on. A hospital's entrance
// level is set back under the mass above it, which is why the bottom of one
// reads as a dark band rather than as more wall.
export const UNDERCROFT_STOREYS = 1;

// The red cross, on the slab's own front. A real size, like everything else —
// and the one piece of signage on the campus, because it is the one building
// whose sign is a recognisable shape rather than a word you would need to be
// able to read.
export const CROSS_ARM_METRES = 4.2;
export const CROSS_BAR_METRES = 1.5;
