import { useState } from 'react';
import { FACULTY_READINGS, FACULTY_WORDS, quirkById, rankById } from '../content/faculty.ts';
import { fillWords } from '../content/people.ts';
import { schoolById } from '../content/schools.ts';
import {
  effectiveResearch,
  effectiveTeaching,
  formatMoney,
  foundedSchool,
  frozen,
  openProgram,
  severanceFor,
  type Faculty,
  type GameState,
} from '../sim/index.ts';
import FacultyPortrait from './FacultyPortrait.tsx';

// A hire, as a card (ported from v1's faculty-card idiom): the portrait at a
// size you can see, the name with the weight of a heading, the two skills
// as bars with the headroom behind them, the quirk as one line, and the
// footer — salary, what they teach, the one action. A LISTING is the same
// card dashed: a candidate is not a hire, and the paper says so before the
// text does.

const GREY_BY_RANK = { assistant: 0.1, associate: 0.25, full: 0.5 } as const;

function Bar({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <span className="faculty-bar figure" tabIndex={0}>
      <span className="faculty-bar-label">{label}</span>
      <span className="faculty-bar-track">
        <span className="faculty-bar-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="faculty-bar-value">{value}</span>
      <span className="figure-hint" role="tooltip">
        {hint}
      </span>
    </span>
  );
}

// The programs this person could teach: open, in their field.
function programOptions(state: GameState, f: Faculty) {
  return schoolById(f.schoolId).programs.filter((p) => openProgram(state, p.id));
}

export default function FacultyCard({
  f,
  state,
  onHire,
  onAssign,
  onDismiss,
}: {
  f: Faculty;
  state: GameState;
  // Present for a listing: hires them to the chosen program (or none).
  onHire?: (programId: string | null) => void;
  onAssign?: (programId: string | null) => void;
  onDismiss?: () => void;
}) {
  const listed = f.hiredWeek === null;
  const rank = rankById(f.rank);
  const school = schoolById(f.schoolId);
  const quirk = quirkById(f.quirkId);
  const options = programOptions(state, f);
  const [choice, setChoice] = useState<string>('');
  const [armed, setArmed] = useState(false);
  const chosen = options.some((p) => p.id === choice) ? choice : (options[0]?.id ?? '');
  const iced = frozen(state);
  return (
    <li className={`faculty-card ${listed ? 'listed' : ''}`}>
      <div className="faculty-card-main">
        <FacultyPortrait
          f={{ id: f.id, gender: f.gender, heritage: f.heritage, seniority: GREY_BY_RANK[f.rank] }}
        />
        <div className="faculty-card-body">
          <div className="faculty-card-head">
            <span className="faculty-name">{f.name}</span>
          </div>
          <span className="faculty-card-field">
            {fillWords(FACULTY_WORDS.rankAndField, { rank: rank.name, school: school.name })}
          </span>
          <div className="faculty-bars">
            {/* Words, not initials: "T" and "R" on thirty-two cards were two
                letters a new player had to hover to decode (Phase 21F). */}
            <Bar
              label="Teaching"
              value={effectiveTeaching(f)}
              hint={FACULTY_READINGS.teachingSkill}
            />
            <Bar
              label="Research"
              value={effectiveResearch(f)}
              hint={FACULTY_READINGS.researchSkill}
            />
          </div>
          <span className="faculty-quirk">
            <strong>{quirk.name}.</strong> {quirk.line}
          </span>
        </div>
      </div>
      <div className="faculty-card-foot">
        <span className="faculty-card-salary figure" tabIndex={0}>
          {formatMoney(f.salary)} /yr
          <span className="figure-hint" role="tooltip">
            {FACULTY_READINGS.salary}
          </span>
        </span>
        {listed ? (
          <>
            {options.length > 0 ? (
              <select
                className="faculty-assign"
                value={chosen}
                aria-label={`Program for ${f.name}`}
                onChange={(e) => setChoice(e.target.value)}
              >
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="">{FACULTY_WORDS.unassigned}</option>
              </select>
            ) : (
              <span className="faculty-card-note">
                {foundedSchool(state, f.schoolId)
                  ? fillWords(FACULTY_WORDS.noProgramsForSchool, { school: school.name })
                  : fillWords(FACULTY_WORDS.unfoundedField, { school: school.name })}
              </span>
            )}
            {onHire && (
              <button
                type="button"
                className="appoint"
                disabled={iced}
                title={iced ? FACULTY_WORDS.frozen : undefined}
                onClick={() => onHire(chosen || null)}
              >
                {FACULTY_WORDS.hire}
              </button>
            )}
          </>
        ) : (
          <>
            {onAssign && (
              <select
                className={`faculty-assign ${f.programId === null ? 'idle' : ''}`}
                value={f.programId ?? ''}
                aria-label={`Program for ${f.name}`}
                onChange={(e) => onAssign(e.target.value || null)}
              >
                <option value="">{FACULTY_WORDS.unassigned}</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {onDismiss &&
              (armed ? (
                <span className="faculty-dismiss-arm">
                  <span className="newgame-confirm-label">
                    {fillWords(FACULTY_WORDS.dismissConfirm, {
                      name: f.name,
                      severance: formatMoney(severanceFor(f)),
                    })}
                  </span>
                  <button type="button" className="dismiss armed" onClick={onDismiss}>
                    Dismiss
                  </button>
                  <button type="button" className="keep" onClick={() => setArmed(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" className="dismiss" onClick={() => setArmed(true)}>
                  {FACULTY_WORDS.dismiss}
                </button>
              ))}
          </>
        )}
      </div>
    </li>
  );
}
