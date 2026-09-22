import { describe, expect, it } from 'vitest';
import { AMBITIONS, AMBITION_WORDS, ambitionById } from '../content/ambitions.ts';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { AMBITION_CAP } from '../tuning.ts';
import { canApply } from './actions.ts';
import {
  activeAmbitions,
  answerAmbition,
  atCap,
  dealable,
  foundingAmbitions,
  goalMet,
  pickAmbition,
  yearsLeft,
  type ActiveAmbition,
} from './ambitions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { played } from './colleges.ts';
import { conditionsOf, readingOf } from './events.ts';
import type { EventCondition } from '../content/events.ts';
import { Rng } from './rng.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

function opened(seed = 4): Run {
  return dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
}

// Run until a Convocation puts something on the table, holding the beat
// unanswered when it does. The terms are aimed at a college with some
// history, so the first offer is years in, not weeks.
function untilOffered(seed: number): Run {
  let run = opened(seed);
  for (let y = 0; y < 40 && run.state.ambitions.offered === null; y++) {
    run = tickRunWeeks(run, WEEKS_PER_YEAR, (s) =>
      s.ambitions.offered === null ? defaultResolution(s) : null,
    );
  }
  return run;
}

function years(n: number, seed = 4): Run {
  return tickRunWeeks(opened(seed), WEEKS_PER_YEAR * n, defaultResolution);
}

// Hold `id` as a live promise due in `dueIn` years, without waiting for a
// Convocation to deal it.
function holding(state: GameState, id: string, dueIn: number): GameState {
  const active: ActiveAmbition = {
    ambitionId: id,
    acceptedYear: state.clock.year,
    dueYear: state.clock.year + dueIn,
  };
  return { ...state, ambitions: { ...state.ambitions, active: [active] } };
}

describe('the pool is twelve promises worth making (DD §10.2)', () => {
  it('seeds a twelfth of the 1.0 pool, each with terms and a date', () => {
    expect(AMBITIONS.length).toBeGreaterThanOrEqual(12);
    for (const def of AMBITIONS) {
      expect(Object.keys(def.goal).length).toBeGreaterThan(0);
      expect(def.years).toBeGreaterThanOrEqual(2);
      expect(Object.keys(def.reward).length).toBeGreaterThan(0);
      expect(Object.keys(def.penalty).length).toBeGreaterThan(0);
      expect(def.kept).not.toBe(def.missed);
      expect(def.title.length).toBeGreaterThan(8);
    }
  });

  it('never asks for something the college already has', () => {
    // The loader refuses a goal the terms already meet; this is the same
    // claim from the other end, on the dealing.
    const run = years(12);
    for (const def of dealable(run.state)) {
      expect(conditionsOf(run.state, def.deal)).toBe(true);
      expect(goalMet(run.state, def)).toBe(false);
    }
  });

  it('costs board confidence to miss and pays it to keep', () => {
    // Every one of them moves the board, because the board is who the
    // promise was made to (DD §10.2).
    for (const def of AMBITIONS) {
      expect(def.reward.confidence ?? 0).toBeGreaterThan(0);
      expect(def.penalty.confidence ?? 0).toBeLessThan(0);
    }
  });
});

describe('the offer is made at Convocation and answered there (DD §3.3)', () => {
  it('puts one on the table, and the beat carries the answer', () => {
    // Walk to a Convocation that dealt something.
    const run = untilOffered(4);
    expect(run.state.ambitions.offered).not.toBeNull();
    expect(run.state.pendingBeat).toBe('convocation');
    const offered = run.state.ambitions.offered!;
    expect(entriesOfKind(run.state, 'ambitionOffered').at(-1)?.ambitionId).toBe(offered);

    const accepted = dispatch(run, {
      type: 'resolveBeat',
      beatId: 'convocation',
      acceptAmbition: true,
    });
    expect(accepted.state.ambitions.offered).toBeNull();
    expect(accepted.state.ambitions.active).toHaveLength(1);
    const held = accepted.state.ambitions.active[0]!;
    expect(held.ambitionId).toBe(offered);
    expect(held.dueYear).toBe(held.acceptedYear + ambitionById(offered).years);
    expect(entriesOfKind(accepted.state, 'ambitionAccepted')).toHaveLength(1);
  });

  it('declining is free, and is what happens if nobody says otherwise', () => {
    const run = untilOffered(11);
    expect(run.state.ambitions.offered).not.toBeNull();
    const before = run.state.distress.confidence;
    // defaultResolution answers the beat without an opinion, which is a
    // decline — the whole temptation is that saying no costs nothing.
    const declined = tickRunWeeks(run, 1, defaultResolution);
    expect(declined.state.ambitions.offered).toBeNull();
    expect(declined.state.ambitions.active).toEqual([]);
    expect(declined.state.distress.confidence).toBe(before);
    expect(entriesOfKind(declined.state, 'ambitionDeclined')).toHaveLength(1);
  });

  it('holds three at most, and says so', () => {
    const run = years(14);
    const three = AMBITIONS.slice(0, AMBITION_CAP).map((def) => ({
      ambitionId: def.id,
      acceptedYear: run.state.clock.year,
      dueYear: run.state.clock.year + def.years,
    }));
    const full: GameState = {
      ...run.state,
      ambitions: { ...run.state.ambitions, active: three, offered: AMBITIONS[5]!.id },
    };
    expect(atCap(full)).toBe(true);
    expect(activeAmbitions(full)).toHaveLength(AMBITION_CAP);
    // Accepting a fourth is refused, and refusing it takes it off the table
    // rather than leaving it stuck there.
    const answered = answerAmbition(full, true);
    expect(answered.ambitions.active).toHaveLength(AMBITION_CAP);
    expect(answered.ambitions.offered).toBeNull();
    expect(AMBITION_WORDS.capReached.length).toBeGreaterThan(0);
  });

  it('never deals one it is already holding or has already settled', () => {
    const run = years(16);
    const def = AMBITIONS[0]!;
    const held = holding(run.state, def.id, 5);
    expect(dealable(held).map((a) => a.id)).not.toContain(def.id);
    const done: GameState = {
      ...run.state,
      ambitions: {
        ...run.state.ambitions,
        settled: [{ ambitionId: def.id, year: 9, kept: false }],
      },
    };
    expect(dealable(done).map((a) => a.id)).not.toContain(def.id);
  });
});

