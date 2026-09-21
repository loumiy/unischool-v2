import { useEffect, useState } from 'react';
import { formatClock, SPEEDS, speedAllowed, type Speed } from '../sim/index.ts';
import DebugPanel from './DebugPanel.tsx';
import { boot } from './boot.ts';
import { store } from './store.ts';
import { useGame } from './useGame.ts';

// Phase 1's shell: a clock, the speed controls, a blank campus, and the debug
// panel. Phase 2 ports v1's chrome (reference/v1) over this; nothing here is
// meant to survive it except the wiring.

const SPEED_LABEL: Record<Speed, string> = {
  paused: '❚❚',
  x1: '1×',
  x2: '2×',
  x4: '4×',
  x8: '8×',
};

export default function App() {
  const { run, speed, weekProgress } = useGame();
  const [debugOpen, setDebugOpen] = useState(true);

  useEffect(() => {
    void boot();
    return () => store.stop();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`') setDebugOpen((v) => !v);
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        store.setSpeed(speed === 'paused' ? 'x1' : 'paused');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [speed]);

  if (!run) return <div className="boot">Opening the doors…</div>;

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">UniSchool</span>
        <span className="clock">
          {formatClock(run.state.clock)}
          <span className="week-progress" aria-hidden="true">
            <span style={{ width: `${Math.round(weekProgress * 100)}%` }} />
          </span>
        </span>
        <span className="speeds" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={s === speed ? 'active' : ''}
              disabled={!speedAllowed(run.state, s)}
              onClick={() => store.setSpeed(s)}
              aria-pressed={s === speed}
            >
              {SPEED_LABEL[s]}
            </button>
          ))}
        </span>
        <button className="ghost" onClick={() => setDebugOpen((v) => !v)}>
          Debug (`)
        </button>
      </header>

      <main className="campus" aria-label="Campus">
        <p className="muted">A blank parcel. Phase 3 lays the land.</p>
      </main>

      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </div>
  );
}
