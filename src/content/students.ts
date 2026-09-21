import raw from './students.json' with { type: 'json' };
import { arr, ContentError, int, obj, oneOf, str, uniqueBy, validate } from './schema.ts';

// NAMED STUDENTS (DD §8.1): the given names the game draws from, and the
// arc beats it can write about them. A beat is a template with a
// CONDITION — a named fact about the student's class at that moment — so
// the writing is selected from cohort truth rather than invented on top of
// it (guardrail §17.4). The conditions are a closed list, checked here, so
// a typo in the content is a load error rather than a beat that never
// fires.

export const ARC_CONDITIONS = [
  'always',
  'triples',
  'crowdedDining',
  'crowdedSeats',
  'derelict',
  'beautiful',
  'hasQuad',
  'goodTeaching',
  'noTeaching',
  'thinFaculty',
  'austerity',
  'frozen',
  'receivership',
  'strongClass',
  'weakClass',
  'unhappy',
  'happy',
  'newBuilding',
  'programClosed',
  'programAdvanced',
] as const;
export type ArcCondition = (typeof ARC_CONDITIONS)[number];

// When in a student's life a beat can be told: a year of study, the term
// they leave, or the way they graduated.
export const ARC_STAGES = ['year', 'leaving', 'distinguished', 'placed', 'adrift'] as const;
export type ArcStage = (typeof ARC_STAGES)[number];

export interface ArcDef {
  id: string;
  when: ArcCondition;
  stage: ArcStage;
  line: string;
  weight: number;
}

// {tag} is how a student signs themselves in the ticker: their program's
// code and their class, or just their class while they have no program.
const PLACEHOLDERS = [
  'name',
  'first',
  'tag',
  'code',
  'class',
  'program',
  'school',
  'quad',
] as const;

const fileSchema = obj({
  given: obj({ male: arr(str), female: arr(str) }),
  arcs: arr(
    obj({ id: str, when: oneOf(ARC_CONDITIONS), stage: oneOf(ARC_STAGES), line: str, weight: int }),
  ),
  readings: obj({ named: str, arc: str, outcome: str }),
  lines: obj({
    none: str,
    enrolled: str,
    unplaced: str,
    years: arr(str),
    graduated: str,
    left: str,
    introduced: str,
  }),
});

function load() {
  const file = validate(fileSchema, raw, 'content/students.json');
  const arcs = uniqueBy(file.arcs, (a) => a.id, 'content/students.json.arcs') as ArcDef[];
  for (const a of arcs) {
    if (a.weight <= 0) throw new ContentError(`content/students.json.arcs.${a.id}`, 'weightless');
    for (const m of a.line.matchAll(/\{(\w+)\}/g)) {
      if (!PLACEHOLDERS.includes(m[1] as (typeof PLACEHOLDERS)[number])) {
        throw new ContentError(`content/students.json.arcs.${a.id}`, `unknown {${m[1]}}`);
      }
    }
  }
  // Every stage a student can reach needs something to say, whatever the
  // conditions do; the unconditional ones are the floor.
  for (const stage of ARC_STAGES) {
    if (!arcs.some((a) => a.stage === stage && a.when === 'always')) {
      throw new Error(`content/students.json: ${stage} has no unconditional beat`);
    }
  }
  if (file.lines.years.length !== 4) throw new Error('content/students.json: four years of study');
  for (const g of ['male', 'female'] as const) {
    if (file.given[g].length < 20) throw new Error(`content/students.json: too few ${g} names`);
  }
  return { given: file.given, arcs, readings: file.readings, lines: file.lines };
}

const loaded = load();

export const STUDENT_NAMES = loaded.given;
export const ARCS: readonly ArcDef[] = loaded.arcs;
export const STUDENT_READINGS = loaded.readings;
export const STUDENT_WORDS = loaded.lines;

export function findArc(id: string): ArcDef | undefined {
  return ARCS.find((a) => a.id === id);
}
