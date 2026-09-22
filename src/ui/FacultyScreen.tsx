import { FACULTY_READINGS, FACULTY_WORDS } from '../content/faculty.ts';
import { fillWords } from '../content/people.ts';
import { SCHOOLS } from '../content/schools.ts';
import {
  adminShareOfPayroll,
  annualFacultyPayroll,
  formatMoney,
  formatPercent,
  frozen,
  teachingQuality,
  unassignedFaculty,
  type GameState,
  type FilledBy,
} from '../sim/index.ts';
import FacultyCard from './FacultyCard.tsx';
import Figure from './Figure.tsx';
import SeatsPanel from './SeatsPanel.tsx';

// THE FACULTY SCREEN (DD §7.3), in v1's language: the payroll strip, the
// summer market while it is open (listings, dashed), and the roster as
// cards grouped by school under its hue. Competence and cost; no drama.

export default function FacultyScreen({
  state,
  onHire,
  onAssign,
  onDismiss,
  onAppoint,
  onPolicy,
}: {
  state: GameState;
  onHire: (candidateId: string, programId: string | null) => void;
  onAssign: (facultyId: string, programId: string | null) => void;
  onDismiss: (facultyId: string) => void;
  onAppoint: (seatId: string, schoolId: string | null, from: FilledBy) => void;
  onPolicy: (seatId: string, schoolId: string | null, policy: string) => void;
}) {
  const { roster, market, marketOpen } = state.faculty;
  const payroll = annualFacultyPayroll(state);
  const teaching = teachingQuality(state);
  const idle = unassignedFaculty(state).length;
  const iced = frozen(state);
  return (
    <div className="faculty">
      <div className="figure-row">
        <Figure
          label="Faculty"
          value={String(roster.length)}
          hint={FACULTY_READINGS.headcount}
          size="lg"
        />
        <Figure
          label="Faculty payroll"
          value={`${formatMoney(payroll)} /yr`}
          hint={FACULTY_READINGS.payroll}
        />
        <Figure
          label="Admin share"
          value={formatPercent(
            adminShareOfPayroll({
              ...state.treasury.budget,
              expenses: { ...state.treasury.budget.expenses, facultyPayroll: payroll },
            }),
            0,
          )}
          hint={FACULTY_READINGS.adminShare}
        />
        <Figure
          label="Teaching"
          value={teaching.toFixed(0)}
          hint={FACULTY_READINGS.teaching}
          tone={teaching < 40 ? 'bad' : teaching >= 60 ? 'good' : undefined}
        />
        <Figure
          label="Market"
          value={marketOpen ? `${market.length} listed` : 'closed'}
          hint={FACULTY_READINGS.market}
          tone={marketOpen ? 'good' : 'muted'}
        />
      </div>
      {marketOpen && (
        <section className="faculty-market">
          <div className="faculty-section-head">
            <h3>The market</h3>
            <span className="faculty-section-note">
              {iced
                ? FACULTY_WORDS.frozen
                : market.length === 0
                  ? FACULTY_WORDS.marketEmpty
                  : fillWords(FACULTY_WORDS.marketOpen, { count: market.length })}
            </span>
          </div>
          {market.length > 0 && (
            <ul className="faculty-list">
              {market.map((f) => (
                <FacultyCard key={f.id} f={f} state={state} onHire={(p) => onHire(f.id, p)} />
              ))}
            </ul>
          )}
        </section>
      )}
      {roster.length === 0 ? (
        <p className="treasury-note">{FACULTY_WORDS.noFaculty}</p>
      ) : (
        <>
          {!marketOpen && <p className="treasury-note">{FACULTY_WORDS.marketClosed}</p>}
          {idle > 0 && (
            <p className="treasury-note bad">
              {fillWords(FACULTY_WORDS.unassignedNote, { count: idle })}
            </p>
          )}
          {SCHOOLS.filter((s) => roster.some((f) => f.schoolId === s.id)).map((school) => (
            <section
              key={school.id}
              className="school-group founded faculty-group"
              style={{ '--school-hue': school.hue } as React.CSSProperties}
            >
              <div className="school-group-head">
                <span className="school-group-mark" aria-hidden="true">
                  {school.mark}
                </span>
                <h3>{school.name}</h3>
                <span className="lane-count">
                  {roster.filter((f) => f.schoolId === school.id).length}
                </span>
              </div>
              <ul className="faculty-list">
                {roster
                  .filter((f) => f.schoolId === school.id)
                  .map((f) => (
                    <FacultyCard
                      key={f.id}
                      f={f}
                      state={state}
                      onAssign={(p) => onAssign(f.id, p)}
                      onDismiss={() => onDismiss(f.id)}
                    />
                  ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {/* The org chart (DD §9): what the college has delegated, what that
          buys in speed, and what it costs in payroll forever. */}
      <SeatsPanel state={state} onAppoint={onAppoint} onPolicy={onPolicy} />
    </div>
  );
}
