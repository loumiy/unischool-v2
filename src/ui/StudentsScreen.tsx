import JumpBar from './JumpBar.tsx';
import { fillWords, PEOPLE_READINGS, PEOPLE_WORDS } from '../content/people.ts';
import {
  attritionRate,
  campusCapacity,
  classLabel,
  enrolled,
  formatMoney,
  formatPercent,
  inTriples,
  outcomesFor,
  reputationPoolFactor,
  reputationTerms,
  satisfactionBreakdown,
  teachingQuality,
  type GameState,
  type SatisfactionBreakdown,
} from '../sim/index.ts';
import { AID_DISCOUNT_RATE, REPUTATION_WEIGHTS } from '../tuning.ts';
import Figure from './Figure.tsx';
import HistoryChart from './HistoryChart.tsx';
import NamedStudents from './NamedStudents.tsx';
import AlumniLedger from './AlumniLedger.tsx';
import CampaignPanel from './CampaignPanel.tsx';
import PlacementPanel from './PlacementPanel.tsx';
import AthleticsPanel from './AthleticsPanel.tsx';
import type { AthleticsBudget } from '../content/athletics.ts';

// THE STUDENTS SCREEN (DD §8): the cohorts by class year, the campus's
// capacity against them, the standing admissions terms and the last
// funnel, why the students feel the way they do (every term of
// satisfaction, signed), and the alumni ledger with how each class turned
// out. Named students (DD §8.1) and class memories (DD §8.4) arrive with
// their phases.

const TERMS: { key: keyof SatisfactionBreakdown; label: string; hint: string }[] = [
  { key: 'base', label: 'Base', hint: PEOPLE_READINGS.base },
  { key: 'housing', label: 'Housing', hint: PEOPLE_READINGS.housing },
  { key: 'dining', label: 'Dining', hint: PEOPLE_READINGS.dining },
  { key: 'seats', label: 'Teaching seats', hint: PEOPLE_READINGS.seatsTerm },
  { key: 'condition', label: 'Buildings', hint: PEOPLE_READINGS.condition },
  { key: 'teaching', label: 'Teaching', hint: PEOPLE_READINGS.teachingTerm },
  { key: 'morale', label: 'Faculty quirks', hint: PEOPLE_READINGS.morale },
  { key: 'placement', label: 'Placement', hint: PEOPLE_READINGS.placement },
  { key: 'life', label: 'Student life', hint: PEOPLE_READINGS.lifeTerm },
  // The events term was summed into the total and never shown, so the
  // table did not add up to the number under it (Phase 21I).
  { key: 'events', label: 'What happened', hint: PEOPLE_READINGS.eventsTerm },
  { key: 'conditions', label: 'The ladder', hint: PEOPLE_READINGS.conditions },
  { key: 'expectations', label: 'Expectations', hint: PEOPLE_READINGS.expectationsTerm },
  { key: 'identity', label: 'What we are known for', hint: PEOPLE_READINGS.identityTerm },
  { key: 'returns', label: 'Near the top', hint: PEOPLE_READINGS.returnsTerm },
];

