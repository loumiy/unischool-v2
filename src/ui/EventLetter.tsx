import { eventById } from '../content/events.ts';
import {
  formatClock,
  institutionName,
  pendingText,
  scaledWords,
  type GameState,
  type PendingEvent,
} from '../sim/index.ts';

// A SEISMIC EVENT (DD §10.1): the few that are worth stopping the world
// for arrive as a letter, in the board's own shell, and hold the clock
// until they are answered. A letter with three ways out, all of them
// expensive.
export default function EventLetter({
  state,
  pending,
  onChoose,
}: {
  state: GameState;
  pending: PendingEvent;
  onChoose: (instanceId: string, choiceId: string) => void;
}) {
  const def = eventById(pending.eventId);
  const school = state.identity ? institutionName(state.identity) : 'the College';
  return (
    <div className="letter-backdrop" role="dialog" aria-modal="true" aria-label={def.title ?? ''}>
      <article className="letter">
        <header className="letter-head">
          <div className="letter-letterhead">The Office of the President</div>
          <div className="letter-school">{school}</div>
          <div className="letter-date">{formatClock(state.clock)}</div>
        </header>
        <h2 className="letter-title">{def.title}</h2>
        <p className="letter-para">{pendingText(pending)}</p>
        <div className="letter-choices">
          {def.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className="event-choice"
              onClick={() => onChoose(pending.instanceId, choice.id)}
            >
              <span className="event-choice-label">{choice.label}</span>
              {choice.note !== undefined && (
                <span className="event-choice-note">
                  {scaledWords(choice.note, pending.scale ?? 1)}
                </span>
              )}
            </button>
          ))}
        </div>
      </article>
    </div>
  );
}
