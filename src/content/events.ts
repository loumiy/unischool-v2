import raw from './events.json' with { type: 'json' };
import { arr, ContentError, num, obj, oneOf, optional, str, uniqueBy, validate } from './schema.ts';

// THE EVENT CATALOGUE (DD §10.1). An event is data: when it can fire,
// how often, what it says, what it offers, and what each choice does.
// Both halves of that are small closed vocabularies — a CONDITION names a
// reading of the state, an EFFECT names a lever on it — so a typo in the
// content is a load error rather than an event that never fires or a
// choice that does nothing. Writing lives here; the engine (sim/events.ts)
// knows only how to read and apply these.

// Every condition an event may name. All of them are thresholds on a
// number the sim already keeps, and all of a `when` must hold.
export const EVENT_CONDITIONS = [
  // The calendar
  'yearAtLeast',
  'yearAtMost',
  // Money (treasury.ts)
  'cashUnder',
  'cashOver',
  'endowmentOver',
  'endowmentUnder',
  'debtOver',
  'deficitOver', // this year's expenses over its revenue, so far
  'drawRateOver',
  'tuitionOver',
  'adminShareOver',
  'payrollShareOver',
  // The board and the ladder (distress.ts)
  'rungAtLeast',
  'confidenceUnder',
  'confidenceOver',
  // The estate (estate.ts)
  'backlogOver',
  'conditionUnder',
  'maintenanceUnder', // the funding level itself, not what it has cost yet
  'buildingsOver',
  'derelictOver',
  'oldestBuildingOver', // in years since it opened
  // The campus (beauty.ts, quads.ts)
  'beautyUnder',
  'beautyOver',
  'quadsOver',
  'treesUnder',
  // Schools, programs and the roster (academics.ts, faculty.ts)
  'schoolsOver',
  'programsOver',
  'programsUnder',
  'facultyOver',
  'facultyUnder',
  'studentsPerFacultyOver',
  'teachingOver',
  'teachingUnder',
  // Students and alumni (people.ts, alumni.ts)
  'enrolledOver',
  'enrolledUnder',
  'triplesOver',
  'satisfactionOver',
  'satisfactionUnder',
  'selectivityOver',
  'selectivityUnder',
  'alumniOver',
  'warmthOver',
  'warmthUnder',
  'moodOver',
  'moodUnder',
] as const;
export type EventCondition = (typeof EVENT_CONDITIONS)[number];

// Every lever a choice may pull. Each is a signed amount applied once.
export const EVENT_EFFECTS = [
  'cash',
  'endowment',
  'debt', // borrowed, or forgiven
  'confidence',
  'mood',
  'backlog',
  'warmth',
  'quality', // the cohorts', nudged
  'enrollment', // students gained or lost, spread over the classes
  'trees', // planted or taken, on the map itself
] as const;
export type EventEffect = (typeof EVENT_EFFECTS)[number];

export type EventKind = 'inline' | 'seismic';

export interface ChoiceDef {
  id: string;
  label: string; // an honest verb (DD §13.3), never a gag
  note?: string; // the price or the cost of not paying it
  effects: Partial<Record<EventEffect, number>>;
}

export interface EventDef {
  id: string;
  kind: EventKind;
  weight: number;
  cooldownYears: number;
  when: Partial<Record<EventCondition, number>>;
  title?: string; // seismic events are letters, and letters have titles
  text: string;
  timeoutWeeks: number;
  choices: ChoiceDef[];
  default: string;
}

const PLACEHOLDERS = ['building', 'faculty', 'program', 'class', 'school'] as const;

const conditions = obj(
  Object.fromEntries(EVENT_CONDITIONS.map((c) => [c, optional(num)])),
) as unknown as (v: unknown, p: string) => Partial<Record<EventCondition, number>>;

const effects = obj(
  Object.fromEntries(EVENT_EFFECTS.map((e) => [e, optional(num)])),
) as unknown as (v: unknown, p: string) => Partial<Record<EventEffect, number>>;

const fileSchema = obj({
  events: arr(
    obj({
      id: str,
      kind: oneOf(['inline', 'seismic']),
      weight: num,
      cooldownYears: num,
      when: conditions,
      title: optional(str),
      text: str,
      timeoutWeeks: num,
      choices: arr(obj({ id: str, label: str, note: optional(str), effects })),
      default: str,
    }),
  ),
  readings: obj({ pending: str, mood: str, history: str }),
  lines: obj({
    timeout: str,
    resolved: str,
    expiresIn: str,
    expiresSoon: str,
    defaultNote: str,
  }),
});

function load() {
  const file = validate(fileSchema, raw, 'content/events.json');
  const events = uniqueBy(file.events, (e) => e.id, 'content/events.json.events') as EventDef[];
  for (const e of events) {
    const at = `content/events.json.${e.id}`;
    // DD §10.1: two or three choices, each doing something, one of them
    // the stated default an unanswered event settles into.
    if (e.choices.length < 2 || e.choices.length > 3) {
      throw new ContentError(at, 'an event offers two or three choices');
    }
    uniqueBy(e.choices, (c) => c.id, `${at}.choices`);
    if (!e.choices.some((c) => c.id === e.default)) {
      throw new ContentError(at, `default "${e.default}" is not one of its choices`);
    }
    if (e.weight <= 0 || e.timeoutWeeks < 1) throw new ContentError(at, 'weightless or instant');
    if (e.kind === 'seismic' && !e.title)
      throw new ContentError(at, 'a seismic event is a letter and needs a title');
    for (const c of e.choices) {
      if (Object.keys(c.effects).length === 0) {
        throw new ContentError(`${at}.${c.id}`, 'a choice must do something');
      }
    }
    for (const m of e.text.matchAll(/\{(\w+)\}/g)) {
      if (!PLACEHOLDERS.includes(m[1] as (typeof PLACEHOLDERS)[number])) {
        throw new ContentError(at, `unknown placeholder {${m[1]}}`);
      }
    }
  }
  return { events, readings: file.readings, lines: file.lines };
}

const loaded = load();

export const EVENTS: readonly EventDef[] = loaded.events;
export const EVENT_READINGS = loaded.readings;
export const EVENT_WORDS = loaded.lines;

export function findEvent(id: string): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}

export function eventById(id: string): EventDef {
  const e = findEvent(id);
  if (!e) throw new Error(`unknown event ${id}`);
  return e;
}
