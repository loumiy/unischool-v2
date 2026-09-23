import RivalLine from './RivalLine.tsx';
import { YearInReview } from './PassingBeat.tsx';
import { BEAT_WORDS } from '../content/calendarBeats.ts';
import { useState } from 'react';
import { buildingById } from '../content/buildings.ts';
import { programById } from '../content/schools.ts';
import type { CalendarBeat } from '../content/calendarBeats.ts';
import { EXPENSE_WORDS, READING_WORDS, REVENUE_WORDS } from '../content/treasury.ts';
import {
  namedOf,
  admitRate,
  availableCuts,
  boardPolicy,
  campusCapacity,
  cutAvailable,
  followingIntakeCap,
  frozen,
  inAusterity,
  inReceivership,
  netTuition,
  reservesTight,
  RUNG_SOUND,
  termExpenses,
  type AusterityCut,
  classLabel,
  enrolled,
  facultyOf,
  EXPENSE_CATEGORIES,
  formatClock,
  formatMoney,
  formatPercent,
  netOf,
  proposeBudget,
  REVENUE_CATEGORIES,
  runAdmissions,
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
  SELECTIVITY_STEP,
  TUITION_MAX,
  TUITION_MIN,
  TUITION_STEP,
} from '../tuning.ts';
import { fillWords, PEOPLE_READINGS, PEOPLE_WORDS } from '../content/people.ts';
import { BOARD_WORDS, CUT_WORDS, rungWords } from '../content/board.ts';
import { FACULTY_WORDS } from '../content/faculty.ts';
import FacultyCard from './FacultyCard.tsx';
import AmbitionsPanel, { AmbitionOffer } from './AmbitionsPanel.tsx';
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
  tuition?: number;
  selectivity?: number;
  cuts?: AusterityCut[];
  acceptAmbition?: boolean;
}

export default function BeatScreen({
  beat,
  state,
  onResolve,
  onClose,
  onHire,
}: {
  beat: CalendarBeat;
  state: GameState;
  onResolve: (decision: BeatDecision) => void;
  onClose: () => void;
  // Budget & Hiring: a candidate hired off the market (DD §7.3).
  onHire: (candidateId: string, programId: string | null) => void;
}) {
  const [decision, setDecision] = useState<BeatDecision>({});
  // THE ONE WINDOW (the Phase 34 playtest): the market closes when the
  // budget is approved, and there is no other time in the year to hire. A
  // player who approves with programmes nobody teaches is told so once,
  // by name, before the button does it.
  const [warned, setWarned] = useState(false);
  const untaught =
    beat.id === 'budget-and-hiring' && state.faculty.market.length > 0
      ? state.academics.programs
          .filter((p) => facultyOf(state, p.programId).length === 0)
          .map((p) => programById(p.programId).name)
      : [];
  const resolve = () => {
    if (untaught.length > 0 && !warned) setWarned(true);
    else onResolve(decision);
  };
  return (
    <TabOverlay title={beat.name} onClose={onClose}>
      <div className={`beat-screen ${beat.id === 'budget-and-hiring' ? 'wide' : ''}`}>
        <div className="eyebrow">{formatClock(state.clock)}</div>
        <p className="beat-lede">{beat.blurb}</p>
        {beat.id === 'budget-and-hiring' && (
          <BudgetBody state={state} decision={decision} onChange={setDecision} onHire={onHire} />
        )}
        {beat.id === 'admissions-day' && (
          <AdmissionsBody state={state} decision={decision} onChange={setDecision} />
        )}
        {beat.id === 'convocation' && (
          <ConvocationBody state={state} decision={decision} onChange={setDecision} />
        )}
        {beat.id === 'board-meeting' && (
          <BoardBody state={state} decision={decision} onChange={setDecision} />
        )}
        {/* The decision's own button is pinned to the foot of the screen,
            so a mandatory beat can never hide the only way out of it. */}
        <div className="beat-actions">
          {warned && untaught.length > 0 && (
            <p className="beat-warning" role="alert">
              {fillWords(FACULTY_WORDS.untaughtWarning, {
                programs: untaught.join(', '),
                count: untaught.length,
              })}
            </p>
          )}
          <button type="button" className="beat-resolve" onClick={resolve}>
            {warned && untaught.length > 0
              ? FACULTY_WORDS.untaughtConfirm
              : beat.id === 'board-meeting' && inAusterity(state) && availableCuts(state).length > 0
                ? 'Accept the cuts'
                : beat.resolveLabel}
          </button>
        </div>
      </div>
    </TabOverlay>
  );
}

