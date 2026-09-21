import { describe, expect, it } from 'vitest';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { dispatch, newRun, replay, tickRunWeeks, type LoggedAction } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { createNewGame, SCHEMA_VERSION } from './state.ts';
import { tickWeeks } from './tick.ts';

describe('state', () => {
  it('captures the seed at new-game', () => {
    const s = createNewGame(123);
    expect(s.seed).toBe(123);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.clock.absoluteWeek).toBe(0);
  });

  it('rejects seeds outside 32 bits', () => {
    expect(() => createNewGame(-1)).toThrow(RangeError);
    expect(() => createNewGame(2 ** 32)).toThrow(RangeError);
    expect(() => createNewGame(1.5)).toThrow(RangeError);
  });

  it('is plain data: survives JSON round-trip unchanged', () => {
    const s = tickWeeks(createNewGame(5), 40);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('tick', () => {
  it('advances one week and does not mutate its input', () => {
    const s0 = createNewGame(1);
    const frozen = JSON.stringify(s0);
    const s1 = tickWeeks(s0, 1);
    expect(s1.clock.absoluteWeek).toBe(1);
    expect(JSON.stringify(s0)).toBe(frozen);
  });

  it('runs fifty years quickly (DD §15: headless run under 60 s)', () => {
    const t0 = performance.now();
    const s = tickWeeks(createNewGame(9), WEEKS_PER_YEAR * 50);
    expect(s.clock).toMatchObject({ year: 51, term: 'fall', week: 1 });
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('run and replay', () => {
  it('replays a live run identically from seed + log', () => {
    let run = newRun(31337);
    run = tickRunWeeks(run, 3);
    run = dispatch(run, { type: 'debug/mark', label: 'first' });
    run = dispatch(run, { type: 'debug/mark', label: 'second, same week' });
    run = tickRunWeeks(run, 40);
    run = dispatch(run, { type: 'debug/mark', label: 'year two' });
    run = tickRunWeeks(run, 10);

    const rebuilt = replay(run.state.seed, run.log, run.state.clock.absoluteWeek);
    expect(rebuilt).toEqual(run.state);
    expect(rebuilt.marks.map((m) => m.week)).toEqual([3, 3, 43]);
  });

  it('applies an action logged in the current week without ticking past it', () => {
    let run = newRun(1);
    run = dispatch(run, { type: 'debug/mark', label: 'week zero' });
    expect(replay(1, run.log, 0)).toEqual(run.state);
  });

  it('rejects a log that is out of week order', () => {
    const log: LoggedAction[] = [
      { week: 5, action: { type: 'debug/mark', label: 'a' } },
      { week: 2, action: { type: 'debug/mark', label: 'b' } },
    ];
    expect(() => replay(1, log, 10)).toThrow(/week order/);
  });
});

describe('save file', () => {
  it('round-trips through JSON and loadSaveFile', () => {
    let run = newRun(77);
    run = tickRunWeeks(run, 50);
    run = dispatch(run, { type: 'debug/mark', label: 'saved' });
    const file = serializeRun(run, new Date('2026-01-01T00:00:00Z'));
    const result = loadSaveFile(JSON.parse(JSON.stringify(file)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state).toEqual(run.state);
    expect(result.save.log).toEqual(run.log);
    expect(result.save.version).toBe(SCHEMA_VERSION);
  });

  it('rejects garbage with a reason rather than throwing', () => {
    expect(loadSaveFile(null)).toMatchObject({ ok: false });
    expect(loadSaveFile('nope')).toMatchObject({ ok: false });
    expect(loadSaveFile({})).toMatchObject({ ok: false, reason: /version/ });
    expect(loadSaveFile({ version: SCHEMA_VERSION + 1 })).toMatchObject({
      ok: false,
      reason: /newer/,
    });
    expect(loadSaveFile({ version: 0 })).toMatchObject({ ok: false, reason: /migration/ });
  });

  it('rejects a save whose clock is malformed', () => {
    const file = serializeRun(newRun(1));
    const broken = JSON.parse(JSON.stringify(file));
    broken.state.clock.week = 99;
    expect(loadSaveFile(broken)).toMatchObject({ ok: false, reason: /clock.week/ });
  });
});
