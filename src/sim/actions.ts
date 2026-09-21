import { buildingById, findBuilding } from '../content/buildings.ts';
import { emit } from './bus.ts';
import {
  FOUNDERS_HALL_ID,
  footprintIsClear,
  footprintTiles,
  hasFoundersHall,
  orientedFootprint,
  tileIsOpen,
  type Placement,
} from './campus.ts';
import { isValidName, MOTIFS, type Motif, type SchoolColors } from './identity.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';
import { tileKey, TREE_SEED_RANGE } from './terrain.ts';
import { approveBudget } from './treasury.ts';

// Player (and debug) intent, as data. Actions are what the action log
// records; the sim replays a run from its seed and this log alone (DD §15),
// so an action must carry everything the reducer needs and nothing that
// depends on the UI.

export const PAINT_TOOLS = ['path', 'erasePath', 'plant', 'fell'] as const;
export type PaintTool = (typeof PAINT_TOOLS)[number];

export type Action =
  | { type: 'found'; name: string; motif: Motif; paletteId: string; colors: SchoolColors }
  | { type: 'placeBuilding'; buildingId: string; col: number; row: number; rotated: boolean }
  | { type: 'demolish'; placementId: string }
  | { type: 'paint'; tool: PaintTool; col: number; row: number }
  // Resolves the calendar beat holding the clock (beats.ts), carrying the
  // beat's decision. Every field is optional: absent, the beat resolves to
  // its stated default (DD §3.3). Budget & Hiring: the endowment draw rate
  // for next year's budget (DD §5.1).
  | { type: 'resolveBeat'; beatId: string; drawRate?: number }
  | { type: 'debug/mark'; label: string };

export type ActionType = Action['type'];

type Verdict = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Verdict => ({ ok: false, reason });
const YES: Verdict = { ok: true };

// Whether the reducer would accept this action in this state, with the
// reason when it would not. The UI asks before dispatching so that the log
// only ever holds actions that were applied; the reducer asks again so a
// replayed or hand-edited log cannot smuggle one through.
export function canApply(state: GameState, action: Action): Verdict {
  switch (action.type) {
    case 'found': {
      if (state.phase !== 'founding') return no('already founded');
      if (!isValidName(action.name)) return no('name is empty or too long');
      if (!MOTIFS.includes(action.motif)) return no(`unknown motif ${action.motif}`);
      return YES;
    }
    case 'placeBuilding': {
      if (state.phase === 'founding') return no('not founded yet');
      const def = findBuilding(action.buildingId);
      if (!def) return no(`unknown building ${action.buildingId}`);
      const isFounders = def.id === FOUNDERS_HALL_ID;
      // The founding moment (DD §2.4): Founders Hall is the first thing on
      // the land, and there is only ever one.
      if (state.phase === 'siting' && !isFounders) return no('place Founders Hall first');
      if (isFounders && hasFoundersHall(state.campus)) return no('Founders Hall already stands');
      const { w, h } = orientedFootprint(def.footprint, action.rotated);
      if (!footprintIsClear(state.campus, action.col, action.row, w, h)) {
        return no('footprint is off the parcel, on water or road, or occupied');
      }
      return YES;
    }
    case 'demolish': {
      if (state.phase !== 'running') return no('nothing to demolish yet');
      if (!state.campus.placements.some((p) => p.id === action.placementId))
        return no('no such building');
      return YES;
    }
    case 'paint': {
      if (state.phase !== 'running') return no('the campus is not open yet');
      const { col, row, tool } = action;
      const key = tileKey(col, row);
      const isPath = state.campus.paths.includes(key);
      const hasTree = key in state.campus.trees;
      switch (tool) {
        case 'path':
          if (!tileIsOpen(state.campus, col, row)) return no('cannot pave here');
          if (isPath) return no('already paved');
          return YES;
        case 'erasePath':
          return isPath ? YES : no('no path here');
        case 'plant':
          if (!tileIsOpen(state.campus, col, row)) return no('cannot plant here');
          if (isPath) return no('paved');
          if (hasTree) return no('a tree already stands here');
          return YES;
        case 'fell':
          return hasTree ? YES : no('no tree here');
      }
      return no('unknown tool');
    }
    case 'resolveBeat':
      if (state.pendingBeat === null) return no('no beat is waiting');
      if (state.pendingBeat !== action.beatId)
        return no(`${action.beatId} is not the pending beat`);
      return YES;
    case 'debug/mark':
      return YES;
  }
}

export function applyAction(state: GameState, action: Action): GameState {
  if (!canApply(state, action).ok) return state;
  switch (action.type) {
    case 'found': {
      const name = action.name.trim();
      return emit(
        {
          ...state,
          phase: 'siting',
          identity: {
            name,
            motif: action.motif,
            paletteId: action.paletteId,
            colors: { ...action.colors },
          },
        },
        { kind: 'founded', name, motif: action.motif },
      );
    }
    case 'placeBuilding': {
      const def = buildingById(action.buildingId);
      const { w, h } = orientedFootprint(def.footprint, action.rotated);
      const covered = new Set(footprintTiles(action.col, action.row, w, h));
      const trees = { ...state.campus.trees };
      for (const key of covered) delete trees[key];
      const placement: Placement = {
        id: `p${state.campus.nextPlacementId}`,
        buildingId: def.id,
        col: action.col,
        row: action.row,
        w,
        h,
      };
      const opening = state.phase === 'siting';
      let next = emit(
        {
          ...state,
          phase: opening ? 'running' : state.phase,
          campus: {
            placements: [...state.campus.placements, placement],
            paths: state.campus.paths.filter((k) => !covered.has(k)),
            trees,
            nextPlacementId: state.campus.nextPlacementId + 1,
          },
        },
        { kind: 'buildingPlaced', placementId: placement.id, buildingId: def.id },
      );
      // The founding moment (DD §2.4): Founders Hall standing is what opens
      // the doors, and the clock starts with it.
      if (opening) next = emit(next, { kind: 'doorsOpened', placementId: placement.id });
      return next;
    }
    case 'demolish': {
      const gone = state.campus.placements.find((p) => p.id === action.placementId)!;
      return emit(
        {
          ...state,
          campus: {
            ...state.campus,
            placements: state.campus.placements.filter((p) => p.id !== action.placementId),
          },
        },
        { kind: 'buildingDemolished', placementId: gone.id, buildingId: gone.buildingId },
      );
    }
    case 'paint': {
      const key = tileKey(action.col, action.row);
      const campus = state.campus;
      switch (action.tool) {
        case 'path':
          return { ...state, campus: { ...campus, paths: [...campus.paths, key] } };
        case 'erasePath':
          return { ...state, campus: { ...campus, paths: campus.paths.filter((k) => k !== key) } };
        case 'plant': {
          // The seed comes off the sim's own stream, so a replay plants the
          // same tree.
          const rng = Rng.fromState(state.rng);
          const seed = rng.int(0, TREE_SEED_RANGE - 1);
          return {
            ...state,
            rng: rng.snapshot(),
            campus: { ...campus, trees: { ...campus.trees, [key]: seed } },
          };
        }
        case 'fell': {
          const trees = { ...campus.trees };
          delete trees[key];
          return { ...state, campus: { ...campus, trees } };
        }
      }
      return state;
    }
    case 'resolveBeat': {
      let next = state;
      if (action.beatId === 'budget-and-hiring') next = approveBudget(next, action.drawRate);
      return emit({ ...next, pendingBeat: null }, { kind: 'beatResolved', beatId: action.beatId });
    }
    case 'debug/mark':
      return emit(state, { kind: 'mark', label: action.label });
  }
}
