import { BOARD_WORDS, letterById } from '../content/board.ts';
import { formatClock, institutionName, type GameState } from '../sim/index.ts';

// A LETTER FROM THE BOARD (DD §5.5): full-screen, in the card style, holding
// the clock until it is read. The board's letters are the ladder made
// audible; distress is written straight (DD §13.3).
export default function BoardLetter({
  state,
  letterId,
  onRead,
}: {
  state: GameState;
  letterId: string;
  onRead: () => void;
}) {
  const letter = letterById(letterId);
  const school = state.identity ? institutionName(state.identity) : 'the College';
  return (
    <div className="letter-backdrop" role="dialog" aria-modal="true" aria-label={letter.title}>
      <article className="letter">
        <header className="letter-head">
          <div className="letter-letterhead">The Board of Trustees</div>
          <div className="letter-school">{school}</div>
          <div className="letter-date">{formatClock(state.clock)}</div>
        </header>
        <h2 className="letter-title">{letter.title}</h2>
        <p className="letter-salutation">To the Administration,</p>
        {letter.body.map((para, i) => (
          <p key={i} className="letter-para">
            {para}
          </p>
        ))}
        {/* The maintenance the emergency held, handed back (Phase 21L). */}
        {state.distress.maintenanceRestored && (
          <p className="letter-para">{BOARD_WORDS.maintenanceRestored}</p>
        )}
        <p className="letter-signed">— {letter.signed}</p>
        <div className="letter-actions">
          <button type="button" className="beat-resolve" onClick={onRead}>
            Noted
          </button>
        </div>
      </article>
    </div>
  );
}
