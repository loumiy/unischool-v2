import { describeEntry } from '../content/busLines.ts';
import {
  entriesOfKind,
  formatClockShort,
  clockFromAbsoluteWeek,
  type GameState,
} from '../sim/index.ts';
import AmbitionsPanel from './AmbitionsPanel.tsx';
import { tabById } from './tabs.ts';

// THE HISTORY SCREEN — the chronicle in draft (DD §12.1), which Phase 26
// writes properly. Its first tenant is the docket of public promises
// (DD §10.2), because an ambition kept or missed IS a chronicle entry, and
// the run needs somewhere to read them back before the eras exist.

export default function HistoryScreen({ state }: { state: GameState }) {
  const settled = entriesOfKind(state, 'ambitionSettled');
  const stub = tabById('history');
  return (
    <div className="history">
      <AmbitionsPanel state={state} heading="What the college has promised" />
      {settled.length > 0 && (
        <section className="ambitions">
          <h3>As it was recorded</h3>
          <ul className="chronicle">
            {[...settled].reverse().map((entry, i) => {
              const said = describeEntry(entry, state);
              return (
                <li key={i} className={said.tone ?? ''}>
                  <span className="ts">{formatClockShort(clockFromAbsoluteWeek(entry.week))}</span>
                  {said.text}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="beat-stub">
        <div className="eyebrow">Still being written</div>
        <p>{stub.stub}</p>
      </section>
    </div>
  );
}
