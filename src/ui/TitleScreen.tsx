import { useEffect, useState } from 'react';
import { formatClock, type GameState } from '../sim/index.ts';
import { Portrait } from './HallOfFame.tsx';
import { readHall, type HallEntry } from './persistence.ts';

// THE TITLE (DD §12.3, Phase 34): what the game opens on. The run in this
// browser, to carry on; a new college, to found; and the hall of fame front
// and centre — the colleges that reached their fiftieth year, portraits
// first, because they are the reason to play again.

const SHOWN = 3;

export default function TitleScreen({
  state,
  onContinue,
  onNewCollege,
  onHall,
  onSettings,
  onCredits,
}: {
  state: GameState;
  onContinue: () => void;
  onNewCollege: () => void;
  onHall: () => void;
  onSettings: () => void;
  onCredits: () => void;
}) {
  const [hall, setHall] = useState<HallEntry[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    void readHall()
      .then(setHall)
      .catch(() => setHall([]));
  }, []);
  const underway = state.phase !== 'founding' && state.identity !== null;

  return (
    <div className="title-screen" role="dialog" aria-modal="true" aria-label="UniSchool">
      <div className="title-card">
        <header className="title-head">
          <h1 className="title-name">UniSchool</h1>
          <p className="title-tagline">One evening. Fifty years. One patch of land.</p>
        </header>

        <div className="title-body">
          <nav className="title-actions" aria-label="Start">
            {underway && (
              <button type="button" className="beat-resolve title-continue" onClick={onContinue}>
                <span>Continue</span>
                <span className="title-sub">
                  {state.identity!.name} · {formatClock(state.clock)}
                </span>
              </button>
            )}
            {confirming ? (
              <>
                <span className="newgame-confirm-label">
                  Erase {state.identity?.name ?? 'this run'} and found another?
                </span>
                <button type="button" className="newgame-btn armed" onClick={onNewCollege}>
                  Erase &amp; found a new college
                </button>
                <button type="button" className="newgame-btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className={underway ? 'save-btn' : 'beat-resolve title-continue'}
                onClick={() => (underway ? setConfirming(true) : onNewCollege())}
              >
                Found a new college
              </button>
            )}
            <button type="button" className="save-btn" onClick={onSettings}>
              Settings
            </button>
            <button type="button" className="save-btn" onClick={onCredits}>
              Credits
            </button>
          </nav>

          <section className="title-hall" aria-label="The hall of fame">
            <h2 className="title-hall-head">The Hall of Fame</h2>
            {hall === null ? null : hall.length === 0 ? (
              <p className="title-hall-empty">
                No college has reached its fiftieth year in this browser yet. The first one to
                finish hangs here, with a portrait of the campus it became.
              </p>
            ) : (
              <>
                <ul className="title-hall-list">
                  {hall.slice(0, SHOWN).map((e) => (
                    <li key={e.id} className="title-hall-entry">
                      <Portrait entry={e} />
                      <div className="title-hall-caption">
                        <span className="hall-school">{e.school}</span>
                        <span className="hall-mark">{e.mark}</span>
                        <span className="title-hall-title">{e.title}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <button type="button" className="species-chip" onClick={onHall}>
                  {hall.length > SHOWN ? `All ${hall.length} colleges` : 'Open the hall'}
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
