// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../engine/useGame.
import { useEffect, useState } from 'react';
import type { GameState } from '../state/types';
import type { Speed } from '../engine/useGame';

const DAY_TICKER_POLL_MS = 150;
const DAYS_PER_WEEK = 7;

// Purely cosmetic — there is no day-level unit anywhere in GameState (see
// useGame.ts's SPEEDS comment: the sim only ever advances a whole week per
// TICK). This just paces seven squares across the week the clock is
// currently part-way through, so the clock beside it reads as moving
// continuously rather than jumping once every SPEEDS[speed] milliseconds.
//
// It owns NO timing of its own any more. It used to keep its own start
// timestamp and its own ms-per-week arithmetic, which meant it had the
// week clock's pause bug twice over — its effect was keyed on the speed, so
// a pause or a speed change restarted its seven squares from Monday even
// when the week itself had not restarted. Now useGame.ts keeps one
// accumulator for the real clock (see weekClock.ts) and this reads it, so
// the squares cannot drift from the tick they illustrate: they are the same
// number, rendered.
//
// The read is a POLL rather than a subscription on purpose: the accumulator
// is deliberately a ref, so that moving a decorative square never re-renders
// the app (see useGame.ts). Polling at 150ms is what buys that — seven
// squares over a 2,500ms week change at most every ~360ms, so nothing is
// missed, and the poll is skipped entirely while the clock is not running,
// where the fraction cannot change anyway.
export default function DayTicker({ s, speed, weekProgress }: {
  s: GameState;
  speed: Speed;
  // Reads the live week fraction, 0..1 (useGame.ts's weekProgress).
  weekProgress: () => number;
}) {
  const weekKey = `${s.clock.year}-${s.clock.week}`;
  const ticking = speed !== 'paused' && s.started && s.pendingInterrupt === null;
  const [litDays, setLitDays] = useState(0);

  useEffect(() => {
    // Read once up front so a frozen clock still shows where the week
    // stopped, rather than whatever the last poll happened to catch.
    const read = () => setLitDays(Math.min(DAYS_PER_WEEK, Math.floor(weekProgress() * DAYS_PER_WEEK)));
    read();
    if (!ticking) return;
    const id = setInterval(read, DAY_TICKER_POLL_MS);
    return () => clearInterval(id);
  }, [ticking, weekKey, weekProgress]);

  return (
    <div className="day-ticker" aria-hidden="true" title="Days elapsed this week">
      {Array.from({ length: DAYS_PER_WEEK }, (_, i) => (
        <span key={i} className={`day-ticker-cell ${i < litDays ? 'lit' : ''}`} />
      ))}
    </div>
  );
}
