const DAYS_PER_WEEK = 7;

// Purely cosmetic: seven squares paced across the week the clock is part-way
// through, so the clock beside it reads as moving continuously rather than
// jumping once a week. It reads the store's one accumulator (ui/store.ts),
// so the squares cannot drift from the tick they illustrate.
export default function DayTicker({
  weekProgress,
  held = false,
}: {
  weekProgress: number;
  // A beat is holding the week: the days are not passing, and the squares
  // should not look as though they are (Phase 21B).
  held?: boolean;
}) {
  const lit = Math.min(DAYS_PER_WEEK, Math.floor(weekProgress * DAYS_PER_WEEK));
  return (
    <div
      className={`day-ticker ${held ? 'held' : ''}`}
      aria-hidden="true"
      title={held ? 'The week is holding' : 'Days elapsed this week'}
    >
      {Array.from({ length: DAYS_PER_WEEK }, (_, i) => (
        <span key={i} className={`day-ticker-cell ${i < lit ? 'lit' : ''}`} />
      ))}
    </div>
  );
}
