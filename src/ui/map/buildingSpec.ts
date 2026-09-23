import {
  FURNITURE_FORMS,
  type BuildingDef,
  type DoorFamily,
  type Form,
  type MaterialKey,
} from '../../content/buildings.ts';
import type { Motif } from '../../sim/index.ts';
import { across, METRES_PER_TILE, STOREY, up } from './scale.ts';

// WHAT a placed building is, dimensionally (ported from v1's buildingSpec.ts
// and re-keyed on the catalogue): which FORM it takes, how many storeys, what
// material, what door — and how the campus's MOTIF (v1's vernacular: the
// architecture the whole campus was built in) dresses each of those.
//
// Deliberately free of JSX. This module answers questions about buildings;
// buildingMotifs.tsx turns the answers into polygons.

export type { DoorFamily, Form, MaterialKey };

// The forms no motif restyles: engineering, not architecture. A gym is a
// clear-span shed and a lab is a rendered box whatever century the campus
// was founded in.
export const MOTIF_INVARIANT_FORMS: readonly Form[] = [
  'grounds',
  'hangar',
  'works',
  'block',
  'sign',
  'statue',
  'fountain',
  'observatory',
  'bridge',
];

export function variesByMotif(form: Form): boolean {
  return !MOTIF_INVARIANT_FORMS.includes(form);
}

// ---------------------------------------------------------------------
// STOREYS. The one number a building's height comes from.
// ---------------------------------------------------------------------

// THE ENTRANCE SIGN (Phase 21D): two posts and a board, at the size a board
// at a road actually is. Its plot is two tiles so it can be turned to face
// the road; the sign itself stands in the middle of it, and is small — a
// tile is nine metres, and a sign the width of its plot would be a
// billboard.
export const SIGN_POST_METRES = 3.4;

// Campus furniture (Phase 21J), by the height it stands: a figure on its
// plinth, a fountain's jet, a gate's arch, a bell tower's shaft (its cap
// rises above, by motif).
export const STATUE_METRES = 7;
export const FOUNTAIN_METRES = 4.6;
export const GATE_METRES = 8.2;
export const BELL_TOWER_METRES = 21;
export const BELL_TOWER_CAP_METRES = 6;
const CLEAR_SPAN_METRES: Partial<Record<Form, number>> = {
  hangar: 10,
  sign: SIGN_POST_METRES,
  statue: STATUE_METRES,
  fountain: FOUNTAIN_METRES,
  gate: GATE_METRES,
  tower: BELL_TOWER_METRES,
  bridge: 1.9,
};
// The observatory's dome, above its one storey.
export const OBSERVATORY_DOME_METRES = 8.5;
export const SIGN_BOARD_RISE = up(1.7);
export const SIGN_BOARD_WIDTH = across(5.4);
export const SIGN_BOARD_DEPTH = across(0.3);
export const SIGN_POST = across(0.42);
export const SIGN_PLINTH_LONG = across(6.6);
export const SIGN_PLINTH_DEEP = across(1.1);
export const SIGN_PLINTH = up(0.3);

export function storeysOf(def: BuildingDef): number {
  return def.form === 'grounds' || def.form === 'hangar' || FURNITURE_FORMS.includes(def.form)
    ? 0
    : def.storeys;
}

// Is this campus furniture rather than a building: drawn by its own
// renderer, with no windows, floors or door?
export function isFurniture(def: BuildingDef): boolean {
  return FURNITURE_FORMS.includes(def.form);
}

export function wallHeightOf(def: BuildingDef): number {
  if (def.form === 'grounds') return 0;
  const storeys = storeysOf(def);
  if (storeys > 0) return storeys * STOREY;
  return up(CLEAR_SPAN_METRES[def.form] ?? 0);
}

export function windowRanksOf(def: BuildingDef): number {
  const storeys = storeysOf(def);
  return storeys > 0 ? storeys : 1;
}

// ---------------------------------------------------------------------
// BAYS AND WINDOWS. A window is a fixed real size; a wall gets as many bays
// as it has room for.
// ---------------------------------------------------------------------

export const BAY_METRES = 4.5;
const WINDOW_W_METRES = 1.5;
const WINDOW_H_METRES = 2.4;
const SILL_METRES = 0.85;
const WIDE_WINDOW_W_METRES = 2.8;
const WIDE_WINDOW_FORMS: Form[] = ['block'];
const CLERESTORY_HEAD_DROP_METRES = 1.4;

export const WINDOW_HEIGHT = up(WINDOW_H_METRES);
export const SILL_HEIGHT = up(SILL_METRES);
export const FLOOR_COURSE = up(0.42);

