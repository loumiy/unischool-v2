import { describe, expect, it } from 'vitest';
import { beatStops, defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { opened, played } from './colleges.ts';
import { tickRunWeeks } from './run.ts';
import type { GameState } from './state.ts';

// BEATS THAT EARN THEIR STOP (Phase 41, DD §3.3 amended): a beat with
// nothing to decide at a sound college passes on the ticker.

const later = played(4, 10).state;

describe('which beats stop the clock', () => {
  it('always stops at a first sitting, and for the two beats that always decide', () => {
    const fresh = opened(4).state;
    for (const id of ['board-meeting', 'convocation', 'admissions-day', 'budget-and-hiring'])
      expect(beatStops(fresh, id)).toBe(true);
    expect(beatStops(later, 'admissions-day')).toBe(true);
    expect(beatStops(later, 'budget-and-hiring')).toBe(true);
  });

  it('lets a sound board adjourn without stopping, and stops for a board with news', () => {
    const sound: GameState = { ...later, distress: { ...later.distress, rung: 0 } };
    const tight: GameState = { ...later, distress: { ...later.distress, rung: 1 } };
    expect(beatStops(sound, 'board-meeting')).toBe(false);
    expect(beatStops(tight, 'board-meeting')).toBe(true);
  });

  it('stops Convocation only for a promise on the table', () => {
    const quiet: GameState = { ...later, ambitions: { ...later.ambitions, offered: null } };
    const asked: GameState = {
      ...later,
      ambitions: { ...later.ambitions, offered: 'twelve-buildings-and-a-view' },
    };
    expect(beatStops(quiet, 'convocation')).toBe(false);
    expect(beatStops(asked, 'convocation')).toBe(true);
  });

  it('journals a passing beat, and every beat still happens once a year', () => {
    const run = tickRunWeeks(opened(4), WEEKS_PER_YEAR * 10, defaultResolution);
    const passed = entriesOfKind(run.state, 'beatPassed');
    expect(passed.length).toBeGreaterThan(0);
    for (const e of passed) expect(['board-meeting', 'convocation']).toContain(e.beatId);
    const all = entriesOfKind(run.state, 'beatFired').length + passed.length;
    expect(all).toBe(10 * 4);
  });
});
