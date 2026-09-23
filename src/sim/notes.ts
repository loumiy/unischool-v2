import { NOTES, type NoteDef } from '../content/notes.ts';
import { campusCapacity } from './people.ts';
import { conditionsOf, pendingInline } from './events.ts';
import { unassignedFaculty } from './faculty.ts';
import { landScarce } from './lateGame.ts';
import { provostAppointed } from './seats.ts';
import type { GameState } from './state.ts';

// ONBOARDING BY CONSEQUENCE (DD §13.2, Phase 29). Which note is due: the
// first the player has not read whose moment has come. Nothing here holds
// the clock or changes a number; reading one is an action so the save
// remembers it.

export interface Onboarding {
  seen: string[];
}

export function foundingOnboarding(): Onboarding {
  return { seen: [] };
}

function momentHas(state: GameState, note: NoteDef): boolean {
  if (note.afterWeek !== undefined && state.clock.absoluteWeek < note.afterWeek) return false;
  if (note.beat !== undefined && state.pendingBeat !== note.beat) return false;
  switch (note.special) {
    case 'noBeds':
      if (campusCapacity(state).beds > 200) return false;
      break;
    case 'eventPending':
      if (!pendingInline(state)) return false;
      break;
    case 'unassigned':
      if (state.faculty.marketOpen || unassignedFaculty(state).length < 2) return false;
      break;
    case 'noProvost':
      if (provostAppointed(state)) return false;
      break;
    case 'hasTag':
      if (state.perception.tags.length === 0) return false;
      break;
    case 'landScarce':
      if (!landScarce(state.campus)) return false;
      break;
  }
  return conditionsOf(state, note.when);
}

export function dueNote(state: GameState): NoteDef | null {
  if (state.phase !== 'running') return null;
  const seen = new Set(state.onboarding.seen);
  return NOTES.find((n) => !seen.has(n.id) && momentHas(state, n)) ?? null;
}

export function dismissNote(state: GameState, id: string): GameState {
  if (state.onboarding.seen.includes(id)) return state;
  return { ...state, onboarding: { seen: [...state.onboarding.seen, id] } };
}
