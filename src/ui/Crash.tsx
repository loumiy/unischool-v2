import { Component, type ErrorInfo, type ReactNode } from 'react';
import { serializeRun } from '../sim/index.ts';
import { exportSave } from './persistence.ts';
import { store } from './store.ts';

// WHEN SOMETHING BREAKS (Phase 33). Two ways a run can stop that are not the
// player's doing: the simulation throws on a week or an action (the store
// catches it, stops the clock and says so here), or the screen itself
// throws while drawing (the boundary catches it). Either way the player is
// told plainly, the last autosave is untouched, and the run as it stood can
// be downloaded — for a bug report, or to load again later.

function downloadRun(): void {
  const { run } = store.getSnapshot();
  if (run) exportSave(serializeRun(run));
}

function CrashCard({
  title,
  body,
  detail,
  onCarryOn,
}: {
  title: string;
  body: string;
  detail: string;
  onCarryOn?: () => void;
}) {
  return (
    <div className="crash-backdrop" role="alertdialog" aria-labelledby="crash-title">
      <div className="crash-card">
        <h2 id="crash-title">{title}</h2>
        <p>{body}</p>
        <div className="crash-actions">
          <button type="button" className="beat-resolve" onClick={() => location.reload()}>
            Reopen from the last autosave
          </button>
          <button type="button" className="save-btn" onClick={downloadRun}>
            Download the run as it stood
          </button>
          {onCarryOn && (
            <button type="button" className="newgame-btn" onClick={onCarryOn}>
              Carry on, paused
            </button>
          )}
        </div>
        <details className="crash-detail">
          <summary>What went wrong</summary>
          <pre>{detail}</pre>
        </details>
      </div>
    </div>
  );
}

// The sim threw: the clock has stopped on the last whole week.
export function FaultCard({ message }: { message: string }) {
  return (
    <CrashCard
      title="The college has stopped"
      body="Something in the simulation went wrong on this week, so the clock has stopped rather than carry on from a broken state. The last autosave has not been touched."
      detail={message}
      onCarryOn={() => store.clearFault()}
    />
  );
}

// The screen threw while drawing.
export class CrashBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('the screen stopped:', error, info.componentStack);
    store.stop();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <CrashCard
        title="The screen has stopped"
        body="Something went wrong drawing the game, and the clock has been stopped with it. The last autosave has not been touched; reopening loads it."
        detail={`${error.message}\n${error.stack ?? ''}`}
      />
    );
  }
}
