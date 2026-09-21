import { describe, expect, it } from 'vitest';
import { BUS_LINES, describeEntry } from '../content/busLines.ts';
import { CALENDAR_BEATS } from '../content/calendarBeats.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { applyAction, canApply } from './actions.ts';
import { clockAdvances, clockHeld, defaultResolution, pendingBeat } from './beats.ts';
import { BUS_KINDS, entriesBetween, entriesOfKind, lastEntry } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { createNewGame } from './state.ts';
import { formatMoney } from './treasury.ts';
import { tick, tickWeeks } from './tick.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

const PLACE_FOUNDERS = {
  type: 'placeBuilding',
  buildingId: 'founders-hall',
  col: 28,
  row: 28,
  rotated: false,
} as const;

function opened(seed = 4): Run {
  return dispatch(dispatch(newRun(seed), FOUND), PLACE_FOUNDERS);
}

describe('the journal (event bus)', () => {
  it('journals the charter and the doors opening, stamped with the week', () => {
    const run = opened();
    expect(run.state.bus.map((e) => e.kind)).toEqual(['founded', 'buildingPlaced', 'doorsOpened']);
    expect(run.state.bus.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(run.state.bus.every((e) => e.week === 0)).toBe(true);
    expect(lastEntry(run.state)).toMatchObject({ kind: 'doorsOpened', placementId: 'p1' });
  });

  it('journals buildings going up and coming down', () => {
    let run = opened();
    run = dispatch(run, { ...PLACE_FOUNDERS, buildingId: 'library', col: 10, row: 10 });
    run = dispatch(run, { type: 'demolish', placementId: 'p2' });
    expect(entriesOfKind(run.state, 'buildingPlaced').map((e) => e.buildingId)).toEqual([
      'founders-hall',
      'library',
    ]);
    expect(lastEntry(run.state)).toMatchObject({
      kind: 'buildingDemolished',
      buildingId: 'library',
    });
  });

  it('journals the turn of every term and year', () => {
    const s = tickWeeks(createNewGame(1), WEEKS_PER_YEAR + 1);
    expect(entriesOfKind(s, 'termBegan').map((e) => `${e.year}:${e.term}`)).toEqual([
      '1:spring',
      '1:summer',
      '2:fall',
    ]);
    expect(entriesOfKind(s, 'yearTurned').map((e) => e.year)).toEqual([2]);
  });

  it('slices a stretch of history by week', () => {
    const s = tickWeeks(createNewGame(1), 40);
    expect(entriesBetween(s, 14, 28).map((e) => e.kind)).toEqual(['termBegan', 'termBegan']);
  });

  it('has a line for every kind, and words an entry from content', () => {
    for (const kind of BUS_KINDS) expect(BUS_LINES[kind].text.length).toBeGreaterThan(0);
    const run = opened();
    const lines = run.state.bus.map((e) => describeEntry(e, run.state).text);
    expect(lines).toEqual([
      'Blackmoor College is chartered.',
      'Ground is broken for Founders Hall.',
      'Blackmoor College breaks ground.',
    ]);
    expect(describeEntry(run.state.bus[0]!, run.state).tone).toBe('good');
  });
});

describe('calendar beats (DD §3.3)', () => {
  it('fires on the tick that lands on its week and holds the clock', () => {
    let run = opened();
    run = tickRunWeeks(run, 20);
    // Fall Week 12 is the Board Meeting: absolute week 11.
    expect(run.state.clock).toMatchObject({ year: 1, term: 'fall', week: 12, absoluteWeek: 11 });
    expect(run.state.pendingBeat).toBe('board-meeting');
    expect(pendingBeat(run.state)?.name).toBe('Board Meeting');
    expect(clockHeld(run.state)).toBe(true);
    expect(clockAdvances(run.state)).toBe(false);
    expect(tick(run.state)).toBe(run.state);
    expect(lastEntry(run.state)).toMatchObject({ kind: 'beatFired', beatId: 'board-meeting' });
  });

  it('does not fire before the doors are open', () => {
    const s = tickWeeks(createNewGame(1), 40);
    expect(s.clock.absoluteWeek).toBe(40);
    expect(entriesOfKind(s, 'beatFired')).toEqual([]);
    const siting = tickWeeks(applyAction(createNewGame(1), FOUND), 40);
    expect(siting.pendingBeat).toBeNull();
  });

  it('is resolved by the resolveBeat action, and only the pending one', () => {
    let run = tickRunWeeks(opened(), 20);
    expect(canApply(run.state, { type: 'resolveBeat', beatId: 'convocation' })).toMatchObject({
      ok: false,
    });
    expect(
      canApply(opened().state, { type: 'resolveBeat', beatId: 'board-meeting' }),
    ).toMatchObject({
      ok: false,
      reason: /no beat/,
    });
    expect(defaultResolution(run.state)).toEqual({ type: 'resolveBeat', beatId: 'board-meeting' });
    run = dispatch(run, defaultResolution(run.state)!);
    expect(run.state.pendingBeat).toBeNull();
    expect(clockAdvances(run.state)).toBe(true);
    expect(lastEntry(run.state)).toMatchObject({ kind: 'beatResolved', beatId: 'board-meeting' });
    run = tickRunWeeks(run, 1);
    expect(run.state.clock.absoluteWeek).toBe(12);
  });

  it('still takes building actions while the clock holds', () => {
    let run = tickRunWeeks(opened(), 20);
    run = dispatch(run, { ...PLACE_FOUNDERS, buildingId: 'library', col: 10, row: 10 });
    expect(run.state.campus.placements).toHaveLength(2);
    expect(run.state.pendingBeat).toBe('board-meeting');
  });

  it('cycles a year through all four beats in calendar order', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 2, defaultResolution);
    expect(run.state.clock).toMatchObject({ year: 3, term: 'fall', week: 1 });
    const fired = entriesOfKind(run.state, 'beatFired').map((e) => e.beatId);
    // Year 1 is the founding year: the doors open in its Convocation week,
    // so the first Convocation proper is Year 2's (DD §2.4, §3.3).
    expect(fired).toEqual([
      'board-meeting',
      'admissions-day',
      'budget-and-hiring',
      'convocation',
      'board-meeting',
      'admissions-day',
      'budget-and-hiring',
      'convocation',
    ]);
    expect(run.state.pendingBeat).toBe('convocation');
    expect(run.log.filter((e) => e.action.type === 'resolveBeat')).toHaveLength(7);
  });

  it('reads as a coherent history', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    const history = run.state.bus.map((e) => describeEntry(e, run.state).text);
    const line = (kind: 'admissionsClosed' | 'classArrived') =>
      describeEntry(entriesOfKind(run.state, kind)[0]!, run.state).text;
    expect(history).toEqual([
      'Blackmoor College is chartered.',
      'Ground is broken for Founders Hall.',
      'Blackmoor College breaks ground.',
      'The board is in session.',
      'The board adjourns.',
      'Spring Term begins.',
      'Admissions Day. The applications are in.',
      line('admissionsClosed'),
      'The admissions file closes.',
      'Founders Hall opens.',
      'Summer Term begins.',
      'Budget & Hiring. The ledger is open, and so is the market.',
      'The Year 2 budget is approved at a 4.5% draw.',
      'The budget is approved and the market closes for the year.',
      'Fall Term begins.',
      'Year 2.',
      `Year 1 closes ${formatMoney(run.state.treasury.history[0]!.net)} in the black.`,
      line('classArrived'),
      'Convocation. The new class is on the lawn.',
    ]);
  });

  it('runs fifty years with default resolutions and four beats a year', () => {
    const t0 = performance.now();
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR * 50, defaultResolution);
    expect(run.state.clock).toMatchObject({ year: 51, term: 'fall', week: 1 });
    // Year 1 has no Convocation; Year 51's is the one the run lands on.
    expect(entriesOfKind(run.state, 'beatFired')).toHaveLength(50 * 4);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('replays identically, resolutions included', () => {
    let run = tickRunWeeks(opened(77), 60, defaultResolution);
    run = dispatch(run, { type: 'debug/mark', label: 'held' });
    expect(replay(77, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });

  it('refuses to replay a log that skips a beat', () => {
    const run = tickRunWeeks(opened(77), 60, defaultResolution);
    const skipped = run.log.filter((e) => e.action.type !== 'resolveBeat');
    expect(() => replay(77, skipped, run.state.clock.absoluteWeek)).toThrow(/stalled/);
  });

  it('every beat has its screen words', () => {
    for (const b of CALENDAR_BEATS) {
      expect(b.prompt.length).toBeGreaterThan(0);
      expect(b.blurb.length).toBeGreaterThan(0);
      expect(b.resolveLabel.length).toBeGreaterThan(0);
      expect(b.phase).toBeGreaterThan(4);
    }
  });
});

describe('save migration v3 → v4', () => {
  // A v3 save is a v4 save minus the journal, plus the marks list and a log
  // without resolutions. Build one from a live run and check the migration
  // rebuilds the same run, journal and all.
  function downgrade(run: Run) {
    const file = JSON.parse(JSON.stringify(serializeRun(run)));
    file.version = 3;
    file.state.schemaVersion = 3;
    file.state.marks = run.state.bus
      .filter((e) => e.kind === 'mark')
      .map((e) => ({ week: e.week, label: e.kind === 'mark' ? e.label : '' }));
    delete file.state.bus;
    delete file.state.pendingBeat;
    file.log = file.log.filter(
      (e: { action: { type: string } }) => e.action.type !== 'resolveBeat',
    );
    return file;
  }

  it('rebuilds the journal by replay when the run is mid-year', () => {
    let run = tickRunWeeks(opened(11), 30, defaultResolution);
    run = dispatch(run, { type: 'debug/mark', label: 'noted' });
    run = tickRunWeeks(run, 3, defaultResolution);
    const result = loadSaveFile(downgrade(run));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state).toEqual(run.state);
    expect(result.save.log).toEqual(run.log);
  });

  it('leaves a beat pending when the save sits on its week', () => {
    const run = tickRunWeeks(opened(12), 20);
    expect(run.state.pendingBeat).toBe('board-meeting');
    const result = loadSaveFile(downgrade(run));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state).toEqual(run.state);
  });
});
