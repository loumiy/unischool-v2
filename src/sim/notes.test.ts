import { describe, expect, it } from 'vitest';
import { NOTES } from '../content/notes.ts';
import { defaultResolution } from './beats.ts';
import { opened, played } from './colleges.ts';
import { dismissNote, dueNote } from './notes.ts';
import { dispatch, tickRunWeeks, type Run } from './run.ts';

// ONBOARDING BY CONSEQUENCE (DD §13.2, Phase 29): each note once, when its
// moment comes; never a modal, never the clock.

describe('the notes', () => {
  it('opens with the board’s welcome, and reading it puts it away', () => {
    const run = opened(4);
    expect(dueNote(run.state)?.id).toBe('welcome');
    const read = dispatch(run, { type: 'dismissNote', id: 'welcome' });
    expect(dueNote(read.state)?.id).not.toBe('welcome');
    expect(read.state.onboarding.seen).toEqual(['welcome']);
  });

  it('meets most of them in a college’s first decade, each once, in the order they matter', () => {
    const met: string[] = [];
    const read = (r: Run): Run => {
      let s = r;
      for (let note = dueNote(s.state); note; note = dueNote(s.state)) {
        met.push(note.id);
        s = { ...s, state: dismissNote(s.state, note.id) };
      }
      return s;
    };
    played(4, 12, read);
    expect(new Set(met).size).toBe(met.length);
    expect(met[0]).toBe('welcome');
    for (const id of [
      'first-budget',
      'first-admissions',
      'first-convocation',
      'first-board',
      'first-table',
    ])
      expect(met, id).toContain(id);
    expect(met.length).toBeGreaterThanOrEqual(9);
    expect(met.indexOf('first-budget')).toBeLessThan(met.indexOf('first-table'));
  });

  it('never holds the clock', () => {
    const run = opened(4);
    expect(dueNote(run.state)).not.toBeNull();
    const on = tickRunWeeks(run, 3, defaultResolution);
    expect(on.state.clock.absoluteWeek).toBe(run.state.clock.absoluteWeek + 3);
  });

  it('keeps every note to a few sentences', () => {
    for (const n of NOTES) expect(n.text.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(4);
  });
});
