import { TERMS, WEEKS_IN_TERM, type Term } from '../sim/calendar.ts';
import raw from './calendar-beats.json' with { type: 'json' };
import { arr, ContentError, int, obj, oneOf, optional, str, uniqueBy, validate } from './schema.ts';

// The four fixed annual moments (DD §3.3). Content, not code: the sim fires
// them on the tick that lands on their week (sim/beats.ts) and everything
// the player reads about one — the ticker prompt, the journal lines, the
// screen's own words — is written here.

export interface CalendarBeat {
  id: string;
  name: string;
  term: Term;
  week: number;
  dd?: string;
  // The plan phase whose screen replaces the placeholder.
  phase: number;
  // The NEXT slot's reading while the beat waits.
  prompt: string;
  // Journal lines when the beat fires and when it is resolved.
  firedLine: string;
  resolvedLine: string;
  // The placeholder screen: what happens today, and what the screen will
  // hold once its phase lands.
  blurb: string;
  stub: string;
  // The resolving button's honest verb (DD §13.3).
  resolveLabel: string;
}

const beatSchema = obj({
  id: str,
  name: str,
  term: oneOf(TERMS as readonly Term[] as ['fall', 'spring', 'summer']),
  week: int,
  dd: optional(str),
  phase: int,
  prompt: str,
  firedLine: str,
  resolvedLine: str,
  blurb: str,
  stub: str,
  resolveLabel: str,
});

const fileSchema = obj({ beats: arr(beatSchema) });

function load(): CalendarBeat[] {
  const file = validate(fileSchema, raw, 'content/calendar-beats.json');
  const beats = uniqueBy(file.beats, (b) => b.id, 'content/calendar-beats.json.beats');
  const weeks = new Set<string>();
  for (const [i, b] of beats.entries()) {
    const path = `content/calendar-beats.json.beats[${i}]`;
    if (b.week < 1 || b.week > WEEKS_IN_TERM[b.term]) {
      throw new ContentError(
        `${path}.week`,
        `week ${b.week} is outside ${b.term} (1–${WEEKS_IN_TERM[b.term]})`,
      );
    }
    // One beat per week: a beat holds the clock until resolved, and two in
    // one week would have to queue.
    const slot = `${b.term}:${b.week}`;
    if (weeks.has(slot)) throw new ContentError(`${path}.week`, `two beats fall on ${slot}`);
    weeks.add(slot);
  }
  return beats;
}

export const CALENDAR_BEATS: readonly CalendarBeat[] = load();

export function beatsAt(term: Term, week: number): readonly CalendarBeat[] {
  return CALENDAR_BEATS.filter((b) => b.term === term && b.week === week);
}

export function findBeat(id: string): CalendarBeat | undefined {
  return CALENDAR_BEATS.find((b) => b.id === id);
}

export function beatById(id: string): CalendarBeat {
  const beat = findBeat(id);
  if (!beat) throw new Error(`unknown calendar beat ${id}`);
  return beat;
}
