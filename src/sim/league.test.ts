import { describe, expect, it } from 'vitest';
import { AXES, LEAGUE_SCHOOLS, METHODOLOGIES } from '../content/league.ts';
import { played } from './colleges.ts';
import { driftLeague, foundingLeague, PLAYER_ID, rankOf } from './league.ts';
import { axisReadings, collegePrestige } from './prestige.ts';

// THE LEAGUE (DD §11.3, Phase 22). Done when the table moves believably
// over fifty headless years.

describe('the league over fifty years', () => {
  const run = played(4242, 50);
  const tables = run.state.league.tables;

  it('publishes a table every year after the first, the college in it', () => {
    expect(tables).toHaveLength(50);
    for (const t of tables) {
      expect(t.rows).toHaveLength(LEAGUE_SCHOOLS.length + 1);
      expect(t.rows.some((r) => r.id === PLAYER_ID)).toBe(true);
    }
  });

  it('moves: the table churns every year, but nobody goes from first to last', () => {
    let churn = 0;
    for (let i = 1; i < tables.length; i++) {
      const moved = tables[i]!.rows.filter((r, k) => rankOf(tables[i - 1]!, r.id) !== k + 1).length;
      churn += moved;
    }
    const perYear = churn / (tables.length - 1);
    expect(perYear).toBeGreaterThan(4);
    expect(perYear).toBeLessThan(22);
    // The strongest school at the start stays in the top third throughout.
    const first = tables[0]!.rows[0]!.id;
    for (const t of tables) expect(rankOf(t, first)).toBeLessThanOrEqual(9);
    // And more than one school holds first place in fifty years.
    expect(new Set(tables.map((t) => t.rows[0]!.id)).size).toBeGreaterThan(1);
  });

  it('keeps every axis on the scale', () => {
    for (const s of run.state.league.schools)
      for (const a of AXES) {
        expect(s.axes[a]).toBeGreaterThanOrEqual(1);
        expect(s.axes[a]).toBeLessThanOrEqual(99);
      }
  });

  it('changes its methodology now and then, and says so', () => {
    const changes = run.state.bus.filter((e) => e.kind === 'methodologyChanged');
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.length).toBeLessThanOrEqual(10);
    expect(METHODOLOGIES.map((m) => m.id)).toContain(run.state.league.methodologyId);
  });

  it('ranks the college on standings that trail its readings', () => {
    const reading = axisReadings(run.state);
    for (const a of AXES)
      expect(Math.abs(run.state.prestige.axes[a] - reading[a])).toBeLessThan(25);
    expect(collegePrestige(run.state)).toBeGreaterThan(0);
  });
});

describe('the league’s own dice', () => {
  it('draws from the seed and the year, not from the college’s stream', () => {
    const a = driftLeague(foundingLeague(9), 9, 3);
    const b = driftLeague(foundingLeague(9), 9, 3);
    expect(a).toEqual(b);
    expect(driftLeague(foundingLeague(9), 9, 4)).not.toEqual(a);
  });
});
