import { buildingById } from '../content/buildings.ts';
import {
  EVENTS,
  eventById,
  findEvent,
  type EventCondition,
  type EventDef,
  type EventEffect,
} from '../content/events.ts';
import { programById } from '../content/schools.ts';
import {
  EVENT_CONSEQUENCE_WEIGHT,
  EVENT_DISTRESS_ODDS,
  EVENT_QUIET_WEEKS,
  EVENT_WEEKLY_ODDS,
  MOOD_CAP,
  SEISMIC_MIN_YEAR,
  SEISMIC_ODDS_SHARE,
} from '../tuning.ts';
import { campusBeauty } from './beauty.ts';
import { emit } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { conditionFor, openPlacements, totalBacklog } from './estate.ts';
import { teachingQuality } from './faculty.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';
import { adminShareOfPayroll } from './treasury.ts';

// THE EVENT ENGINE (DD §10.1). The world keeps punching, and almost all
// of it resolves inline in the ticker: an event fires, offers two or
// three honest choices, and settles into its stated default if nobody
// answers within a few weeks. Seismic events are rare, hold the clock,
// and arrive as full-screen letters.
//
// The engine knows nothing about any particular event. It reads
// content/events.json, tests each event's CONDITIONS against the state,
// weights what is left toward CONSEQUENCE — an event the player's own
// campus has earned beats one that could happen anywhere — draws one,
// and applies the chosen effects. Adding an event is adding a JSON
// object; the engine does not change.

export interface PendingEvent {
  instanceId: string;
  eventId: string;
  firedWeek: number;
  expiresWeek: number;
  // The subjects the text names, resolved when it fired so the sentence
  // reads the same in week four as in week one.
  vars: Record<string, string>;
}

export interface ResolvedEvent {
  eventId: string;
  choiceId: string;
  week: number;
  timedOut: boolean;
}

export interface Events {
  pending: PendingEvent[];
  history: ResolvedEvent[];
  lastResolvedWeek: number;
  nextId: number;
}

export function foundingEvents(): Events {
  return { pending: [], history: [], lastResolvedWeek: 0, nextId: 1 };
}

// ---------- reading the state ----------

// Every condition, as a reading. A condition is a threshold on one of
// these; the name says which way it points.
const READINGS: Record<EventCondition, (s: GameState) => number> = {
  yearAtLeast: (s) => s.clock.year,
  yearAtMost: (s) => -s.clock.year,
  enrolledOver: (s) => s.people.cohorts.reduce((t, c) => t + c.size, 0),
  triplesOver: (s) => {
    const beds = openPlacements(s).reduce(
      (t, p) => t + (buildingById(p.buildingId).capacity?.beds ?? 0),
      0,
    );
    return Math.max(0, s.people.cohorts.reduce((t, c) => t + c.size, 0) - beds);
  },
  backlogOver: (s) => totalBacklog(s),
  conditionUnder: (s) => {
    const open = openPlacements(s);
    return open.length === 0 ? -1 : -Math.min(...open.map((p) => p.condition));
  },
  cashUnder: (s) => -s.treasury.cash,
  cashOver: (s) => s.treasury.cash,
  endowmentOver: (s) => s.treasury.endowment,
  adminShareOver: (s) => adminShareOfPayroll(s.treasury.budget),
  rungAtLeast: (s) => s.distress.rung,
  facultyOver: (s) => s.faculty.roster.length,
  programsOver: (s) => s.academics.programs.length,
  teachingOver: (s) => teachingQuality(s),
  alumniOver: (s) => s.people.alumni.reduce((t, a) => t + a.size, 0),
  buildingsOver: (s) => openPlacements(s).length,
  beautyUnder: (s) => -campusBeauty(s),
};

// The "Under" readings are negated above, so every condition is the same
// comparison: the reading is at least the threshold it names.
function thresholdOf(name: EventCondition, value: number): number {
  return name.endsWith('Under') ? -value : value;
}

export function conditionsHold(state: GameState, def: EventDef): boolean {
  for (const [name, value] of Object.entries(def.when) as [EventCondition, number][]) {
    if (READINGS[name](state) < thresholdOf(name, value)) return false;
  }
  return true;
}

// ---------- choosing one ----------

export function firedRecently(state: GameState, def: EventDef): boolean {
  const cooldown = def.cooldownYears * WEEKS_PER_YEAR;
  return state.events.history.some(
    (h) => h.eventId === def.id && state.clock.absoluteWeek - h.week < cooldown,
  );
}

