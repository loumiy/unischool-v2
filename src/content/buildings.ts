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
] as const;
export type BuildingIcon = (typeof BUILDING_ICONS)[number];

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  footprint: { w: number; h: number };
  cost: number; // to build, dollars
  upkeep: number; // annual maintenance when new, dollars (DD §6.4)
  buildWeeks: number; // ground broken to doors open
  form: Form;
  material: MaterialKey;
  storeys: number; // 0 for a clear-span volume or open ground
  door: DoorFamily | null;
  landmark?: boolean; // carries the campus's one clock tower
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
    const massless = b.form === 'grounds' || b.form === 'hangar';
    if (massless !== (b.storeys === 0)) {
      throw new ContentError(
        `${at}.storeys`,
        `a ${b.form} has ${massless ? 'no' : 'at least one'} storey`,
      );
    }
    if ((b.form === 'grounds') !== (b.door === null)) {
      throw new ContentError(`${at}.door`, 'open ground has no door; every building has one');
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
