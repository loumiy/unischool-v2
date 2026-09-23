import { describe, expect, it } from 'vitest';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { courseListings, programById, tierById } from '../content/schools.ts';
import {
  ADVANCEMENT,
  DECAY_AFTER_YEARS,
  SIGNATURE_ADVANCE_DISCOUNT,
  SIGNATURE_DECAY_CONFIDENCE,
  SIGNATURE_LIMIT,
} from '../tuning.ts';
import {
  academicsWeek,
  advancementCost,
  advancementYears,
  advanceVerdict,
  crowdingFactor,
  neglected,
  nextTier,
  openProgram,
  programCrowding,
  programSeats,
  signatures,
} from './academics.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind, lastEntry } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { RUNG_FREEZE } from './distress.ts';
import { enrolled } from './people.ts';
import { dispatch, newRun, replay, tickRun, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION } from './state.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

function untilBeat(run: Run, beatId: string): Run {
  const from = run.state.clock.absoluteWeek;
  for (let guard = 0; guard < WEEKS_PER_YEAR * 2; guard++) {
    if (run.state.pendingBeat === beatId) return run;
    // A beat with nothing to decide passes without holding (Phase 41).
    const last = lastEntry(run.state);
    if (last?.kind === 'beatPassed' && last.beatId === beatId && last.week !== from) return run;
    if (run.state.pendingBeat !== null || run.state.distress.pendingLetter !== null) {
      run = dispatch(run, defaultResolution(run.state)!);
      continue;
    }
    run = tickRun(run);
  }
  throw new Error(`${beatId} never fired`);
}

// Science founded, Biology open, at the Year 2 market: seed 4's market
// lists an Associate Professor and a Professor of science.
function atMarket(seed = 4): Run {
  let run = dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
  run = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
  run = dispatch(run, { type: 'foundSchool', schoolId: 'science', placementId: 'p1' });
  run = dispatch(run, { type: 'openProgram', programId: 'biology' });
  return untilBeat(run, 'budget-and-hiring');
}

function seniors(run: Run, rank: 'associate' | 'full') {
  return run.state.faculty.market.filter((f) => f.schoolId === 'science' && f.rank === rank);
}

// Biology led by an Associate Professor, the market approved.
function led(seed = 4): { run: Run; leadId: string } {
  let run = atMarket(seed);
  const lead = seniors(run, 'associate')[0]!;
  run = dispatch(run, { type: 'hire', candidateId: lead.id, programId: 'biology' });
  run = dispatch(run, defaultResolution(run.state)!);
  return { run, leadId: lead.id };
}

const biology = (run: Run) => openProgram(run.state, 'biology')!;
const line = (run: Run) => describeEntry(lastEntry(run.state)!, run.state).text;

