import { CUT_WORDS } from '../content/board.ts';
import {
  AID_CUT_STEP,
  AID_MIN,
  RESTRUCTURE_MOOD,
  AUSTERITY_AFTER_TERMS,
  BOARD_CONFIDENCE_START,
  BOARD_POLICY_DRAW,
  BOARD_POLICY_MAINTENANCE,
  CONFIDENCE_AUSTERITY_LOSS,
  CONFIDENCE_DEFICIT_LOSS,
  CONFIDENCE_FREEZE_LOSS,
  CONFIDENCE_OVERDRAW_LOSS,
  CONFIDENCE_SURPLUS_GAIN,
  CONFIDENCE_TRIPLES_LOSS,
  DEFICIT_TERMS,
  ENDOWMENT_DRAW_PRUDENT,
  RECEIVERSHIP_AFTER_TERMS,
  RECEIVERSHIP_TERMS,
  SURPLUS_TERMS_TO_EXIT,
  TERM_HISTORY,
} from '../tuning.ts';
import { closeProgramIn, newestProgram } from './academics.ts';
import { emit } from './bus.ts';
import type { Term } from './calendar.ts';
import { inTriples } from './people.ts';
import type { GameState } from './state.ts';
import { netOf, sumExpenses, zeroFlows, type Flows } from './treasury.ts';

// THE DISTRESS LADDER (DD §5.5). There is no bankruptcy. Financial failure
// is a ladder of five rungs, each survivable and narratable, climbed down
// and back up a term at a time: Tight, Deficit, Freeze, Austerity,
// Receivership. The board watches every term, its confidence moves, and it
// writes a letter at each step that matters.

export type Rung = 0 | 1 | 2 | 3 | 4 | 5;
export const RUNG_SOUND: Rung = 0;
export const RUNG_TIGHT: Rung = 1;
export const RUNG_DEFICIT: Rung = 2;
export const RUNG_FREEZE: Rung = 3;
export const RUNG_AUSTERITY: Rung = 4;
export const RUNG_RECEIVERSHIP: Rung = 5;

export const AUSTERITY_CUTS = [
  'cutAid',
  'deferMaintenance',
  'closeProgram',
  'restructureAdmin',
] as const;
export type AusterityCut = (typeof AUSTERITY_CUTS)[number];

export interface TermRecord {
  year: number;
  term: Term;
  net: number;
}

export interface Distress {
  rung: Rung;
  termsAtRung: number;
  confidence: number; // 0–100
  term: Flows; // this term so far
  terms: TermRecord[]; // the closed terms, oldest first, capped
  surplusRun: number; // consecutive surplus terms
  deficitRun: number; // consecutive deficit terms
  receivershipTermsLeft: number; // 0 outside receivership
  scars: number[]; // the years receivership began: the chronicle's scars
  pendingLetter: string | null; // a board letter awaiting the player
  cutsTaken: AusterityCut[]; // this spell of austerity
  // The letter awaiting the player also hands maintenance back (Phase 21L).
  maintenanceRestored: boolean;
}

export function foundingDistress(): Distress {
  return {
    rung: RUNG_SOUND,
    termsAtRung: 0,
    confidence: BOARD_CONFIDENCE_START,
    term: zeroFlows(),
    terms: [],
    surplusRun: 0,
    deficitRun: 0,
    receivershipTermsLeft: 0,
    scars: [],
    pendingLetter: null,
    cutsTaken: [],
    maintenanceRestored: false,
  };
}

// One term of budgeted expenses: what "reserves" are measured against.
export function termExpenses(state: GameState): number {
  return Math.round(sumExpenses(state.treasury.budget.expenses) / 3);
}

export function reservesTight(state: GameState): boolean {
  return state.treasury.cash < termExpenses(state);
}

// ---------- what the rungs forbid (DD §5.5) ----------

export function frozen(state: GameState): boolean {
  return state.distress.rung >= RUNG_FREEZE && state.distress.rung < RUNG_RECEIVERSHIP;
}

export function inAusterity(state: GameState): boolean {
  return state.distress.rung >= RUNG_AUSTERITY;
}

export function inReceivership(state: GameState): boolean {
  return state.distress.rung === RUNG_RECEIVERSHIP;
}

// Construction: banned under a freeze or austerity; cash only under the
// interim CFO, who does not borrow.
export function constructionAllowed(
  state: GameState,
): { ok: true } | { ok: false; reason: string } {
  if (frozen(state)) return { ok: false, reason: 'the board has frozen new construction' };
  return { ok: true };
}

export function borrowingAllowed(state: GameState): boolean {
  return state.distress.rung < RUNG_FREEZE;
}

// Board policy under receivership: what the budget sliders lock to.
export function boardPolicy(): { drawRate: number; maintenanceFunding: number } {
  return { drawRate: BOARD_POLICY_DRAW, maintenanceFunding: BOARD_POLICY_MAINTENANCE };
}

// ---------- the cuts (DD §5.5) ----------

