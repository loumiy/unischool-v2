import {
  EXPENSE_CATEGORIES,
  REVENUE_CATEGORIES,
  type ExpenseCategory,
  type RevenueCategory,
} from '../sim/treasury.ts';
import raw from './treasury.json' with { type: 'json' };
import { arr, int, num, obj, optional, str, validate } from './schema.ts';

// The words on the Treasury screen (DD §5.3, §13.2): a label and the one
// tooltip sentence for every line and every reading. Content, so the
// explanations are edited where they are written.

export interface LineWords {
  label: string;
  hint: string;
  // The plan phase that makes the line move; absent when it already does.
  phase?: number;
}

const lineSchema = obj({ label: str, hint: str, phase: optional(int) });

const fileSchema = obj({
  revenue: obj(Object.fromEntries(REVENUE_CATEGORIES.map((k) => [k, lineSchema]))),
  expenses: obj(Object.fromEntries(EXPENSE_CATEGORIES.map((k) => [k, lineSchema]))),
  readings: obj({
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
    }),
    pay: obj({ cash: str, debt: str }),
  }),
});

const file = validate(fileSchema, raw, 'content/treasury.json');

export const REVENUE_WORDS = file.revenue as Record<RevenueCategory, LineWords>;
export const EXPENSE_WORDS = file.expenses as Record<ExpenseCategory, LineWords>;
export const READING_WORDS = file.readings;
export const ESTATE_WORDS = file.estate;

// The word for a condition, from the first band it clears.
export function conditionWord(condition: number): string {
  return ESTATE_WORDS.condition.find((b) => condition >= b.atLeast)?.word ?? 'derelict';
}
