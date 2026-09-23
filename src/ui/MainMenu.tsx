import { useState } from 'react';
import { useHotkeys } from './hotkeys.ts';
import { MenuIcon } from './icons.tsx';

// The top-right hamburger: Save, the hall, New Game, settings, the title. New Game's confirm is an
// inline second click that turns the same button red, never a browser
// confirm() that would look nothing like the rest of the chrome.
export default function MainMenu({
  onSave,
  onNewGame,
  onHall,
  onSettings,
  onTitle,
}: {
  onSave: () => void;
  onNewGame: () => void;
  onHall: () => void;
  onSettings: () => void;
  onTitle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  useHotkeys((e) => {
    if (e.key === 'Escape') close();
  }, open);

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
          {confirming ? (
            <>
              <span className="newgame-confirm-label">Erase this run and start over?</span>
              <button
                className="newgame-btn armed"
                onClick={() => {
                  close();
                  onNewGame();
                }}
              >
                Erase &amp; start over
              </button>
              <button className="newgame-btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="save-btn"
                onClick={() => {
                  onSave();
                  close();
                }}
                title="Write the run to this browser now. The game also saves itself every year-turn."
              >
                Save
              </button>
              <button
                className="save-btn"
                onClick={() => {
                  onHall();
                  close();
                }}
                title="Every college that reached its fiftieth year."
              >
                Hall of fame
              </button>
              <button
                className="newgame-btn"
                onClick={() => setConfirming(true)}
                title="Erase the saved run and found a new university."
              >
                New Game
              </button>
              <button
                className="save-btn"
                onClick={() => {
                  onSettings();
                  close();
                }}
                title="Sound, text size, colour and autosave."
              >
                Settings
              </button>
              <button
                className="save-btn"
                onClick={() => {
                  onTitle();
                  close();
                }}
                title="Back to the title: the hall, credits, and a new college."
              >
                Title screen
              </button>
              <p className="main-menu-credits">
                <strong>UniSchool</strong>
                <br />
                One evening. Fifty years. One patch of land.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
