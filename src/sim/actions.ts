import { FOUNDERS_HALL_ID, footprintIsClear, foundersHallFootprint } from './campus.ts';
import { isValidName, MOTIFS, type Motif, type SchoolColors } from './identity.ts';
import type { GameState } from './state.ts';

// Player (and debug) intent, as data. Actions are what the action log
// records; the sim replays a run from its seed and this log alone (DD §15),
// so an action must carry everything the reducer needs and nothing that
// depends on the UI.
export type Action =
  | { type: 'found'; name: string; motif: Motif; paletteId: string; colors: SchoolColors }
  | { type: 'placeFoundersHall'; col: number; row: number }
  | { type: 'debug/mark'; label: string };

export type ActionType = Action['type'];

// Whether the reducer would accept this action in this state, with the
// reason when it would not. The UI asks before dispatching so that the log
// only ever holds actions that were applied; the reducer asks again so a
// replayed or hand-edited log cannot smuggle one through.
export function canApply(
  state: GameState,
  action: Action,
): { ok: true } | { ok: false; reason: string } {
  switch (action.type) {
    case 'found': {
      if (state.phase !== 'founding') return { ok: false, reason: 'already founded' };
      if (!isValidName(action.name)) return { ok: false, reason: 'name is empty or too long' };
      if (!MOTIFS.includes(action.motif))
        return { ok: false, reason: `unknown motif ${action.motif}` };
      return { ok: true };
    }
    case 'placeFoundersHall': {
      if (state.phase !== 'siting') return { ok: false, reason: 'not siting Founders Hall' };
      const { w, h } = foundersHallFootprint();
      if (!footprintIsClear(state.campus, action.col, action.row, w, h)) {
        return { ok: false, reason: 'footprint is off the parcel or occupied' };
      }
      return { ok: true };
    }
    case 'debug/mark':
      return { ok: true };
  }
}

export function applyAction(state: GameState, action: Action): GameState {
  if (!canApply(state, action).ok) return state;
  switch (action.type) {
    case 'found':
      return {
        ...state,
        phase: 'siting',
        identity: {
          name: action.name.trim(),
          motif: action.motif,
          paletteId: action.paletteId,
          colors: { ...action.colors },
        },
      };
    case 'placeFoundersHall': {
      const { w, h } = foundersHallFootprint();
      return {
        ...state,
        phase: 'running',
        campus: {
          ...state.campus,
          placements: [
            ...state.campus.placements,
            {
              id: FOUNDERS_HALL_ID,
              buildingId: FOUNDERS_HALL_ID,
              col: action.col,
              row: action.row,
              w,
              h,
            },
          ],
        },
      };
    }
    case 'debug/mark':
      return {
        ...state,
        marks: [...state.marks, { week: state.clock.absoluteWeek, label: action.label }],
      };
  }
}
