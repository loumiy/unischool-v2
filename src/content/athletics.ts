import raw from './athletics.json' with { type: 'json' };
import { findBuilding } from './buildings.ts';
import { arr, ContentError, int, num, obj, oneOf, str, uniqueBy, validate } from './schema.ts';

// ATHLETICS-LITE (DD §8.5): varsity teams toggled on with the facilities
// they need, an athletics budget, and seasons that resolve as results. No
// rosters. And the rival's lines (DD §11.3).

export const BUDGET_IDS = ['lean', 'standard', 'ambitious'] as const;
export type AthleticsBudget = (typeof BUDGET_IDS)[number];

export interface SportDef {
  id: string;
  name: string;
  season: 'fall' | 'spring';
  requires: string[]; // any one of these buildings; none means nothing but the stream
  cost: number; // a year, at the standard budget
  blurb: string;
}

const schema = obj({
  sports: arr(
    obj({
      id: str,
      name: str,
      season: oneOf(['fall', 'spring'] as const),
      requires: arr(str),
      cost: int,
      blurb: str,
    }),
  ),
  budgets: arr(obj({ id: oneOf(BUDGET_IDS), label: str, factor: num, note: str })),
  taunts: obj({ ahead: arr(str), behind: arr(str), beat: arr(str), lost: arr(str) }),
  lines: obj({ season: str, champions: str, rivalNamed: str }),
  words: obj({
    title: str,
    varsity: str,
    budget: str,
    budgetHint: str,
    cost: str,
    needs: str,
    noNeed: str,
    on: str,
    off: str,
    record: str,
    title_won: str,
    noSeasons: str,
    rival: str,
    rivalLine: str,
    rivalSince: str,
    rivalNone: str,
    headToHead: str,
    rivalAhead: str,
    rivalBehind: str,
    rivalLevel: str,
    lifeHint: str,
  }),
});

function load() {
  const file = validate(schema, raw, 'content/athletics.json');
  const sports = uniqueBy(file.sports, (s) => s.id, 'content/athletics.json.sports');
  for (const [i, s] of sports.entries()) {
    for (const b of s.requires) {
      if (!findBuilding(b))
        throw new ContentError(`content/athletics.json.sports[${i}].requires`, `unknown ${b}`);
    }
  }
  for (const id of BUDGET_IDS) {
    if (!file.budgets.some((b) => b.id === id))
      throw new ContentError('content/athletics.json.budgets', `missing ${id}`);
  }
  for (const [k, lines] of Object.entries(file.taunts)) {
    if (lines.length === 0) throw new ContentError(`content/athletics.json.taunts.${k}`, 'empty');
  }
  return { ...file, sports: sports as SportDef[] };
}

const loaded = load();

export const SPORTS: readonly SportDef[] = loaded.sports;
export const ATHLETICS_BUDGETS = loaded.budgets;
export const TAUNTS = loaded.taunts;
export const ATHLETICS_WORDS = loaded.words;
export const ATHLETICS_LINES = loaded.lines;

export function sportById(id: string): SportDef {
  const s = SPORTS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown sport "${id}"`);
  return s;
}

export function budgetFactor(id: AthleticsBudget): number {
  return ATHLETICS_BUDGETS.find((b) => b.id === id)!.factor;
}