const signed = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export function SatisfactionTable({ breakdown }: { breakdown: SatisfactionBreakdown }) {
  return (
    <table className="budget-table satisfaction-table">
      <tbody>
        {TERMS.map((t) => {
          const v = breakdown[t.key];
          return (
            <tr key={t.key} className={v < 0 ? 'bad' : v > 0 && t.key !== 'base' ? 'good' : ''}>
              <th>{t.label}</th>
              <td className="figure" tabIndex={0}>
                {t.key === 'base' ? v.toFixed(0) : signed(v)}
                <span className="figure-hint" role="tooltip">
                  {t.hint}
                </span>
              </td>
            </tr>
          );
        })}
        <tr className="satisfaction-total">
          <th>Satisfaction</th>
          <td>{breakdown.total.toFixed(0)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// REPUTATION (DD §8.2, Phase 37): the talk, the reading it is moving
// towards, what it is doing to the pool, and the four causes with what
// each contributes, so a falling number always has a reason on the page.
const CAUSES = [
  { key: 'teaching', label: 'Teaching', hint: PEOPLE_READINGS.repTeaching },
  { key: 'satisfaction', label: 'Satisfaction', hint: PEOPLE_READINGS.repSatisfaction },
  { key: 'outcomes', label: 'Graduates', hint: PEOPLE_READINGS.repOutcomes },
  { key: 'condition', label: 'Buildings', hint: PEOPLE_READINGS.repCondition },
] as const;

function ReputationPanel({ state }: { state: GameState }) {
  const reputation = state.people.reputation;
  const terms = reputationTerms(state);
  const pool = reputationPoolFactor(state) - 1;
  const quiet = state.people.alumni.length === 0;
  const trend = terms.reading - reputation;
  return (
    <section className="treasury-panel" id="students-reputation">
      <h3>{PEOPLE_WORDS.reputationTitle}</h3>
      <div className="figure-row inner">
        <Figure
          label="Reputation"
          value={reputation.toFixed(0)}
          hint={PEOPLE_READINGS.reputation}
          tone={reputation < 40 ? 'bad' : reputation >= 60 ? 'good' : undefined}
        />
        <Figure
          label="This year's reading"
          value={terms.reading.toFixed(0)}
          note={quiet ? undefined : trend > 1 ? 'rising' : trend < -1 ? 'falling' : 'steady'}
          hint={PEOPLE_READINGS.reputationReading}
          tone={quiet ? 'muted' : trend < -1 ? 'bad' : trend > 1 ? 'good' : undefined}
        />
        <Figure
          label="Applicants"
          value={`${signed(pool * 100)}%`}
          hint={PEOPLE_READINGS.reputationPool}
          tone={pool > 0 ? 'good' : pool < 0 ? 'bad' : undefined}
        />
      </div>
      {quiet && <p className="treasury-note">{PEOPLE_WORDS.reputationQuiet}</p>}
      <table className="budget-table satisfaction-table">
        <tbody>
          {CAUSES.map((c) => (
            <tr
              key={c.key}
              className={terms[c.key] < 40 ? 'bad' : terms[c.key] >= 60 ? 'good' : ''}
            >
              <th>{c.label}</th>
              <td className="figure" tabIndex={0}>
                {terms[c.key].toFixed(0)}
                <span className="figure-hint" role="tooltip">
                  {c.hint}
                </span>
              </td>
              <td>{(terms[c.key] * REPUTATION_WEIGHTS[c.key]).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function StudentsScreen({
  state,
  onReunion,
  onLaunch,
  onVarsity,
  onAthleticsBudget,
}: {
  state: GameState;
  onReunion: (classYear: number) => void;
  onLaunch: (campaignId: string) => void;
  onVarsity: (sportId: string, on: boolean) => void;
  onAthleticsBudget: (budget: AthleticsBudget) => void;
}) {
  const { cohorts, terms, lastAdmissions, incoming } = state.people;
  const total = enrolled(state);
  const cap = campusCapacity(state);
  const triples = inTriples(state);
  const satisfaction = cohorts.length
    ? cohorts.reduce((t, c) => t + c.satisfaction * c.size, 0) / Math.max(1, total)
    : null;
  const sorted = [...cohorts].sort((a, b) => a.classYear - b.classYear);
  const breakdown = satisfactionBreakdown(state, total);
  const teaching = teachingQuality(state);
  const next = sorted[0] ?? null;
  const projected = next ? outcomesFor(next.quality, next.satisfaction, next.size) : null;
  return (
    <div className="students">
      <JumpBar
        label="Sections of the Students screen"
        jumps={[
          { label: 'Classes', id: 'students-classes' },
          { label: 'Named students', id: 'students-named' },
          { label: 'Layout', id: 'students-layout' },
          { label: 'Reputation', id: 'students-reputation' },
          { label: 'Admissions', id: 'students-admissions' },
          { label: 'Alumni', id: 'students-alumni' },
          { label: 'Campaigns', id: 'students-campaigns' },
          { label: 'Athletics', id: 'students-athletics' },
        ]}
      />
      <div className="figure-row">
        <Figure label="Enrolled" value={String(total)} hint={PEOPLE_READINGS.enrolled} size="lg" />
        <Figure
          label="Satisfaction"
          value={satisfaction === null ? '—' : satisfaction.toFixed(0)}
          hint={PEOPLE_READINGS.satisfaction}
          tone={satisfaction !== null && satisfaction < 50 ? 'bad' : undefined}
        />
        <Figure
          label="Attrition"
          value={
            satisfaction === null
              ? '—'
              : formatPercent(
                  cohorts.reduce(
                    (t, c) => t + attritionRate(c.satisfaction, c.quality) * c.size,
                    0,
                  ) / Math.max(1, total),
                  1,
                )
          }
          hint={PEOPLE_READINGS.attrition}
        />
        <Figure
          label="Teaching"
          value={teaching.toFixed(0)}
          hint={PEOPLE_READINGS.teachingQuality}
          tone={teaching < 40 ? 'bad' : teaching >= 60 ? 'good' : undefined}
        />
        <Figure
          label="In triples"
          value={String(triples)}
          hint={PEOPLE_READINGS.triples}
          tone={triples > 0 ? 'bad' : undefined}
        />
      </div>

      <div className="figure-row">
        <Figure
          label="Beds"
          value={`${Math.min(total, cap.beds)} / ${cap.beds}`}
          hint={PEOPLE_READINGS.beds}
          tone={total > cap.beds ? 'bad' : undefined}
        />
        <Figure
          label="Dining seats"
          value={`${Math.min(total, cap.meals)} / ${cap.meals}`}
          hint={PEOPLE_READINGS.meals}
          tone={total > cap.meals ? 'bad' : undefined}
        />
        <Figure
          label="Teaching seats"
          value={`${Math.min(total, cap.seats)} / ${cap.seats}`}
          hint={PEOPLE_READINGS.seats}
          tone={total > cap.seats ? 'bad' : undefined}
        />
      </div>

      <section className="treasury-panel" id="students-classes">
        <h3>Classes</h3>
        {sorted.length === 0 ? (
          <p className="treasury-note">{PEOPLE_WORDS.noClass}</p>
        ) : (
          <table className="budget-table cohort-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Students</th>
                <th>Quality</th>
                <th>Satisfaction</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.classYear}>
                  <th>{classLabel(c.classYear)}</th>
                  <td className="figure" tabIndex={0}>
                    {c.size}
                    <span className="figure-hint" role="tooltip">
                      {PEOPLE_READINGS.cohortSize}
                    </span>
                  </td>
                  <td className="figure" tabIndex={0}>
                    {c.quality.toFixed(0)}
                    <span className="figure-hint" role="tooltip">
                      {PEOPLE_READINGS.cohortQuality}
                    </span>
                  </td>
                  <td>{c.satisfaction.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {incoming && (
          <p className="treasury-note">
            The {classLabel(incoming.year + 3)}, {incoming.size} strong, arrives at Convocation.
          </p>
        )}
      </section>

      <NamedStudents state={state} />

      <section className="treasury-panel">
        <h3>{PEOPLE_WORDS.breakdownTitle}</h3>
        <SatisfactionTable breakdown={breakdown} />
        {next && projected && (
          <p className="treasury-note">
            {fillWords(PEOPLE_WORDS.nextClass, {
              label: classLabel(next.classYear),
              ...projected,
            })}
          </p>
        )}
      </section>

      <PlacementPanel state={state} />

      <ReputationPanel state={state} />

      <section className="treasury-panel" id="students-admissions">
        <h3>Admissions</h3>
        <div className="figure-row inner">
          <Figure
            label="Sticker"
            value={formatMoney(terms.tuition)}
            hint={PEOPLE_READINGS.tuition}
          />
          <Figure
            label="Net tuition"
            value={formatMoney(terms.tuition * (1 - AID_DISCOUNT_RATE))}
            hint={PEOPLE_READINGS.netTuition}
          />
          <Figure
            label="Selectivity"
            value={formatPercent(terms.selectivity, 0)}
            hint={PEOPLE_READINGS.selectivity}
          />
          {lastAdmissions && (
            <>
              <Figure
                label="Applied"
                value={String(lastAdmissions.applicants)}
                hint={PEOPLE_READINGS.applicants}
              />
              <Figure
                label="Admitted"
                value={String(lastAdmissions.admitted)}
                hint={PEOPLE_READINGS.admitted}
              />
              <Figure
                label="Yield"
                value={formatPercent(lastAdmissions.yieldRate, 0)}
                hint={PEOPLE_READINGS.yield}
              />
              <Figure
                label="Class"
                value={String(lastAdmissions.size)}
                hint={PEOPLE_READINGS.classSize}
                note={lastAdmissions.capped ? 'capped by the beds' : undefined}
                tone={lastAdmissions.capped ? 'bad' : undefined}
              />
            </>
          )}
        </div>
      </section>

      {/* The classes over the run (Phase 48): how big, and how happy as
          they left. */}
      {state.people.alumni.length > 1 && (
        <section className="treasury-panel">
          <h3>The classes over the years</h3>
          <HistoryChart
            title="Each class as it graduated"
            xLabel="Class of"
            series={[
              {
                name: 'Graduates',
                points: state.people.alumni.map((a) => ({ x: a.classYear, y: a.size })),
              },
            ]}
          />
          <HistoryChart
            title="Satisfaction as they left"
            xLabel="Class of"
            yMin={0}
            yMax={100}
            series={[
              {
                name: 'Satisfaction',
                points: state.people.alumni.map((a) => ({ x: a.classYear, y: a.satisfaction })),
              },
            ]}
          />
        </section>
      )}

      <AlumniLedger state={state} onReunion={onReunion} />
      {/* Campaigns sit with the ledger they are answered by (DD §9.3). */}
      <CampaignPanel state={state} onLaunch={onLaunch} />
      <AthleticsPanel state={state} onVarsity={onVarsity} onBudget={onAthleticsBudget} />
    </div>
  );
}
