import { useState } from 'react';

// A small, dismissible '?' for explainer copy that is useful once but busy
// if always on screen. `align="end"` opens leftward for a hint at a right edge.
export default function HelpHint({
  text,
  align = 'start',
}: {
  text: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-hint">
      <button
        type="button"
        className="help-hint-btn"
        aria-expanded={open}
        aria-label={open ? 'Hide explanation' : 'Explain this'}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && <p className={`help-hint-text ${align === 'end' ? 'align-end' : ''}`}>{text}</p>}
    </span>
  );
}
