import {
  buildingById,
  FURNITURE_FORMS,
  type BuildingDef,
  type Capacity,
} from '../content/buildings.ts';
import {
  EXTEND_COST_SHARE,
  EXTEND_MAX_STOREYS,
  EXTEND_WEEKS,
  HISTORIC_AGE,
  HISTORIC_CHANCE,
  HISTORIC_FOUNDERS_CHANCE,
  HISTORIC_MEMORY_CHANCE,
  HISTORIC_QUAD_CHANCE,
  LAND_SCARCE_SHARE,
} from '../tuning.ts';
import { emit } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { FOUNDERS_HALL_ID, type Campus, type Placement } from './campus.ts';
import { detectQuads } from './quads.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';
import { GRID_HEIGHT, GRID_WIDTH, TERRAIN, tileKey } from './terrain.ts';

// THE FULL-CANVAS LATE GAME (DD §6.5–§6.6, Phase 25). Around years 25–35
// a healthy college fills the land, and building turns to rebuilding:
// buildings go up a storey or two instead of out; the ones that have stood
// long enough become Historic, and taking one down is an argument with
// the college's own past; and the Build menu turns to face the estate
// when there is little ground left to break.

// ---------- going up instead of out ----------

// Forms that can take another storey: anything with floors to add to.
export function canTakeStoreys(def: BuildingDef): boolean {
  return (
    def.storeys > 0 &&
    !FURNITURE_FORMS.includes(def.form) &&
    def.form !== 'hangar' &&
    def.form !== 'grounds' &&
    def.form !== 'observatory'
  );
}

export function storeysAdded(p: Pick<Placement, 'storeysAdded'>): number {
  return p.storeysAdded ?? 0;
}

// How much bigger the building is than the catalogue's: its beds, seats,
// meals and upkeep scale with its floors.
export function storeyFactor(p: Pick<Placement, 'buildingId' | 'storeysAdded'>): number {
  const def = buildingById(p.buildingId);
  const added = storeysAdded(p);
  return def.storeys > 0 && added > 0 ? (def.storeys + added) / def.storeys : 1;
}

export function placementCapacity(p: Pick<Placement, 'buildingId' | 'storeysAdded'>): Capacity {
  const c = buildingById(p.buildingId).capacity ?? {};
  const f = storeyFactor(p);
  if (f === 1) return c;
  const scale = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * f));
  return { ...c, beds: scale(c.beds), meals: scale(c.meals), seats: scale(c.seats) };
}

// The catalogue row as this placement stands, for the renderer: the same
// object for the same height, so a memoised motif stays memoised.
const TALLER = new Map<string, BuildingDef>();
export function effectiveDef(p: Pick<Placement, 'buildingId' | 'storeysAdded'>): BuildingDef {
  const def = buildingById(p.buildingId);
  const added = storeysAdded(p);
  if (added === 0) return def;
  const key = `${def.id}+${added}`;
  let taller = TALLER.get(key);
  if (!taller) {
    taller = { ...def, storeys: def.storeys + added };
    TALLER.set(key, taller);
  }
  return taller;
}

export function extensionCost(p: Pick<Placement, 'buildingId'>): number {
  return Math.round(buildingById(p.buildingId).cost * EXTEND_COST_SHARE);
}

export function extensionRefusal(p: Placement): string | null {
  const def = buildingById(p.buildingId);
  if (!canTakeStoreys(def)) return 'it cannot take another storey';
  if (storeysAdded(p) >= EXTEND_MAX_STOREYS) return 'it has gone up as far as it will';
  if (p.status !== 'open') return 'the building is not open';
  return null;
}

