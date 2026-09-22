import type { Term } from './calendar.ts';
import type { Motif } from './identity.ts';
import type { GameState } from './state.ts';

// THE EVENT BUS (plan Phase 4): the sim's journal of everything notable,
// kept in state and stamped with the week it happened. Not a pub/sub bus
// with listeners — the sim is a pure function and has nothing to call —
// but a log the sim appends to as it goes, which is the same thing for a
// pure system: anything that wants to react reads the tail. The ticker
// reads its last line; the event engine (Ph.17), class memory (Ph.16) and
// the chronicle (Ph.26) read the stretch they care about.
//
// An entry is typed data, never prose: the words for it live in
// content/bus-lines.json (DD §15, writing lives in content files), so the
// same entry can be a ticker line today and a chronicle sentence later.

export type BusEvent =
  | { kind: 'founded'; name: string; motif: Motif }
  | { kind: 'doorsOpened'; placementId: string } // Founders Hall stands; the clock starts
  | { kind: 'buildingPlaced'; placementId: string; buildingId: string }
  | { kind: 'buildingDemolished'; placementId: string; buildingId: string }
  | { kind: 'buildingCompleted'; placementId: string; buildingId: string }
  | { kind: 'renovationBegun'; placementId: string; buildingId: string }
  | { kind: 'renovated'; placementId: string; buildingId: string }
  | { kind: 'termBegan'; year: number; term: Term }
  | { kind: 'yearTurned'; year: number }
  | { kind: 'beatFired'; beatId: string }
  | { kind: 'beatResolved'; beatId: string }
  | { kind: 'budgetApproved'; year: number; drawRate: number }
  | {
      kind: 'admissionsClosed';
      year: number;
      applicants: number;
      admitted: number;
      size: number;
      capped: boolean;
    }
  | {
      kind: 'classArrived';
      classYear: number;
      size: number;
      quality: number;
      triples: number;
      // Everyone on the books once they arrived, so the journal records
      // how crowded the place was and not just by how many.
      enrolled: number;
    }
  | { kind: 'studentsLeft'; count: number }
  | { kind: 'studentsNamed'; classYear: number; names: string[] }
  | { kind: 'classRemembered'; classYear: number }
  | { kind: 'reunionHeld'; classYear: number; warmth: number }
  | { kind: 'eventFired'; eventId: string; instanceId: string }
  | { kind: 'eventResolved'; eventId: string; choiceId: string; timedOut: boolean }
  // Ambitions (DD §10.2): offered at a Convocation, answered there, and
  // read out at the Convocation its date falls on.
  | { kind: 'ambitionOffered'; ambitionId: string }
  | { kind: 'ambitionAccepted'; ambitionId: string; dueYear: number }
  | { kind: 'ambitionDeclined'; ambitionId: string }
  | { kind: 'ambitionSettled'; ambitionId: string; kept: boolean }
  | { kind: 'studentBeat'; studentId: string; arcId: string }
  | {
      kind: 'classGraduated';
      classYear: number;
      size: number;
      distinguished: number;
      adrift: number;
    }
  | { kind: 'schoolFounded'; schoolId: string; buildingId: string; placementId: string }
  | { kind: 'programOpened'; programId: string }
  | { kind: 'programClosed'; programId: string }
  | { kind: 'advancementBegun'; programId: string; tier: string }
  | { kind: 'programAdvanced'; programId: string; tier: string }
  | { kind: 'advancementStalled'; programId: string; tier: string }
  | { kind: 'programDecayed'; programId: string; tier: string; signature: boolean }
  | { kind: 'signatureNamed'; programId: string }
  | { kind: 'signatureDropped'; programId: string }
  | { kind: 'marketOpened'; count: number }
  | { kind: 'marketClosed'; count: number } // candidates who took other offers
  | { kind: 'facultyHired'; facultyId: string; name: string; programId: string | null }
  | { kind: 'facultyDismissed'; facultyId: string; name: string }
  | { kind: 'termClosed'; year: number; term: Term; net: number }
  | { kind: 'rungChanged'; from: number; to: number }
  | { kind: 'boardLetter'; letter: string }
  | { kind: 'cutsImposed'; cuts: string[] }
  | { kind: 'yearClosed'; year: number; net: number }
  | { kind: 'mark'; label: string }; // the debug panel's marker

export type BusKind = BusEvent['kind'];

// Every kind, so content can be checked for a line per kind at load.
export const BUS_KINDS: readonly BusKind[] = [
  'founded',
  'doorsOpened',
  'buildingPlaced',
  'buildingDemolished',
  'buildingCompleted',
  'renovationBegun',
  'renovated',
  'termBegan',
  'yearTurned',
  'beatFired',
  'beatResolved',
  'budgetApproved',
  'admissionsClosed',
  'classArrived',
  'studentsLeft',
  'studentsNamed',
  'classRemembered',
  'reunionHeld',
  'eventFired',
  'eventResolved',
  'ambitionOffered',
  'ambitionAccepted',
  'ambitionDeclined',
  'ambitionSettled',
  'studentBeat',
  'classGraduated',
  'schoolFounded',
  'programOpened',
  'programClosed',
  'advancementBegun',
  'programAdvanced',
  'advancementStalled',
  'programDecayed',
  'signatureNamed',
  'signatureDropped',
  'marketOpened',
  'marketClosed',
  'facultyHired',
  'facultyDismissed',
  'termClosed',
  'rungChanged',
  'boardLetter',
  'cutsImposed',
  'yearClosed',
  'mark',
];

export type BusEntry = { seq: number; week: number } & BusEvent;

// Append one entry, stamped with the current week. `seq` is the entry's
// identity for the life of the run: it survives a trimmed tail, which an
// array index would not.
export function emit(state: GameState, event: BusEvent): GameState {
  const last = state.bus[state.bus.length - 1];
  const entry = { seq: (last?.seq ?? 0) + 1, week: state.clock.absoluteWeek, ...event } as BusEntry;
  return { ...state, bus: [...state.bus, entry] };
}

export function lastEntry(state: GameState): BusEntry | null {
  return state.bus[state.bus.length - 1] ?? null;
}

// Entries from `fromWeek` (inclusive) to `toWeek` (inclusive), oldest
// first: the shape a four-year class memory or an era wants.
export function entriesBetween(state: GameState, fromWeek: number, toWeek: number): BusEntry[] {
  return state.bus.filter((e) => e.week >= fromWeek && e.week <= toWeek);
}

export function entriesOfKind<K extends BusKind>(
  state: GameState,
  kind: K,
): Extract<BusEntry, { kind: K }>[] {
  return state.bus.filter((e): e is Extract<BusEntry, { kind: K }> => e.kind === kind);
}
