import type { ReactNode } from 'react';

// The frame every view other than the campus map is rendered in: a titled
// header with a close button, and the scroll container the screen sits in.
// One shape: every tab is a full screen, and the bottom dock is laid OVER it
// so the game's own controls stay reachable. Escape is bound in App, which
// owns the one Escape ladder for the whole shell.
export default function TabOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="tab-overlay" role="dialog" aria-modal="false" aria-label={title}>
      <div className="tab-overlay-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="tab-overlay-close"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          close ✕
        </button>
      </div>
      <div className="tab-overlay-body">{children}</div>
    </div>
  );
}

// A screen the college does not have yet. It says so in the college's own
// terms; a player should never read the development plan (Phase 21F).
export function StubScreen({ children }: { children: ReactNode }) {
  return (
    <div className="stub-screen">
      <div className="eyebrow">Not open yet</div>
      <p>{children}</p>
    </div>
  );
}