export function cutAvailable(state: GameState, cut: AusterityCut): boolean {
  const words = CUT_WORDS.find((c) => c.id === cut);
  if (!words || words.phase !== undefined) return false; // arrives with its phase
  switch (cut) {
    case 'cutAid':
      return state.people.aidRate > AID_MIN;
    case 'deferMaintenance':
      return state.treasury.budget.maintenanceFunding > 0;
    case 'closeProgram':
      return state.academics.programs.length > 0;
    case 'restructureAdmin':
      return state.delegation.seats.length > 0;
    default:
      return false;
  }
}

export function availableCuts(state: GameState): AusterityCut[] {
  return AUSTERITY_CUTS.filter((c) => cutAvailable(state, c));
}

// The board's own choice when the administration makes none: the first
// cut on its list that can still be made.
export function defaultCuts(state: GameState): AusterityCut[] {
  const first = availableCuts(state)[0];
  return first ? [first] : [];
}

export function applyCut(state: GameState, cut: AusterityCut): GameState {
  switch (cut) {
    case 'cutAid': {
      const aidRate = Number(Math.max(AID_MIN, state.people.aidRate - AID_CUT_STEP).toFixed(4));
      return { ...state, people: { ...state.people, aidRate } };
    }
    case 'closeProgram': {
      const newest = newestProgram(state);
      return newest ? closeProgramIn(state, newest.programId) : state;
    }
    case 'restructureAdmin': {
      // The ratchet back a notch (DD §5.4, §5.5): the seat appointed most
      // recently is abolished, its salary with it, and the term that follows
      // pays for the reorganisation in the students' patience. Whoever held
      // it goes back to the faculty, or out of the college if they came in.
      const seats = state.delegation.seats;
      if (seats.length === 0) return state;
      let newest = 0;
      for (let i = 1; i < seats.length; i++) {
        if (seats[i]!.appointedYear >= seats[newest]!.appointedYear) newest = i;
      }
      return {
        ...state,
        delegation: { ...state.delegation, seats: seats.filter((_, i) => i !== newest) },
        people: { ...state.people, mood: state.people.mood - RESTRUCTURE_MOOD },
      };
    }
    case 'deferMaintenance': {
      const t = state.treasury;
      return {
        ...state,
        treasury: {
          ...t,
          // What the college had set, held for when the emergency ends.
          ownMaintenance: t.ownMaintenance ?? t.maintenanceFunding,
          maintenanceFunding: 0,
          budget: { ...t.budget, maintenanceFunding: 0 },
          pendingBudget: t.pendingBudget ? { ...t.pendingBudget, maintenanceFunding: 0 } : null,
        },
      };
    }
    default:
      return state;
  }
}

// The Board Meeting under austerity: the cuts the administration chose, or
// the board's own if it chose none.
export function imposeCuts(state: GameState, chosen: AusterityCut[] | undefined): GameState {
  if (!inAusterity(state)) return state;
  const valid = (chosen ?? []).filter((c) => cutAvailable(state, c));
  const cuts = valid.length > 0 ? valid : defaultCuts(state);
  if (cuts.length === 0) return state;
  let next = state;
  for (const c of cuts) next = applyCut(next, c);
  next = {
    ...next,
    distress: { ...next.distress, cutsTaken: [...next.distress.cutsTaken, ...cuts] },
  };
  return emit(next, { kind: 'cutsImposed', cuts });
}

// ---------- the term (DD §5.5) ----------

// Where the conditions alone would put the college, ignoring the rungs
// that have their own clocks.
function rungByConditions(state: GameState, d: Distress): Rung {
  if (state.treasury.cash <= 0) return RUNG_FREEZE;
  if (d.deficitRun >= DEFICIT_TERMS) return RUNG_DEFICIT;
  if (reservesTight(state)) return RUNG_TIGHT;
  return RUNG_SOUND;
}

function recovered(state: GameState, d: Distress): boolean {
  return d.surplusRun >= SURPLUS_TERMS_TO_EXIT && state.treasury.cash > 0;
}

// The next rung after a closed term. Down the ladder one rung a term, so
// every rung is seen and narrated — except that exhausted reserves go
// straight to Freeze. Up the ladder to wherever the conditions put the
// college.
export function nextRung(state: GameState, d: Distress): Rung {
  switch (d.rung) {
    case RUNG_RECEIVERSHIP:
      // A fixed sentence: the CFO leaves when her term ends, not before.
      return d.receivershipTermsLeft > 0 ? RUNG_RECEIVERSHIP : rungByConditions(state, d);
    case RUNG_AUSTERITY:
      if (recovered(state, d)) return rungByConditions(state, d);
      return d.termsAtRung >= RECEIVERSHIP_AFTER_TERMS ? RUNG_RECEIVERSHIP : RUNG_AUSTERITY;
    case RUNG_FREEZE:
      if (recovered(state, d)) return rungByConditions(state, d);
      return d.termsAtRung >= AUSTERITY_AFTER_TERMS ? RUNG_AUSTERITY : RUNG_FREEZE;
    default: {
      const by = rungByConditions(state, d);
      if (by === RUNG_FREEZE) return RUNG_FREEZE;
      return Math.min(by, d.rung + 1) as Rung;
    }
  }
}

