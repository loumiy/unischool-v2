// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../state/actions.
import { useEffect, useState } from 'react';
import type { Action } from '../state/actions';
import { MenuIcon } from './icons';

// The top-right hamburger overlay: what used to be the topbar's Save/New
// Game buttons, now joined by Credits, collapsed into one menu now that
// there's no control bar left to hold them inline (see StatusHeader.tsx's
// module comment — C3 moved everything else in that old control bar down
// into the bottom toolbar). Sits directly above the map's zoom/'?' pill in
// that same corner (see styles.css's --corner-menu-height).
//
// New Game's confirm is the same inline second-click pattern the old
// control bar used: the armed state times out on nothing and clears on
// Cancel, so the only way through is a deliberate second click, never a
// browser confirm() dialog that would look nothing like the rest of the
// chrome.
export default function MainMenu({ act }: { act: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setConfirmingNewGame(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setConfirmingNewGame(false);
  }

  return (
    <div className="main-menu">
      <button
        type="button"
        className={`main-menu-btn ${open ? 'active' : ''}`}
        aria-expanded={open}
        aria-label={open ? 'Close main menu' : 'Open main menu'}
        title="Menu"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MenuIcon />
      </button>

      {open && (
        <div className="main-menu-popup" role="dialog" aria-label="Main menu">
          {confirmingNewGame ? (
            <>
              <span className="newgame-confirm-label">Erase this run and start over?</span>
              <button className="newgame-btn armed" onClick={() => act({ type: 'RESET' })}>
                Erase &amp; start over
              </button>
              <button className="newgame-btn" onClick={() => setConfirmingNewGame(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="save-btn"
                onClick={() => { act({ type: 'SAVE_GAME' }); close(); }}
                title="Write the run to this browser now. The game also saves itself every summer, at admissions."
              >
                Save
              </button>
              <button
                className="newgame-btn"
                onClick={() => setConfirmingNewGame(true)}
                title="Erase the saved run and found a new university."
              >
                New Game
              </button>
              <p className="main-menu-credits">
                <strong>UniSchool</strong><br />
                Made by Louis Miyani.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
