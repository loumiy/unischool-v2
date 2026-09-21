import {
  EXPENSE_WORDS,
  READING_WORDS,
  REVENUE_WORDS,
  type LineWords,
} from '../content/treasury.ts';
import {
  adminShareOfPayroll,
  borrowingRoom,
  EXPENSE_CATEGORIES,
  formatMoney,
  formatPercent,
  netOf,
  REVENUE_CATEGORIES,
  sumExpenses,
  sumRevenue,
  totalBacklog,
  tuitionDependence,
  type Flows,
  type GameState,
} from '../sim/index.ts';
import { ENDOWMENT_DRAW_PRUDENT, TUITION_DEPENDENCE_FLAG } from '../tuning.ts';
import Figure from './Figure.tsx';

// THE TREASURY SCREEN (DD §5.3): one screen — the cashflow strip, the year
// budget, the gauges (tuition dependence, endowment, backlog, administrative
// share) and the closed years — where every number is a Figure with its one
// sentence. Ported from v1's income-statement idiom: two columns, income
// against expenses, the net underneath.

function Line({ words, amount, hint }: { words: LineWords; amount: number; hint?: string }) {
  const idle = words.phase !== undefined && amount === 0;
  return (
    <div className={`statement-line ${idle ? 'idle' : ''}`} tabIndex={0}>
      <span className="statement-line-label">
        {words.label}
        {idle && <span className="statement-line-note">arrives in Phase {words.phase}</span>}
      </span>
      <span className="statement-line-amount">{formatMoney(amount)}</span>
      <span className="figure-hint" role="tooltip">
        {hint ?? words.hint}
      </span>
    </div>
  );
}

function Statement({ flows, title }: { flows: Flows; title: string }) {
  const net = netOf(flows);
  return (
    <section className="treasury-panel">
      <h3>{title}</h3>
      <div className="income-statement">
        <div className="statement-col">
          <h4>Income</h4>
          {REVENUE_CATEGORIES.map((k) => (
            <Line key={k} words={REVENUE_WORDS[k]} amount={flows.revenue[k]} />
          ))}
          <div className="statement-total">
            <span>Total income</span>
            <span>{formatMoney(sumRevenue(flows.revenue))}</span>
          </div>
        </div>
        <div className="statement-col">
          <h4>Expenses</h4>
          {EXPENSE_CATEGORIES.map((k) => (
            <Line key={k} words={EXPENSE_WORDS[k]} amount={flows.expenses[k]} />
          ))}
          <div className="statement-total">
            <span>Total expenses</span>
            <span>{formatMoney(sumExpenses(flows.expenses))}</span>
          </div>
        </div>
      </div>
      <div className={`statement-net ${net < 0 ? 'negative' : ''}`}>
        <span>Net</span>
        <span className="statement-line-amount">{formatMoney(net, { sign: true })}</span>
      </div>
    </section>
  );
}