describe('the date arrives whatever has happened (DD §10.2)', () => {
  it('pays for a promise kept and charges for one missed', () => {
    const run = years(14);
    const def = ambitionById('thousand-students');
    // Two colleges, one of which reaches the number.
    const short = holding(run.state, def.id, 0);
    const reached: GameState = {
      ...short,
      people: {
        ...short.people,
        cohorts: short.people.cohorts.map((c) => ({ ...c, size: 2000 })),
      },
    };
    expect(goalMet(short, def)).toBe(false);
    expect(goalMet(reached, def)).toBe(true);

    const missedRun = tickRunWeeks({ ...run, state: short }, WEEKS_PER_YEAR + 2, defaultResolution);
    const keptRun = tickRunWeeks({ ...run, state: reached }, WEEKS_PER_YEAR + 2, defaultResolution);
    const settledOf = (s: GameState) => s.ambitions.settled.find((a) => a.ambitionId === def.id);
    expect(settledOf(missedRun.state)?.kept).toBe(false);
    expect(settledOf(keptRun.state)?.kept).toBe(true);
    // The board hears about both, in opposite directions.
    expect(keptRun.state.distress.confidence).toBeGreaterThan(missedRun.state.distress.confidence);
    // And it comes off the docket either way.
    expect(missedRun.state.ambitions.active).toEqual([]);
    expect(keptRun.state.ambitions.active).toEqual([]);
  });

  it('reads out in the journal, warmly or otherwise', () => {
    const run = years(14);
    const def = ambitionById('sound-estate');
    const due = holding(run.state, def.id, 0);
    const after = tickRunWeeks({ ...run, state: due }, WEEKS_PER_YEAR + 2, defaultResolution);
    const entry = entriesOfKind(after.state, 'ambitionSettled').at(-1)!;
    const said = describeEntry(entry, after.state);
    expect(said.text).toBe(entry.kept ? def.kept : def.missed);
    expect(said.tone).toBe(entry.kept ? 'good' : 'bad');
  });

  it('counts down in years the player can see', () => {
    const run = years(10);
    const held = holding(run.state, 'debt-free', 6);
    expect(yearsLeft(held, held.ambitions.active[0]!)).toBe(6);
    const later = { ...held, clock: { ...held.clock, year: held.clock.year + 5 } };
    expect(yearsLeft(later, later.ambitions.active[0]!)).toBe(1);
  });
});

describe('the docket is part of the run', () => {
  it('replays exactly, promises and all', () => {
    const run = years(24, 7);
    const again = replay(run.state.seed, run.log, run.state.clock.absoluteWeek);
    expect(again.ambitions).toEqual(run.state.ambitions);
    expect(again.distress.confidence).toBe(run.state.distress.confidence);
  });

  it('survives a save, mid-promise', () => {
    let run = years(18, 13);
    run = { ...run, state: holding(run.state, 'great-faculty', 4) };
    const file = JSON.parse(JSON.stringify(serializeRun(run))) as unknown;
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.state.ambitions).toEqual(run.state.ambitions);
  });

  it('gives an older save an empty docket', () => {
    const run = years(6);
    const file = JSON.parse(JSON.stringify(serializeRun(run))) as Record<string, unknown>;
    const state = file.state as Record<string, unknown>;
    file.version = 16;
    state.schemaVersion = 16;
    delete state.ambitions;
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.save.state.ambitions).toEqual(foundingAmbitions());
  });

  it('refuses an answer when nothing is on the table', () => {
    const run = years(8);
    expect(answerAmbition(run.state, true)).toBe(run.state);
    // And the beat still resolves cleanly with the field set to nothing.
    expect(
      canApply(run.state, { type: 'resolveBeat', beatId: run.state.pendingBeat ?? 'convocation' }),
    ).toMatchObject({ ok: run.state.pendingBeat !== null });
  });

  it('picks from the pool by weight, and from an empty pool picks nothing', () => {
    expect(pickAmbition(Rng.fromSeed(3), [])).toBeNull();
    const one = AMBITIONS.slice(0, 1);
    expect(pickAmbition(Rng.fromSeed(3), one)).toBe(one[0]);
  });
});