describe('advancing a tier (DD §7.2)', () => {
  it('prices and times the climb, half price for a signature', () => {
    expect(nextTier('founded')).toBe('established');
    expect(nextTier('renowned')).toBeNull();
    const { run } = led();
    expect(advancementCost(biology(run))).toBe(ADVANCEMENT.established.cost);
    expect(advancementYears('established')).toBe(ADVANCEMENT.established.years);
    const signed = dispatch(run, { type: 'designateSignature', programId: 'biology' });
    expect(advancementCost(biology(signed))).toBe(
      ADVANCEMENT.established.cost * SIGNATURE_ADVANCE_DISCOUNT,
    );
    expect(tierById('established').leadRank).toBe('associate');
    expect(tierById('renowned').leadRank).toBe('full');
  });

  it('needs a senior hire of the next tier’s rank assigned, and the money', () => {
    let run = atMarket();
    expect(advanceVerdict(run.state, 'chemistry')).toMatchObject({ ok: false, reason: /not open/ });
    expect(advanceVerdict(run.state, 'biology')).toMatchObject({
      ok: false,
      reason: /senior hire/,
    });
    const junior = run.state.faculty.market.find(
      (f) => f.schoolId === 'science' && f.rank === 'assistant',
    )!;
    run = dispatch(run, { type: 'hire', candidateId: junior.id, programId: 'biology' });
    expect(advanceVerdict(run.state, 'biology')).toMatchObject({ ok: false });
    const lead = seniors(run, 'associate')[0]!;
    run = dispatch(run, { type: 'hire', candidateId: lead.id, programId: 'biology' });
    expect(advanceVerdict(run.state, 'biology')).toEqual({ ok: true });
    const frozen = { ...run.state, distress: { ...run.state.distress, rung: RUNG_FREEZE } };
    expect(canApply(frozen, { type: 'advanceProgram', programId: 'biology' })).toMatchObject({
      ok: false,
      reason: /frozen/,
    });
    const broke = { ...run.state, treasury: { ...run.state.treasury, cash: 1000 } };
    expect(canApply(broke, { type: 'advanceProgram', programId: 'biology' })).toMatchObject({
      ok: false,
      reason: /cash/,
    });
    expect(canApply(run.state, { type: 'advanceProgram', programId: 'biology' })).toEqual({
      ok: true,
    });
  });

  it('is a multi-year project: paid now, Established two years on, with more seats and courses', () => {
    let { run } = led();
    const cash = run.state.treasury.cash;
    const week = run.state.clock.absoluteWeek;
    run = dispatch(run, { type: 'advanceProgram', programId: 'biology' });
    expect(run.state.treasury.cash).toBe(cash - ADVANCEMENT.established.cost);
    expect(biology(run).advancing).toEqual({
      to: 'established',
      completesWeek: week + ADVANCEMENT.established.years * WEEKS_PER_YEAR,
      stalled: false,
    });
    expect(line(run)).toBe('Biology begins its climb to Established.');
    expect(canApply(run.state, { type: 'advanceProgram', programId: 'biology' })).toMatchObject({
      ok: false,
      reason: /already/,
    });
    run = tickRunWeeks(run, ADVANCEMENT.established.years * WEEKS_PER_YEAR - 1, defaultResolution);
    expect(biology(run).tier).toBe('founded');
    run = tickRunWeeks(run, 1, defaultResolution);
    expect(biology(run)).toMatchObject({ tier: 'established', advancing: null });
    expect(entriesOfKind(run.state, 'programAdvanced')).toHaveLength(1);
    expect(describeEntry(entriesOfKind(run.state, 'programAdvanced')[0]!, run.state).text).toBe(
      'Biology is now Established.',
    );
    expect(programSeats(run.state)).toBe(tierById('established').seats);
    const offered = courseListings(programById('biology'));
    expect(offered.filter((c) => c.level <= tierById(biology(run).tier).levels)).toHaveLength(4);
    expect(advanceVerdict(run.state, 'biology')).toMatchObject({
      ok: false,
      reason: /senior hire/,
    });
  });

  it('waits, once noted, if the lead is gone when the works are done', () => {
    const start = led();
    const { leadId } = start;
    let { run } = start;
    run = dispatch(run, { type: 'advanceProgram', programId: 'biology' });
    run = tickRunWeeks(run, 10, defaultResolution);
    run = dispatch(run, { type: 'assignFaculty', facultyId: leadId, programId: null });
    run = tickRunWeeks(run, ADVANCEMENT.established.years * WEEKS_PER_YEAR - 10, defaultResolution);
    expect(biology(run)).toMatchObject({ tier: 'founded', advancing: { stalled: true } });
    const stalled = entriesOfKind(run.state, 'advancementStalled');
    expect(stalled).toHaveLength(1);
    expect(describeEntry(stalled[0]!, run.state).text).toBe(
      "Biology's works to Established are done, but wait on an Associate Professor assigned.",
    );
    run = tickRunWeeks(run, 5, defaultResolution);
    expect(entriesOfKind(run.state, 'advancementStalled')).toHaveLength(1);
    run = dispatch(run, { type: 'assignFaculty', facultyId: leadId, programId: 'biology' });
    run = tickRunWeeks(run, 1, defaultResolution);
    expect(biology(run)).toMatchObject({ tier: 'established', advancing: null });
  });
});

describe('holding a tier, and decay', () => {
  function established(): { run: Run; leadId: string } {
    const start = led();
    let { run } = start;
    run = dispatch(run, { type: 'advanceProgram', programId: 'biology' });
    run = tickRunWeeks(run, ADVANCEMENT.established.years * WEEKS_PER_YEAR, defaultResolution);
    expect(biology(run).tier).toBe('established');
    return { run, leadId: start.leadId };
  }

  function toConvocation(run: Run): Run {
    return untilBeat(run, 'convocation');
  }

  it('drops a tier after two neglected years; a signature embarrasses the board', () => {
    let { run } = established();
    expect(neglected(run.state, biology(run))).toBe(true); // one hire against four needed
    run = dispatch(run, { type: 'designateSignature', programId: 'biology' });
    run = toConvocation(run);
    expect(biology(run)).toMatchObject({ tier: 'established', neglectYears: 1 });
    if (run.state.pendingBeat) run = dispatch(run, defaultResolution(run.state)!);
    // The decay week alone, on the state as it stands: the board's hit.
    const eve = {
      ...run.state,
      clock: { ...run.state.clock, term: 'fall' as const, week: 1 },
    };
    const after = academicsWeek(eve);
    expect(after.distress.confidence).toBe(eve.distress.confidence - SIGNATURE_DECAY_CONFIDENCE);
    expect(openProgram(after, 'biology')!.tier).toBe('founded');
    run = toConvocation(run);
    expect(biology(run)).toMatchObject({ tier: 'founded', neglectYears: 0 });
    const decayed = entriesOfKind(run.state, 'programDecayed');
    expect(decayed).toHaveLength(1);
    expect(describeEntry(decayed[0]!, run.state).text).toBe(
      'Biology slips back to Founded, a signature program, to public embarrassment.',
    );
    expect(DECAY_AFTER_YEARS).toBe(2);
  });

  it('a staffed, led program keeps its tier and its count resets', () => {
    let { run } = established();
    // Staff it up at the next market: every scientist listed.
    run = untilBeat(run, 'budget-and-hiring');
    for (const c of run.state.faculty.market.filter((f) => f.schoolId === 'science'))
      run = dispatch(run, { type: 'hire', candidateId: c.id, programId: 'biology' });
    run = dispatch(run, defaultResolution(run.state)!);
    run = toConvocation(run);
    expect(neglected(run.state, biology(run))).toBe(false);
    expect(biology(run)).toMatchObject({ tier: 'established', neglectYears: 0 });
  });
});

