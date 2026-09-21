// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { type ReactNode } from 'react';

// The frame every view other than the campus map is rendered in (see
// App.tsx): a titled header with a close button, and the scroll container
// the tab's own content sits in. The tab components underneath are rendered
// unchanged and still know nothing about being framed.
//
// ONE SHAPE. This used to draw two — a centred sheet floating over a dimmed
// map, and a full-bleed screen — with App.tsx's FULL_BLEED_TABS naming the
// two tabs that got the second one. The playtest notes retire the sheet:
// every tab is a screen. The argument for the split was that a short
// read-and-leave page (Treasury, Admissions, History) looks empty at full
// size and that keeping the map visible around the edges reminds the player
// they are one Escape away from it. That loses to the argument against it —
// a shell that answers "what happens when I click a tab?" the same way every
// time is worth more than a per-tab fit, and the split was quietly producing
// a second bug class besides: a sheet left the tab you clicked holding DOM
// focus over a visible map, which is how Space came to close a tab instead
// of pausing (see hotkeys.ts's isActivationTarget).
//
// So: the panel takes the whole viewport, and the bottom dock (log ticker +
// toolbar) is laid OVER it rather than covered by it — a view the player
// works in keeps the game's own controls reachable without closing it first,
// and reads as a screen rather than as a dialog standing in front of one.
//
// Deliberately NOT the interrupt modal (InterruptModal.tsx): an interrupt
// halts the clock and must be resolved, while this is a dismissible view.
// The interrupt modal sits at a higher layer, so it still covers this.
//
// The dock staying on top is the whole point of the shape, and it is why
// this panel sits BELOW the toolbar's layer (see styles.css) rather than
// above it. Everything below the dock's own height is reserved rather than
// drawn into: .tab-overlay-body pads its bottom by --toolbar-height +
// --log-ticker-height, for exactly the reason .campus-map-canvas insets by
// the same figures — the toolbar is opaque and always on screen, so content
// rendered behind it would be on screen but permanently unreachable.
//
// Escape is not bound here. App.tsx owns the one Escape ladder for the whole
// shell (build popup, then tab, then the map's own back-out) — see its
// module comment — rather than three components each binding the key and
// guessing about the other two.
export default function TabOverlay({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="tab-overlay" role="dialog" aria-modal="false" aria-label={title}>
      <div className="tab-overlay-head">
        <h2>{title}</h2>
        <button type="button" className="tab-overlay-close" onClick={onClose} aria-label={`Close ${title}`}>
          close ✕
        </button>
      </div>
      <div className="tab-overlay-body">{children}</div>
    </div>
  );
}
