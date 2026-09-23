import { type EventDef, type EventDomain, type EventEffect } from '../content/events.ts';
import { SEATS, seatById, type PolicyRule, type SeatDef } from '../content/seats.ts';
import {
  DEANS_FOR_FASTEST,
  ESCALATION_MONEY,
  SEAT_SENIOR_RANKS,
  STANDING_COST_YEARS,
} from '../tuning.ts';
import { emit } from './bus.ts';
import type { GameState } from './state.ts';

// DELEGATION (DD §9). A seat is filled once and paid for forever. What it
// buys is (a) the routine of its domain handled without the player,
// (b) the top speed tiers (§3.2), and what it costs is permanent payroll
// and a step of the administrative ratchet (§5.4).
//
// The satire made mechanical: the machinery that makes the game playable
// at speed is the machinery bleeding you.

export type FilledBy = { kind: 'internal'; facultyId: string } | { kind: 'outside' };

export interface Seat {
  seatId: string;
  // Deans are one per founded school; every other seat leaves this null.
  schoolId: string | null;
  filledBy: FilledBy;
  policy: string;
  salary: number; // a year, forever
  appointedYear: number;
}

export interface Delegation {
  seats: Seat[];
}

export function foundingDelegation(): Delegation {
  return { seats: [] };
}

// ---------- reading the org chart ----------

export function seatKey(seatId: string, schoolId: string | null): string {
  return schoolId === null ? seatId : `${seatId}:${schoolId}`;
}

export function heldSeat(state: GameState, seatId: string, schoolId: string | null): Seat | null {
  return (
    state.delegation.seats.find(
      (s) => s.seatId === seatId && (s.schoolId ?? null) === (schoolId ?? null),
    ) ?? null
  );
}

export function seatFilled(state: GameState, seatId: string, schoolId: string | null): boolean {
  return heldSeat(state, seatId, schoolId) !== null;
}

export function deansAppointed(state: GameState): number {
  return state.delegation.seats.filter((s) => s.seatId === 'dean').length;
}

// Every seat the college could fill right now, in one list: the standing
// seats, plus a Dean for each school it has actually founded.
export function seatSlots(state: GameState): { def: SeatDef; schoolId: string | null }[] {
  const slots: { def: SeatDef; schoolId: string | null }[] = [];
  for (const def of SEATS) {
    if (!def.perSchool) {
      slots.push({ def, schoolId: null });
      continue;
    }
    for (const school of state.academics.schools) slots.push({ def, schoolId: school.schoolId });
  }
  return slots;
}

// Who on the roster is senior enough to be promoted into a seat. Filling
// internally takes them out of teaching entirely (DD §9.1), so this is a
// real trade against programQuality, not a discount.
export function seniorFaculty(state: GameState) {
  const seated = new Set(
    state.delegation.seats
      .filter((s) => s.filledBy.kind === 'internal')
      .map((s) => (s.filledBy as { kind: 'internal'; facultyId: string }).facultyId),
  );
  return state.faculty.roster.filter(
    (f) => SEAT_SENIOR_RANKS.includes(f.rank) && !seated.has(f.id),
  );
}

// WHO COULD TAKE THIS SEAT (Phase 21K). The seniors free to take it, and
// for a Dean only those from the Dean's own school: a professor of Health
// is not made Dean of Science. Best first — the strongest record of
// teaching and research together — so the list reads as a shortlist.
export function seatCandidates(state: GameState, seatId: string, schoolId: string | null) {
  const perSchool = seatById(seatId).perSchool === true;
  return seniorFaculty(state)
    .filter((f) => !perSchool || f.schoolId === schoolId)
    .sort(
      (a, b) => b.teaching + b.research - (a.teaching + a.research) || a.id.localeCompare(b.id),
    );
}

export function isSeated(state: GameState, facultyId: string): boolean {
  return state.delegation.seats.some(
    (s) => s.filledBy.kind === 'internal' && s.filledBy.facultyId === facultyId,
  );
}

// ---------- what it costs (DD §5.4, §9.4) ----------

export function seatPayroll(state: GameState): number {
  return state.delegation.seats.reduce((total, s) => total + s.salary, 0);
}

export function ratchetSteps(state: GameState): number {
  return state.delegation.seats.reduce((total, s) => total + seatById(s.seatId).ratchet, 0);
}

// ---------- what it buys: the speed tiers (DD §3.2) ----------

export function provostAppointed(state: GameState): boolean {
  return seatFilled(state, 'provost', null);
}

export function fastTimeAllowed(state: GameState): boolean {
  return provostAppointed(state);
}

