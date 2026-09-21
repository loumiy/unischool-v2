// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import type { GameState } from '../state/types';

// The full event feed, oldest-entries-cut-off-first the same as s.log
// itself. Opened from LogTicker.tsx's click handler, inside a ToolbarPopup
// (see styles.css's .log-popup) — the one-line ticker is deliberately only
// the latest entry; this is where the rest of it lives.
export default function LogStrip({ s }: { s: GameState }) {
  return (
    <ul className="log">
      {s.log.map((e, i) => (
        <li key={i} className={e.kind}>
          <span className="ts">Y{e.year}W{e.week}</span> {e.message}
        </li>
      ))}
    </ul>
  );
}
