import type { CalendarBeat } from '../content/calendarBeats.ts';
import { formatClock, type GameState } from '../sim/index.ts';
import TabOverlay from './TabOverlay.tsx';

// A calendar beat's screen (DD §3.3): a bounded, full-screen card entered
// from the ticker prompt, with one honest verb at the bottom that resolves
// the beat and lets the clock go. In Phase 4 every beat is a placeholder
// that says what will be decided here; closing the screen without
// resolving leaves the beat waiting, because closing is not deciding.

export default function BeatScreen({
  beat,
  state,
  onResolve,
  onClose,
}: {
  beat: CalendarBeat;
  state: GameState;
  onResolve: () => void;
  onClose: () => void;
}) {
  return (
    <TabOverlay title={beat.name} onClose={onClose}>
      <div className="beat-screen">
        <div className="eyebrow">{formatClock(state.clock)}</div>
        <p className="beat-lede">{beat.blurb}</p>
        <div className="beat-stub">
          <div className="eyebrow">Arrives in Phase {beat.phase}</div>
          <p>{beat.stub}</p>
        </div>
        <div className="beat-actions">
          <button type="button" className="beat-resolve" onClick={onResolve}>
            {beat.resolveLabel}
          </button>
        </div>
      </div>
    </TabOverlay>
  );
}
