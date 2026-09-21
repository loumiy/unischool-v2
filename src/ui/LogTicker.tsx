import { LogIcon } from './icons.tsx';

// The ticker strip (DD §13.2): one line above the toolbar. The newest
// journal line on the left, behind a small button that opens the whole
// journal; the NEXT slot on the right — the highest-value thing the game
// is currently offering, a button when it names somewhere to go, and
// pulsing when the clock is holding for it. Phase 17 makes the strip the
// event-resolution surface.

export interface NextPrompt {
  text: string;
  go?: 'campus' | 'beat';
  urgent?: boolean;
}

export interface Notice {
  stamp: string; // "Y1 · Fall · W3"
  text: string;
  tone?: 'good' | 'bad';
}

export default function LogTicker({
  notice,
  next,
  onGo,
  journalOpen,
  onToggleJournal,
}: {
  notice: Notice | null;
  next: NextPrompt | null;
  onGo: (go: NonNullable<NextPrompt['go']>) => void;
  journalOpen: boolean;
  onToggleJournal: () => void;
}) {
  return (
    <div className="log-ticker">
      <button
        type="button"
        className="log-ticker-toggle"
        aria-expanded={journalOpen}
        aria-label={journalOpen ? 'Close the journal' : 'Open the journal'}
        title="Journal (L)"
        onClick={onToggleJournal}
      >
        <LogIcon />
      </button>
      {notice ? (
        <span className={notice.tone ?? ''}>
          <span className="ts">{notice.stamp}</span>
          {notice.text}
        </span>
      ) : (
        <span className="log-ticker-empty">No news yet.</span>
      )}
      {next && (
        <span className={`log-ticker-next ${next.urgent ? 'urgent' : ''}`}>
          <span className="log-ticker-next-label">Next</span>
          {next.go ? (
            <button
              type="button"
              className="log-ticker-next-text"
              onClick={() => {
                if (next.go) onGo(next.go);
              }}
            >
              {next.text}
            </button>
          ) : (
            <span className="log-ticker-next-text">{next.text}</span>
          )}
        </span>
      )}
    </div>
  );
}
