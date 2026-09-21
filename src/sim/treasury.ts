import {
  ENDOWMENT_DRAW_DEFAULT,
  ENDOWMENT_DRAW_MAX,
  ENDOWMENT_DRAW_MIN,
  ENDOWMENT_DRAW_STEP,
  ENDOWMENT_MEAN_RETURN,
  ENDOWMENT_RETURN_SPREAD,
  FOUNDING_ADMIN_PAYROLL,
  STARTING_CASH,
  STARTING_ENDOWMENT,
} from '../tuning.ts';
import { emit } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';

// THE TREASURY (DD §5). Money is the weather: every week the school takes
// in and pays out along the categories of §5.1 and §5.2, the year runs
// against a budget approved the summer before, and the endowment earns
// whatever the markets gave that year and pays out its draw.
//
// Phase 5 wires the categories, the weekly flow, the fiscal year, the
// endowment and the budget decision. The lines that later phases fill
// (tuition and aid from enrollment, faculty payroll, maintenance, debt,
// programs) exist here at zero, typed and displayed, so nothing later has
// to be un-taught — only filled in.

export const REVENUE_CATEGORIES = [
  'tuition',
  'endowmentDraw',
  'donations',
  'researchOverhead',
  'auxiliaries',
] as const;
export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

export const EXPENSE_CATEGORIES = [
  'facultyPayroll',
  'adminPayroll',
  'maintenance',
  'financialAid',
  'debtService',
  'programs',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type Revenue = Record<RevenueCategory, number>;
export type Expenses = Record<ExpenseCategory, number>;

export interface Flows {
  revenue: Revenue;
  expenses: Expenses;
}

// A year's plan: annual amounts per category, approved the summer before
// (or at founding for Year 1).
export interface YearBudget extends Flows {
  year: number;
  drawRate: number;
  // The endowment the draw was computed on.
  endowmentBasis: number;
}

// A closed year, as the history and the chronicle will read it.
export interface YearSummary extends Flows {
  year: number;
  net: number;
  endowmentEnd: number;
  marketReturn: number;
}

export interface Treasury {
  cash: number; // operating funds
  endowment: number;
  drawRate: number; // the standing rate; the next budget is proposed at it
  budget: YearBudget; // this fiscal year's
  pendingBudget: YearBudget | null; // next year's, once approved at Budget & Hiring
  actual: Flows; // this year to date
  lastWeek: Flows; // the most recent week's movement
  // This fiscal year's market return on the endowment, and the endowment
  // the return is earned on (it accrues in equal weekly slices).
  marketReturn: number;
  endowmentBasis: number;
  debt: number; // borrowing arrives with construction (Ph.6)
  history: YearSummary[];
}

export function zeroRevenue(): Revenue {
  return { tuition: 0, endowmentDraw: 0, donations: 0, researchOverhead: 0, auxiliaries: 0 };
}

export function zeroExpenses(): Expenses {
  return {
    facultyPayroll: 0,
    adminPayroll: 0,
    maintenance: 0,
    financialAid: 0,
    debtService: 0,
    programs: 0,
  };
}

export function zeroFlows(): Flows {
  return { revenue: zeroRevenue(), expenses: zeroExpenses() };
}

export function sumRevenue(r: Revenue): number {
  return REVENUE_CATEGORIES.reduce((t, k) => t + r[k], 0);
}

export function sumExpenses(e: Expenses): number {
  return EXPENSE_CATEGORIES.reduce((t, k) => t + e[k], 0);
}

export function netOf(f: Flows): number {
  return sumRevenue(f.revenue) - sumExpenses(f.expenses);
}

export function clampDrawRate(rate: number): number {
  const stepped = Math.round(rate / ENDOWMENT_DRAW_STEP) * ENDOWMENT_DRAW_STEP;
  const clamped = Math.min(ENDOWMENT_DRAW_MAX, Math.max(ENDOWMENT_DRAW_MIN, stepped));
  return Number(clamped.toFixed(4));
}

// The year's market return is drawn from the seed and the year, not from
// the run's stream: the markets are the world's weather, and planting a
// tree should not change what the Dow did.
export function marketReturnFor(seed: number, year: number): number {
  const rng = Rng.fromSeed((seed ^ Math.imul(year, 0x9e3779b9)) >>> 0);
  const r = ENDOWMENT_MEAN_RETURN + (rng.next() * 2 - 1) * ENDOWMENT_RETURN_SPREAD;
  return Number(r.toFixed(4));
}

// Next year's plan from where the school stands now. Every line the sim
// can foresee is here; the ones later phases fill stay at zero.
export function proposeBudget(state: GameState, year: number, drawRate: number): YearBudget {
  const t = state.treasury;
  const rate = clampDrawRate(drawRate);
  return {
    year,
    drawRate: rate,
    endowmentBasis: t.endowment,
    revenue: { ...zeroRevenue(), endowmentDraw: Math.round(t.endowment * rate) },
    expenses: { ...zeroExpenses(), adminPayroll: FOUNDING_ADMIN_PAYROLL },
  };
}

export function foundingTreasury(seed: number): Treasury {
  const budget: YearBudget = {
    year: 1,
    drawRate: ENDOWMENT_DRAW_DEFAULT,
    endowmentBasis: STARTING_ENDOWMENT,
    revenue: {
      ...zeroRevenue(),
      endowmentDraw: Math.round(STARTING_ENDOWMENT * ENDOWMENT_DRAW_DEFAULT),
    },
    expenses: { ...zeroExpenses(), adminPayroll: FOUNDING_ADMIN_PAYROLL },
  };
  return {
    cash: STARTING_CASH,
    endowment: STARTING_ENDOWMENT,
    drawRate: ENDOWMENT_DRAW_DEFAULT,
    budget,
    pendingBudget: null,
    actual: zeroFlows(),
    lastWeek: zeroFlows(),
    marketReturn: marketReturnFor(seed, 1),
    endowmentBasis: STARTING_ENDOWMENT,
    debt: 0,
    history: [],
  };
}

function addFlows(a: Flows, b: Flows): Flows {
  const revenue = { ...a.revenue };
  const expenses = { ...a.expenses };
  for (const k of REVENUE_CATEGORIES) revenue[k] += b.revenue[k];
  for (const k of EXPENSE_CATEGORIES) expenses[k] += b.expenses[k];
  return { revenue, expenses };
}

// One week's movement: each budgeted line in 36 equal slices. Later phases
// replace the slices that depend on live state (tuition on enrollment,
// maintenance on the campus) with the real weekly figure.
export function weeklyFlows(t: Treasury): Flows {
  const revenue = zeroRevenue();
  const expenses = zeroExpenses();
  for (const k of REVENUE_CATEGORIES) revenue[k] = Math.round(t.budget.revenue[k] / WEEKS_PER_YEAR);
  for (const k of EXPENSE_CATEGORIES)
    expenses[k] = Math.round(t.budget.expenses[k] / WEEKS_PER_YEAR);
  return { revenue, expenses };
}

// The treasury system, run each week after the calendar. On the week the
// year turns, the old year closes into the history and the pending budget
// takes over; then the week's money moves.
export function treasuryWeek(state: GameState): GameState {
  let s = state;
  const { clock } = s;
  if (clock.term === 'fall' && clock.week === 1) s = turnFiscalYear(s);
  const t = s.treasury;
  const week = weeklyFlows(t);
  const net = netOf(week);
  const growth = Math.round((t.endowmentBasis * t.marketReturn) / WEEKS_PER_YEAR);
  const draw = week.revenue.endowmentDraw;
  return {
    ...s,
    treasury: {
      ...t,
      cash: t.cash + net,
      endowment: t.endowment + growth - draw,
      actual: addFlows(t.actual, week),
      lastWeek: week,
    },
  };
}

function turnFiscalYear(state: GameState): GameState {
  const t = state.treasury;
  const year = state.clock.year;
  const closed: YearSummary = {
    year: t.budget.year,
    revenue: t.actual.revenue,
    expenses: t.actual.expenses,
    net: netOf(t.actual),
    endowmentEnd: t.endowment,
    marketReturn: t.marketReturn,
  };
  const budget = t.pendingBudget ?? proposeBudget(state, year, t.drawRate);
  const next: GameState = {
    ...state,
    treasury: {
      ...t,
      budget,
      pendingBudget: null,
      drawRate: budget.drawRate,
      actual: zeroFlows(),
      marketReturn: marketReturnFor(state.seed, year),
      endowmentBasis: t.endowment,
      history: [...t.history, closed],
    },
  };
  return emit(next, { kind: 'yearClosed', year: closed.year, net: closed.net });
}

// The Budget & Hiring decision (DD §3.3, §5.1): approve next year's budget
// at a draw rate. The stated default is the standing rate.
export function approveBudget(state: GameState, drawRate: number | undefined): GameState {
  const t = state.treasury;
  const rate = clampDrawRate(drawRate ?? t.drawRate);
  const budget = proposeBudget(state, state.clock.year + 1, rate);
  return emit(
    { ...state, treasury: { ...t, drawRate: rate, pendingBudget: budget } },
    { kind: 'budgetApproved', year: budget.year, drawRate: rate },
  );
}

// ---------- readings (DD §5.3) ----------

export function tuitionDependence(f: Flows): number {
  const total = sumRevenue(f.revenue);
  return total <= 0 ? 0 : f.revenue.tuition / total;
}

export function adminShareOfPayroll(f: Flows): number {
  const payroll = f.expenses.facultyPayroll + f.expenses.adminPayroll;
  return payroll <= 0 ? 0 : f.expenses.adminPayroll / payroll;
}

// "$2.3M", "$450k", "−$1.2M": three significant figures at most, the
// register's own minus sign.
export function formatMoney(n: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  let body: string;
  if (abs >= 1e9) body = `$${trim(abs / 1e9)}B`;
  else if (abs >= 1e6) body = `$${trim(abs / 1e6)}M`;
  else if (abs >= 1e3) body = `$${trim(abs / 1e3)}k`;
  else body = `$${Math.round(abs)}`;
  if (n < 0) return `−${body}`;
  return opts.sign && n > 0 ? `+${body}` : body;
}

function trim(x: number): string {
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  return x
    .toFixed(digits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
}

export function formatPercent(rate: number, digits = 1): string {
  const fixed = (rate * 100).toFixed(digits);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return `${trimmed}%`;
}
