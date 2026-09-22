import { useState, type ReactNode } from 'react';

// A small, dismissible '?' for explainer copy that is useful once but busy
// if always on screen. `align="end"` opens leftward for a hint at a right
// edge. `children` carry anything the sentence cannot — the map's key list
// is a table, not a paragraph (Phase 21A).
export default function HelpHint({
  text,
  align = 'start',
  label,
  children,
}: {
  text: string;
  align?: 'start' | 'end';
  label?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-hint">
      <button
        type="button"
        className="help-hint-btn"
        aria-expanded={open}
        aria-label={open ? 'Hide explanation' : (label ?? 'Explain this')}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <div className={`help-hint-text ${align === 'end' ? 'align-end' : ''}`}>
          <p>{text}</p>
          {children}
        </div>
      )}
    </span>
  );
}
