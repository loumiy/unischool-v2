import { describeEntry } from '../content/busLines.ts';
import { clockFromAbsoluteWeek, formatClockShort, type GameState } from '../sim/index.ts';
import ToolbarPopup from './ToolbarPopup.tsx';

// The whole journal, newest first, one click from the ticker (ported from
// v1's activity log popup). The ticker is deliberately only the latest
// line; this is where the rest of the run's history is read until the
// History screen (Phase 26) tells it properly.

const MAX_ROWS = 300;

export default function JournalPopup({
  state,
  onClose,
}: {
  state: GameState;
  onClose: () => void;
}) {
  const rows = state.bus.slice(-MAX_ROWS).reverse();
  return (
    <ToolbarPopup title="Journal" onClose={onClose} className="journal-popup">
      {rows.length === 0 ? (
        <p className="journal-empty">Nothing has happened yet.</p>
      ) : (
        <ul className="journal">
          {rows.map((entry) => {
            const line = describeEntry(entry, state);
            return (
              <li key={entry.seq} className={line.tone ?? ''}>
                <span className="ts">{formatClockShort(clockFromAbsoluteWeek(entry.week))}</span>
                <span>{line.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </ToolbarPopup>
  );
}
