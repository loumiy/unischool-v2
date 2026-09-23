import { describe, expect, it } from 'vitest';
import { AXES } from '../content/league.ts';
import { ENDING_YEAR } from '../tuning.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { played } from './colleges.ts';
import { composeTitle, gradeAxes } from './ending.ts';
import { tickRunWeeks } from './run.ts';

// THE ENDING (DD §2.3, §12.2; Phase 27). Done when the run lands: the
// report should feel like a verdict, not a stat dump.

describe('the end of the run', () => {
  const held = tickRunWeeks(played(4242, ENDING_YEAR - 1), 60, (s) => {
    const a = defaultResolution(s);
    return a?.type === 'enterEpilogue' ? null : a;
  });

  it('holds the clock at Year 50 with the report written', () => {
    const s = held.state;
    expect(s.clock.year).toBe(ENDING_YEAR);
    expect(s.ending.pending).toBe(true);
    const r = s.ending.report!;
    expect(r.axes.map((a) => a.axis)).toEqual([...AXES]);
    expect(r.mark).toMatch(/^[ABCDF]$/);
    expect(r.title.startsWith(`${r.school}: `)).toBe(true);
    expect(r.title).not.toMatch(/[{}]/);
    expect(r.eras.length).toBeGreaterThan(2);
    expect(r.finances.length).toBeGreaterThan(1);
    expect(entriesOfKind(s, 'runEnded')).toHaveLength(1);
  });

  it('continues in Epilogue, with an addendum every ten years', () => {
    const on = tickRunWeeks(held, 36 * 21, defaultResolution);
    expect(on.state.ending.epilogue).toBe(true);
    expect(on.state.ending.pending).toBe(false);
    expect(on.state.ending.addenda.map((a) => [a.from, a.to])).toEqual([
      [50, 59],
      [60, 69],
    ]);
    // The report is frozen when written; the Epilogue does not rewrite it.
    expect(on.state.ending.report).toEqual(held.state.ending.report);
  });

  it('grades the arc: a college that climbed outranks one that coasted', () => {
    const s = held.state;
    const flat = s.prestige.history.map((h) => ({ ...h, axes: { ...h.axes, research: 50 } }));
    const climb = s.prestige.history.map((h, i, all) => ({
      ...h,
      axes: { ...h.axes, research: 20 + (60 * i) / Math.max(1, all.length - 1) },
    }));
    const grade = (history: typeof flat) =>
      gradeAxes({ ...s, prestige: { ...s.prestige, history } }).find((g) => g.axis === 'research')!;
    // Both end near where they started or better; the climber ends higher
    // and is graded for the climb.
    expect(grade(climb).score).toBeGreaterThan(grade(flat).score);
  });

  it('never names a weakness the college’s own tag claims', () => {
    const s = {
      ...held.state,
      perception: { ...held.state.perception, tags: ['the-bargain' as const] },
    };
    const grades = gradeAxes(s).map((g) => (g.axis === 'access' ? { ...g, score: 1 } : g));
    expect(composeTitle(s, grades)).not.toMatch(/doors/);
  });
});
