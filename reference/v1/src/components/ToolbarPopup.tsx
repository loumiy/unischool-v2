// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { type ReactNode } from 'react';

// The compact card a toolbar icon pops open (see Toolbar.tsx's build and
// log buttons) — deliberately NOT TabOverlay: TabOverlay's whole point is a
// dimmed, click-to-dismiss backdrop covering the map, which is exactly
// wrong here. The build popup in particular has to leave the campus map
// visible and clickable everywhere outside its own box, since the point of
// popping it up from the toolbar rather than reusing the old side rail is
// choosing a building while still seeing where it'll go — see B2's one-step
// placement flow. So this renders NO backdrop at all: just a positioned
// parchment card (position is the caller's job, via `className` — see
// styles.css's .build-popup / .log-popup), floating above the toolbar the
// same way the old build rail / log strip floated over the map.
//
// It binds no keys. Escape used to be a raw window listener right here,
// which made this the third component guessing about a key three components
// were binding; App.tsx now owns one Escape ladder for the whole shell (log
// popup, then build popup, then an open tab, then the map's own back-out),
// and both of this component's callers have their open/closed state up
// there for that reason. See App.tsx's module comment.
export default function ToolbarPopup({ title, headExtra, onClose, className, children }: {
  title: string;
  headExtra?: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`toolbar-popup ${className ?? ''}`} role="dialog" aria-label={title}>
      <div className="toolbar-popup-head">
        <span className="panel-head-title">
          <h2>{title}</h2>
          {headExtra}
        </span>
        <button type="button" className="toolbar-popup-close" onClick={onClose} aria-label={`Close ${title}`}>
          ✕
        </button>
      </div>
      <div className="toolbar-popup-body">{children}</div>
    </div>
  );
}
