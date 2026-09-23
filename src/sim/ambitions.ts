import { AMBITIONS, ambitionById, type AmbitionDef } from '../content/ambitions.ts';
import { AMBITION_CAP, AMBITION_DEAL_ODDS } from '../tuning.ts';
import { emit } from './bus.ts';
import { applyChoiceEffects, conditionsOf, priceScale, scaledEffects } from './events.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';

// AMBITIONS (DD §10.2): the overreach engine. The college is offered a
// public commitment at Convocation, with a date on it. Declining is free.
// Accepting puts it on the record, and the record is read out at the
// Convocation the date falls on, whatever has happened in between.
//
// Everything here leans on events.ts: the same readings decide whether an
// ambition may be dealt and whether it was kept, and the same levers pay
// for it either way. An ambition is a slow event with a deadline.

export interface ActiveAmbition {
  ambitionId: string;
  acceptedYear: number;
  dueYear: number; // the Convocation it is read out at
}

export interface SettledAmbition {
  ambitionId: string;
  year: number;
  kept: boolean;
}

export interface Ambitions {
  // What is on the table at this Convocation, unanswered.
  offered: string | null;
  active: ActiveAmbition[];
  settled: SettledAmbition[];
  lastDealtYear: number;
}

export function foundingAmbitions(): Ambitions {
  return { offered: null, active: [], settled: [], lastDealtYear: 0 };
}

// ---------- reading the docket ----------

export function activeAmbitions(state: GameState): AmbitionDef[] {
  return state.ambitions.active.map((a) => ambitionById(a.ambitionId));
}

export function yearsLeft(state: GameState, active: ActiveAmbition): number {
  return active.dueYear - state.clock.year;
}

// Whether the promise is true right now — what the Convocation on the due
// date will read, and what the screen shows while it is still open.
export function goalMet(state: GameState, def: AmbitionDef): boolean {
  return conditionsOf(state, def.goal);
}

export function atCap(state: GameState): boolean {
  return state.ambitions.active.length >= AMBITION_CAP;
}

// The pool this college could be offered: never one it holds, never one it
// has already settled either way, never one whose terms it does not meet,
// and never one it has already achieved (that is a report, not a promise).
export function dealable(state: GameState): AmbitionDef[] {
  const held = new Set(state.ambitions.active.map((a) => a.ambitionId));
  const done = new Set(state.ambitions.settled.map((a) => a.ambitionId));
  return AMBITIONS.filter(
    (def) =>
      !held.has(def.id) &&
      !done.has(def.id) &&
      def.id !== state.ambitions.offered &&
      conditionsOf(state, def.deal) &&
      !conditionsOf(state, def.goal),
  );
}

export function pickAmbition(rng: Rng, pool: AmbitionDef[]): AmbitionDef | null {
  if (pool.length === 0) return null;
  const total = pool.reduce((t, a) => t + a.weight, 0);
  let pick = rng.next() * total;
  for (const def of pool) {
    pick -= def.weight;
    if (pick <= 0) return def;
  }
  return pool[pool.length - 1]!;
}

// ---------- the year's turn ----------

// Called when Convocation fires (beats.ts), before the screen opens: the
// promises that came due are read out and paid for, and then — if there is
// room on the docket — one more is put on the table.
export function convocationAmbitions(state: GameState): GameState {
  const s = settleDue(state);
  if (atCap(s) || s.ambitions.offered !== null) return s;
  const rng = Rng.fromState(s.rng);
  if (!rng.chance(AMBITION_DEAL_ODDS)) return { ...s, rng: rng.snapshot() };
  const def = pickAmbition(rng, dealable(s));
  if (!def) return { ...s, rng: rng.snapshot() };
  return emit(
    { ...s, rng: rng.snapshot(), ambitions: { ...s.ambitions, offered: def.id } },
    { kind: 'ambitionOffered', ambitionId: def.id },
  );
}

function settleDue(state: GameState): GameState {
  let s = state;
  for (const active of state.ambitions.active) {
    if (active.dueYear > s.clock.year) continue;
    const def = ambitionById(active.ambitionId);
    const kept = goalMet(s, def);
    s = applyChoiceEffects(s, scaledEffects(kept ? def.reward : def.penalty, priceScale(s)));
    s = emit(
      {
        ...s,
        ambitions: {
          ...s.ambitions,
          active: s.ambitions.active.filter((a) => a.ambitionId !== active.ambitionId),
          settled: [...s.ambitions.settled, { ambitionId: def.id, year: s.clock.year, kept }],
        },
      },
      { kind: 'ambitionSettled', ambitionId: def.id, kept },
    );
  }
  return s;
}

// ---------- the answer ----------

// Answered at the Convocation that offered it (actions.ts): accepting puts
// it on the record with its date; declining takes it off the table and
// costs nothing, which is the whole temptation.
export function answerAmbition(state: GameState, accept: boolean): GameState {
  const offered = state.ambitions.offered;
  if (offered === null) return state;
  const def = ambitionById(offered);
  if (!accept || atCap(state)) {
    return emit(
      { ...state, ambitions: { ...state.ambitions, offered: null } },
      { kind: 'ambitionDeclined', ambitionId: def.id },
    );
  }
  const active: ActiveAmbition = {
    ambitionId: def.id,
    acceptedYear: state.clock.year,
    dueYear: state.clock.year + def.years,
  };
  return emit(
    {
      ...state,
      ambitions: {
        ...state.ambitions,
        offered: null,
        active: [...state.ambitions.active, active],
        lastDealtYear: state.clock.year,
      },
    },
    { kind: 'ambitionAccepted', ambitionId: def.id, dueYear: active.dueYear },
  );
}
