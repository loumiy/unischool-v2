import raw from './notes.json' with { type: 'json' };
import { EVENT_CONDITIONS, type EventCondition } from './events.ts';
import {
  arr,
  ContentError,
  int,
  num,
  obj,
  oneOf,
  optional,
  str,
  uniqueBy,
  validate,
} from './schema.ts';

// ONBOARDING BY CONSEQUENCE (DD §13.2, Phase 29): no tutorial, only notes
// from the people who work at the college, each the first time the thing
// it is about happens — the first budget, the first question on the
// strip, the first faculty member paid to teach nothing. Written here;
// the moment each is due is sim-readable (the event engine's conditions,
// a beat, or a named special case).

export const NOTE_SPECIALS = [
  'noBeds',
  'eventPending',
  'unassigned',
  'noProvost',
  'hasTag',
  'landScarce',
] as const;
export type NoteSpecial = (typeof NOTE_SPECIALS)[number];

export interface NoteDef {
  id: string;
  from: string;
  title: string;
  text: string;
  when: Partial<Record<EventCondition, number>>;
  beat?: string;
  afterWeek?: number;
  special?: NoteSpecial;
}

const conditions = obj(
  Object.fromEntries(EVENT_CONDITIONS.map((c) => [c, optional(num)])),
) as unknown as (v: unknown, p: string) => Partial<Record<EventCondition, number>>;

const schema = obj({
  notes: arr(
    obj({
      id: str,
      from: str,
      title: str,
      text: str,
      when: optional(conditions),
      beat: optional(str),
      afterWeek: optional(int),
      special: optional(oneOf(NOTE_SPECIALS)),
    }),
  ),
  words: obj({ dismiss: str, from: str }),
});

function load() {
  const file = validate(schema, raw, 'content/notes.json');
  const notes = uniqueBy(file.notes, (n) => n.id, 'content/notes.json.notes');
  for (const [i, n] of notes.entries()) {
    const sentences = n.text.split(/(?<=[.!?])\s+/).length;
    if (sentences > 4)
      throw new ContentError(`content/notes.json.notes[${i}]`, 'four sentences at most');
  }
  return {
    notes: notes.map((n) => ({ ...n, when: n.when ?? {} })) as NoteDef[],
    words: file.words,
  };
}

const loaded = load();
export const NOTES: readonly NoteDef[] = loaded.notes;
export const NOTE_WORDS = loaded.words;