export default function TreasuryScreen({ state }: { state: GameState }) {
  const t = state.treasury;
  const weekNet = netOf(t.lastWeek);
  const dependence = tuitionDependence(t.actual);
  const adminShare = adminShareOfPayroll(t.actual);
  const overdrawn = t.budget.drawRate > ENDOWMENT_DRAW_PRUDENT;
  const backlog = totalBacklog(state);
  return (
    <div className="treasury">
      <div className="figure-row">
        <Figure
          label="Operating funds"
          value={formatMoney(t.cash)}
          hint={READING_WORDS.cash}
          size="lg"
          tone={t.cash < 0 ? 'bad' : undefined}
        />
        <Figure
          label="This week"
          value={`${formatMoney(weekNet, { sign: true })} /wk`}
          hint={READING_WORDS.weekNet}
          tone={weekNet < 0 ? 'bad' : 'good'}
        />
        <Figure label="Endowment" value={formatMoney(t.endowment)} hint={READING_WORDS.endowment} />
        <Figure
          label="Draw"
          value={formatPercent(t.budget.drawRate, 2)}
          note={`${formatMoney(t.budget.revenue.endowmentDraw)} this year`}
          hint={READING_WORDS.drawRate}
          tone={overdrawn ? 'bad' : undefined}
        />
        <Figure
          label="Markets this year"
          value={formatPercent(t.marketReturn, 1)}
          hint={READING_WORDS.marketReturn}
          tone={t.marketReturn < 0 ? 'bad' : undefined}
        />
      </div>

      <Statement flows={t.lastWeek} title="This week" />

      <section className="treasury-panel">
        <h3>Year {t.budget.year} budget</h3>
        <table className="budget-table">
          <thead>
            <tr>
              <th />
              <th>Budget</th>
              <th>So far</th>
            </tr>
          </thead>
          <tbody>
            {REVENUE_CATEGORIES.map((k) => (
              <BudgetRow
                key={k}
                words={REVENUE_WORDS[k]}
                budget={t.budget.revenue[k]}
                actual={t.actual.revenue[k]}
              />
            ))}
            <tr className="budget-subtotal">
              <th>Income</th>
              <td>{formatMoney(sumRevenue(t.budget.revenue))}</td>
              <td>{formatMoney(sumRevenue(t.actual.revenue))}</td>
            </tr>
            {EXPENSE_CATEGORIES.map((k) => (
              <BudgetRow
                key={k}
                words={EXPENSE_WORDS[k]}
                budget={t.budget.expenses[k]}
                actual={t.actual.expenses[k]}
              />
            ))}
            <tr className="budget-subtotal">
              <th>Expenses</th>
              <td>{formatMoney(sumExpenses(t.budget.expenses))}</td>
              <td>{formatMoney(sumExpenses(t.actual.expenses))}</td>
            </tr>
            <tr className="budget-net">
              <th>Net</th>
              <td>{formatMoney(netOf(t.budget), { sign: true })}</td>
              <td className="figure" tabIndex={0}>
                {formatMoney(netOf(t.actual), { sign: true })}
                <span className="figure-hint" role="tooltip">
                  {READING_WORDS.yearNet}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        {t.pendingBudget && (
          <p className="treasury-note">
            Year {t.pendingBudget.year}’s budget is approved at a{' '}
            {formatPercent(t.pendingBudget.drawRate, 2)} draw and takes effect at Convocation.
          </p>
        )}
      </section>

      <div className="figure-row">
        <Figure
          label="Tuition dependence"
          value={formatPercent(dependence, 0)}
          hint={READING_WORDS.tuitionDependence}
          tone={dependence > TUITION_DEPENDENCE_FLAG ? 'bad' : undefined}
          note={sumRevenue(t.actual.revenue) === 0 ? 'no revenue yet' : undefined}
        />
        <Figure
          label="Administrative share of payroll"
          value={formatPercent(adminShare, 0)}
          hint={READING_WORDS.adminShare}
          note={t.actual.expenses.facultyPayroll === 0 ? 'no faculty yet' : undefined}
        />
        <Figure
          label="Maintenance funded"
          value={formatPercent(t.budget.maintenanceFunding, 0)}
          hint={READING_WORDS.maintenanceFunding}
          tone={t.budget.maintenanceFunding < 1 ? 'bad' : undefined}
        />
        <Figure
          label="Backlog"
          value={formatMoney(backlog)}
          hint={READING_WORDS.backlog}
          tone={backlog > 0 ? 'bad' : undefined}
        />
      </div>

      <div className="figure-row">
        <Figure
          label="Debt"
          value={formatMoney(t.debt)}
          hint={READING_WORDS.debt}
          tone={t.debt > 0 ? 'bad' : undefined}
        />
        <Figure
          label="Borrowing room"
          value={formatMoney(borrowingRoom(state))}
          hint={READING_WORDS.borrowingRoom}
        />
        <Figure
          label="Construction this year"
          value={formatMoney(t.capitalThisYear.spent)}
          note={
            t.capitalThisYear.borrowed > 0
              ? `${formatMoney(t.capitalThisYear.borrowed)} of it borrowed`
              : undefined
          }
          hint={READING_WORDS.capital}
        />
      </div>

      {t.history.length > 0 && (
        <section className="treasury-panel">
          <h3>Closed years</h3>
          <table className="budget-table history-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Net</th>
                <th>Endowment</th>
                <th>Markets</th>
                <th>Built</th>
              </tr>
            </thead>
            <tbody>
              {[...t.history].reverse().map((y) => (
                <tr key={y.year} className={y.net < 0 ? 'bad' : ''}>
                  <th>Year {y.year}</th>
                  <td>{formatMoney(sumRevenue(y.revenue))}</td>
                  <td>{formatMoney(sumExpenses(y.expenses))}</td>
                  <td>{formatMoney(y.net, { sign: true })}</td>
                  <td>{formatMoney(y.endowmentEnd)}</td>
                  <td>{formatPercent(y.marketReturn, 1)}</td>
                  <td>{formatMoney(y.capital.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function BudgetRow({
  words,
  budget,
  actual,
}: {
  words: LineWords;
  budget: number;
  actual: number;
}) {
  const idle = words.phase !== undefined && budget === 0 && actual === 0;
  return (
    <tr className={idle ? 'idle' : ''}>
      <th>
        {words.label}
        {idle && <span className="statement-line-note"> · Phase {words.phase}</span>}
      </th>
      <td className="figure" tabIndex={0}>
        {formatMoney(budget)}
        <span className="figure-hint" role="tooltip">
          {READING_WORDS.budgetLine}
        </span>
      </td>
      <td className="figure" tabIndex={0}>
        {formatMoney(actual)}
        <span className="figure-hint" role="tooltip">
          {words.hint}
        </span>
      </td>
    </tr>
  );
}
