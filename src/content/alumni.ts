import raw from './alumni.json' with { type: 'json' };
import { arr, ContentError, int, obj, oneOf, str, uniqueBy, validate } from './schema.ts';

// CLASS MEMORY (DD §8.4): the clauses a class's four years can earn, each
// with what it does to how they remember the place. A clause is chosen by
// a CONDITION read off the journal of those four years and the numbers
// they left with — the memory is a summary of what happened, not a mood
// rolled at graduation.

export const MEMORY_CONDITIONS = [
  'always',
  'overcrowded',
  'thinned',
  'poorlyTaught',
  'wellTaught',
  'happy',
  'unhappy',
  'building',
  'renovated',
  'newSchool',
  'firstOfProgram',
  'programLost',
  'freeze',
  'austerity',
  'receivership',
  'cuts',
  'deficits',
  'distinguished',
  'adrift',
  'beautiful',
] as const;
export type MemoryCondition = (typeof MEMORY_CONDITIONS)[number];

export interface ClauseDef {
  id: string;
  when: MemoryCondition;
  text: string;
  warmth: number;
}

const fileSchema = obj({
  clauses: arr(obj({ id: str, when: oneOf(MEMORY_CONDITIONS), text: str, warmth: int })),
  memoryLine: str,
  readings: obj({
    warmth: str,
    memory: str,
    giving: str,
    annualFund: str,
    given: str,
    reunion: str,
  }),
  lines: obj({
    reunion: str,
    reunionDone: str,
    reunionCapped: str,
    noAlumni: str,
    warmthNote: str,
  }),
});

function load() {
  const file = validate(fileSchema, raw, 'content/alumni.json');
  const clauses = uniqueBy(file.clauses, (c) => c.id, 'content/alumni.json.clauses') as ClauseDef[];
  uniqueBy(clauses, (c) => c.when, 'content/alumni.json.clauses.when');
  if (!clauses.some((c) => c.when === 'always')) {
    throw new Error('content/alumni.json: a class with an uneventful four years still gets a line');
  }
  for (const c of clauses) {
    if (c.text.length === 0) throw new ContentError(`content/alumni.json.${c.id}`, 'empty');
  }
  for (const key of ['label', 'clauses'] as const) {
    if (!file.memoryLine.includes(`{${key}}`)) {
      throw new Error(`content/alumni.json.memoryLine: needs {${key}}`);
    }
  }
  return { clauses, memoryLine: file.memoryLine, readings: file.readings, lines: file.lines };
}

const loaded = load();

export const MEMORY_CLAUSES: readonly ClauseDef[] = loaded.clauses;
export const MEMORY_LINE = loaded.memoryLine;
export const ALUMNI_READINGS = loaded.readings;
export const ALUMNI_WORDS = loaded.lines;

export function findClause(id: string): ClauseDef | undefined {
  return MEMORY_CLAUSES.find((c) => c.id === id);
}