export function eligible(state: GameState, kind: EventDef['kind']): EventDef[] {
  return EVENTS.filter(
    (e) =>
      e.kind === kind &&
      !state.events.pending.some((p) => p.eventId === e.id) &&
      !firedRecently(state, e) &&
      conditionsHold(state, e),
  );
}

// An event the college has earned outranks one that could happen to
// anybody: every condition it names multiplies its weight (DD §10.1).
export function weightOf(def: EventDef): number {
  return def.weight * Math.pow(EVENT_CONSEQUENCE_WEIGHT, Object.keys(def.when).length);
}

export function pickEvent(rng: Rng, pool: EventDef[]): EventDef | null {
  if (pool.length === 0) return null;
  const total = pool.reduce((t, e) => t + weightOf(e), 0);
  let pick = rng.next() * total;
  for (const e of pool) {
    pick -= weightOf(e);
    if (pick <= 0) return e;
  }
  return pool[pool.length - 1]!;
}

// The subjects an event's sentence names, resolved once at firing.
export function subjectsFor(state: GameState, rng: Rng, def: EventDef): Record<string, string> {
  const vars: Record<string, string> = {};
  if (def.text.includes('{building}')) {
    const worst = [...openPlacements(state)].sort((a, b) => b.backlog - a.backlog)[0];
    vars.building = worst ? buildingById(worst.buildingId).name : 'the old wing';
  }
  if (def.text.includes('{faculty}')) {
    const roster = state.faculty.roster;
    vars.faculty = roster.length > 0 ? rng.pick(roster).name : 'A professor';
  }
  if (def.text.includes('{program}')) {
    const programs = state.academics.programs;
    vars.program =
      programs.length > 0 ? programById(rng.pick(programs).programId).name : 'the college';
  }
  if (def.text.includes('{class}')) {
    const alumni = state.people.alumni;
    vars.class =
      alumni.length > 0
        ? `Class of '${String(rng.pick(alumni).classYear % 100).padStart(2, '0')}`
        : 'founding class';
  }
  if (def.text.includes('{school}')) {
    vars.school = state.identity?.name ?? 'the college';
  }
  return vars;
}

export function fillEventText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

// An event's sentence as it was when it fired: the subjects were
// resolved then, so the wording does not drift while it waits.
export function pendingText(pending: PendingEvent): string {
  return fillEventText(eventById(pending.eventId).text, pending.vars);
}

// ---------- applying a choice ----------

const LEVERS: Record<EventEffect, (s: GameState, amount: number) => GameState> = {
  cash: (s, amount) => ({ ...s, treasury: { ...s.treasury, cash: s.treasury.cash + amount } }),
  endowment: (s, amount) => ({
    ...s,
    treasury: { ...s.treasury, endowment: Math.max(0, s.treasury.endowment + amount) },
  }),
  confidence: (s, amount) => ({
    ...s,
    distress: {
      ...s.distress,
      confidence: Math.min(100, Math.max(0, s.distress.confidence + amount)),
    },
  }),
  mood: (s, amount) => ({
    ...s,
    people: {
      ...s.people,
      mood: Number(Math.min(MOOD_CAP, Math.max(-MOOD_CAP, s.people.mood + amount)).toFixed(2)),
    },
  }),
  // Backlog spreads over the open buildings by what each already carries
  // (repairs go to the worst first; new damage lands on everything).
  backlog: (s, amount) => {
    const open = openPlacements(s);
    if (open.length === 0) return s;
    const carried = open.reduce((t, p) => t + p.backlog, 0);
    const shares = open.map((p) => (carried > 0 ? p.backlog / carried : 1 / open.length));
    const byId = new Map(open.map((p, i) => [p.id, shares[i]!]));
    return {
      ...s,
      campus: {
        ...s.campus,
        placements: s.campus.placements.map((p) => {
          const share = byId.get(p.id);
          if (share === undefined) return p;
          const def = buildingById(p.buildingId);
          const backlog = Math.max(0, p.backlog + amount * share);
          return { ...p, backlog, condition: conditionFor(def, backlog) };
        }),
      },
    };
  },
  warmth: (s, amount) => ({
    ...s,
    people: {
      ...s.people,
      alumni: s.people.alumni.map((a) => ({
        ...a,
        warmth: Number(Math.min(100, Math.max(0, a.warmth + amount)).toFixed(1)),
      })),
    },
  }),
};

