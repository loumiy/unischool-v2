import { buildingById, type BuildingDef } from '../content/buildings.ts';
import {
  BACKLOG_GROWTH_RATE,
  BACKLOG_RUIN_SHARE,
  DEBT_CAP_SHARE_OF_ENDOWMENT,
  DEMOLITION_COST_SHARE,
  MAINTENANCE_FUNDING_STEP,
  RENOVATION_FEE_SHARE,
  UPKEEP_AGE_RATE,
} from '../tuning.ts';
import { emit } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import type { Placement } from './campus.ts';
import type { GameState } from './state.ts';
import { repaymentFor } from './treasury.ts';

// BUILDINGS AS ECONOMIC OBJECTS (DD §6.4). A building costs money to put
// up and takes weeks to build; once open it wants maintenance every week,
// more as it ages; what the budget does not fund becomes Backlog, which
// compounds, drags the building's condition down, and shows on the map.
// Renovation pays the backlog off. Construction is paid in cash or borrowed,
// and the board caps how much can be borrowed.

export type Financing = 'cash' | 'debt';
export const FINANCINGS: readonly Financing[] = ['cash', 'debt'];

export function ageYearsOf(p: Placement, absoluteWeek: number): number {
  if (p.openedWeek === null) return 0;
  return Math.max(0, absoluteWeek - p.openedWeek) / WEEKS_PER_YEAR;
}

// What a building wants spent on it this year to hold its condition.
export function annualUpkeep(def: BuildingDef, ageYears: number): number {
  return Math.round(def.upkeep * (1 + ageYears * UPKEEP_AGE_RATE));
}

export function upkeepOf(p: Placement, absoluteWeek: number): number {
  return annualUpkeep(buildingById(p.buildingId), ageYearsOf(p, absoluteWeek));
}

// Condition is how much of the building the backlog has eaten: 1 with no
// backlog, 0 once the backlog is worth BACKLOG_RUIN_SHARE of the build cost.
export function conditionFor(def: BuildingDef, backlog: number): number {
  const ruin = def.cost * BACKLOG_RUIN_SHARE;
  return Number(Math.max(0, Math.min(1, 1 - backlog / ruin)).toFixed(4));
}

export function clampFunding(level: number): number {
  const stepped = Math.round(level / MAINTENANCE_FUNDING_STEP) * MAINTENANCE_FUNDING_STEP;
  return Number(Math.max(0, Math.min(1, stepped)).toFixed(4));
}

export function renovationCost(p: Placement): number {
  const def = buildingById(p.buildingId);
  return Math.round(p.backlog + def.cost * RENOVATION_FEE_SHARE);
}

export function demolitionCost(def: BuildingDef): number {
  return Math.round(def.cost * DEMOLITION_COST_SHARE);
}

// ---------- paying for things ----------

export function debtCap(state: GameState): number {
  return Math.round(state.treasury.endowment * DEBT_CAP_SHARE_OF_ENDOWMENT);
}

export function borrowingRoom(state: GameState): number {
  return Math.max(0, debtCap(state) - state.treasury.debt);
}

export function canPay(state: GameState, amount: number, financing: Financing): boolean {
  if (financing === 'cash') return state.treasury.cash >= amount;
  return borrowingRoom(state) >= amount;
}

// Which way this amount can be paid, cash first: what a tile or a button
// should offer.
export function affordableFinancing(state: GameState, amount: number): Financing | null {
  if (canPay(state, amount, 'cash')) return 'cash';
  if (canPay(state, amount, 'debt')) return 'debt';
  return null;
}

export function pay(state: GameState, amount: number, financing: Financing): GameState {
  const t = state.treasury;
  const capital = {
    spent: t.capitalThisYear.spent + amount,
    borrowed: t.capitalThisYear.borrowed + (financing === 'debt' ? amount : 0),
  };
  if (financing === 'cash') {
    return { ...state, treasury: { ...t, cash: t.cash - amount, capitalThisYear: capital } };
  }
  return {
    ...state,
    treasury: {
      ...t,
      debt: t.debt + amount,
      debtRepayment: t.debtRepayment + repaymentFor(amount),
      capitalThisYear: capital,
    },
  };
}

// ---------- the estate, week by week ----------

// Buildings that are open at the start of this week: what maintenance is
// charged on and what accrues backlog.
export function openPlacements(state: GameState): Placement[] {
  return state.campus.placements.filter((p) => p.status === 'open');
}

// This week's funded maintenance across the campus, at the standing
// funding level: the treasury's maintenance line.
export function weeklyMaintenance(state: GameState): number {
  const funding = state.treasury.budget.maintenanceFunding;
  const week = state.clock.absoluteWeek;
  let total = 0;
  for (const p of openPlacements(state)) {
    total += Math.round((upkeepOf(p, week) / WEEKS_PER_YEAR) * funding);
  }
  return total;
}

// The year's maintenance, as a budget line: every building, at the given
// funding, as if open all year.
export function projectedMaintenance(state: GameState, funding: number): number {
  const week = state.clock.absoluteWeek;
  let total = 0;
  for (const p of state.campus.placements) total += upkeepOf(p, week) * funding;
  return Math.round(total);
}

export function totalBacklog(state: GameState): number {
  return state.campus.placements.reduce((t, p) => t + p.backlog, 0);
}

// The estate system, after the treasury has paid the week: unfunded
// maintenance becomes backlog and the backlog compounds; sites that reach
// their week open; renovations finish.
export function estateWeek(state: GameState): GameState {
  const week = state.clock.absoluteWeek;
  const funding = state.treasury.budget.maintenanceFunding;
  const events: { kind: 'buildingCompleted' | 'renovated'; p: Placement }[] = [];
  const placements = state.campus.placements.map((p): Placement => {
    if (p.status === 'open') {
      const def = buildingById(p.buildingId);
      const required = upkeepOf(p, week) / WEEKS_PER_YEAR;
      const unfunded = required * (1 - funding);
      const grown = p.backlog * (1 + BACKLOG_GROWTH_RATE / WEEKS_PER_YEAR);
      const backlog = Math.round(grown + unfunded);
      if (backlog === p.backlog) return p;
      return { ...p, backlog, condition: conditionFor(def, backlog) };
    }
    if (p.completesWeek !== null && week >= p.completesWeek) {
      const opened: Placement = {
        ...p,
        status: 'open',
        completesWeek: null,
        openedWeek: p.status === 'building' ? week : p.openedWeek,
      };
      events.push({ kind: p.status === 'building' ? 'buildingCompleted' : 'renovated', p: opened });
      return opened;
    }
    return p;
  });
  let next: GameState = { ...state, campus: { ...state.campus, placements } };
  for (const e of events) {
    next = emit(next, { kind: e.kind, placementId: e.p.id, buildingId: e.p.buildingId });
  }
  return next;
}
