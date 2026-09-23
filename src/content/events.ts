import { BUILDINGS } from './buildings.ts';
import { TAG_IDS, type TagId } from './identityTags.ts';
import { CHARTER_IDS, type CharterId } from './charters.ts';
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
  'winterAtLeast', // how deep the winter is this week, 0–1 (sim/weather.ts)
  // Money (treasury.ts)
  'cashUnder',
  'cashOver',
  'endowmentOver',
  'endowmentUnder',
  'debtOver',
  'debtUnder',
  'deficitOver', // this year's expenses over its revenue, so far
  'drawRateOver',
  'tuitionOver',
  'adminShareOver',
  'payrollShareOver',
  // The board and the ladder (distress.ts)
  'rungAtLeast',
  'rungAtMost',
  'confidenceUnder',
  'confidenceOver',
  // The estate (estate.ts)
  'backlogOver',
  'backlogUnder',
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
  // The world (Phases 22–23)
  'rankAtLeast', // the college's place in the guide's latest table
  'varsityAtLeast', // varsity teams fielded
  'titlesAtLeast', // championships won this year and last
  'rivalAtLeast', // 1 once the college has a rival
  // The 1.1 systems (Phase 51)
  'adjunctsOver', // adjuncts on the roster (Phase 39)
  'reputationOver', // the talk at the gate (Phase 37)
  'reputationUnder',
  'projectsOver', // capital projects standing (Phase 42)
  'projectsBuildingOver', // capital projects going up
  'projectNewUnder', // years since the newest capital project opened
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
  // The named subject (Phase 24): the {faculty} an outside offer is made
  // to leaves, or is kept with a raise; the {suitor} making it is more of
  // a rival for it.
  'departs',
  'counter',
  'rivalry',
  // A STANDING COST (Phase 21H): dollars a year, forever, added to a
  // payroll line. "$120k a year, forever" used to pull `cash` exactly once;
  // this is the recurring charge the satire assumed, and the ratchet DD
  // §5.4 describes — the administration's share climbs from the events
  // that deserve it.
  'adminPayroll',
  'facultyPayroll',
] as const;
export type EventEffect = (typeof EVENT_EFFECTS)[number];

export type EventKind = 'inline' | 'seismic';

// Whose desk an event lands on (DD §9.2). A domain with a filled seat can
// have its minor events handled without the President; `money` and `board`
// have no seat, which is why those always reach the President.
export const EVENT_DOMAINS = [
  'estate',
  'academic',
  'students',
  'advancement',
  'money',
  'board',
] as const;
export type EventDomain = (typeof EVENT_DOMAINS)[number];

export interface ChoiceDef {
  id: string;
  label: string; // an honest verb (DD §13.3), never a gag
  note?: string; // the price or the cost of not paying it
  effects: Partial<Record<EventEffect, number>>;
}

export interface EventDef {
  id: string;
  kind: EventKind;
  domain: EventDomain;
  weight: number;
  cooldownYears: number;
  when: Partial<Record<EventCondition, number>>;
  title?: string; // seismic events are letters, and letters have titles
  text: string;
  timeoutWeeks: number;
  choices: ChoiceDef[];
  default: string;
  // Buildings the college must have OPEN for this to be true of it (Phase
  // 21H): an event whose prose names the Health Centre cannot fire at a
  // college without one. The `when` vocabulary is numbers; this is the
  // standing clause it could not express.
  needs: string[];
  // Identity (Phase 24): tags whose colleges this happens to more often,
  // and whether the engine never rolls it — a scripted event is put on
  // the docket by a system (the league's poaching), not by the dice.
  favours: TagId[];
  scripted: boolean;
  // Charters (Phase 51): the founding charters this can happen to; empty
  // for any college. A land-grant college hears from the extension
  // farms, and nobody else does.
  charters: CharterId[];
}

const PLACEHOLDERS = [
  'building',
  'faculty',
  'program',
  'class',
  'school',
  'rival',
  'sport',
  'suitor',
] as const;

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
      domain: oneOf(EVENT_DOMAINS),
      weight: num,
      cooldownYears: num,
      when: conditions,
      title: optional(str),
      text: str,
      timeoutWeeks: num,
      choices: arr(obj({ id: str, label: str, note: optional(str), effects })),
      default: str,
      needs: optional(arr(str)),
      favours: optional(arr(oneOf(TAG_IDS))),
      charters: optional(arr(oneOf(CHARTER_IDS))),
      scripted: optional((v: unknown, p: string) => {
        if (typeof v !== 'boolean') throw new ContentError(p, 'expected a boolean');
        return v;
      }),
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
  const events = uniqueBy(
    file.events.map((e) => ({
      ...e,
      needs: e.needs ?? [],
      favours: e.favours ?? [],
      scripted: e.scripted ?? false,
      charters: e.charters ?? [],
    })),
    (e) => e.id,
    'content/events.json.events',
  ) as EventDef[];
  const catalogue = new Set(BUILDINGS.map((b) => b.id));
  for (const e of events) {
    const at = `content/events.json.${e.id}`;
    for (const id of e.needs) {
      if (!catalogue.has(id)) throw new ContentError(`${at}.needs`, `no building "${id}"`);
    }
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
