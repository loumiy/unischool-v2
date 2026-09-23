import {
  DEBT_AMORTISATION_YEARS,
  DEBT_INTEREST_RATE,
  ENDOWMENT_DRAW_DEFAULT,
  ENDOWMENT_DRAW_MAX,
  ENDOWMENT_DRAW_MIN,
  ENDOWMENT_DRAW_STEP,
  ENDOWMENT_MEAN_RETURN,
  ENDOWMENT_RETURN_SPREAD,
  FOUNDING_ADMIN_PAYROLL,
  MAINTENANCE_FUNDING_DEFAULT,
  STARTING_CASH,
  STARTING_ENDOWMENT,
} from '../tuning.ts';
import { emit } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { annualProgramCosts } from './academics.ts';
import { annualGiving } from './alumni.ts';
import { boardPolicy, inReceivership } from './distress.ts';
import { clampFunding, projectedMaintenance, weeklyMaintenance } from './estate.ts';
import { annualFacultyPayroll } from './faculty.ts';
import { annualAid, annualAuxiliaries, annualTuition, projectedEnrollment } from './people.ts';
import { Rng } from './rng.ts';
import { seatPayroll } from './seats.ts';
import type { GameState } from './state.ts';

// THE TREASURY (DD §5). Money is the weather: every week the school takes
// in and pays out along the categories of §5.1 and §5.2, the year runs
// against a budget approved the summer before, and the endowment earns
// whatever the markets gave that year and pays out its draw.
//
// Phase 5 wired the categories, the weekly flow, the fiscal year, the
// endowment and the budget decision; the lines later phases fill (tuition
// and aid, faculty payroll, maintenance, debt, programs) existed at zero
// from the start and were filled in without un-teaching anything.

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
  // The share of required maintenance the year funds (DD §6.4).
  maintenanceFunding: number;
  // The endowment the draw was computed on.
  endowmentBasis: number;
}

// Construction money: outside the income statement (it buys an asset),
// tracked on its own for the year.
export interface Capital {
  spent: number;
  borrowed: number;
}

// A closed year, as the history and the chronicle will read it.
export interface YearSummary extends Flows {
  year: number;
  net: number;
  endowmentEnd: number;
  marketReturn: number;
  capital: Capital;
}