export function baysAcross(spanTiles: number): number {
  return Math.max(1, Math.round((spanTiles * METRES_PER_TILE) / BAY_METRES));
}

export function windowWidthOf(def: BuildingDef): number {
  return across(WIDE_WINDOW_FORMS.includes(def.form) ? WIDE_WINDOW_W_METRES : WINDOW_W_METRES);
}

export function rankSills(ranks: number): number[] {
  return Array.from({ length: Math.max(0, ranks) }, (_, i) => i * STOREY + SILL_HEIGHT);
}

export function clerestorySill(wallHeight: number): number {
  return Math.max(0, wallHeight - up(CLERESTORY_HEAD_DROP_METRES) - WINDOW_HEIGHT);
}

export function floorLinesOf(def: BuildingDef): number[] {
  const storeys = storeysOf(def);
  return Array.from({ length: Math.max(0, storeys - 1) }, (_, i) => (i + 1) * STOREY);
}

// ---------------------------------------------------------------------
// DOORS. Six families, each a fixed real size.
// ---------------------------------------------------------------------

interface DoorSpec {
  widthMetres: number;
  heightMetres: number;
  thresholdMetres: number;
  treads: number;
}

const DOOR_FAMILY_SPECS: Record<DoorFamily, DoorSpec> = {
  formal: { widthMetres: 4.0, heightMetres: 5.4, thresholdMetres: 1.4, treads: 5 },
  civic: { widthMetres: 2.6, heightMetres: 3.0, thresholdMetres: 0.25, treads: 1 },
  residential: { widthMetres: 2.2, heightMetres: 3.0, thresholdMetres: 0.3, treads: 1 },
  service: { widthMetres: 1.6, heightMetres: 2.6, thresholdMetres: 0.15, treads: 1 },
  shopfront: { widthMetres: 6.0, heightMetres: 3.4, thresholdMetres: 0, treads: 0 },
  canopy: { widthMetres: 8.0, heightMetres: 4.2, thresholdMetres: 0, treads: 0 },
};

export interface DoorDimensions {
  family: DoorFamily;
  widthTiles: number;
  height: number;
  threshold: number;
  treads: number;
}

export function doorDimensions(family: DoorFamily): DoorDimensions {
  const d = DOOR_FAMILY_SPECS[family];
  return {
    family,
    widthTiles: across(d.widthMetres),
    height: up(d.heightMetres),
    threshold: up(d.thresholdMetres),
    treads: d.treads,
  };
}

export function doorOf(def: BuildingDef): DoorDimensions | null {
  return def.door ? doorDimensions(def.door) : null;
}

export const TREAD_DEPTH = across(0.42);
export const STEP_OVERHANG = across(0.8);

// ---------------------------------------------------------------------
// THE ACADEMIC HALL'S VOCABULARY, as real dimensions.
// ---------------------------------------------------------------------

export const PLINTH = up(0.7);
export const CORNICE = up(1.05);
export const PAVILION_DEPTH = across(1.9);
export const PAVILION_BAYS = 4;
export const PAVILION_RISE = up(2.1);
export const PEDIMENT_RISE = up(2.9);
export const PORTICO_COLUMNS = 4;
export const PORTICO_HEIGHT = up(10.4);
export const PORTICO_COLUMN_PLAN = across(1.4);
export const ARCADE_HEIGHT = up(7.2);
export const ARCADE_DEPTH = across(2.6);
export const ARCADE_PIER = across(0.75);
export const ARCADE_BAY_METRES = 6.0;
export const ARCADE_MAX = 10;
export const CAMPANILE_PLAN = across(7.0);
export const CAMPANILE_RISE = up(13.0);
export const CAMPANILE_BELFRY_RISE = up(5.0);
export const CAMPANILE_CAP_RISE = up(4.4);
export const CORE_PLAN = across(6.0);
export const CORE_RISE = up(15.0);
export const CORE_CAP_RISE = up(2.4);
export const PORCH_HEIGHT_FRACTION = 0.66;
export const PORCH_GABLE_RISE = up(6.0);
export const PORCH_ARCH_WIDTH = 0.36;
export const PORCH_ARCH_HEIGHT = 0.66;
export const BUTTRESS_PLAN = across(1.15);
export const BUTTRESS_SETOFF_FRACTION = 0.58;
export const BUTTRESS_SETOFF_DEPTH = 0.45;
export const PORTICO_STANDOFF = across(0.4);
export const ENTABLATURE = up(1.5);
export const END_PAVILION_PLAN = across(12.0);
export const END_PAVILION_RISE = up(1.9);
export const END_PAVILION_DEPTH = across(4.0);
export const COPING = up(0.45);
export const COPING_OVERHANG = across(0.35);

