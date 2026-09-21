// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { useState } from 'react';

// A small, dismissible '?' toggle for panel explainer copy that's useful
// once but busy if it's always on screen (see
// docs/architecture/ui-shell.md-adjacent UI notes) — the explanation is one
// click away instead of permanently taking up space as an italic paragraph
// under every panel heading. `align="end"` opens the popup leftward instead
// of rightward, for a hint sitting at a panel's right edge (see
// TreasuryTab.tsx) where the default would run off-screen.
export default function HelpHint({ text, align = 'start' }: { text: string; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-hint">
      <button
        type="button"
        className="help-hint-btn"
        aria-expanded={open}
        aria-label={open ? 'Hide explanation' : 'Explain this panel'}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && <p className={`help-hint-text ${align === 'end' ? 'align-end' : ''}`}>{text}</p>}
    </span>
  );
}