export interface Treasury {
  cash: number; // operating funds
  endowment: number;
  drawRate: number; // the standing rate; the next budget is proposed at it
  maintenanceFunding: number; // the standing level, likewise
  budget: YearBudget; // this fiscal year's
  pendingBudget: YearBudget | null; // next year's, once approved at Budget & Hiring
  actual: Flows; // this year to date
  lastWeek: Flows; // the most recent week's movement
  // This fiscal year's market return on the endowment, and the endowment
  // the return is earned on (it accrues in equal weekly slices).
  marketReturn: number;
  endowmentBasis: number;
  debt: number; // construction borrowing outstanding (DD §5.2)
  // The principal due each week: every loan's amount over the term, summed,
  // so the balance retires on schedule rather than decaying forever.
  debtRepayment: number;
  capitalThisYear: Capital;
  history: YearSummary[];
  // Standing costs the college took on by deciding to (Phase 21H): dollars
  // a year, forever, on the administration's payroll and the faculty's.
  // They are what "$120k a year, forever" means.
  standing: { admin: number; faculty: number };
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
export function proposeBudget(
  state: GameState,
  year: number,
  drawRate: number,
  maintenanceFunding: number = state.treasury.maintenanceFunding,
): YearBudget {
  const t = state.treasury;
  const rate = clampDrawRate(drawRate);
  const funding = clampFunding(maintenanceFunding);
  return {
    year,
    drawRate: rate,
    maintenanceFunding: funding,
    endowmentBasis: t.endowment,
    revenue: {
      ...zeroRevenue(),
      tuition: projectedEnrollment(state) * state.people.terms.tuition,
      endowmentDraw: Math.round(t.endowment * rate),
      donations: annualGiving(state),
      auxiliaries: Math.round(
        (annualAuxiliaries(state) * projectedEnrollment(state)) / Math.max(1, enrolledNow(state)),
      ),
    },
    expenses: {
      ...zeroExpenses(),
      facultyPayroll: annualFacultyPayroll(state),
      adminPayroll: annualAdminPayroll(state),
      maintenance: projectedMaintenance(state, funding),
      financialAid: Math.round(
        projectedEnrollment(state) * state.people.terms.tuition * state.people.aidRate,
      ),
      debtService: annualDebtService(t),
      programs: annualProgramCosts(state),
    },
  };
}

function enrolledNow(state: GameState): number {
  return state.people.cohorts.reduce((n, c) => n + c.size, 0);
}

// Interest on the balance plus the scheduled principal, over a year.
export function annualDebtService(t: Pick<Treasury, 'debt' | 'debtRepayment'>): number {
  return Math.round(
    t.debt * DEBT_INTEREST_RATE + Math.min(t.debt, t.debtRepayment * WEEKS_PER_YEAR),
  );
}

export function weeklyDebtService(t: Pick<Treasury, 'debt' | 'debtRepayment'>): {
  interest: number;
  principal: number;
} {
  const interest = Math.round((t.debt * DEBT_INTEREST_RATE) / WEEKS_PER_YEAR);
  const principal = Math.min(t.debt, Math.round(t.debtRepayment));
  return { interest, principal };
}

// The weekly principal a new loan adds to the schedule.
export function repaymentFor(amount: number): number {
  return amount / (DEBT_AMORTISATION_YEARS * WEEKS_PER_YEAR);
}

export function foundingTreasury(seed: number): Treasury {
  const budget: YearBudget = {
    year: 1,
    drawRate: ENDOWMENT_DRAW_DEFAULT,
    maintenanceFunding: MAINTENANCE_FUNDING_DEFAULT,
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
    maintenanceFunding: MAINTENANCE_FUNDING_DEFAULT,
    budget,
    pendingBudget: null,
    actual: zeroFlows(),
    lastWeek: zeroFlows(),
    marketReturn: marketReturnFor(seed, 1),
    endowmentBasis: STARTING_ENDOWMENT,
    standing: { admin: 0, faculty: 0 },
    debt: 0,
    debtRepayment: 0,
    capitalThisYear: { spent: 0, borrowed: 0 },
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

// One week's movement: the budgeted lines in 36 equal slices, except the
// lines that follow live state — tuition, aid and auxiliaries follow the
// students enrolled (people.ts), maintenance the estate as it stands
// (estate.ts), debt service the balance outstanding, faculty payroll the
// roster (faculty.ts), programs the catalogue.
export function weeklyFlows(state: GameState): Flows {
  const t = state.treasury;
  const revenue = zeroRevenue();
  const expenses = zeroExpenses();
  for (const k of REVENUE_CATEGORIES) revenue[k] = Math.round(t.budget.revenue[k] / WEEKS_PER_YEAR);
  for (const k of EXPENSE_CATEGORIES)
    expenses[k] = Math.round(t.budget.expenses[k] / WEEKS_PER_YEAR);
  revenue.tuition = Math.round(annualTuition(state) / WEEKS_PER_YEAR);
  revenue.donations = Math.round(annualGiving(state) / WEEKS_PER_YEAR);
  revenue.auxiliaries = Math.round(annualAuxiliaries(state) / WEEKS_PER_YEAR);
  expenses.financialAid = Math.round(annualAid(state) / WEEKS_PER_YEAR);
  expenses.facultyPayroll = Math.round(annualFacultyPayroll(state) / WEEKS_PER_YEAR);
  expenses.maintenance = weeklyMaintenance(state);
  expenses.programs = Math.round(annualProgramCosts(state) / WEEKS_PER_YEAR);
  const service = weeklyDebtService(t);
  expenses.debtService = service.interest + service.principal;
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
  const week = weeklyFlows(s);
  const net = netOf(week);
  const growth = Math.round((t.endowmentBasis * t.marketReturn) / WEEKS_PER_YEAR);
  const draw = week.revenue.endowmentDraw;
  const { principal } = weeklyDebtService(t);
  const debt = t.debt - principal;
  return {
    ...s,
    treasury: {
      ...t,
      cash: t.cash + net,
      endowment: t.endowment + growth - draw,
      debt,
      debtRepayment: debt <= 0 ? 0 : t.debtRepayment,
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
    capital: t.capitalThisYear,
  };
  const budget = t.pendingBudget ?? proposeBudget(state, year, t.drawRate, t.maintenanceFunding);
  const next: GameState = {
    ...state,
    treasury: {
      ...t,
      budget,
      pendingBudget: null,
      drawRate: budget.drawRate,
      maintenanceFunding: budget.maintenanceFunding,
      capitalThisYear: { spent: 0, borrowed: 0 },
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
export function approveBudget(
  state: GameState,
  drawRate: number | undefined,
  maintenanceFunding: number | undefined,
): GameState {
  const t = state.treasury;
  // Under the interim CFO the sliders lock to board policy (DD §5.5).
  const policy = inReceivership(state) ? boardPolicy() : null;
  const rate = clampDrawRate(policy?.drawRate ?? drawRate ?? t.drawRate);
  const funding = clampFunding(
    policy?.maintenanceFunding ?? maintenanceFunding ?? t.maintenanceFunding,
  );
  const budget = proposeBudget(state, state.clock.year + 1, rate, funding);
  return emit(
    {
      ...state,
      treasury: { ...t, drawRate: rate, maintenanceFunding: funding, pendingBudget: budget },
    },
    { kind: 'budgetApproved', year: budget.year, drawRate: rate },
  );
}

// ---------- readings (DD §5.3) ----------

export function tuitionDependence(f: Flows): number {
  const total = sumRevenue(f.revenue);
  return total <= 0 ? 0 : f.revenue.tuition / total;
}

// The founding office, plus every seat the college has filled, forever
// (DD §5.4, §9.4). This is the ratchet: it only goes up.
export function annualAdminPayroll(state: GameState): number {
  return FOUNDING_ADMIN_PAYROLL + seatPayroll(state) + state.treasury.standing.admin;
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
