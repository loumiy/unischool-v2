import { LogIcon } from './icons.tsx';

// The ticker strip (DD §13.2): one line above the toolbar. The newest
// notice on the left; the NEXT slot on the right — the highest-value thing
// the game is currently offering, a button when it names somewhere to go.
// Phase 4's event bus feeds the notices and Phase 17 makes the strip the
// event-resolution surface; until then the left half only says so.

export interface NextPrompt {
  text: string;
  go?: 'campus';
}

export interface Notice {
  stamp: string; // "Y1W3"
  text: string;
  tone?: 'good' | 'bad';
}

export default function LogTicker({
  notice,
  next,
  onGo,
}: {
  notice: Notice | null;
  next: NextPrompt | null;
  onGo: (go: NonNullable<NextPrompt['go']>) => void;
}) {
  return (
    <div className="log-ticker">
      <span className="log-ticker-icon" aria-hidden="true">
        <LogIcon />
      </span>
      {notice ? (
        <span className={notice.tone ?? ''}>
          <span className="ts">{notice.stamp}</span>
          {notice.text}
        </span>
      ) : (
        <span className="log-ticker-empty">No news yet.</span>
      )}
      {next && (
        <span className="log-ticker-next">
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
