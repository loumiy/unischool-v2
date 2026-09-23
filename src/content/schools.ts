import raw from './schools.json' with { type: 'json' };
import { arr, int, num, obj, oneOf, str, uniqueBy, validate } from './schema.ts';
import type { RankId } from './faculty.ts';

// THE ACADEMIC CATALOGUE (DD §7.2, §14): six schools, thirty programs,
// three tiers. A program's courses are generated flavour (DD §7.1): six
// titles, two a level, numbered from the code, revealed a level at a
// time as the program's tier rises.

export type TierId = 'founded' | 'established' | 'renowned';

export interface TierDef {
  id: TierId;
  name: string;
  seats: number;
  costFactor: number;
  // The tier's multiplier on program quality (DD §7.4).
  qualityFactor: number;
  // The rank of the senior hire that must be assigned to reach the tier and
  // to hold it (DD §7.2); none at Founded.
  leadRank: RankId | null;
  levels: number; // course levels on the catalogue at this tier (1–3)
}

export interface ProgramDef {
  id: string;
  name: string;
  code: string; // "ENGL"
  blurb: string;
  courses: string[]; // six titles, two a level
  schoolId: string;
}

export interface SchoolDef {
  id: string;
  name: string;
  hue: string;
  mark: string;
  blurb: string;
  programs: ProgramDef[];
}

const fileSchema = obj({
  tiers: arr(
    obj({
      id: str,
      name: str,
      seats: int,
      costFactor: num,
      qualityFactor: num,
      leadRank: (v, p) => (v === null ? null : oneOf(['assistant', 'associate', 'full'])(v, p)),
      levels: int,
    }),
  ),
  schools: arr(
    obj({
      id: str,
      name: str,
      hue: str,
      mark: str,
      blurb: str,
      programs: arr(obj({ id: str, name: str, code: str, blurb: str, courses: arr(str) })),
    }),
  ),
  words: obj({
    readings: obj({
      schools: str,
      programs: str,
      programCosts: str,
      halls: str,
      tier: str,
      seats: str,
      annualCost: str,
      signatures: str,
      crowding: str,
      advance: str,
      lead: str,
      neglect: str,
    }),
    lines: obj({
      found: str,
      needHall: str,
      frozen: str,
      noPrograms: str,
      open: str,
      close: str,
      closeConfirm: str,
      houses: str,
      noSchool: str,
      notAHall: str,
      hallOption: str,
      unfoundedNote: str,
      advance: str,
      advancing: str,
      stalled: str,
      needsLead: str,
      topTier: str,
      signature: str,
      makeSignature: str,
      dropSignature: str,
      signaturesFull: str,
      neglected: str,
      crowded: str,
      coursesOffered: str,
    }),
  }),
});

const COURSES_PER_LEVEL = 2;

function load() {
  const file = validate(fileSchema, raw, 'content/schools.json');
  const tiers = uniqueBy(file.tiers, (t) => t.id, 'content/schools.json.tiers') as TierDef[];
  if (tiers.map((t) => t.id).join(',') !== 'founded,established,renowned') {
    throw new Error('content/schools.json.tiers: expected founded, established, renowned in order');
  }
  const schools: SchoolDef[] = uniqueBy(
    file.schools,
    (s) => s.id,
    'content/schools.json.schools',
  ).map((s) => ({ ...s, programs: s.programs.map((p) => ({ ...p, schoolId: s.id })) }));
  const programs = schools.flatMap((s) => s.programs);
  uniqueBy(programs, (p) => p.id, 'content/schools.json.programs');
  uniqueBy(programs, (p) => p.code, 'content/schools.json.programs.code');
  for (const p of programs) {
    if (p.courses.length !== COURSES_PER_LEVEL * 3) {
      throw new Error(`content/schools.json: ${p.id} needs ${COURSES_PER_LEVEL * 3} courses`);
    }
  }
  if (schools.length !== 6) throw new Error('content/schools.json: six schools (DD §7.2)');
  if (programs.length !== 30) throw new Error('content/schools.json: thirty programs (DD §14)');
  return { tiers, schools, programs, words: file.words };
}

const loaded = load();

export const TIERS: readonly TierDef[] = loaded.tiers;
export const SCHOOLS: readonly SchoolDef[] = loaded.schools;
export const PROGRAMS: readonly ProgramDef[] = loaded.programs;
export const ACADEMIC_WORDS = loaded.words;

export function tierById(id: TierId): TierDef {
  return TIERS.find((t) => t.id === id)!;
}

export function findSchool(id: string): SchoolDef | undefined {
  return SCHOOLS.find((s) => s.id === id);
}

export function schoolById(id: string): SchoolDef {
  const s = findSchool(id);
  if (!s) throw new Error(`unknown school ${id}`);
  return s;
}

export function findProgram(id: string): ProgramDef | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

export function programById(id: string): ProgramDef {
  const p = findProgram(id);
  if (!p) throw new Error(`unknown program ${id}`);
  return p;
}

// A program's catalogue: its six courses with generated codes ("ENGL 101"),
// each marked with the level it belongs to. The tier decides how many
// levels are on offer.
export interface CourseListing {
  code: string;
  title: string;
  level: number;
}

export function courseListings(program: ProgramDef): CourseListing[] {
  return program.courses.map((title, i) => {
    const level = Math.floor(i / COURSES_PER_LEVEL) + 1;
    const n = (i % COURSES_PER_LEVEL) + 1;
    return { code: `${program.code} ${level}0${n}`, title, level };
  });
}
