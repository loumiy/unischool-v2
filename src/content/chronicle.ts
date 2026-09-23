import raw from './chronicle.json' with { type: 'json' };
import { arr, ContentError, obj, str, validate } from './schema.ts';

// THE CHRONICLE'S WORDS (DD §12.1): the era-name templates the historian
// chooses between, the sentences an era's summary is built from, and the
// History screen's own words. Writing lives here; the detection is
// sim/chronicle.ts.

export const ERA_KINDS = [
  'founding',
  'building',
  'troubles',
  'receivership',
  'rise',
  'decline',
  'campaign',
  'rivalry',
  'golden',
  'quiet',
  'eventful', // a quiet stretch with one thing in it everyone remembers
] as const;
export type EraKind = (typeof ERA_KINDS)[number];

const names = obj(Object.fromEntries(ERA_KINDS.map((k) => [k, arr(str)])));

const schema = obj({
  names,
  lines: obj({
    span: str,
    spanOne: str,
    built: str,
    builtNone: str,
    rank: str,
    rankFlat: str,
    money: str,
    classes: str,
    troubles: str,
    titles: str,
    tags: str,
    demolished: str,
    historicDown: str,
    rival: str,
    kept: str,
    missed: str,
    weathered: str,
    classesPlain: str,
  }),
  words: obj({
    title: str,
    draft: str,
    eras: str,
    timeline: str,
    alumni: str,
    alumniNone: str,
    rival: str,
    rivalNone: str,
    export: str,
    exported: str,
    built: str,
    demolished: str,
    historic: str,
    storey: str,
    sagaNamed: str,
    sagaGames: str,
    sagaTable: str,
    sagaPoached: str,
    sagaTaunts: str,
  }),
});

function load() {
  const file = validate(schema, raw, 'content/chronicle.json');
  const n = file.names as Record<EraKind, string[]>;
  for (const k of ERA_KINDS) {
    if (n[k].length === 0) throw new ContentError(`content/chronicle.json.names.${k}`, 'empty');
  }
  return { names: n, lines: file.lines, words: file.words };
}

const loaded = load();
export const ERA_NAMES = loaded.names;
export const CHRONICLE_LINES = loaded.lines;
export const CHRONICLE_WORDS = loaded.words;
