import { DOMAIN_LABELS } from './domains.ts';
import { EVENT_WORDS, eventById } from '../content/events.ts';
import { pendingText, choiceNote, type GameState, type PendingEvent } from '../sim/index.ts';

// AN EVENT, INLINE (DD §10.1): the ticker strip grows a panel rather than
// stopping the world. The clock keeps running underneath it, the choices
// are two or three lines of consequence, and the panel says out loud which
// way it falls if nobody answers — so ignoring it is a decision, not an
// accident.
export default function EventPrompt({
  state,
  pending,
  onChoose,
}: {
  state: GameState;
  pending: PendingEvent;
  onChoose: (instanceId: string, choiceId: string) => void;
}) {
  const def = eventById(pending.eventId);
  const weeks = Math.max(0, pending.expiresWeek - state.clock.absoluteWeek);
  const clock =
    weeks <= 1 ? EVENT_WORDS.expiresSoon : EVENT_WORDS.expiresIn.replace('{weeks}', String(weeks));
  const fallback = def.choices.find((c) => c.id === def.default) ?? def.choices[0]!;
  return (
    <section className={`event-prompt domain-${def.domain}`} aria-label="An event is waiting">
      <header className="event-prompt-head">
        <span className="event-prompt-tag">Now</span>
        {/* Its domain, as a stripe and a word, so the strip can be scanned
            (Phase 48). */}
        <span className="event-domain">{DOMAIN_LABELS[def.domain] ?? def.domain}</span>
        <span className="event-prompt-clock">{clock}</span>
      </header>
      <p className="event-prompt-text">{pendingText(pending)}</p>
      <div className="event-prompt-choices">
        {def.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="event-choice"
            onClick={() => onChoose(pending.instanceId, choice.id)}
          >
            <span className="event-choice-label">{choice.label}</span>
            {choice.note !== undefined && (
              <span className="event-choice-note">{choiceNote(choice, pending.scale ?? 1)}</span>
            )}
          </button>
        ))}
      </div>
      <p className="event-prompt-default">
        {EVENT_WORDS.defaultNote.replace('{choice}', fallback.label)}
      </p>
    </section>
  );
}

// The question in one clause, for the ticker's NEXT slot when the panel
// itself is out of sight behind a screen.
export function eventPrompt(pending: PendingEvent): string {
  const sentence = pendingText(pending).split(/(?<=[.!?])\s/)[0] ?? '';
  return sentence.length > 72 ? `${sentence.slice(0, 69).trimEnd()}…` : sentence;
}