describe('signatures (DD §7.2)', () => {
  it('names up to three, and drops them', () => {
    let run = atMarket();
    for (const id of ['chemistry', 'physics', 'mathematics'])
      run = dispatch(run, { type: 'openProgram', programId: id });
    for (const id of ['biology', 'chemistry', 'physics'])
      run = dispatch(run, { type: 'designateSignature', programId: id });
    expect(signatures(run.state).map((p) => p.programId)).toEqual([
      'biology',
      'chemistry',
      'physics',
    ]);
    expect(SIGNATURE_LIMIT).toBe(3);
    expect(
      canApply(run.state, { type: 'designateSignature', programId: 'mathematics' }),
    ).toMatchObject({ ok: false, reason: /three/ });
    expect(canApply(run.state, { type: 'designateSignature', programId: 'biology' })).toMatchObject(
      { ok: false, reason: /already/ },
    );
    expect(line(run)).toBe('Physics is named a signature program.');
    run = dispatch(run, { type: 'revokeSignature', programId: 'physics' });
    expect(line(run)).toBe('Physics is no longer a signature program.');
    expect(signatures(run.state)).toHaveLength(2);
    expect(canApply(run.state, { type: 'revokeSignature', programId: 'physics' })).toMatchObject({
      ok: false,
    });
  });
});

describe('overcrowding (DD §7.4)', () => {
  it('damps every program once the students outnumber the seats', () => {
    const run = atMarket();
    const students = enrolled(run.state);
    expect(students).toBeGreaterThan(tierById('founded').seats);
    expect(programCrowding(run.state)).toBeCloseTo(students / 120, 5);
    expect(crowdingFactor(run.state)).toBeCloseTo(120 / students, 5);
    const roomy = dispatch(run, { type: 'openProgram', programId: 'chemistry' });
    expect(crowdingFactor(roomy.state)).toBe(1);
    const empty = { ...run.state, academics: { ...run.state.academics, programs: [] } };
    expect(programCrowding(empty)).toBe(0);
    expect(crowdingFactor(empty)).toBe(1);
  });
});

describe('the log and the save', () => {
  it('replays an advancement, a signature and a decay from the log', () => {
    const start = led();
    const { leadId } = start;
    let { run } = start;
    run = dispatch(run, { type: 'designateSignature', programId: 'biology' });
    run = dispatch(run, { type: 'advanceProgram', programId: 'biology' });
    run = tickRunWeeks(run, ADVANCEMENT.established.years * WEEKS_PER_YEAR + 3, defaultResolution);
    run = dispatch(run, { type: 'assignFaculty', facultyId: leadId, programId: null });
    run = tickRunWeeks(run, WEEKS_PER_YEAR * 2 + 2, defaultResolution);
    expect(entriesOfKind(run.state, 'programDecayed')).toHaveLength(1);
    expect(replay(run.state.seed, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });

  it('migrates a version-10 save', () => {
    let { run } = led();
    run = dispatch(run, { type: 'advanceProgram', programId: 'biology' });
    run = tickRunWeeks(run, 3, defaultResolution);
    const v10 = JSON.parse(JSON.stringify(serializeRun(run)));
    v10.version = 10;
    v10.state.schemaVersion = 10;
    for (const p of v10.state.academics.programs) {
      delete p.advancing;
      delete p.signature;
      delete p.neglectYears;
    }
    const replayed = loadSaveFile(v10);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) {
      expect(replayed.save.version).toBe(SCHEMA_VERSION);
      expect(replayed.save.state).toEqual(run.state);
    }
    const orphan = { ...v10, log: [] };
    const fallen = loadSaveFile(orphan);
    expect(fallen.ok).toBe(true);
    if (fallen.ok) {
      expect(fallen.save.state.academics.programs[0]).toMatchObject({
        programId: 'biology',
        advancing: null,
        signature: false,
        neglectYears: 0,
      });
    }
  });
});
