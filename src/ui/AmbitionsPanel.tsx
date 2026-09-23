import { AMBITION_WORDS, ambitionById } from '../content/ambitions.ts';
import { activeAmbitions, goalMet, yearsLeft, type GameState } from '../sim/index.ts';
import { costLine, measureAll, worthLine, type Measure } from './measure.ts';

// The goal as a measurement (Phase 21F): where the college is against what
// it said it would be, one line per clause, with a bar when there is a
// distance to close. The docket used to say "not yet" and never what.
function Goal({ measures }: { measures: Measure[] }) {
  return (
    <ul className="ambition-goal">
      {measures.map((m) => (
        <li key={m.text} className={m.met ? 'met' : ''}>
          <span className="ambition-goal-text">{m.text}</span>
          {m.progress !== undefined && (
            <span className="ambition-goal-track" aria-hidden="true">
              <span
                className="ambition-goal-fill"
                style={{ width: `${Math.round(m.progress * 100)}%` }}
              />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// THE DOCKET (DD §10.2): what the college has promised in public and by
// when. Shown at Convocation, where promises are made and read out, and on
// the History screen, where the chronicle will eventually keep them.
//
// The point of the panel is the date. An ambition with no visible deadline
// is a wish, and the game's job is to make the player want one more than
// they can afford.

export function dueLine(years: number): string {
  if (years <= 0) return AMBITION_WORDS.dueNow;
  if (years === 1) return AMBITION_WORDS.dueNext;
  return AMBITION_WORDS.dueIn.replace('{years}', String(years));
}

export default function AmbitionsPanel({
  state,
  heading = 'On the record',
}: {
  state: GameState;
  heading?: string;
}) {
  const active = state.ambitions.active;
  const settled = [...state.ambitions.settled].reverse();
  return (
    <section className="ambitions">
      <h3>{heading}</h3>
      {active.length === 0 && settled.length === 0 && (
        <p className="ambitions-empty">{AMBITION_WORDS.none}</p>
      )}
      {active.length > 0 && (
        <ul className="ambition-list">
          {active.map((held) => {
            const def = ambitionById(held.ambitionId);
            const left = yearsLeft(state, held);
            const met = goalMet(state, def);
            return (
              <li key={held.ambitionId} className={`ambition ${met ? 'met' : ''}`}>
                <span className="ambition-title">{def.title}</span>
                <span className={`ambition-due ${left <= 1 ? 'soon' : ''}`}>{dueLine(left)}</span>
                {/* Whether the promise is true TODAY, which is not the same
                    as whether it will be true on the day it is read out. */}
                <span className="ambition-state">{met ? 'true today' : 'not yet'}</span>
                <Goal measures={measureAll(state, def.goal)} />
                <span className="ambition-stakes">{costLine(def.penalty)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {settled.length > 0 && (
        <ul className="ambition-list settled">
          {settled.map((done) => (
            <li key={`${done.ambitionId}${done.year}`} className={done.kept ? 'kept' : 'missed'}>
              <span className="ambition-title">{ambitionById(done.ambitionId).title}</span>
              <span className="ambition-due">Year {done.year}</span>
              <span className="ambition-state">{done.kept ? 'kept' : 'missed'}</span>
            </li>
          ))}
        </ul>
      )}
      {activeAmbitions(state).length >= 3 && (
        <p className="ambitions-note">{AMBITION_WORDS.capReached}</p>
      )}
    </section>
  );
}

// The offer itself, on the Convocation screen: the words, the date it puts
// on them, and two honest verbs. Declining is free and says so.
export function AmbitionOffer({
  state,
  accepted,
  onChange,
}: {
  state: GameState;
  accepted: boolean;
  onChange: (accept: boolean) => void;
}) {
  const offered = state.ambitions.offered;
  if (offered === null) return null;
  const def = ambitionById(offered);
  const full = state.ambitions.active.length >= 3;
  return (
    <section className="ambition-offer">
      <div className="eyebrow">On the record</div>
      <h3>{def.title}</h3>
      <p className="ambition-text">
        {def.text.replace('{school}', state.identity?.name ?? 'the college')}
      </p>
      <Goal measures={measureAll(state, def.goal)} />
      <p className="ambition-terms">
        {full
          ? AMBITION_WORDS.capReached
          : `${def.years} years from this Convocation. ${AMBITION_WORDS.note}`}
      </p>
      <p className="ambition-stakes">
        {worthLine(def.reward)} {costLine(def.penalty)}
      </p>
      <div className="ambition-choices">
        <button
          type="button"
          className={`event-choice ${accepted ? 'chosen' : ''}`}
          disabled={full}
          onClick={() => onChange(true)}
        >
          <span className="event-choice-label">Put it on the record</span>
          <span className="event-choice-note">{def.years} years, publicly</span>
        </button>
        <button
          type="button"
          className={`event-choice ${accepted ? '' : 'chosen'}`}
          onClick={() => onChange(false)}
        >
          <span className="event-choice-label">Decline</span>
          <span className="event-choice-note">Free, and nobody hears about it</span>
        </button>
      </div>
    </section>
  );
}
