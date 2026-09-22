import raw from './ambitions.json' with { type: 'json' };
import {
  EVENT_CONDITIONS,
  EVENT_EFFECTS,
  type EventCondition,
  type EventEffect,
} from './events.ts';
import { arr, ContentError, num, obj, str, uniqueBy, validate } from './schema.ts';

// AMBITIONS (DD §10.2): dealt temptations. An ambition is a public
// commitment with a date on it — a state the college promises to reach,
// and what it costs when the date arrives and the state has not.
//
// It reads and writes through the SAME two closed vocabularies the events
// use (content/events.ts): `deal` and `goal` are clauses over readings,
// `reward` and `penalty` are levers. There is no second engine here, and
// nothing an ambition can reach that an event could not.

export interface AmbitionDef {
  id: string;
  title: string; // what goes on the record, in the board's words
  weight: number;
  deal: Partial<Record<EventCondition, number>>; // when the game may offer it
  goal: Partial<Record<EventCondition, number>>; // what must hold by the date
  years: number; // the deadline, from the Convocation it was accepted at
  text: string; // the offer, in voice
  reward: Partial<Record<EventEffect, number>>;
  penalty: Partial<Record<EventEffect, number>>;
  kept: string; // the chronicle's line, either way (DD §12.1)
  missed: string;
}

const clauses = obj(
  Object.fromEntries(EVENT_CONDITIONS.map((c) => [c, optionalNum])),
) as unknown as (v: unknown, p: string) => Partial<Record<EventCondition, number>>;

const levers = obj(Object.fromEntries(EVENT_EFFECTS.map((e) => [e, optionalNum]))) as unknown as (
  v: unknown,
  p: string,
) => Partial<Record<EventEffect, number>>;

function optionalNum(v: unknown, p: string): number | undefined {
  return v === undefined ? undefined : num(v, p);
}

const fileSchema = obj({
  ambitions: arr(
    obj({
      id: str,
      title: str,
      weight: num,
      deal: clauses,
      goal: clauses,
      years: num,
      text: str,
      reward: levers,
      penalty: levers,
      kept: str,
      missed: str,
    }),
  ),
  lines: obj({
    offered: str,
    accepted: str,
    declined: str,
    kept: str,
    missed: str,
    dueIn: str,
    dueNext: str,
    dueNow: str,
    none: str,
    capReached: str,
    note: str,
  }),
});

const loaded = validate(fileSchema, raw, 'ambitions.json');
uniqueBy(loaded.ambitions, (a) => a.id, 'ambitions.json.ambitions');

for (const a of loaded.ambitions) {
  const at = `ambitions.json.${a.id}`;
  if (a.weight <= 0) throw new ContentError(at, 'weight must be positive');
  if (a.years < 2)
    throw new ContentError(at, 'a deadline the college cannot see is not a deadline');
  if (Object.keys(a.goal).length === 0) {
    throw new ContentError(at, 'an ambition with no goal is a promise about nothing');
  }
  if (Object.keys(a.reward).length === 0 || Object.keys(a.penalty).length === 0) {
    throw new ContentError(at, 'keeping it and missing it must both mean something');
  }
  // A goal the college has already reached when the offer is dealt is not
  // a temptation, so the two clause sets may not be the same reading in
  // the same direction (DD §10.2: concrete, public, and not yet true).
  for (const name of Object.keys(a.goal) as EventCondition[]) {
    const dealt = a.deal[name];
    const wanted = a.goal[name]!;
    if (dealt !== undefined && dealt >= wanted) {
      throw new ContentError(at, `${name}: dealt at ${dealt}, which already meets the goal`);
    }
  }
  for (const placeholder of a.text.matchAll(/\{(\w+)\}/g)) {
    if (placeholder[1] !== 'school')
      throw new ContentError(at, `unknown subject {${placeholder[1]}}`);
  }
}

export const AMBITIONS: readonly AmbitionDef[] = loaded.ambitions;
export const AMBITION_WORDS = loaded.lines;

export function findAmbition(id: string): AmbitionDef | undefined {
  return AMBITIONS.find((a) => a.id === id);
}

export function ambitionById(id: string): AmbitionDef {
  const found = findAmbition(id);
  if (!found) throw new ContentError('ambitions', `no such ambition "${id}"`);
  return found;
}