// The Budget & Hiring decision (DD §5.1, §7.3): next year's budget at a
// draw rate, the lines the sim can foresee shown as they would land — the
// faculty payroll among them, moving as the market below is hired from.
// The market closes when the budget is approved.
// THE BEDS, A YEAR AHEAD (Phase 21F). Admissions closes the file at the
// beds the college will have, and the playtest met that as a surprise on
// Admissions Day with nothing left to do about it. Budget & Hiring is the
// last beat before next spring's file with time to break ground, so this is
// where the college is told what that file will be able to take.
function HousingAhead({ state }: { state: GameState }) {
  const { cap, beds } = followingIntakeCap(state);
  const size = state.people.incoming?.size ?? state.people.lastAdmissions?.size ?? 0;
  if (size === 0) return null;
  const hall = buildingById('residence-hall');
  const short = cap < size;
  return (
    <div className={`housing-ahead ${short ? 'short' : ''}`} role={short ? 'alert' : undefined}>
      <p>{fillWords(PEOPLE_WORDS.housingAhead, { cap, beds, size })}</p>
      {short && (
        <p>
          {fillWords(PEOPLE_WORDS.housingShort, {
            weeks: hall.buildWeeks,
            hallBeds: hall.capacity?.beds ?? 0,
          })}
        </p>
      )}
    </div>
  );
}

