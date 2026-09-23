import raw from './buildings.json' with { type: 'json' };
import { arr, ContentError, int, obj, oneOf, optional, str, uniqueBy, validate } from './schema.ts';

// The building catalogue (DD §14: ~40 types at 1.0; Phase 3 seeds eleven
// across DD's categories). Everything the renderer needs to draw a building
// is data here — its form, its material, its storeys, its door — so a new
// type is a row, not a branch (see ui/map/buildingSpec.ts).

export const BUILDING_CATEGORIES = [
  'academic',
  'residential',
  'dining',
  'life',
  'athletics',
  'admin',
  'landmark',
] as const;
export type BuildingCategory = (typeof BUILDING_CATEGORIES)[number];

// What a building IS, dimensionally: the silhouette the renderer draws.
export const FORMS = [
  'hall', // academic halls: the landmarks — a deep roof behind a parapet
  'residential', // one long roof down a block, ranked windows
  'portico', // library, arts: flat roof, rooflights, a colonnade
  'pavilion', // union, dining, clinic: low, a storey or two
  'hangar', // rec centre, gym: a clear-span vault, no storeys
  'works', // labs: low, flat, crowded with rooftop plant
  'block', // an institutional mass: flat-roofed, plant on top
  'grounds', // a field: markings, no mass
  'sign', // the board at the road, with the school's name on it
] as const;
export type Form = (typeof FORMS)[number];

export const MATERIAL_KEYS = [
  'brickRed',
  'brickBuff',
  'limestone',
  'render',
  'curtain',
  'brickDark',
  'clinical',
] as const;
export type MaterialKey = (typeof MATERIAL_KEYS)[number];

export const DOOR_FAMILIES = [
  'formal',
  'civic',
  'residential',
  'service',
  'shopfront',
  'canopy',
] as const;
export type DoorFamily = (typeof DOOR_FAMILIES)[number];

export const BUILDING_ICONS = [
  'academic',
  'library',
  'lab',
  'housing',
  'dining',
  'life',
  'health',
  'fitness',
  'athletics',
  'admin',
  'sign',
] as const;
export type BuildingIcon = (typeof BUILDING_ICONS)[number];

export interface Capacity {
  beds?: number;
  meals?: number;
  seats?: number;
  // Students the building's student life reaches (DD §8.3, §8.5; Phase
  // 21I): the student centre, the health centre, the recreation centre and
  // the fields, which until now changed no number a player could find.
  life?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  footprint: { w: number; h: number };
  cost: number; // to build, dollars
  upkeep: number; // annual maintenance when new, dollars (DD §6.4)
  buildWeeks: number; // ground broken to doors open
  // What the building holds (DD §8.2): beds, dining seats, teaching seats.
  capacity?: Capacity;
  // What it adds to campus beauty (DD §6.2, beauty.ts): a landmark's mark.
  beauty?: number;
  form: Form;
  material: MaterialKey;
  storeys: number; // 0 for a clear-span volume or open ground
  door: DoorFamily | null;
  landmark?: boolean; // carries the campus's one clock tower
  // How many a college has, at most (Phase 21I). No university has four
  // administration buildings; absent means as many as the land will hold.
  limit?: number;
  icon: BuildingIcon;
  blurb?: string;
}

const nullable =
  <T>(inner: (v: unknown, p: string) => T) =>
  (v: unknown, p: string): T | null =>
    v === null ? null : inner(v, p);

const schema = obj({
  buildings: arr(
    obj({
      id: str,
      name: str,
      category: oneOf(BUILDING_CATEGORIES),
      footprint: obj({ w: int, h: int }),
      cost: int,
      upkeep: int,
      buildWeeks: int,
      capacity: optional(
        obj({
          beds: optional(int),
          meals: optional(int),
          seats: optional(int),
          life: optional(int),
        }),
      ),
      limit: optional(int),
      beauty: optional(int),
      form: oneOf(FORMS),
      material: oneOf(MATERIAL_KEYS),
      storeys: int,
      door: nullable(oneOf(DOOR_FAMILIES)),
      landmark: optional((v: unknown, p: string) => {
        if (typeof v !== 'boolean') throw new ContentError(p, 'expected a boolean');
        return v;
      }),
      icon: oneOf(BUILDING_ICONS),
      blurb: optional(str),
    }),
  ),
});

function load(): BuildingDef[] {
  const file = validate(schema, raw, 'content/buildings.json');
  const list = uniqueBy(file.buildings, (b) => b.id, 'content/buildings.json.buildings');
  for (const [i, b] of list.entries()) {
    const at = `content/buildings.json.buildings[${i}]`;
    if (b.footprint.w < 1 || b.footprint.h < 1)
      throw new ContentError(`${at}.footprint`, 'must be ≥ 1×1');
    if (b.storeys < 0) throw new ContentError(`${at}.storeys`, 'must be ≥ 0');
    if (b.cost <= 0) throw new ContentError(`${at}.cost`, 'must be > 0');
    if (b.upkeep < 0) throw new ContentError(`${at}.upkeep`, 'must be ≥ 0');
    if (b.buildWeeks < 1) throw new ContentError(`${at}.buildWeeks`, 'must be ≥ 1');
    if (b.limit !== undefined && b.limit < 1) throw new ContentError(`${at}.limit`, 'must be ≥ 1');
    for (const k of ['beds', 'meals', 'seats', 'life'] as const) {
      const n = b.capacity?.[k];
      if (n !== undefined && n < 0) throw new ContentError(`${at}.capacity.${k}`, 'must be ≥ 0');
    }
    // A sign is massless like a field: two posts and a board, no floors.
    const massless = b.form === 'grounds' || b.form === 'hangar' || b.form === 'sign';
    if (massless !== (b.storeys === 0)) {
      throw new ContentError(
        `${at}.storeys`,
        `a ${b.form} has ${massless ? 'no' : 'at least one'} storey`,
      );
    }
    const doorless = b.form === 'grounds' || b.form === 'sign';
    if (doorless !== (b.door === null)) {
      throw new ContentError(
        `${at}.door`,
        'open ground and signs have no door; every building has one',
      );
    }
    // A door on a tile, not on a seam: every footprint with a door is odd in
    // width so a walkway can arrive at it (v1's rule, kept).
    if (b.door !== null && b.footprint.w % 2 === 0) {
      throw new ContentError(
        `${at}.footprint.w`,
        'a building with a door is an odd number of tiles wide',
      );
    }
  }
  const landmarks = list.filter((b) => b.landmark);
  if (landmarks.length !== 1)
    throw new ContentError('content/buildings.json', 'exactly one landmark');
  return list;
}

export const BUILDINGS: readonly BuildingDef[] = load();

export function buildingById(id: string): BuildingDef {
  const def = BUILDINGS.find((b) => b.id === id);
  if (!def) throw new Error(`unknown building "${id}"`);
  return def;
}

export function findBuilding(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
