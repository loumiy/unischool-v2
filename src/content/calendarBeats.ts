import { TERMS, WEEKS_IN_TERM, type Term } from '../sim/calendar.ts';
import raw from './calendar-beats.json' with { type: 'json' };
import { arr, ContentError, int, obj, oneOf, optional, str, uniqueBy, validate } from './schema.ts';

// The four fixed annual moments (DD §3.3). Content, not code: Phase 4 fires
// them as ticker prompts; here they are only data with a shape.

export interface CalendarBeat {
  id: string;
  name: string;
  term: Term;
  week: number;
  dd?: string;
}

const beatSchema = obj({
  id: str,
  name: str,
  term: oneOf(TERMS as readonly Term[] as ['fall', 'spring', 'summer']),
  week: int,
  dd: optional(str),
});

const fileSchema = obj({ beats: arr(beatSchema) });

function load(): CalendarBeat[] {
  const file = validate(fileSchema, raw, 'content/calendar-beats.json');
  const beats = uniqueBy(file.beats, (b) => b.id, 'content/calendar-beats.json.beats');
  for (const [i, b] of beats.entries()) {
    if (b.week < 1 || b.week > WEEKS_IN_TERM[b.term]) {
      throw new ContentError(
        `content/calendar-beats.json.beats[${i}].week`,
        `week ${b.week} is outside ${b.term} (1–${WEEKS_IN_TERM[b.term]})`,
      );
    }
  }
  return beats;
}

export const CALENDAR_BEATS: readonly CalendarBeat[] = load();

export function beatsAt(term: Term, week: number): readonly CalendarBeat[] {
  return CALENDAR_BEATS.filter((b) => b.term === term && b.week === week);
}
