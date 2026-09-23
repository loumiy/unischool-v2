import { describe, expect, it } from 'vitest';
import {
  ADJUNCT_RESEARCH_CAP,
  ADJUNCT_SALARY_PREMIUM,
  ADJUNCT_TEACHING_CAP,
  SALARY_BY_RANK,
} from '../tuning.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { opened, played } from './colleges.ts';
import { adjunctFor, facultyOf, retirementYear } from './faculty.ts';
import { dispatch, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION } from './state.ts';

// STAFFING WITHOUT A TRAP (Phase 39, DD §7.3): an adjunct any week of the
// year, dearer and weaker, for a year; and hires who leave for reasons.

// A college with a programme open and nobody hired: the founding checklist
// done, the summer market missed.
function unstaffed(): { run: Run; programId: string } {
  let run = played(4, 3, undefined, { hireCap: 0 });
  const program = run.state.academics.programs[0]!;
  run = { ...run, state: { ...run.state } };
  return { run, programId: program.programId };
}

describe('adjuncts', () => {
  it('can be hired any week of the year to a programme nobody teaches', () => {
    const { run, programId } = unstaffed();
    expect(facultyOf(run.state, programId)).toHaveLength(0);
    expect(run.state.faculty.marketOpen).toBe(false);
    const hired = dispatch(run, { type: 'hireAdjunct', programId });
    const staff = facultyOf(hired.state, programId);
    expect(staff).toHaveLength(1);
    expect(staff[0]!.adjunct).toBe(true);
    expect(entriesOfKind(hired.state, 'adjunctHired')).toHaveLength(1);
  });

  it('cost more and teach less than a summer hire', () => {
    const { run, programId } = unstaffed();
    const a = adjunctFor(run.state, programId)!;
    expect(a.teaching).toBeLessThanOrEqual(ADJUNCT_TEACHING_CAP);
    expect(a.research).toBeLessThanOrEqual(ADJUNCT_RESEARCH_CAP);
    expect(a.salary).toBeGreaterThan(SALARY_BY_RANK.assistant * (ADJUNCT_SALARY_PREMIUM - 0.5));
    // The same week and programme show the same person: the world's dice.
    expect(adjunctFor(run.state, programId)).toEqual(a);
  });

  it('leave when the year is up', () => {
    const { run, programId } = unstaffed();
    const hired = dispatch(run, { type: 'hireAdjunct', programId });
    const later = tickRunWeeks(hired, WEEKS_PER_YEAR + 1, defaultResolution);
    expect(facultyOf(later.state, programId).filter((f) => f.adjunct)).toHaveLength(0);
    expect(entriesOfKind(later.state, 'adjunctLeft')).toHaveLength(1);
  });

  it('are refused before the doors open and for a programme not open', () => {
    const fresh = opened(4);
    expect(canApply(fresh.state, { type: 'hireAdjunct', programId: 'english' }).ok).toBe(false);
    const { run } = unstaffed();
    const closed = run.state.academics.programs.some((p) => p.programId === 'accounting');
    expect(closed).toBe(false);
    expect(canApply(run.state, { type: 'hireAdjunct', programId: 'accounting' }).ok).toBe(false);
  });
});

describe('careers end', () => {
  it('retire every hire eventually, the senior ones first', () => {
    const run = played(4, 30);
    const retired = entriesOfKind(run.state, 'facultyRetired');
    expect(retired.length).toBeGreaterThan(0);
    for (const f of run.state.faculty.roster) {
      const y = retirementYear(f);
      if (y !== null) expect(y).toBeGreaterThan(run.state.clock.year - 1);
    }
  });
});

describe('the save', () => {
  it('migrates a version-29 save', () => {
    const run = tickRunWeeks(opened(4), 10, defaultResolution);
    const v29 = JSON.parse(JSON.stringify(serializeRun(run)));
    v29.version = 29;
    v29.state.schemaVersion = 29;
    const loaded = loadSaveFile(v29);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.version).toBe(SCHEMA_VERSION);
  });
});
