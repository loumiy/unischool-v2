// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { useEffect, useRef, useState } from 'react';
import type { GameState, LogEntry } from '../state/types';
import type { TabId } from './TabNav';
import { newToasts, pushToasts, TOAST_MS, toastKey, toastTarget } from './toasts';

// ---------------------------------------------------------------------
// THE TOAST STACK (Plan 16's PR G). A small column above the log ticker
// for the things that never stop the clock (see toasts.ts for which).
// Three seconds each, five at most, click to open the relevant tab. The
// ticker stays as the last line; this is what a player at 4x actually
// sees of a quiet stretch.
//
// It reads the log and nothing else — the same lines the ticker shows —
// and keeps one piece of state of its own: which lines it has already
// shown, seeded with the whole log on mount so a resumed save does not
// open on a wall of cards. Nothing here is game state, and nothing here
// dispatches: a click hands the tab to App and drops the card.
// ---------------------------------------------------------------------

interface Toast {
  key: string;
  entry: LogEntry;
}

export default function Toasts({ s, onOpenTab }: { s: GameState; onOpenTab: (tab: TabId) => void }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Seeded lazily from the first log seen, so a run resumed from a save
  // starts from silence rather than from its history.
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(s.log.map(toastKey));
      return;
    }
    const arrivals = newToasts(s.log, seen.current);
    if (arrivals.length === 0) return;
    for (const entry of arrivals) seen.current.add(toastKey(entry));
    const cards = arrivals.map((entry) => ({ key: toastKey(entry), entry }));
    setToasts((current) => pushToasts(current, cards));
    for (const card of cards) {
      const id = setTimeout(() => {
        timers.current.delete(card.key);
        setToasts((current) => current.filter((t) => t.key !== card.key));
      }, TOAST_MS);
      timers.current.set(card.key, id);
    }
  }, [s.log]);

  // Every pending timer goes with the component.
  useEffect(() => () => {
    for (const id of timers.current.values()) clearTimeout(id);
    timers.current.clear();
  }, []);

  if (toasts.length === 0) return null;

  function dismiss(card: Toast) {
    const id = timers.current.get(card.key);
    if (id !== undefined) clearTimeout(id);
    timers.current.delete(card.key);
    setToasts((current) => current.filter((t) => t.key !== card.key));
  }

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((card) => {
        const target = toastTarget(card.entry.topic);
        return (
          <button
            key={card.key}
            type="button"
            className={`toast ${card.entry.kind}`}
            title={target ? `Open ${target}` : 'Dismiss'}
            onClick={() => { dismiss(card); if (target) onOpenTab(target); }}
          >
            <span className="ts">Y{card.entry.year}W{card.entry.week}</span>
            <span>{card.entry.message}</span>
          </button>
        );
      })}
    </div>
  );
}
