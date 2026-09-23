import { NOTE_WORDS } from '../content/notes.ts';
import { fillWords } from '../content/people.ts';
import { askedNote, dueNote, type GameState } from '../sim/index.ts';

// A NOTE FROM SOMEONE AT THE COLLEGE (DD §13.2, Phase 29): the onboarding.
// One at a time, the first time the thing it is about happens, from the
// person whose job it is; it never holds the clock, and "Noted" puts it
// away for the run.
export default function NoteCard({
  state,
  asked,
  onDismiss,
}: {
  state: GameState;
  // A note the player reached for (Phase 40), ahead of any that is due.
  asked?: string | null;
  onDismiss: (id: string) => void;
}) {
  const note = (asked ? askedNote(state, asked) : null) ?? dueNote(state);
  if (!note) return null;
  return (
    <aside className="note-card" role="note" aria-label={note.title}>
      <div className="note-card-from">{fillWords(NOTE_WORDS.from, { from: note.from })}</div>
      <h3 className="note-card-title">{note.title}</h3>
      <p className="note-card-text">{note.text}</p>
      <button type="button" className="species-chip" onClick={() => onDismiss(note.id)}>
        {NOTE_WORDS.dismiss}
      </button>
    </aside>
  );
}