export function fastestTimeAllowed(state: GameState): boolean {
  return provostAppointed(state) && deansAppointed(state) >= DEANS_FOR_FASTEST;
}

// ---------- what it buys: the routine (DD §9.2) ----------

// Whether a domain's routine is covered: the standing seat for it, or —
// for the academic side — the Provost or any Dean.
export function domainCovered(state: GameState, domain: EventDomain): boolean {
  return state.delegation.seats.some((s) => seatById(s.seatId).domain === domain);
}

// The seat that would handle an event, and the policy it would handle it
// by. A Dean handles their own school's academic routine; the Provost
// handles the rest of it, so the Provost is the fallback.
export function handlerFor(state: GameState, def: EventDef): Seat | null {
  const standing = state.delegation.seats.find(
    (s) => seatById(s.seatId).domain === def.domain && s.schoolId === null,
  );
  if (standing) return standing;
  return state.delegation.seats.find((s) => seatById(s.seatId).domain === def.domain) ?? null;
}

// What a choice moves, in money. The escalation test (DD §9.2): anything
// above the threshold reaches the player however well-staffed the college.
export function moneyMoved(def: EventDef): number {
  return Math.max(...def.choices.map((c) => Math.abs(costOf(c.effects))));
}

// What a choice spends, counting a standing cost as the years it will
// certainly be paid for (Phase 21H): "$120k a year, forever" is not a
// $120k decision, and a seat choosing by thrift must not read it as one.
function costOf(e: Partial<Record<EventEffect, number>>): number {
  const standing = (e.adminPayroll ?? 0) + (e.facultyPayroll ?? 0);
  return -(e.cash ?? 0) - (e.endowment ?? 0) + standing * STANDING_COST_YEARS;
}

// Escalations always surface (DD §9.2): a seismic letter, anything above
// the money threshold, and anything with no seat to land on.
export function escalates(state: GameState, def: EventDef): boolean {
  if (def.kind === 'seismic') return true;
  if (moneyMoved(def) > ESCALATION_MONEY) return true;
  return handlerFor(state, def) === null;
}

// The choice a policy takes. Three rules over the effects the event
// already carries, so a policy needs no per-event authoring.
export function choiceByRule(def: EventDef, rule: PolicyRule): string {
  const spend = (i: number) => costOf(def.choices[i]!.effects);
  const mood = (i: number) => def.choices[i]!.effects.mood ?? 0;
  let best = 0;
  for (let i = 1; i < def.choices.length; i++) {
    const better =
      rule === 'thrifty'
        ? spend(i) < spend(best)
        : rule === 'thorough'
          ? spend(i) > spend(best)
          : mood(i) > mood(best) || (mood(i) === mood(best) && spend(i) < spend(best));
    if (better) best = i;
  }
  return def.choices[best]!.id;
}

export function policyChoice(
  state: GameState,
  def: EventDef,
): { seat: Seat; choiceId: string } | null {
  if (escalates(state, def)) return null;
  const seat = handlerFor(state, def);
  if (!seat) return null;
  const seatDef = seatById(seat.seatId);
  const policy = seatDef.policies.find((p) => p.id === seat.policy) ?? seatDef.policies[0]!;
  return { seat, choiceId: choiceByRule(def, policy.rule) };
}

// ---------- appointing ----------

export function appointCost(def: SeatDef, from: FilledBy): number {
  return from.kind === 'outside' ? def.outsideSalary : def.internalSalary;
}

export function appointSeat(
  state: GameState,
  seatId: string,
  schoolId: string | null,
  from: FilledBy,
): GameState {
  const def = seatById(seatId);
  const seat: Seat = {
    seatId,
    schoolId,
    filledBy: from,
    policy: def.defaultPolicy,
    salary: appointCost(def, from),
    appointedYear: state.clock.year,
  };
  // An internal appointment stops teaching (DD §9.1), which is the point
  // of the trade: the cheap seat costs a programme its lecturer.
  const roster =
    from.kind === 'internal'
      ? state.faculty.roster.map((f) => (f.id === from.facultyId ? { ...f, programId: null } : f))
      : state.faculty.roster;
  return emit(
    {
      ...state,
      faculty: { ...state.faculty, roster },
      delegation: { seats: [...state.delegation.seats, seat] },
    },
    { kind: 'seatFilled', seatId, schoolId, outside: from.kind === 'outside' },
  );
}

export function setSeatPolicy(
  state: GameState,
  seatId: string,
  schoolId: string | null,
  policy: string,
): GameState {
  return {
    ...state,
    delegation: {
      seats: state.delegation.seats.map((s) =>
        s.seatId === seatId && s.schoolId === schoolId ? { ...s, policy } : s,
      ),
    },
  };
}
