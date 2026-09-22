import { emit } from './bus.ts';
import { beatDue, clockHeld } from './beats.ts';
import { advanceClock } from './calendar.ts';
import type { GameState } from './state.ts';
import { distressWeek } from './distress.ts';
import { academicsWeek } from './academics.ts';
import { convocationAmbitions } from './ambitions.ts';
import { estateWeek } from './estate.ts';
import { eventsWeek } from './events.ts';
import { openMarket } from './faculty.ts';
import { peopleWeek } from './people.ts';
import { treasuryWeek } from './treasury.ts';

// One week of the world (DD §15): `tick(state) → state`, pure, no I/O, no
// timers. The driver decides WHEN a tick happens; nothing in here knows about
// real time or about speed — every speed runs the identical sim, just sooner.
//
// A held clock (a calendar beat awaiting the player, beats.ts) makes the
// tick a no-op that returns the SAME state object, so a driver can tell a
// week passed from a week refused by identity alone.
//
// Systems land here phase by phase in a fixed order (calendar, treasury,
// distress, estate, academics, people, events, reputation). A system
// that needs randomness draws it from the state's own stream and writes the
// stream back (people.ts does, for the named students), so a tick stays a
// pure function of (state) including its own dice.
export function tick(state: GameState): GameState {
  if (clockHeld(state)) return state;
  let next: GameState = { ...state, clock: advanceClock(state.clock) };
  next = calendarTurn(next);
  if (next.phase === 'running') {
    next = treasuryWeek(next);
    next = distressWeek(next);
    next = estateWeek(next);
    next = academicsWeek(next);
    next = peopleWeek(next);
    next = eventsWeek(next);
    next = fireBeat(next);
  }
  return next;
}

// The calendar system, first: journals the turn of a term and a year.
function calendarTurn(state: GameState): GameState {
  let s = state;
  const { clock } = s;
  if (clock.week === 1) {
    s = emit(s, { kind: 'termBegan', year: clock.year, term: clock.term });
    if (clock.term === 'fall') s = emit(s, { kind: 'yearTurned', year: clock.year });
  }
  return s;
}

// The calendar system, last: fires the beat the week lands on (DD §3.3),
// after the week's systems have run, so the screen that opens reads the
// week as it stands. Beats belong to a school with its doors open; a run
// that is still founding or siting has no board to sit and no class to
// convene.
function fireBeat(state: GameState): GameState {
  const beat = beatDue(state.clock);
  if (!beat) return state;
  let s = emit({ ...state, pendingBeat: beat.id }, { kind: 'beatFired', beatId: beat.id });
  // Budget & Hiring lists the summer market (DD §7.3).
  if (beat.id === 'budget-and-hiring') s = openMarket(s);
  // Convocation reads out the promises that came due and may put one more
  // on the table (DD §10.2).
  if (beat.id === 'convocation') s = convocationAmbitions(s);
  return s;
}

// Advance up to `weeks` weeks, stopping early if the clock is held.
export function tickWeeks(state: GameState, weeks: number): GameState {
  let s = state;
  for (let i = 0; i < weeks; i++) {
    const next = tick(s);
    if (next === s) break;
    s = next;
  }
  return s;
}