// Another storey: paid for, and the building closed while it goes up.
export function extend(state: GameState, placementId: string): GameState {
  const placements = state.campus.placements.map((p) =>
    p.id === placementId
      ? {
          ...p,
          storeysAdded: storeysAdded(p) + 1,
          status: 'renovating' as const,
          completesWeek: state.clock.absoluteWeek + EXTEND_WEEKS,
        }
      : p,
  );
  const target = placements.find((p) => p.id === placementId)!;
  return emit(
    { ...state, campus: { ...state.campus, placements } },
    { kind: 'storeyAdded', placementId, buildingId: target.buildingId },
  );
}

// ---------- Historic ----------

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// The quads the player has named, and the buildings on their edges.
function onNamedQuad(campus: Campus, p: Placement): boolean {
  const named = new Set(Object.keys(campus.quadNames));
  if (named.size === 0) return false;
  for (const q of detectQuads(campus)) {
    if (!named.has(q.key)) continue;
    const tiles = new Set(q.tiles);
    for (let c = p.col - 1; c <= p.col + p.w; c++) {
      if (tiles.has(tileKey(c, p.row - 1)) || tiles.has(tileKey(c, p.row + p.h))) return true;
    }
    for (let r = p.row; r < p.row + p.h; r++) {
      if (tiles.has(tileKey(p.col - 1, r)) || tiles.has(tileKey(p.col + p.w, r))) return true;
    }
  }
  return false;
}

// Buildings that opened while a class that remembers its buildings was
// here: the ones with strong class memories attached (DD §8.4).
function remembered(state: GameState, p: Placement): boolean {
  if (p.openedWeek === null) return false;
  const opened = Math.floor(p.openedWeek / WEEKS_PER_YEAR) + 1;
  return state.people.alumni.some(
    (a) => a.memory.includes('building') && a.classYear - 4 <= opened && opened <= a.classYear,
  );
}

export function historicChance(state: GameState, p: Placement): number {
  let chance = HISTORIC_CHANCE;
  if (p.buildingId === FOUNDERS_HALL_ID) chance += HISTORIC_FOUNDERS_CHANCE;
  if (onNamedQuad(state.campus, p)) chance += HISTORIC_QUAD_CHANCE;
  if (remembered(state, p)) chance += HISTORIC_MEMORY_CHANCE;
  return chance;
}

// Once a year, at the turn: a building of age may be declared Historic.
export function historicYear(state: GameState): GameState {
  const { clock } = state;
  if (clock.week !== 1 || clock.term !== 'fall') return state;
  let s = state;
  for (const p of state.campus.placements) {
    if (p.historic || p.status !== 'open' || p.openedWeek === null) continue;
    const def = buildingById(p.buildingId);
    if (FURNITURE_FORMS.includes(def.form)) continue;
    if (clock.absoluteWeek - p.openedWeek < HISTORIC_AGE * WEEKS_PER_YEAR) continue;
    const rng = Rng.fromSeed((state.seed ^ hashOf(p.id) ^ Math.imul(clock.year, 0x27d4eb2d)) >>> 0);
    if (!rng.chance(historicChance(s, p))) continue;
    s = {
      ...s,
      campus: {
        ...s.campus,
        placements: s.campus.placements.map((q) =>
          q.id === p.id ? { ...q, historic: true, historicSince: clock.year } : q,
        ),
      },
    };
    s = emit(s, { kind: 'becameHistoric', placementId: p.id, buildingId: p.buildingId });
  }
  return s;
}

// ---------- the land ----------

const BUILDABLE = (() => {
  let n = 0;
  for (let r = 0; r < GRID_HEIGHT; r++)
    for (let c = 0; c < GRID_WIDTH; c++) if (!TERRAIN.blocked.has(tileKey(c, r))) n++;
  return n;
})();

// The share of the parcel's buildable ground still free of buildings.
export function freeLandShare(campus: Campus): number {
  const used = campus.placements.reduce((t, p) => t + p.w * p.h, 0);
  return Math.max(0, 1 - used / BUILDABLE);
}

export function landScarce(campus: Campus): boolean {
  return freeLandShare(campus) < LAND_SCARCE_SHARE;
}
