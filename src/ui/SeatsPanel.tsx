import { SEAT_WORDS, seatById } from '../content/seats.ts';
import { findSchool } from '../content/schools.ts';
import {
  appointCost,
  deansAppointed,
  formatMoney,
  heldSeat,
  provostAppointed,
  seatPayroll,
  seatSlots,
  seniorFaculty,
  type FilledBy,
  type GameState,
} from '../sim/index.ts';
import { DEANS_FOR_FASTEST } from '../tuning.ts';
import Figure from './Figure.tsx';

// THE ORG CHART (DD §9.1–§9.2). Every seat the college could fill, what
// each would cost forever, and — where one is filled — the single policy
// it runs its domain on.
//
// The panel's job is to make the trade legible in both directions at once:
// the speed it buys and the payroll it costs, on the same screen.

export default function SeatsPanel({
  state,
  onAppoint,
  onPolicy,
}: {
  state: GameState;
  onAppoint: (seatId: string, schoolId: string | null, from: FilledBy) => void;
  onPolicy: (seatId: string, schoolId: string | null, policy: string) => void;
}) {
  const slots = seatSlots(state);
  const senior = seniorFaculty(state);
  const deans = deansAppointed(state);
  return (
    <section className="seats">
      <h3>The administration</h3>
      <div className="figure-row">
        <Figure
          label="Seats filled"
          value={`${state.delegation.seats.length} / ${slots.length}`}
          hint={SEAT_WORDS.payrollNote}
          size="lg"
        />
        <Figure
          label="In salaries"
          value={`${formatMoney(seatPayroll(state))} /yr`}
          hint={SEAT_WORDS.payrollNote}
          tone={seatPayroll(state) > 0 ? 'bad' : undefined}
        />
        <Figure
          label="Top speed"
          value={provostAppointed(state) ? (deans >= DEANS_FOR_FASTEST ? '8×' : '4×') : '2×'}
          hint={SEAT_WORDS.speedNote}
        />
      </div>
      <ul className="seat-list">
        {slots.map(({ def, schoolId }) => {
          const held = heldSeat(state, def.id, schoolId);
          const school = schoolId === null ? null : findSchool(schoolId);
          const title = school ? `${def.title} of ${school.name}` : def.title;
          const holder =
            held === null
              ? null
              : held.filledBy.kind === 'outside'
                ? SEAT_WORDS.heldOutside
                : SEAT_WORDS.heldBy.replace(
                    '{name}',
                    state.faculty.roster.find(
                      (f) => held.filledBy.kind === 'internal' && f.id === held.filledBy.facultyId,
                    )?.name ?? 'somebody',
                  );
          return (
            <li key={`${def.id}${schoolId ?? ''}`} className={held ? 'seat filled' : 'seat'}>
              <div className="seat-head">
                <span className="seat-title">{title}</span>
                <span className="seat-holder">{holder ?? SEAT_WORDS.vacant}</span>
              </div>
              <p className="seat-blurb">{def.blurb}</p>
              {held === null ? (
                <div className="seat-choices">
                  <button
                    type="button"
                    className="event-choice"
                    onClick={() => onAppoint(def.id, schoolId, { kind: 'outside' })}
                  >
                    <span className="event-choice-label">{SEAT_WORDS.outside}</span>
                    <span className="event-choice-note">
                      {formatMoney(def.outsideSalary)} /yr · {def.outsideLine}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="event-choice"
                    disabled={senior.length === 0}
                    onClick={() =>
                      senior[0] &&
                      onAppoint(def.id, schoolId, { kind: 'internal', facultyId: senior[0].id })
                    }
                  >
                    <span className="event-choice-label">{SEAT_WORDS.internal}</span>
                    <span className="event-choice-note">
                      {senior.length === 0
                        ? SEAT_WORDS.noSenior
                        : `${formatMoney(def.internalSalary)} /yr · ${senior[0]!.name} stops teaching`}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="seat-policies">
                  {def.policies.map((policy) => (
                    <button
                      key={policy.id}
                      type="button"
                      className={`seat-policy ${held.policy === policy.id ? 'chosen' : ''}`}
                      onClick={() => onPolicy(def.id, schoolId, policy.id)}
                    >
                      <span className="seat-policy-label">{policy.label}</span>
                      <span className="seat-policy-note">{policy.note}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="seat-cost">
                {held === null
                  ? `${formatMoney(appointCost(seatById(def.id), { kind: 'outside' }))} a year, forever, and a step of the ratchet.`
                  : // A filled seat keeps saying what it costs, because the
                    // cost is the point of the bargain (DD §9.4).
                    `${formatMoney(held.salary)} a year since Year ${held.appointedYear}.`}
              </p>
            </li>
          );
        })}
      </ul>
      {state.academics.schools.length === 0 && <p className="seat-cost">{SEAT_WORDS.noSchools}</p>}
    </section>
  );
}
