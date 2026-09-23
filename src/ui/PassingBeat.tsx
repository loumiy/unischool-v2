import { useEffect, useState } from 'react';
import { beatById } from '../content/calendarBeats.ts';
import { BEAT_WORDS } from '../content/calendarBeats.ts';
import { describeEntry } from '../content/busLines.ts';
import { fillWords } from '../content/people.ts';
import {
  classLabel,
  namedOf,
  WEEKS_PER_YEAR,
  type BusEntry,
  type GameState,
} from '../sim/index.ts';

// BEATS THAT EARN THEIR STOP (Phase 41, DD §3.3). A beat with nothing to
// decide at a sound college passes on the ticker, and this card says so
// for a few seconds without stopping anything: what happened, and — at
// Convocation, the turn of the year — who arrived and what the year was.

const SHOWN_MS = 9000;
const RECENT_WEEKS = 4;

// The year's one headline: the most notable thing in the journal since the
// last Convocation, by kind, most notable first.
const HEADLINE_KINDS: readonly BusEntry['kind'][] = [
  'ambitionSettled',
  'tagEarned',
  'rivalNamed',
  'becameHistoric',
  'schoolFounded',
  'programAdvanced',
  'campaignClosed',
  'methodologyChanged',
  'seasonClosed',
];

function headlineOf(state: GameState, from: number): BusEntry | null {
  const year = state.bus.filter((e) => e.week > from);
  for (const kind of HEADLINE_KINDS) {
    const hit = year.findLast((e) => e.kind === kind && (e.kind !== 'seasonClosed' || e.title));
    if (hit) return hit;
  }
  return null;
}

// What the seats decided while nobody was looking, folded into one read
// (Phase 41's year in review). Shared with the Convocation screen.
export function YearInReview({ state }: { state: GameState }) {
  const from = state.clock.absoluteWeek - WEEKS_PER_YEAR;
  const delegated = state.bus.filter((e) => e.kind === 'eventDelegated' && e.week > from);
  const headline = headlineOf(state, from);
  if (!headline && delegated.length === 0) return null;
  return (
    <div className="year-review">
      {headline && (
        <p className="year-review-headline">
          <span className="year-review-label">{BEAT_WORDS.headline}</span>{' '}
          {describeEntry(headline, state).text}
        </p>
      )}
      {delegated.length > 0 && (
        <>
          <p className="year-review-label">
            {fillWords(BEAT_WORDS.delegated, { count: delegated.length })}
          </p>
          <ul className="year-review-list">
            {delegated.slice(-3).map((e) => (
              <li key={e.seq}>{describeEntry(e, state).text}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function PassingBeat({ state }: { state: GameState }) {
  const latest = state.bus.findLast((e) => e.kind === 'beatPassed') ?? null;
  // The card shows for a few seconds of real time, or a few weeks of the
  // clock at speed, whichever is sooner; a loaded save does not replay one.
  const [hidden, setHidden] = useState<number | null>(null);
  const seq = latest?.seq ?? null;
  useEffect(() => {
    if (seq === null) return;
    const t = window.setTimeout(() => setHidden(seq), SHOWN_MS);
    return () => window.clearTimeout(t);
  }, [seq]);
  if (
    !latest ||
    latest.kind !== 'beatPassed' ||
    hidden === latest.seq ||
    state.clock.absoluteWeek - latest.week > RECENT_WEEKS
  )
    return null;
  const beat = beatById(latest.beatId);
  const convocation = latest.beatId === 'convocation';
  const arrived = convocation
    ? [...state.people.cohorts].sort((a, b) => b.classYear - a.classYear)[0]
    : undefined;
  const names = arrived ? namedOf(state, arrived.classYear).map((s) => s.name) : [];
  return (
    <aside className="passing-beat" role="status" aria-label={beat.name}>
      <div className="note-card-from">{BEAT_WORDS.passed}</div>
      <h3 className="note-card-title">{beat.name}</h3>
      <p className="note-card-text">{beat.passedLine ?? beat.resolvedLine}</p>
      {arrived && (
        <p className="note-card-text">
          {fillWords(BEAT_WORDS.arrived, {
            label: classLabel(arrived.classYear),
            size: arrived.size,
          })}
          {names.length > 0 && ` ${fillWords(BEAT_WORDS.among, { names: names.join(', ') })}`}
        </p>
      )}
      {convocation && <YearInReview state={state} />}
      <button type="button" className="species-chip" onClick={() => setHidden(latest.seq)}>
        {BEAT_WORDS.dismiss}
      </button>
    </aside>
  );
}
