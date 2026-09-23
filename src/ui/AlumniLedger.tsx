import { ALUMNI_READINGS, ALUMNI_WORDS } from '../content/alumni.ts';
import { fillWords, PEOPLE_READINGS } from '../content/people.ts';
import {
  annualGiving,
  canReunite,
  classLabel,
  formatMoney,
  givingOf,
  memoryLine,
  reunionCost,
  reunionRoom,
  type GameState,
} from '../sim/index.ts';
import Figure from './Figure.tsx';

// THE ALUMNI LEDGER (DD §8.4): the run's long memory, and the one screen
// where a decision from twenty years ago is still visibly costing money.
// Every class carries the line it was stamped with at graduation, the
// warmth that line set, and what it gives this year — so the causal chain
// from a bad four years to a thin annual fund is readable, not asserted.

export default function AlumniLedger({
  state,
  onReunion,
}: {
  state: GameState;
  onReunion: (classYear: number) => void;
}) {
  const { alumni } = state.people;
  const year = state.clock.year;
  const fund = annualGiving(state);
  const heads = alumni.reduce((t, a) => t + a.size, 0);
  return (
    <section className="treasury-panel" id="students-alumni">
      <h3>Alumni</h3>
      {alumni.length === 0 ? (
        <p className="treasury-note">{ALUMNI_WORDS.noAlumni}</p>
      ) : (
        <>
          <div className="figure-row inner">
            <Figure
              label="Annual fund"
              value={`${formatMoney(fund)} /yr`}
              hint={ALUMNI_READINGS.annualFund}
              size="lg"
              tone={fund > 0 ? 'good' : undefined}
            />
            <Figure label="Alumni" value={String(heads)} hint={PEOPLE_READINGS.enrolled} />
            <Figure
              label="Mean warmth"
              value={(alumni.reduce((t, a) => t + a.warmth, 0) / alumni.length).toFixed(0)}
              hint={ALUMNI_READINGS.warmth}
            />
          </div>
          <table className="budget-table alumni-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Graduates</th>
                <th>Warmth</th>
                <th>Gives</th>
                <th aria-label="Reunion" />
              </tr>
            </thead>
            <tbody>
              {[...alumni].reverse().map((a) => (
                <tr key={a.classYear}>
                  <th>
                    {classLabel(a.classYear)}
                    <span className="alumni-memory figure" tabIndex={0}>
                      {memoryLine(a)}
                      <span className="figure-hint" role="tooltip">
                        {ALUMNI_READINGS.memory}
                      </span>
                    </span>
                  </th>
                  <td>
                    {a.size}
                    <span className="alumni-outcomes">
                      {a.outcomes.distinguished} · {a.outcomes.placed} · {a.outcomes.adrift}
                    </span>
                  </td>
                  <td className="figure" tabIndex={0}>
                    {a.warmth.toFixed(0)}
                    {a.nudged > 0 && <span className="alumni-nudged">+{a.nudged.toFixed(0)}</span>}
                    <span className="figure-hint" role="tooltip">
                      {ALUMNI_READINGS.warmth}
                    </span>
                  </td>
                  <td className="figure" tabIndex={0}>
                    {formatMoney(givingOf(a, year))}
                    <span className="figure-hint" role="tooltip">
                      {ALUMNI_READINGS.giving}
                    </span>
                  </td>
                  <td className="alumni-reunion">
                    {reunionRoom(a) <= 0 ? (
                      <span className="alumni-capped">{ALUMNI_WORDS.reunionCapped}</span>
                    ) : !canReunite(a, year) ? (
                      <span className="alumni-capped">{ALUMNI_WORDS.reunionDone}</span>
                    ) : (
                      <button
                        type="button"
                        className="newgame-btn"
                        title={ALUMNI_READINGS.reunion}
                        onClick={() => onReunion(a.classYear)}
                      >
                        {fillWords(ALUMNI_WORDS.reunion, { cost: formatMoney(reunionCost(a)) })}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="treasury-note">{ALUMNI_WORDS.warmthNote}</p>
        </>
      )}
    </section>
  );
}
