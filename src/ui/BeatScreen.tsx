import { useState } from 'react';
import type { CalendarBeat } from '../content/calendarBeats.ts';
import { EXPENSE_WORDS, READING_WORDS, REVENUE_WORDS } from '../content/treasury.ts';
import {
  EXPENSE_CATEGORIES,
  formatClock,
  formatMoney,
  formatPercent,
  netOf,
  proposeBudget,
  REVENUE_CATEGORIES,
  sumExpenses,
  sumRevenue,
  type GameState,
} from '../sim/index.ts';
import {
  ENDOWMENT_DRAW_MAX,
  ENDOWMENT_DRAW_MIN,
  ENDOWMENT_DRAW_PRUDENT,
  ENDOWMENT_DRAW_STEP,
  MAINTENANCE_FUNDING_STEP,
} from '../tuning.ts';
import Figure from './Figure.tsx';
import TabOverlay from './TabOverlay.tsx';

// A calendar beat's screen (DD §3.3): a bounded, full-screen card entered
// from the ticker prompt, with one honest verb at the bottom that resolves
// the beat and lets the clock go. Each beat's body is its own decision;
// what a body does not decide yet is noted with the phase that will.
// Closing the screen without resolving leaves the beat waiting, because
// closing is not deciding.

export interface BeatDecision {
  drawRate?: number;
  maintenanceFunding?: number;
}

export default function BeatScreen({
  beat,
  state,
  onResolve,
  onClose,
}: {
  beat: CalendarBeat;
  state: GameState;
  onResolve: (decision: BeatDecision) => void;
  onClose: () => void;
}) {
  const [decision, setDecision] = useState<BeatDecision>({});
  return (
    <TabOverlay title={beat.name} onClose={onClose}>
      <div className="beat-screen">
        <div className="eyebrow">{formatClock(state.clock)}</div>
        <p className="beat-lede">{beat.blurb}</p>
        {beat.id === 'budget-and-hiring' && (
          <BudgetBody state={state} decision={decision} onChange={setDecision} />
        )}
        <div className="beat-stub">
          <div className="eyebrow">Arrives in Phase {beat.phase}</div>
          <p>{beat.stub}</p>
        </div>
        <div className="beat-actions">
          <button type="button" className="beat-resolve" onClick={() => onResolve(decision)}>
            {beat.resolveLabel}
          </button>
        </div>
      </div>
    </TabOverlay>
  );
}

// The Budget & Hiring decision (DD §5.1): next year's budget at a draw
// rate, the lines the sim can foresee shown as they would land.
function BudgetBody({
  state,
  decision,
  onChange,
}: {
  state: GameState;
  decision: BeatDecision;
  onChange: (d: BeatDecision) => void;
}) {
  const t = state.treasury;
  const rate = decision.drawRate ?? t.drawRate;
  const funding = decision.maintenanceFunding ?? t.maintenanceFunding;
  const budget = proposeBudget(state, state.clock.year + 1, rate, funding);
  const net = netOf(budget);
  return (
    <div className="budget-body">
      <h3>Year {budget.year} budget</h3>
      <label className="draw-slider">
        <span className="draw-slider-label">
          Endowment draw <strong>{formatPercent(rate, 2)}</strong>
          <span className="draw-slider-note">
            {rate > ENDOWMENT_DRAW_PRUDENT
              ? 'above the prudent line: an overdraw'
              : `of ${formatMoney(t.endowment)} · ${formatMoney(budget.revenue.endowmentDraw)} next year`}
          </span>
        </span>
        <input
          type="range"
          min={ENDOWMENT_DRAW_MIN}
          max={ENDOWMENT_DRAW_MAX}
          step={ENDOWMENT_DRAW_STEP}
          value={rate}
          aria-label="Endowment draw rate"
          onChange={(e) => onChange({ ...decision, drawRate: Number(e.target.value) })}
        />
      </label>
      <label className="draw-slider">
        <span className="draw-slider-label">
          Maintenance funded <strong>{formatPercent(funding, 0)}</strong>
          <span className="draw-slider-note">
            {funding >= 1
              ? `${formatMoney(budget.expenses.maintenance)} holds every building's condition`
              : `${formatMoney(budget.expenses.maintenance)} funded; the rest becomes Backlog`}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={MAINTENANCE_FUNDING_STEP}
          value={funding}
          aria-label="Maintenance funding"
          onChange={(e) => onChange({ ...decision, maintenanceFunding: Number(e.target.value) })}
        />
      </label>
      <div className="income-statement compact">
        <div className="statement-col">
          <h4>Income</h4>
          {REVENUE_CATEGORIES.filter((k) => budget.revenue[k] !== 0).map((k) => (
            <div key={k} className="statement-line" tabIndex={0}>
              <span className="statement-line-label">{REVENUE_WORDS[k].label}</span>
              <span className="statement-line-amount">{formatMoney(budget.revenue[k])}</span>
              <span className="figure-hint" role="tooltip">
                {REVENUE_WORDS[k].hint}
              </span>
            </div>
          ))}
          <div className="statement-total">
            <span>Total</span>
            <span>{formatMoney(sumRevenue(budget.revenue))}</span>
          </div>
        </div>
        <div className="statement-col">
          <h4>Expenses</h4>
          {EXPENSE_CATEGORIES.filter((k) => budget.expenses[k] !== 0).map((k) => (
            <div key={k} className="statement-line" tabIndex={0}>
              <span className="statement-line-label">{EXPENSE_WORDS[k].label}</span>
              <span className="statement-line-amount">{formatMoney(budget.expenses[k])}</span>
              <span className="figure-hint" role="tooltip">
                {EXPENSE_WORDS[k].hint}
              </span>
            </div>
          ))}
          <div className="statement-total">
            <span>Total</span>
            <span>{formatMoney(sumExpenses(budget.expenses))}</span>
          </div>
        </div>
      </div>
      <div className="figure-row">
        <Figure
          label="Planned net"
          value={formatMoney(net, { sign: true })}
          hint={READING_WORDS.yearNet}
          tone={net < 0 ? 'bad' : 'good'}
        />
        <Figure label="Operating funds now" value={formatMoney(t.cash)} hint={READING_WORDS.cash} />
      </div>
    </div>
  );
}
