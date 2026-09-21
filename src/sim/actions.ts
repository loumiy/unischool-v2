import type { GameState } from './state.ts';

// Player (and debug) intent, as data. Actions are what the action log
// records; the sim replays a run from its seed and this log alone (DD §15),
// so an action must carry everything the reducer needs and nothing that
// depends on the UI.
export type Action = { type: 'debug/mark'; label: string };

export type ActionType = Action['type'];

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'debug/mark':
      return {
        ...state,
        marks: [...state.marks, { week: state.clock.absoluteWeek, label: action.label }],
      };
  }
}