// THE CLOCK TOWER: the campus's one landmark.
export function hasClockTower(def: BuildingDef): boolean {
  return def.landmark === true;
}

export const TOWER_BASE_PLAN = across(11);
export const TOWER_BASE_RISE = up(12.5);
export const TOWER_DRUM_PLAN = across(8);
export const TOWER_DRUM_RISE = up(3.6);
export const TOWER_DOME_RISE = up(5.2);
export const TOWER_FINIAL_RISE = up(3.0);
export const TOWER_BELFRY_PLAN = across(8.4);
export const TOWER_BELFRY_RISE = up(5.4);
export const TOWER_SPIRE_RISE = up(17.0);
export const TOWER_PINNACLE_PLAN = across(1.5);
export const TOWER_PINNACLE_RISE = up(4.2);
const CLOCK_RADIUS_METRES = 2.1;
export const CLOCK_RADIUS = up(CLOCK_RADIUS_METRES);
export const CLOCK_RADIUS_TILES = across(CLOCK_RADIUS_METRES);

export const BASE_COURSE = up(0.55);
export const EAVES_COURSE = up(0.5);
export const COLONNADE_HEIGHT = up(8.2);
export const COLONNADE_BAY_METRES = 6.5;
export const COLONNADE_MAX = 9;
export const PIER_WIDTH_METRES = 1.1;
export const PIER_PROJECTION = across(0.5);
export const CANOPY_DEPTH = across(2.6);
export const CANOPY_SLAB = up(0.45);
export const CANOPY_POST = across(0.35);

// ---------------------------------------------------------------------
// MATERIALS. What a building is MADE of: a wall and a roof, from the
// campus's motif's own set.
// ---------------------------------------------------------------------

export interface Material {
  wall: string;
  roof: string;
}
export type MaterialSet = Record<MaterialKey, Material>;

const SLATE = '#5f6b5f';
const DECK = '#7c8377';
const PAINTED_SASH = 'rgba(255, 253, 246, 0.5)';
const GEORGIAN_GILT = '#c9a227';

export interface StonePalette {
  trim: string; // NO_STONE when the motif has no applied stonework
  gilt: string;
  towerStone: string;
  glass: string;
}
export const NO_STONE = 'none';

export interface MotifRoof {
  ridgeMetres: Partial<Record<Form, number>>;
  residentialRidgeMetres(storeys: number): number;
  parapet: number;
  eavesMetres?: number;
}

export type WindowShape = 'rect' | 'arched' | 'lancet' | 'slot' | 'ribbon';

export type EntrancePart =
  'portico' | 'colonnade' | 'canopy' | 'porch' | 'arcade' | 'archway' | 'recess' | 'none';
export type RooflineEndPart = 'pavilion' | 'none';
export type ApexPart = 'cupola' | 'spire' | 'campanile' | 'dome' | 'core' | 'none';

export interface MotifParts {
  entrance: Partial<Record<Form, EntrancePart>>;
  rooflineEnd: RooflineEndPart;
  apex: ApexPart;
  hood?: boolean;
  chimneys?: boolean;
  dormers?: boolean;
  bellGable?: boolean;
  buttresses?: boolean;
  turrets?: boolean;
  crenellations?: boolean;
  pairedLights?: boolean;
  grandPortico?: boolean;
  balustrade?: boolean;
  glazedCivic?: boolean;
}

export interface MotifStyle {
  materials: MaterialSet;
  stone: StonePalette;
  roof: MotifRoof;
  windowShape: WindowShape;
  parts: MotifParts;
}

const INVARIANT = {
  render: { wall: '#b0a992', roof: DECK },
  curtain: { wall: '#93a9b4', roof: DECK },
  clinical: { wall: '#eef1f2', roof: '#c2ccd1' },
} as const;

const GEORGIAN: MotifStyle = {
  materials: {
    brickRed: { wall: '#a2564a', roof: SLATE },
    brickBuff: { wall: '#bb9468', roof: SLATE },
    limestone: { wall: '#d8cdb4', roof: DECK },
    brickDark: { wall: '#6d4b3c', roof: DECK },
    ...INVARIANT,
  },
  stone: { trim: '#efe9da', gilt: GEORGIAN_GILT, towerStone: '#e4dcc8', glass: PAINTED_SASH },
  roof: {
    ridgeMetres: { hall: 2.2, pavilion: 2.0 },
    residentialRidgeMetres: (storeys) => (storeys <= 3 ? 4.2 : storeys <= 5 ? 2.4 : 2.2),
    parapet: up(0.85),
  },
  windowShape: 'rect',
  parts: {
    entrance: { hall: 'portico', portico: 'colonnade', pavilion: 'canopy', residential: 'canopy' },
    rooflineEnd: 'pavilion',
    apex: 'cupola',
    chimneys: true,
  },
};

