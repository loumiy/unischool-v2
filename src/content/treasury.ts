import type { BuildingDef } from './buildings.ts';
import {
  EXPENSE_CATEGORIES,
  REVENUE_CATEGORIES,
  type ExpenseCategory,
  type RevenueCategory,
} from '../sim/treasury.ts';
import raw from './treasury.json' with { type: 'json' };
import { arr, num, obj, str, validate } from './schema.ts';

// The words on the Treasury screen (DD §5.3, §13.2): a label and the one
// tooltip sentence for every line and every reading. Content, so the
// explanations are edited where they are written.

export interface LineWords {
  label: string;
  hint: string;
}

const lineSchema = obj({ label: str, hint: str });

const fileSchema = obj({
  revenue: obj(Object.fromEntries(REVENUE_CATEGORIES.map((k) => [k, lineSchema]))),
  expenses: obj(Object.fromEntries(EXPENSE_CATEGORIES.map((k) => [k, lineSchema]))),
  readings: obj({
    backlogDefined: str,
    cash: str,
    weekNet: str,
    endowment: str,
    drawRate: str,
    marketReturn: str,
    tuitionDependence: str,
    adminShare: str,
    backlog: str,
    budgetLine: str,
    actualLine: str,
    yearNet: str,
    debt: str,
    borrowingRoom: str,
    capital: str,
    maintenanceFunding: str,
  }),
  estate: obj({
    status: obj({ building: str, open: str, renovating: str }),
    condition: arr(obj({ atLeast: num, word: str })),
    hints: obj({
      cost: str,
      buildWeeks: str,
      upkeep: str,
      condition: str,
      backlog: str,
      renovate: str,
      demolish: str,
      provides: str,
      extend: str,
      historic: str,
    }),
    pay: obj({ cash: str, debt: str, gift: str }),
    historic: str,
    historicWarning: str,
    provides: obj({
      beds: str,
      meals: str,
      seats: str,
      life: str,
      draw: str,
      giving: str,
      beauty: str,
      school: str,
      nothing: str,
    }),
  }),
  reserves: obj({ title: str, body: str, half: str, all: str, sweep: str }),
});

const file = validate(fileSchema, raw, 'content/treasury.json');

export const REVENUE_WORDS = file.revenue as Record<RevenueCategory, LineWords>;
export const EXPENSE_WORDS = file.expenses as Record<ExpenseCategory, LineWords>;
export const READING_WORDS = file.readings;
export const ESTATE_WORDS = file.estate;
export const TREASURY_WORDS = { reserves: file.reserves };

// The word for a condition, from the first band it clears.
export function conditionWord(condition: number): string {
  return ESTATE_WORDS.condition.find((b) => condition >= b.atLeast)?.word ?? 'derelict';
}

// What a building gives, in the catalogue's own numbers (Phase 21J): the
// line the build tile and the building card both carry, so forty-odd
// types can be told apart by what they do rather than by their names.
export function providesLine(def: BuildingDef): string {
  const w = ESTATE_WORDS.provides;
  const c = def.capacity ?? {};
  const parts: string[] = [];
  for (const k of ['beds', 'meals', 'seats', 'life', 'draw', 'giving'] as const) {
    const n = c[k];
    if (n) parts.push(w[k].replace('{n}', n.toLocaleString('en-US')));
  }
  if (def.beauty) parts.push(w.beauty.replace('{n}', String(def.beauty)));
  if (def.housesSchool) parts.push(w.school);
  return parts.length ? parts.join(' · ') : w.nothing;
}