export function applyChoice(state: GameState, def: EventDef, choiceId: string): GameState {
  const choice = def.choices.find((c) => c.id === choiceId) ?? def.choices[0]!;
  let s = state;
  for (const [lever, amount] of Object.entries(choice.effects) as [EventEffect, number][]) {
    s = LEVERS[lever](s, amount);
  }
  return s;
}

// ---------- the week ----------

export function pendingInline(state: GameState): PendingEvent | null {
  return state.events.pending.find((p) => eventById(p.eventId).kind === 'inline') ?? null;
}

export function pendingSeismic(state: GameState): PendingEvent | null {
  return state.events.pending.find((p) => eventById(p.eventId).kind === 'seismic') ?? null;
}

export function resolveEvent(
  state: GameState,
  instanceId: string,
  choiceId: string,
  timedOut = false,
): GameState {
  const pending = state.events.pending.find((p) => p.instanceId === instanceId);
  if (!pending) return state;
  const def = eventById(pending.eventId);
  const choice = def.choices.find((c) => c.id === choiceId) ?? def.choices[0]!;
  const applied = applyChoice(state, def, choice.id);
  return emit(
    {
      ...applied,
      events: {
        ...applied.events,
        pending: applied.events.pending.filter((p) => p.instanceId !== instanceId),
        history: [
          ...applied.events.history,
          { eventId: def.id, choiceId: choice.id, week: state.clock.absoluteWeek, timedOut },
        ],
        lastResolvedWeek: state.clock.absoluteWeek,
      },
    },
    { kind: 'eventResolved', eventId: def.id, choiceId: choice.id, timedOut },
  );
}

// The events system, run each week: time out what has waited long enough,
// then roll for something new.
// Put an event on the docket now, whatever the world says: the authoring
// tool for a content file that will hold a hundred and forty of these
// (DD §14) — write one, fire it, read it in the ticker. Subjects resolve
// from the run's own stream, exactly as a fired event's would.
export function fireEvent(state: GameState, eventId: string): GameState {
  const def = findEvent(eventId);
  if (!def) return state;
  const rng = Rng.fromState(state.rng);
  const week = state.clock.absoluteWeek;
  const pending: PendingEvent = {
    instanceId: `e${state.events.nextId}`,
    eventId: def.id,
    firedWeek: week,
    expiresWeek: week + def.timeoutWeeks,
    vars: subjectsFor(state, rng, def),
  };
  return emit(
    {
      ...state,
      rng: rng.snapshot(),
      events: {
        ...state.events,
        pending: [...state.events.pending, pending],
        nextId: state.events.nextId + 1,
      },
    },
    { kind: 'eventFired', eventId: def.id, instanceId: pending.instanceId },
  );
}

export function eventsWeek(state: GameState): GameState {
  let s = state;
  const week = s.clock.absoluteWeek;
  // An unanswered event settles into its stated default (DD §10.1).
  for (const p of s.events.pending) {
    if (p.expiresWeek <= week)
      s = resolveEvent(s, p.instanceId, eventById(p.eventId).default, true);
  }
  if (s.events.pending.length > 0) return s;
  if (week - s.events.lastResolvedWeek < EVENT_QUIET_WEEKS) return s;
  const rng = Rng.fromState(s.rng);
  const odds = EVENT_WEEKLY_ODDS + s.distress.rung * EVENT_DISTRESS_ODDS;
  if (!rng.chance(odds)) return { ...s, rng: rng.snapshot() };
  // Seismic events are rare, and the run needs some history to shake.
  const seismic = s.clock.year >= SEISMIC_MIN_YEAR && rng.chance(SEISMIC_ODDS_SHARE);
  const def =
    pickEvent(rng, eligible(s, seismic ? 'seismic' : 'inline')) ??
    pickEvent(rng, eligible(s, 'inline'));
  if (!def) return { ...s, rng: rng.snapshot() };
  const vars = subjectsFor(s, rng, def);
  const pending: PendingEvent = {
    instanceId: `e${s.events.nextId}`,
    eventId: def.id,
    firedWeek: week,
    expiresWeek: week + def.timeoutWeeks,
    vars,
  };
  return emit(
    {
      ...s,
      rng: rng.snapshot(),
      events: {
        ...s.events,
        pending: [...s.events.pending, pending],
        nextId: s.events.nextId + 1,
      },
    },
    { kind: 'eventFired', eventId: def.id, instanceId: pending.instanceId },
  );
}

// Mood fades toward nothing over a couple of years (called at Convocation).
export function fadeMood(mood: number, perYear: number): number {
  return Number((mood * (1 - perYear)).toFixed(2));
}