function BudgetBody({
  state,
  decision,
  onChange,
  onHire,
}: {
  state: GameState;
  decision: BeatDecision;
  onChange: (d: BeatDecision) => void;
  onHire: (candidateId: string, programId: string | null) => void;
}) {
  const t = state.treasury;
  const rate = decision.drawRate ?? t.drawRate;
  const funding = decision.maintenanceFunding ?? t.maintenanceFunding;
  const budget = proposeBudget(state, state.clock.year + 1, rate, funding);
  const net = netOf(budget);
  return (
    <div className="budget-body">
      {/* Two columns on a screen wide enough for them: the plan, and the
          market it is paying for. One narrow column put the decision's own
          button two screens down (Phase 21G). */}
      <div className="budget-plan">
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
              {funding >= 1 ? (
                `${formatMoney(budget.expenses.maintenance)} holds every building's condition`
              ) : (
                <>
                  {formatMoney(budget.expenses.maintenance)} funded; the rest becomes{' '}
                  {/* Where the word is first made, it is defined (Phase 21F). */}
                  <span className="figure defined-term" tabIndex={0}>
                    Backlog
                    <span className="figure-hint" role="tooltip">
                      {READING_WORDS.backlogDefined}
                    </span>
                  </span>
                </>
              )}
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
        <HousingAhead state={state} />
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
          <Figure
            label="Operating funds now"
            value={formatMoney(t.cash)}
            hint={READING_WORDS.cash}
          />
        </div>
      </div>
      {state.faculty.marketOpen && (
        <section className="faculty-market beat-market">
          <div className="faculty-section-head">
            <h3>The market</h3>
            <span className="faculty-section-note">
              {frozen(state)
                ? FACULTY_WORDS.frozen
                : state.faculty.market.length === 0
                  ? FACULTY_WORDS.marketEmpty
                  : fillWords(FACULTY_WORDS.marketOpen, { count: state.faculty.market.length })}
            </span>
          </div>
          {state.faculty.market.length > 0 && (
            <ul className="faculty-list">
              {state.faculty.market.map((f) => (
                <FacultyCard key={f.id} f={f} state={state} onHire={(p) => onHire(f.id, p)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// The Admissions Day decision (DD §8.2): the sticker and the selectivity,
// with the funnel they produce previewed live — applicants, admitted,
// yield, the class, its quality, its revenue — and the beds it will find.
function AdmissionsBody({
  state,
  decision,
  onChange,
}: {
  state: GameState;
  decision: BeatDecision;
  onChange: (d: BeatDecision) => void;
}) {
  const standing = state.people.terms;
  const terms = {
    tuition: decision.tuition ?? standing.tuition,
    selectivity: decision.selectivity ?? standing.selectivity,
  };
  const result = runAdmissions(state, terms);
  const wanted = Math.round(result.admitted * result.yieldRate);
  const continuing = state.people.cohorts
    .filter((c) => c.classYear > state.clock.year)
    .reduce((t, c) => t + c.size, 0);
  const bedsThen = result.cap + continuing; // beds plus the triples allowance
  const triples = Math.max(0, continuing + result.size - Math.round(bedsThen / 1.25));
  return (
    <div className="budget-body admissions-body">
      <h3>The {classLabel(result.year + 3)}</h3>
      <label className="draw-slider">
        <span className="draw-slider-label">
          Tuition <strong>{formatMoney(terms.tuition)}</strong>
          <span className="draw-slider-note">
            {formatMoney(netTuition(terms.tuition, state.people.aidRate))} net of aid
          </span>
        </span>
        <input
          type="range"
          min={TUITION_MIN}
          max={TUITION_MAX}
          step={TUITION_STEP}
          value={terms.tuition}
          aria-label="Tuition"
          onChange={(e) => onChange({ ...decision, tuition: Number(e.target.value) })}
        />
      </label>
      <label className="draw-slider">
        <span className="draw-slider-label">
          Selectivity <strong>{formatPercent(terms.selectivity, 0)}</strong>
          <span className="draw-slider-note">
            admit {formatPercent(admitRate(terms.selectivity), 0)} of the pool
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={SELECTIVITY_STEP}
          value={terms.selectivity}
          aria-label="Selectivity"
          onChange={(e) => onChange({ ...decision, selectivity: Number(e.target.value) })}
        />
      </label>
      <div className="figure-row">
        <Figure
          label="Applied"
          value={String(result.applicants)}
          hint={PEOPLE_READINGS.applicants}
        />
        <Figure label="Admitted" value={String(result.admitted)} hint={PEOPLE_READINGS.admitted} />
        <Figure
          label="Yield"
          value={formatPercent(result.yieldRate, 0)}
          hint={PEOPLE_READINGS.yield}
        />
        <Figure
          label="The class"
          value={String(result.size)}
          hint={PEOPLE_READINGS.classSize}
          size="lg"
          tone={result.capped ? 'bad' : 'good'}
        />
        <Figure label="Quality" value={result.quality.toFixed(0)} hint={PEOPLE_READINGS.quality} />
        <Figure
          label="Tuition next year"
          value={formatMoney(result.size * terms.tuition)}
          hint={PEOPLE_READINGS.revenue}
        />
      </div>
      <p className={`treasury-note ${result.capped || triples > 0 ? 'bad' : ''}`}>
        {result.capped
          ? fillWords(PEOPLE_WORDS.capped, { size: result.size, wanted })
          : triples > 0
            ? fillWords(PEOPLE_WORDS.triplesWarning, { triples })
            : PEOPLE_WORDS.roomToSpare}
      </p>
    </div>
  );
}

// Convocation (DD §3.3): the class on the lawn, by the numbers, and the
// school as it stands to receive them.
function ConvocationBody({
  state,
  decision,
  onChange,
}: {
  state: GameState;
  decision: BeatDecision;
  onChange: (d: BeatDecision) => void;
}) {
  const { cohorts } = state.people;
  const arrived = [...cohorts].sort((a, b) => b.classYear - a.classYear)[0] ?? null;
  const total = enrolled(state);
  const cap = campusCapacity(state);
  return (
    <div className="budget-body">
      <h3>{arrived ? `The ${classLabel(arrived.classYear)}` : 'The lawn'}</h3>
      {arrived ? (
        <div className="figure-row">
          <Figure
            label="Arrived"
            value={String(arrived.size)}
            hint={PEOPLE_READINGS.cohortSize}
            size="lg"
          />
          <Figure
            label="Quality"
            value={arrived.quality.toFixed(0)}
            hint={PEOPLE_READINGS.cohortQuality}
          />
          <Figure
            label="Satisfaction"
            value={arrived.satisfaction.toFixed(0)}
            hint={PEOPLE_READINGS.satisfaction}
            tone={arrived.satisfaction < 50 ? 'bad' : undefined}
          />
          <Figure label="Enrolled" value={String(total)} hint={PEOPLE_READINGS.enrolled} />
          <Figure
            label="Beds"
            value={`${Math.min(total, cap.beds)} / ${cap.beds}`}
            hint={PEOPLE_READINGS.beds}
            tone={total > cap.beds ? 'bad' : undefined}
          />
        </div>
      ) : (
        <p className="treasury-note">{PEOPLE_WORDS.noClass}</p>
      )}
      {/* Convocation earns its screen (Phase 41): who arrived, and the
          year in one read. */}
      {arrived && namedOf(state, arrived.classYear).length > 0 && (
        <p className="beat-lede">
          {fillWords(BEAT_WORDS.among, {
            names: namedOf(state, arrived.classYear)
              .map((s) => s.name)
              .join(', '),
          })}
        </p>
      )}
      <YearInReview state={state} />
      {/* The year's turn is where promises are made and read out
          (DD §10.2): what is on the table, then what is already on the
          record with the years it has left. */}
      <AmbitionOffer
        state={state}
        accepted={decision.acceptAmbition === true}
        onChange={(accept) => onChange({ ...decision, acceptAmbition: accept })}
      />
      {(state.ambitions.active.length > 0 || state.ambitions.settled.length > 0) && (
        <AmbitionsPanel state={state} />
      )}
    </div>
  );
}

// The Board Meeting (DD §3.3, §5.5): the board's confidence, where the
// college stands on the ladder and what the board says about it; under
// austerity, the cuts it requires; under the interim CFO, her policy.
function BoardBody({
  state,
  decision,
  onChange,
}: {
  state: GameState;
  decision: BeatDecision;
  onChange: (d: BeatDecision) => void;
}) {
  const d = state.distress;
  const words = rungWords(d.rung);
  const austerity = inAusterity(state);
  const cuts = availableCuts(state);
  const chosen = decision.cuts ?? [];
  const last = d.terms.at(-1);
  const toggle = (cut: AusterityCut) =>
    onChange({
      ...decision,
      cuts: chosen.includes(cut) ? chosen.filter((c) => c !== cut) : [...chosen, cut],
    });
  return (
    <div className="budget-body board-body">
      <h3>The board's view</h3>
      {/* Head to head with the rival, where the board reads it (Phase 23). */}
      {/* "No rival yet" is said at the first board meeting, not every
          autumn after it (Phase 40). */}
      {(state.athletics.rivalId || state.clock.year <= 1) && <RivalLine state={state} />}
      <div className="figure-row">
        <Figure
          label="Confidence"
          value={String(d.confidence)}
          hint={BOARD_WORDS.confidence}
          size="lg"
          tone={d.confidence < 40 ? 'bad' : undefined}
        />
        <Figure
          label="Standing"
          value={words.name}
          hint={BOARD_WORDS.rung}
          tone={d.rung === RUNG_SOUND ? 'good' : 'bad'}
        />
        <Figure
          label="Reserves"
          value={`${formatMoney(state.treasury.cash)} / ${formatMoney(termExpenses(state))}`}
          note="against one term of expenses"
          hint={BOARD_WORDS.reserves}
          tone={reservesTight(state) ? 'bad' : undefined}
        />
        {last && (
          <Figure
            label="Last term"
            value={formatMoney(last.net, { sign: true })}
            hint={BOARD_WORDS.surplusRun}
            tone={last.net < 0 ? 'bad' : 'good'}
          />
        )}
      </div>
      <p className="board-demand">{words.demand}</p>
      <p className="treasury-note">{words.rule}</p>
      {austerity && (
        <div className="board-cuts">
          <div className="eyebrow">The board's list</div>
          <p className="treasury-note">
            {cuts.length > 0 ? BOARD_WORDS.cutsRequired : BOARD_WORDS.cutsNone}
          </p>
          <ul className="cut-list">
            {CUT_WORDS.map((c) => {
              const id = c.id as AusterityCut;
              const available = cutAvailable(state, id);
              return (
                <li key={c.id} className={available ? '' : 'unavailable'}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!available}
                      checked={chosen.includes(id)}
                      onChange={() => toggle(id)}
                    />
                    <span className="cut-label">{c.label}</span>
                    <span className="cut-blurb">{c.blurb}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {inReceivership(state) && (
        <div className="figure-row">
          <Figure
            label="CFO's policy"
            value={`${formatPercent(boardPolicy().drawRate, 2)} draw · ${formatPercent(boardPolicy().maintenanceFunding, 0)} maintenance`}
            hint={BOARD_WORDS.policy}
          />
          <Figure
            label="Terms left"
            value={String(d.receivershipTermsLeft)}
            hint={BOARD_WORDS.receivership}
          />
        </div>
      )}
    </div>
  );
}