const GOTHIC_SLATE = '#5a6270';
const GOTHIC: MotifStyle = {
  materials: {
    brickRed: { wall: '#8a8b86', roof: GOTHIC_SLATE },
    brickBuff: { wall: '#b8975f', roof: GOTHIC_SLATE },
    limestone: { wall: '#cbc5b0', roof: DECK },
    brickDark: { wall: '#585448', roof: DECK },
    ...INVARIANT,
  },
  stone: { trim: '#e6e3d6', gilt: '#b9bcc4', towerStone: '#d9d5c4', glass: PAINTED_SASH },
  roof: {
    ridgeMetres: { hall: 13.0, pavilion: 5.0 },
    residentialRidgeMetres: (storeys) => (storeys <= 3 ? 7.5 : 6.5),
    parapet: 0,
  },
  windowShape: 'lancet',
  parts: {
    entrance: { hall: 'porch', portico: 'colonnade', pavilion: 'canopy', residential: 'canopy' },
    rooflineEnd: 'none',
    apex: 'spire',
    hood: true,
    chimneys: true,
    dormers: true,
    buttresses: true,
    turrets: true,
    crenellations: true,
    pairedLights: true,
  },
};

const COPPER_GREEN = '#5f7a63';
const CLASSICAL: MotifStyle = {
  materials: {
    brickRed: { wall: '#d6cfbb', roof: COPPER_GREEN },
    brickBuff: { wall: '#9e5a48', roof: COPPER_GREEN },
    limestone: { wall: '#c9a86a', roof: DECK },
    brickDark: { wall: '#6e3f36', roof: DECK },
    ...INVARIANT,
  },
  stone: { trim: '#f3eee1', gilt: GEORGIAN_GILT, towerStone: '#e9e2d0', glass: PAINTED_SASH },
  roof: {
    ridgeMetres: { hall: 2.4, pavilion: 2.0 },
    residentialRidgeMetres: (storeys) => (storeys <= 3 ? 4.2 : 2.4),
    parapet: up(0.85),
  },
  windowShape: 'rect',
  parts: {
    entrance: {
      hall: 'portico',
      portico: 'colonnade',
      pavilion: 'portico',
      residential: 'portico',
    },
    rooflineEnd: 'none',
    apex: 'dome',
    grandPortico: true,
    balustrade: true,
  },
};

const CLAY_TILE = '#9c4f3a';
const MISSION: MotifStyle = {
  materials: {
    brickRed: { wall: '#e3d6b6', roof: CLAY_TILE },
    brickBuff: { wall: '#b98763', roof: CLAY_TILE },
    limestone: { wall: '#d4b276', roof: DECK },
    brickDark: { wall: '#5f5347', roof: CLAY_TILE },
    ...INVARIANT,
  },
  stone: { trim: '#fbf4e2', gilt: '#b08d3f', towerStone: '#ece0c4', glass: PAINTED_SASH },
  roof: {
    ridgeMetres: { hall: 3.4, pavilion: 3.0 },
    residentialRidgeMetres: (storeys) => (storeys <= 3 ? 3.6 : 3.0),
    parapet: 0,
    eavesMetres: 0.9,
  },
  windowShape: 'arched',
  parts: {
    entrance: { hall: 'arcade', portico: 'arcade', pavilion: 'arcade', residential: 'archway' },
    rooflineEnd: 'none',
    apex: 'campanile',
    bellGable: true,
  },
};

const MODERN: MotifStyle = {
  materials: {
    brickRed: { wall: '#dcd9cf', roof: DECK },
    brickBuff: { wall: '#b5623f', roof: DECK },
    limestone: { wall: '#5f7d8c', roof: '#c2ccd1' },
    brickDark: { wall: '#4d4f52', roof: DECK },
    ...INVARIANT,
  },
  stone: { trim: NO_STONE, gilt: NO_STONE, towerStone: '#e8e6df', glass: 'rgba(40, 60, 75, 0.7)' },
  roof: { ridgeMetres: {}, residentialRidgeMetres: () => 0, parapet: up(0.6) },
  windowShape: 'ribbon',
  parts: {
    entrance: { hall: 'canopy', portico: 'canopy', pavilion: 'canopy', residential: 'canopy' },
    rooflineEnd: 'none',
    apex: 'core',
    glazedCivic: true,
  },
};

