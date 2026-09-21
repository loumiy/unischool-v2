import { PEOPLE_READINGS, PEOPLE_WORDS } from '../content/people.ts';
import {
  attritionRate,
  campusCapacity,
  classLabel,
  enrolled,
  formatMoney,
  formatPercent,
  inTriples,
  type GameState,
} from '../sim/index.ts';
import { AID_DISCOUNT_RATE } from '../tuning.ts';
import Figure from './Figure.tsx';

// THE STUDENTS SCREEN (DD §8): the cohorts by class year, the campus's
// capacity against them, the standing admissions terms and the last
// funnel, and the alumni ledger. Named students (DD §8.1) and class
// memories (DD §8.4) arrive with their phases.

export default function StudentsScreen({ state }: { state: GameState }) {
  const { cohorts, alumni, terms, lastAdmissions, incoming } = state.people;
  const total = enrolled(state);
  const cap = campusCapacity(state);
  const triples = inTriples(state);
  const satisfaction = cohorts.length
    ? cohorts.reduce((t, c) => t + c.satisfaction * c.size, 0) / Math.max(1, total)
    : null;
  const sorted = [...cohorts].sort((a, b) => a.classYear - b.classYear);
  return (
    <div className="students">
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
          value={satisfaction === null ? '—' : formatPercent(attritionRate(satisfaction), 1)}
          hint={PEOPLE_READINGS.attrition}
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

      <section className="treasury-panel">
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

      <section className="treasury-panel">
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

      <section className="treasury-panel">
        <h3>Alumni</h3>
        {alumni.length === 0 ? (
          <p className="treasury-note">{PEOPLE_WORDS.noAlumni}</p>
        ) : (
          <table className="budget-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Graduates</th>
                <th>Quality</th>
                <th>Left satisfied</th>
              </tr>
            </thead>
            <tbody>
              {[...alumni].reverse().map((a) => (
                <tr key={a.classYear}>
                  <th>{classLabel(a.classYear)}</th>
                  <td>{a.size}</td>
                  <td>{a.quality.toFixed(0)}</td>
                  <td>{a.satisfaction.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
