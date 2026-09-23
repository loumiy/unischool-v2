import raw from './faculty.json' with { type: 'json' };
import { arr, ContentError, num, obj, optional, str, uniqueBy, validate } from './schema.ts';

// THE FACULTY CATALOGUE (DD §7.3, §14): the ranks, the quirks — one wry
// line each, mechanically real — the name pools the market draws from,
// and the words on the Faculty screen. Fifteen of the forty quirks are
// seeded here; the rest arrive with the phases that need them.

export type RankId = 'assistant' | 'associate' | 'full';

export interface RankDef {
  id: RankId;
  name: string;
  short: string;
}

// What a quirk does: points on a skill, a multiplier on the asking
// salary, points of morale on every cohort. Absent means none.
export interface QuirkEffects {
  teaching?: number;
  research?: number;
  salary?: number;
  morale?: number;
}

export interface QuirkDef {
  id: string;
  name: string;
  line: string;
  effects: QuirkEffects;
}

export type Gender = 'male' | 'female';

const fileSchema = obj({
  ranks: arr(obj({ id: str, name: str, short: str })),
  quirks: arr(
    obj({
      id: str,
      name: str,
      line: str,
      effects: obj({
        teaching: optional(num),
        research: optional(num),
        salary: optional(num),
        morale: optional(num),
      }),
    }),
  ),
  names: obj({
    given: obj({ male: arr(str), female: arr(str) }),
    surnames: (v, p) => {
      if (typeof v !== 'object' || v === null || Array.isArray(v))
        throw new ContentError(p, 'expected an object');
      const out: Record<string, string[]> = {};
      for (const [k, list] of Object.entries(v as Record<string, unknown>))
        out[k] = arr(str)(list, `${p}.${k}`);
      return out;
    },
  }),
  readings: obj({
    headcount: str,
    payroll: str,
    adminShare: str,
    teaching: str,
    market: str,
    teachingSkill: str,
    researchSkill: str,
    salary: str,
    programQuality: str,
    staffing: str,
  }),
  lines: obj({
    noFaculty: str,
    marketClosed: str,
    marketOpen: str,
    marketEmpty: str,
    frozen: str,
    hire: str,
    dismiss: str,
    dismissConfirm: str,
    unassigned: str,
    assignLabel: str,
    noProgramsForSchool: str,
    unfoundedField: str,
    taughtBy: str,
    nobodyTeaches: str,
    unassignedNote: str,
    quirkLabel: str,
    rankAndField: str,
    untaughtWarning: str,
    untaughtConfirm: str,
  }),
});

function load() {
  const file = validate(fileSchema, raw, 'content/faculty.json');
  const ranks = uniqueBy(file.ranks, (r) => r.id, 'content/faculty.json.ranks') as RankDef[];
  if (ranks.map((r) => r.id).join(',') !== 'assistant,associate,full') {
    throw new Error('content/faculty.json.ranks: expected assistant, associate, full in order');
  }
  const quirks = uniqueBy(file.quirks, (q) => q.id, 'content/faculty.json.quirks') as QuirkDef[];
  for (const q of quirks) {
    const s = q.effects.salary;
    if (s !== undefined && (s <= 0 || s > 2))
      throw new ContentError(`content/faculty.json.quirks.${q.id}`, 'salary factor out of range');
    if (Object.keys(q.effects).length === 0)
      throw new ContentError(`content/faculty.json.quirks.${q.id}`, 'a quirk must do something');
  }
  const heritages = Object.keys(file.names.surnames);
  if (heritages.length === 0) throw new Error('content/faculty.json: no surname pools');
  for (const g of ['male', 'female'] as const) {
    if (file.names.given[g].length === 0)
      throw new Error(`content/faculty.json: no ${g} given names`);
  }
  return {
    ranks,
    quirks,
    names: file.names,
    heritages,
    readings: file.readings,
    lines: file.lines,
  };
}

const loaded = load();

export const RANKS: readonly RankDef[] = loaded.ranks;
export const QUIRKS: readonly QuirkDef[] = loaded.quirks;
export const NAME_POOLS = loaded.names;
export const HERITAGES: readonly string[] = loaded.heritages;
export const FACULTY_READINGS = loaded.readings;
export const FACULTY_WORDS = loaded.lines;

// "an Associate Professor", "a Professor": the article a rank's name takes.
export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

export function rankById(id: RankId): RankDef {
  return RANKS.find((r) => r.id === id)!;
}

export function findQuirk(id: string): QuirkDef | undefined {
  return QUIRKS.find((q) => q.id === id);
}

export function quirkById(id: string): QuirkDef {
  const q = findQuirk(id);
  if (!q) throw new Error(`unknown quirk ${id}`);
  return q;
}