describe('nothing in the pool is unreachable (the Phase 18 discipline)', () => {
  it('every ambition can be offered, and every goal can be met', { timeout: 60_000 }, () => {
    // An ambition whose terms never hold is never dealt; one whose goal is
    // out of reach is not a temptation but a trap. Neither is malformed
    // data, so only a run can tell — the same guard the catalogue has, on
    // the same scripted colleges (colleges.ts).
    const dealt = new Set<string>();
    const met = new Set<string>();
    const range = new Map<EventCondition, { min: number; max: number }>();
    const named = [
      ...new Set(AMBITIONS.flatMap((a) => [...Object.keys(a.deal), ...Object.keys(a.goal)])),
    ] as EventCondition[];
    const sample = (s: GameState) => {
      for (const def of AMBITIONS) {
        if (conditionsOf(s, def.deal)) dealt.add(def.id);
        if (conditionsOf(s, def.goal)) met.add(def.id);
      }
      for (const name of named) {
        const v = Number(readingOf(s, name).toFixed(2));
        const seen = range.get(name);
        range.set(
          name,
          seen ? { min: Math.min(seen.min, v), max: Math.max(seen.max, v) } : { min: v, max: v },
        );
      }
    };
    const watch = (r: Run) => {
      sample(r.state);
      return r;
    };
    played(4, 50, watch, { drawRate: 0.06, tuition: 62_000, selectivity: 0.7 });
    played(21, 50, watch, { maintenanceFunding: 0, drawRate: 0.08, selectivity: 0.3, hireCap: 3 });
    played(13, 50, watch, { tuition: 8_000, drawRate: 0.02 });
    played(31, 50, watch, { selectivity: 0.85, tuition: 70_000 });

    const why = (def: (typeof AMBITIONS)[number], clauses: Record<string, number | undefined>) =>
      Object.entries(clauses)
        .map(([name, want]) => {
          const r = range.get(name as EventCondition);
          return `${name} wants ${want}, saw ${r ? `${r.min} .. ${r.max}` : 'nothing'}`;
        })
        .join('; ') + ` (${def.id})`;
    expect(AMBITIONS.filter((a) => !dealt.has(a.id)).map((a) => why(a, a.deal))).toEqual([]);
    expect(AMBITIONS.filter((a) => !met.has(a.id)).map((a) => why(a, a.goal))).toEqual([]);
  });
});

describe('overreach, over fifty years (the phase’s done-when)', () => {
  it('a college that says yes to everything is asked to pay for it', () => {
    // Accept every offer; the promises are aimed at what the college has
    // NOT done, so a passive run misses most of them and the board says so.
    const sayYes = (s: GameState): ReturnType<typeof defaultResolution> =>
      s.pendingBeat === 'convocation' && s.ambitions.offered !== null
        ? { type: 'resolveBeat', beatId: 'convocation', acceptAmbition: true }
        : defaultResolution(s);
    // The bill is paid the week the date arrives, so that is where to look
    // for it: over fifty years a solvent college climbs back to the same
    // ceiling either way, and the closing figure says nothing.
    let run = opened(4);
    let charged = 0;
    for (let w = 0; w < WEEKS_PER_YEAR * 50; w++) {
      const before = run.state.distress.confidence;
      const settledBefore = run.state.ambitions.settled.length;
      run = tickRunWeeks(run, 1, sayYes);
      const landed = run.state.ambitions.settled.slice(settledBefore);
      for (const done of landed) {
        if (done.kept) continue;
        expect(run.state.distress.confidence).toBeLessThan(before);
        charged++;
      }
    }
    const cautious = tickRunWeeks(opened(4), WEEKS_PER_YEAR * 50, defaultResolution);

    expect(run.state.ambitions.settled.length).toBeGreaterThanOrEqual(2);
    expect(cautious.state.ambitions.settled).toEqual([]);
    // Something was promised, missed, and paid for; declining cost nothing.
    expect(charged).toBeGreaterThan(0);
    expect(run.state.ambitions.active.length).toBeLessThanOrEqual(AMBITION_CAP);
  });
});
