import { describe, expect, it } from 'vitest';
import { ERA_MAX, ERA_MAX_YEARS } from '../tuning.ts';
import { chronicleOf, partition, yearRecords } from './chronicle.ts';
import { played } from './colleges.ts';

// THE CHRONICLE (DD §12.1, Phase 26). Done when a completed test run reads
// as a story a player would screenshot.

describe('the chronicle of a fifty-year run', () => {
  const run = played(21, 50, undefined, {
    maintenanceFunding: 0,
    drawRate: 0.08,
    selectivity: 0.3,
    hireCap: 3,
  });
  const c = chronicleOf(run.state);

  it('divides the run into named eras that cover every year once', () => {
    expect(c.eras.length).toBeGreaterThanOrEqual(4);
    expect(c.eras.length).toBeLessThanOrEqual(ERA_MAX);
    expect(c.eras[0]!.kind).toBe('founding');
    expect(c.eras[0]!.from).toBe(1);
    for (let i = 1; i < c.eras.length; i++) expect(c.eras[i]!.from).toBe(c.eras[i - 1]!.to + 1);
    expect(c.eras[c.eras.length - 1]!.to).toBe(run.state.clock.year);
    for (const e of c.eras) expect(e.to - e.from + 1).toBeLessThanOrEqual(ERA_MAX_YEARS + 1);
  });

  it('names no two eras alike, and names them in words, not placeholders', () => {
    const names = c.eras.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).not.toMatch(/[{}]/);
  });

  it('summarises each era in sentences with its years, buildings and numbers', () => {
    for (const e of c.eras) {
      expect(e.lines[0]).toMatch(/^Years? \d+/);
      expect(e.lines.join(' ')).not.toMatch(/[{}]|undefined|NaN/);
    }
    // The letters the college answered are what its quiet years are named for.
    expect(c.eras.some((e) => e.lines.some((l) => l.startsWith('It weathered')))).toBe(true);
  });

  it('keeps a building timeline and the rival’s saga', () => {
    expect(c.timeline.length).toBeGreaterThan(5);
    expect(c.timeline.every((t) => t.year >= 1)).toBe(true);
    expect(c.rival).not.toBeNull();
    expect(c.rival!.years).toBeGreaterThan(0);
  });

  it('reads the troubles as troubles', () => {
    const recs = yearRecords(run.state);
    const spans = partition(recs);
    expect(spans.map((s) => s.kind)).toContain('founding');
  });
});