export const MOTIF_STYLES: Readonly<Record<Motif, MotifStyle>> = {
  georgian: GEORGIAN,
  gothic: GOTHIC,
  classical: CLASSICAL,
  mission: MISSION,
  modern: MODERN,
};

export function styleFor(m: Motif): MotifStyle {
  return MOTIF_STYLES[m];
}
export function stoneFor(m: Motif): StonePalette {
  return MOTIF_STYLES[m].stone;
}
export function hasTrim(m: Motif): boolean {
  return stoneFor(m).trim !== NO_STONE;
}
export function hasGilt(m: Motif): boolean {
  return stoneFor(m).gilt !== NO_STONE;
}
export function partsFor(m: Motif): MotifParts {
  return MOTIF_STYLES[m].parts;
}
export function parapetOf(m: Motif): number {
  return MOTIF_STYLES[m].roof.parapet;
}
export function eavesOf(m: Motif): number {
  return across(MOTIF_STYLES[m].roof.eavesMetres ?? 0);
}

export function materialOf(def: BuildingDef, m: Motif): Material {
  return MOTIF_STYLES[m].materials[def.material];
}

export function ridgeOf(def: BuildingDef, m: Motif): number {
  const roof = MOTIF_STYLES[m].roof;
  if (def.form === 'residential') return up(roof.residentialRidgeMetres(storeysOf(def)));
  return up(roof.ridgeMetres[def.form] ?? 0);
}

export function paneShapeOf(def: BuildingDef, m: Motif): WindowShape {
  return variesByMotif(def.form) ? MOTIF_STYLES[m].windowShape : 'rect';
}

export function entrancePartOf(def: BuildingDef, m: Motif): EntrancePart {
  if (!variesByMotif(def.form)) return 'none';
  return partsFor(m).entrance[def.form] ?? 'none';
}

export function rooflineEndPartOf(m: Motif): RooflineEndPart {
  return partsFor(m).rooflineEnd;
}
export function apexPartOf(m: Motif): ApexPart {
  return partsFor(m).apex;
}

// Neighbouring residence halls should not be identical: the same brick,
// nudged a few percent either way off the placement's id.
const SHADE_STEPS = [0.94, 1.0, 1.06, 1.11];
export function wallShadeOf(def: BuildingDef, placementId: string): number {
  if (def.form !== 'residential') return 1;
  let h = 0;
  for (let i = 0; i < placementId.length; i++) h = (h * 31 + placementId.charCodeAt(i)) % 1000003;
  return SHADE_STEPS[h % SHADE_STEPS.length]!;
}

// ---------------------------------------------------------------------
// THE OPENING ITSELF, as a closed outline in the wall face's own (u, v).
// ---------------------------------------------------------------------

const ARCH_SPRING = 0.66;
const ARCH_STEPS = 6;
const SLOT_INSET = 0.22;
const RIBBON_HEIGHT = 0.46;
const RIBBON_DROP = 0.3;

export function windowOutline(
  shape: WindowShape,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): Array<[number, number]> {
  const uc = (u0 + u1) / 2;
  const half = (u1 - u0) / 2;
  switch (shape) {
    case 'rect':
      return [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ];
    case 'arched': {
      const spring = v0 + (v1 - v0) * ARCH_SPRING;
      const head: Array<[number, number]> = [];
      for (let i = 0; i <= ARCH_STEPS; i++) {
        const a = Math.PI * (i / ARCH_STEPS);
        head.push([uc + half * Math.cos(a), spring + (v1 - spring) * Math.sin(a)]);
      }
      return [[u0, v0], [u1, v0], [u1, spring], ...head.slice(1, ARCH_STEPS), [u0, spring]];
    }
    case 'lancet': {
      const spring = v0 + (v1 - v0) * ARCH_SPRING;
      return [
        [u0, v0],
        [u1, v0],
        [u1, spring],
        [uc, v1],
        [u0, spring],
      ];
    }
    case 'slot': {
      const i = half * SLOT_INSET;
      return [
        [u0 + i, v0],
        [u1 - i, v0],
        [u1 - i, v1],
        [u0 + i, v1],
      ];
    }
    case 'ribbon': {
      const span = v1 - v0;
      const lo = v0 + span * RIBBON_DROP;
      return [
        [u0, lo],
        [u1, lo],
        [u1, lo + span * RIBBON_HEIGHT],
        [u0, lo + span * RIBBON_HEIGHT],
      ];
    }
  }
}