function confidenceAfterTerm(state: GameState, d: Distress, net: number, rung: Rung): number {
  let c = d.confidence;
  if (net >= 0 && rung === RUNG_SOUND) c += CONFIDENCE_SURPLUS_GAIN;
  if (net < 0) c -= CONFIDENCE_DEFICIT_LOSS;
  if (rung === RUNG_FREEZE) c -= CONFIDENCE_FREEZE_LOSS;
  if (rung >= RUNG_AUSTERITY) c -= CONFIDENCE_AUSTERITY_LOSS;
  if (state.treasury.budget.drawRate > ENDOWMENT_DRAW_PRUDENT) c -= CONFIDENCE_OVERDRAW_LOSS;
  if (inTriples(state) > 0) c -= CONFIDENCE_TRIPLES_LOSS;
  return Math.max(0, Math.min(100, c));
}

// The letter a step earns, if any: every rung entered on the way down, the
// end of receivership, and the return to a sound footing from distress.
function letterFor(from: Rung, to: Rung): string | null {
  if (to > from && to >= RUNG_TIGHT) return `enter-${to}`;
  // The CFO's departure is its own letter, whatever footing she leaves
  // the college on.
  if (from === RUNG_RECEIVERSHIP && to < from) return 'exit-5';
  // Out of austerity: the cuts end, and the board says which (Phase 21L).
  if (from === RUNG_AUSTERITY && to < from) return 'exit-4';
  if (from >= RUNG_DEFICIT && to === RUNG_SOUND) return 'recovered';
  return null;
}

// Close the term that just ended and move the ladder.
export function closeTerm(state: GameState, year: number, term: Term): GameState {
  const d = state.distress;
  const net = netOf(d.term);
  const surplus = net >= 0;
  const runs = {
    surplusRun: surplus ? d.surplusRun + 1 : 0,
    deficitRun: surplus ? 0 : d.deficitRun + 1,
  };
  const before: Distress = { ...d, ...runs, termsAtRung: d.termsAtRung + 1 };
  const to = nextRung(state, before);
  const from = d.rung;
  const entering = to !== from;
  const receivershipTermsLeft =
    to === RUNG_RECEIVERSHIP
      ? from === RUNG_RECEIVERSHIP
        ? Math.max(0, d.receivershipTermsLeft - 1)
        : RECEIVERSHIP_TERMS
      : 0;
  const scars =
    to === RUNG_RECEIVERSHIP && from !== RUNG_RECEIVERSHIP ? [...d.scars, year] : d.scars;
  const letter = entering ? letterFor(from, to) : null;
  // Leaving the rungs where the emergency overrides maintenance hands the
  // college's own level back (Phase 21L).
  const handBack =
    from >= RUNG_AUSTERITY && to < RUNG_AUSTERITY && state.treasury.ownMaintenance !== null;
  const next: Distress = {
    ...before,
    rung: to,
    termsAtRung: entering ? 0 : before.termsAtRung,
    confidence: confidenceAfterTerm(state, d, net, to),
    term: zeroFlows(),
    terms: [...d.terms, { year, term, net }].slice(-TERM_HISTORY),
    receivershipTermsLeft,
    scars,
    pendingLetter: letter ?? d.pendingLetter,
    cutsTaken: to >= RUNG_AUSTERITY ? d.cutsTaken : [],
    maintenanceRestored: handBack ? letter !== null : d.maintenanceRestored,
  };
  let s: GameState = { ...state, distress: next };
  if (handBack) {
    const t = s.treasury;
    s = {
      ...s,
      treasury: {
        ...t,
        maintenanceFunding: t.ownMaintenance ?? t.maintenanceFunding,
        ownMaintenance: null,
      },
    };
  }
  s = emit(s, { kind: 'termClosed', year, term, net });
  if (entering) s = emit(s, { kind: 'rungChanged', from, to });
  if (letter) s = emit(s, { kind: 'boardLetter', letter });
  return s;
}

// The distress system, weekly, after the treasury has moved the money: on
// the first week of a term the previous term closes; every week the
// week's flows join the running term.
export function distressWeek(state: GameState): GameState {
  let s = state;
  const { clock } = s;
  if (clock.week === 1) {
    // The term that ended: the one before this week's.
    const prevTerm: Term =
      clock.term === 'fall' ? 'summer' : clock.term === 'spring' ? 'fall' : 'spring';
    const prevYear = clock.term === 'fall' ? clock.year - 1 : clock.year;
    s = closeTerm(s, prevYear, prevTerm);
  }
  const week = s.treasury.lastWeek;
  const term = s.distress.term;
  const revenue = { ...term.revenue };
  const expenses = { ...term.expenses };
  for (const k of Object.keys(revenue) as (keyof typeof revenue)[]) revenue[k] += week.revenue[k];
  for (const k of Object.keys(expenses) as (keyof typeof expenses)[])
    expenses[k] += week.expenses[k];
  return { ...s, distress: { ...s.distress, term: { revenue, expenses } } };
}

export function readLetter(state: GameState): GameState {
  return {
    ...state,
    distress: { ...state.distress, pendingLetter: null, maintenanceRestored: false },
  };
}
