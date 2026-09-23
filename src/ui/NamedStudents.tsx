import { STUDENT_READINGS, STUDENT_WORDS } from '../content/students.ts';
import { fillWords } from '../content/people.ts';
import { programById } from '../content/schools.ts';
import {
  beatLine,
  classLabel,
  clockFromAbsoluteWeek,
  formatClockShort,
  yearOfStudy,
  type GameState,
  type NamedStudent,
} from '../sim/index.ts';
import FacultyPortrait from './FacultyPortrait.tsx';

// THE HANDFUL THE GAME FOLLOWS (DD §8.1): a face, a name, what they came
// to read, and everything that has been said about them, in the order it
// was said. The card exists so a player can recognise someone in the
// ticker and come here to find out how they got on — it shows the arc,
// and never a number, because there is no number behind it.

function standing(state: GameState, s: NamedStudent): string {
  if (s.status === 'graduated') return fillWords(STUDENT_WORDS.graduated, { class: s.classYear });
  if (s.status === 'left') {
    const left = s.beats[s.beats.length - 1];
    return fillWords(STUDENT_WORDS.left, {
      year: left ? clockFromAbsoluteWeek(left.week).year : '—',
    });
  }
  const year = STUDENT_WORDS.years[yearOfStudy(s, state.clock.year) - 1] ?? '';
  const program = s.programId ? programById(s.programId).name : null;
  return program ? fillWords(STUDENT_WORDS.enrolled, { program, year: year.toLowerCase() }) : year;
}

function StudentCard({ s, state }: { s: NamedStudent; state: GameState }) {
  return (
    <li className={`student-card ${s.status}`}>
      <div className="student-card-head">
        <FacultyPortrait
          f={{ id: s.id, gender: s.gender, heritage: s.heritage, seniority: 0 }}
          size={40}
        />
        <div className="student-card-who">
          <span className="faculty-name">{s.name}</span>
          <span className="student-card-standing">
            {standing(state, s)}
            {s.outcome && <span className={`student-outcome ${s.outcome}`}>{s.outcome}</span>}
          </span>
        </div>
      </div>
      {s.beats.length === 0 ? (
        <p className="student-card-quiet">Nothing has happened to them yet.</p>
      ) : (
        <ol className="student-arc">
          {s.beats.map((b) => (
            <li key={`${b.week}-${b.arcId}`}>
              <span className="student-arc-when">
                {formatClockShort(clockFromAbsoluteWeek(b.week))}
              </span>
              <span className="student-arc-line">{beatLine(state, s, b.arcId)}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export default function NamedStudents({ state }: { state: GameState }) {
  const named = state.people.named;
  const here = named.filter((s) => s.status === 'enrolled');
  // The ones who have finished, newest first: a short memory, not a ledger.
  const gone = named
    .filter((s) => s.status !== 'enrolled')
    .slice(-6)
    .reverse();
  return (
    <section className="treasury-panel" id="students-named">
      <h3 className="figure" tabIndex={0}>
        Students we are following
        <span className="figure-hint" role="tooltip">
          {STUDENT_READINGS.named}
        </span>
      </h3>
      {named.length === 0 ? (
        <p className="treasury-note">{STUDENT_WORDS.none}</p>
      ) : (
        <>
          <ul className="student-list">
            {here.map((s) => (
              <StudentCard key={s.id} s={s} state={state} />
            ))}
          </ul>
          {gone.length > 0 && (
            <>
              <div className="eyebrow student-gone-head">Lately gone</div>
              <ul className="student-list">
                {gone.map((s) => (
                  <StudentCard key={s.id} s={s} state={state} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {here.length > 0 && (
        <p className="treasury-note">
          {classLabel(Math.min(...here.map((s) => s.classYear)))} is the oldest class the game is
          still watching.
        </p>
      )}
    </section>
  );
}
