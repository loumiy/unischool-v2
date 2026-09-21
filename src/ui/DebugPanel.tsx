import { useEffect, useState, type ChangeEvent } from 'react';
import { describeEntry } from '../content/busLines.ts';
import { beatsAt, CALENDAR_BEATS } from '../content/calendarBeats.ts';
import {
  clockFromAbsoluteWeek,
  clockRuns,
  formatClock,
  formatClockShort,
  formatMoney,
  pendingBeat,
  serializeRun,
  SPEEDS,
  WEEKS_PER_YEAR,
} from '../sim/index.ts';
import { autosave, randomSeed } from './boot.ts';
import {
  deleteSave,
  exportSave,
  importSave,
  listSaves,
  MANUAL_SLOTS,
  readSave,
  writeSave,
  type SlotId,
  type SlotSummary,
} from './persistence.ts';
import { store } from './store.ts';
import { useGame } from './useGame.ts';

// The developer's window into the sim: state inspector, time controls, the
// action log, and the save slots. Everything it does goes through the store,
// so anything it can do a player action could do too.

function formatSaved(at: string): string {
  return new Date(at).toLocaleString();
}

export default function DebugPanel({ onClose }: { onClose: () => void }) {
  const { run, speed, lastAutosave } = useGame();
  const [label, setLabel] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshSlots = () => void listSaves().then(setSlots);
  useEffect(refreshSlots, [lastAutosave]);

  if (!run) return null;
  const { state, log } = run;
  const running = clockRuns(state);
  const held = pendingBeat(state);

  const stepToNextBeat = () => {
    for (let weeks = 1; weeks <= WEEKS_PER_YEAR; weeks++) {
      const c = clockFromAbsoluteWeek(state.clock.absoluteWeek + weeks);
      if (beatsAt(c.term, c.week).length > 0) {
        store.stepWeeks(weeks);
        return;
      }
    }
  };

  const saveTo = async (slot: SlotId) => {
    await writeSave(slot, serializeRun(run));
    setNotice(`Saved to ${slot}`);
    refreshSlots();
  };

  const loadFrom = async (slot: SlotId) => {
    const result = await readSave(slot);
    if (!result) return setNotice(`${slot} is empty`);
    if (!result.ok) return setNotice(`${slot}: ${result.reason}`);
    store.loadRun({ state: result.save.state, log: result.save.log }, lastAutosave);
    setNotice(`Loaded ${slot}`);
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await importSave(file);
    if (!result.ok) return setNotice(`Import failed: ${result.reason}`);
    store.loadRun({ state: result.save.state, log: result.save.log }, lastAutosave);
    setNotice(`Imported ${file.name}`);
    e.target.value = '';
  };

  const newGame = () => {
    const seed = seedInput.trim() === '' ? randomSeed() : Number(seedInput);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      return setNotice('Seed must be an integer between 0 and 4294967295');
    }
    store.newGame(seed);
    setNotice(`New game, seed ${seed}`);
  };

  return (
    <aside className="debug">
      <header className="debug-head">
        <strong>Debug</strong>
        <button onClick={onClose} aria-label="Close debug panel">
          ×
        </button>
      </header>

      <section>
        <h3>Run</h3>
        <dl>
          <dt>Phase</dt>
          <dd>{state.phase}</dd>
          <dt>Seed</dt>
          <dd>
            <code>{state.seed}</code>
          </dd>
          <dt>Clock</dt>
          <dd>{formatClock(state.clock)}</dd>
          <dt>Absolute week</dt>
          <dd>{state.clock.absoluteWeek}</dd>
          <dt>Pending beat</dt>
          <dd>
            {held ? (
              <>
                {held.name}{' '}
                <button
                  type="button"
                  onClick={() => store.dispatch({ type: 'resolveBeat', beatId: held.id })}
                >
                  resolve
                </button>
              </>
            ) : (
              '—'
            )}
          </dd>
          <dt>Letter</dt>
          <dd>
            {state.distress.pendingLetter ? (
              <>
                {state.distress.pendingLetter}{' '}
                <button type="button" onClick={() => store.dispatch({ type: 'readLetter' })}>
                  read
                </button>
              </>
            ) : (
              '—'
            )}
          </dd>
          <dt>Rung / confidence</dt>
          <dd>
            {state.distress.rung} / {state.distress.confidence}
          </dd>
          <dt>Cash / endowment</dt>
          <dd>
            {formatMoney(state.treasury.cash)} / {formatMoney(state.treasury.endowment)}
          </dd>
          <dt>Autosaved</dt>
          <dd>{lastAutosave ? formatSaved(lastAutosave) : 'never'}</dd>
        </dl>
      </section>

      <section>
        <h3>Time</h3>
        <div className="row">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={s === speed ? 'active' : ''}
              onClick={() => store.setSpeed(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="row">
          <button disabled={!running} onClick={() => store.stepWeeks(1)}>
            +1 week
          </button>
          <button disabled={!running} onClick={stepToNextBeat}>
            → next beat
          </button>
          <button disabled={!running} onClick={() => store.stepWeeks(WEEKS_PER_YEAR)}>
            +1 year
          </button>
        </div>
      </section>

      <section>
        <h3>Actions</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            store.dispatch({ type: 'debug/mark', label: label.trim() });
            setLabel('');
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="mark label"
          />
          <button type="submit">Mark</button>
        </form>
        <ol className="log" reversed>
          {log
            .slice(-30)
            .reverse()
            .map((entry, i) => (
              <li key={log.length - i}>
                <code>w{entry.week}</code> {entry.action.type}
                {entry.action.type === 'debug/mark' ? `: ${entry.action.label}` : ''}
              </li>
            ))}
        </ol>
        {log.length === 0 && <p className="muted">No actions yet.</p>}
      </section>

      <section>
        <h3>Journal ({state.bus.length})</h3>
        <ol className="log" reversed>
          {state.bus
            .slice(-20)
            .reverse()
            .map((entry) => (
              <li key={entry.seq}>
                <code>{formatClockShort(clockFromAbsoluteWeek(entry.week))}</code>{' '}
                {describeEntry(entry, state).text}
              </li>
            ))}
        </ol>
        {state.bus.length === 0 && <p className="muted">Nothing yet.</p>}
      </section>

      <section>
        <h3>Saves</h3>
        <div className="row">
          <button onClick={() => void autosave(run)}>Autosave now</button>
          <button onClick={() => exportSave(serializeRun(run))}>Export</button>
          <label className="button">
            Import
            <input
              type="file"
              accept="application/json"
              onChange={(e) => void onImport(e)}
              hidden
            />
          </label>
        </div>
        {MANUAL_SLOTS.map((slot) => {
          const summary = slots.find((s) => s.slot === slot);
          return (
            <div className="row" key={slot}>
              <span className="slot">
                {slot}{' '}
                {summary ? <small>{formatSaved(summary.savedAt)}</small> : <small>empty</small>}
              </span>
              <button onClick={() => void saveTo(slot)}>Save</button>
              <button disabled={!summary} onClick={() => void loadFrom(slot)}>
                Load
              </button>
              <button
                disabled={!summary}
                onClick={() => void deleteSave(slot).then(refreshSlots)}
                aria-label={`Delete ${slot}`}
              >
                ×
              </button>
            </div>
          );
        })}
        <div className="row">
          <input
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            placeholder="seed (blank = random)"
            inputMode="numeric"
          />
          <button onClick={newGame}>New game</button>
        </div>
        {notice && <p className="muted">{notice}</p>}
      </section>

      <section>
        <details>
          <summary>State ({CALENDAR_BEATS.length} beats loaded)</summary>
          <pre>{JSON.stringify(state, null, 2)}</pre>
        </details>
      </section>
    </aside>
  );
}
