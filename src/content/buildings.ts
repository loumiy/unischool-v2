import raw from './buildings.json' with { type: 'json' };
import { arr, ContentError, int, obj, oneOf, optional, str, uniqueBy, validate } from './schema.ts';

// The building catalogue (DD §14: ~40 types at 1.0). Phase 2 needs one
// entry; Phase 3 grows it to the seed catalogue.

export const BUILDING_KINDS = ['academic'] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export interface BuildingDef {
  id: string;
  name: string;
  kind: BuildingKind;
  footprint: { w: number; h: number };
  blurb?: string;
}

const schema = obj({
  buildings: arr(
    obj({
      id: str,
      name: str,
      kind: oneOf(BUILDING_KINDS),
      footprint: obj({ w: int, h: int }),
      blurb: optional(str),
    }),
  ),
});

function load(): BuildingDef[] {
  const file = validate(schema, raw, 'content/buildings.json');
  const list = uniqueBy(file.buildings, (b) => b.id, 'content/buildings.json.buildings');
  for (const [i, b] of list.entries()) {
    if (b.footprint.w < 1 || b.footprint.h < 1) {
      throw new ContentError(`content/buildings.json.buildings[${i}].footprint`, 'must be ≥ 1×1');
    }
  }
  return list;
}

export const BUILDINGS: readonly BuildingDef[] = load();

export function buildingById(id: string): BuildingDef {
  const def = BUILDINGS.find((b) => b.id === id);
  if (!def) throw new Error(`unknown building "${id}"`);
  return def;
}
