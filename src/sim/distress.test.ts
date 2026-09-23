import { describe, expect, it } from 'vitest';
import { letterById, rungWords } from '../content/board.ts';
import { describeEntry } from '../content/busLines.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  AID_CUT_STEP,
  AID_DISCOUNT_RATE,
  BOARD_CONFIDENCE_START,
  BOARD_POLICY_DRAW,
  BOARD_POLICY_MAINTENANCE,
  RECEIVERSHIP_TERMS,
} from '../tuning.ts';
import { canApply } from './actions.ts';
import { clockHeld, defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import {
  applyCut,
  availableCuts,
  closeTerm,
  cutAvailable,
  frozen,
  inAusterity,
  inReceivership,
  reservesTight,
  RUNG_AUSTERITY,
  RUNG_DEFICIT,
  RUNG_FREEZE,
  RUNG_RECEIVERSHIP,
  RUNG_SOUND,
  RUNG_TIGHT,
  termExpenses,
} from './distress.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import type { GameState } from './state.ts';

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

// A deliberately mismanaged school: the founding gift spent on halls, the
// board's line borrowed to its cap, a sticker nobody will pay, and the
// draw at its minimum, so the debt service eats what little comes in.
function mismanaged(seed = 4): Run {
  let run = opened(seed);
  const place = (buildingId: string, col: number, row: number, financing?: 'cash' | 'debt') =>
    dispatch(run, { type: 'placeBuilding', buildingId, col, row, rotated: false, financing });
  run = place('library', 2, 2);
  run = place('library', 12, 2);
  run = place('residence-hall', 2, 10, 'debt');
  run = place('residence-hall', 12, 10, 'debt');
  run = place('dining-hall', 24, 10, 'debt');
  expect(run.state.treasury.cash).toBeLessThan(5_000_000);
  expect(run.state.treasury.debt).toBe(20_000_000);
  return run;
}

// Resolve beats with the ruinous terms and read every letter.
const ruinous = (state: GameState) => {
  const d = defaultResolution(state);
  if (d?.type === 'resolveBeat' && d.beatId === 'admissions-day')
    return { ...d, tuition: 90_000, selectivity: 1 };
  if (d?.type === 'resolveBeat' && d.beatId === 'budget-and-hiring')
    return { ...d, drawRate: 0.03, maintenanceFunding: 1 };
  return d;
};

function rungsSeen(run: Run): number[] {
  return entriesOfKind(run.state, 'rungChanged').map((e) => e.to);
}

describe('the ladder (DD §5.5)', () => {
  it('starts sound, with the board confident', () => {
    const s = opened().state;
    expect(s.distress.rung).toBe(RUNG_SOUND);
    expect(s.distress.confidence).toBe(BOARD_CONFIDENCE_START);
    expect(reservesTight(s)).toBe(false);
    expect(termExpenses(s)).toBeGreaterThan(0);
  });

  it('closes a term at each term turn and journals it', () => {
    const run = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution);
    const closed = entriesOfKind(run.state, 'termClosed');
    expect(closed.map((e) => `${e.year}:${e.term}`)).toEqual(['1:fall', '1:spring', '1:summer']);
    expect(run.state.distress.terms).toHaveLength(3);
    expect(describeEntry(closed[0]!, run.state).text).toMatch(/^Fall Term closes/);
  });

  it('rides the ladder down: tight, deficit, freeze, austerity, receivership', () => {
    let run = mismanaged();
    const seen: number[] = [];
    for (let year = 0; year < 6; year++) {
      run = tickRunWeeks(run, WEEKS_PER_YEAR, ruinous);
      seen.push(run.state.distress.rung);
    }
    expect(rungsSeen(run)).toEqual([
      RUNG_TIGHT,
      RUNG_DEFICIT,
      RUNG_FREEZE,
      RUNG_AUSTERITY,
      RUNG_RECEIVERSHIP,
    ]);
    expect(run.state.distress.rung).toBe(RUNG_RECEIVERSHIP);
    expect(run.state.distress.scars).toHaveLength(1);
    expect(run.state.distress.confidence).toBeLessThan(BOARD_CONFIDENCE_START - 20);
    // A letter at every rung entered.
    const letters = entriesOfKind(run.state, 'boardLetter').map((e) => e.letter);
    expect(letters).toEqual(['enter-1', 'enter-2', 'enter-3', 'enter-4', 'enter-5']);
    for (const l of letters) expect(letterById(l).body.length).toBeGreaterThan(0);
    // The college is still here, and the CFO's policy is already pulling
    // the books back.
    expect(run.state.phase).toBe('running');
    expect(Number.isFinite(run.state.treasury.cash)).toBe(true);
    expect(run.state.distress.terms.some((t) => t.net < 0)).toBe(true);
  });

  it('a letter holds the clock until it is read', () => {
    let run = mismanaged();
    // Run until the first letter is queued.
    for (let i = 0; i < WEEKS_PER_YEAR * 3 && run.state.distress.pendingLetter === null; i++) {
      const before = run;
      run = tickRunWeeks(run, 1);
      if (run === before) run = dispatch(run, ruinous(run.state)!);
    }
    expect(run.state.distress.pendingLetter).toBe('enter-1');
    expect(clockHeld(run.state)).toBe(true);
    expect(tickRunWeeks(run, 1)).toBe(run);
    expect(defaultResolution(run.state)).toEqual({ type: 'readLetter' });
    run = dispatch(run, { type: 'readLetter' });
    expect(run.state.distress.pendingLetter).toBeNull();
    expect(canApply(run.state, { type: 'readLetter' })).toMatchObject({ ok: false });
  });

  it('the freeze bans construction and the CFO does not borrow', () => {
    let run = mismanaged();
    for (let year = 0; year < 3 && !frozen(run.state); year++) {
      run = tickRunWeeks(run, WEEKS_PER_YEAR, ruinous);
    }
    expect(frozen(run.state)).toBe(true);
    const cashy = {
      ...run,
      state: { ...run.state, treasury: { ...run.state.treasury, cash: 50_000_000 } },
    };
    const lab = {
      type: 'placeBuilding',
      buildingId: 'lab',
      col: 40,
      row: 40,
      rotated: false,
    } as const;
    expect(canApply(cashy.state, lab)).toMatchObject({ ok: false, reason: /frozen/ });
    for (let year = 0; year < 3 && !inReceivership(run.state); year++) {
      run = tickRunWeeks(run, WEEKS_PER_YEAR, ruinous);
    }
    expect(inReceivership(run.state)).toBe(true);
    const rich = {
      ...run,
      state: { ...run.state, treasury: { ...run.state.treasury, cash: 50_000_000 } },
    };
    expect(canApply(rich.state, lab)).toMatchObject({ ok: true });
    expect(canApply(rich.state, { ...lab, financing: 'debt' })).toMatchObject({
      ok: false,
      reason: /not borrowing/,
    });
  });

  it('austerity imposes cuts, and the CFO locks the budget to board policy', () => {
    let run = mismanaged();
    for (let year = 0; year < 4 && !inAusterity(run.state); year++) {
      run = tickRunWeeks(run, WEEKS_PER_YEAR, ruinous);
    }
    expect(inAusterity(run.state)).toBe(true);
    // The next Board Meeting, in the twelfth week of fall, imposes the cuts.
    run = tickRunWeeks(run, 12, ruinous);
    const cuts = entriesOfKind(run.state, 'cutsImposed');
    expect(cuts.length).toBeGreaterThan(0);
    expect(describeEntry(cuts[0]!, run.state).text).toMatch(/board's cuts/);
    expect(run.state.distress.cutsTaken.length).toBeGreaterThan(0);
    // The board's default is the first on its list: aid.
    expect(run.state.people.aidRate).toBeCloseTo(AID_DISCOUNT_RATE - AID_CUT_STEP, 4);
    expect(availableCuts(run.state)).toContain('deferMaintenance');
    for (let year = 0; year < 3 && !inReceivership(run.state); year++) {
      run = tickRunWeeks(run, WEEKS_PER_YEAR, ruinous);
    }
    // The next budget approved under the CFO is board policy, whatever
    // the administration asks for.
    const defiant = (s: GameState) => {
      const d = ruinous(s);
      if (d?.type === 'resolveBeat' && d.beatId === 'budget-and-hiring')
        return { ...d, drawRate: 0.03, maintenanceFunding: 1 };
      return d;
    };
    for (let w = 0; w < WEEKS_PER_YEAR && run.state.treasury.pendingBudget === null; w++) {
      run = tickRunWeeks(run, 1, defiant);
    }
    const approved = run.state.treasury.pendingBudget!;
    expect(approved.drawRate).toBe(BOARD_POLICY_DRAW);
    expect(approved.maintenanceFunding).toBe(BOARD_POLICY_MAINTENANCE);
  });

  it('climbs back without dying', () => {
    let run = mismanaged();
    for (let year = 0; year < 6; year++) run = tickRunWeeks(run, WEEKS_PER_YEAR, ruinous);
    expect(run.state.distress.rung).toBe(RUNG_RECEIVERSHIP);
    const scarredAt = run.state.distress.scars[0]!;
    // The administration sees sense: a sticker people will pay.
    const sensible = (s: GameState) => {
      const d = defaultResolution(s);
      if (d?.type === 'resolveBeat' && d.beatId === 'admissions-day')
        return { ...d, tuition: 40_000, selectivity: 0.3 };
      return d;
    };
    for (let year = 0; year < 8; year++) run = tickRunWeeks(run, WEEKS_PER_YEAR, sensible);
    expect(run.state.distress.rung).toBe(RUNG_SOUND);
    expect(run.state.treasury.cash).toBeGreaterThan(0);
    const path = rungsSeen(run);
    expect(path.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(path.at(-1)).toBe(RUNG_SOUND);
    const letters = entriesOfKind(run.state, 'boardLetter').map((e) => e.letter);
    // The CFO's departure is the last letter when she leaves the college
    // sound; the recovery letter is for a climb that ends without her.
    expect(letters.at(-1)).toBe('exit-5');
    expect(run.state.distress.scars).toEqual([scarredAt]);
    expect(run.state.distress.receivershipTermsLeft).toBe(0);
    // The CFO's term was the fixed nine terms.
    const inRec = entriesOfKind(run.state, 'termClosed').length;
    expect(inRec).toBeGreaterThan(RECEIVERSHIP_TERMS);
    expect(rungWords(RUNG_SOUND).name).toBe('Sound');
  });

  it('writes the recovery letter when a deficit school climbs back to sound', () => {
    const base = tickRunWeeks(opened(), WEEKS_PER_YEAR, defaultResolution).state;
    const inDeficit: GameState = {
      ...base,
      distress: { ...base.distress, rung: RUNG_DEFICIT, deficitRun: 3, surplusRun: 1 },
    };
    // One more surplus term with cash in hand: back to sound, with the letter.
    const closed = closeTerm(
      {
        ...inDeficit,
        distress: {
          ...inDeficit.distress,
          term: {
            ...inDeficit.distress.term,
            revenue: { ...inDeficit.distress.term.revenue, tuition: 5_000_000 },
          },
        },
      },
      base.clock.year,
      'spring',
    );
    expect(closed.distress.rung).toBe(RUNG_SOUND);
    expect(closed.distress.pendingLetter).toBe('recovered');
    expect(entriesOfKind(closed, 'rungChanged').at(-1)).toMatchObject({ from: 2, to: 0 });
  });

  it('a sound school stays sound for a decade', () => {
    let run = opened(9);
    run = dispatch(run, {
      type: 'placeBuilding',
      buildingId: 'residence-hall',
      col: 2,
      row: 2,
      rotated: false,
    });
    run = tickRunWeeks(run, WEEKS_PER_YEAR * 10, defaultResolution);
    expect(rungsSeen(run)).toEqual([]);
    expect(run.state.distress.confidence).toBeGreaterThan(BOARD_CONFIDENCE_START);
    expect(entriesOfKind(run.state, 'boardLetter')).toEqual([]);
  });

  it('replays identically, letters and cuts included', () => {
    let run = mismanaged(77);
    for (let year = 0; year < 5; year++) run = tickRunWeeks(run, WEEKS_PER_YEAR, ruinous);
    expect(replay(77, run.log, run.state.clock.absoluteWeek)).toEqual(run.state);
  });
});

describe('save migration v7 → v8', () => {
  it('starts an old run sound with the default aid when the replay disagrees', () => {
    const run = tickRunWeeks(opened(12), 40, defaultResolution);
    const file = JSON.parse(JSON.stringify(serializeRun(run)));
    file.version = 7;
    file.state.schemaVersion = 7;
    delete file.state.distress;
    delete file.state.people.aidRate;
    file.state.campus.placements.push({
      id: 'p9',
      buildingId: 'lab',
      col: 40,
      row: 40,
      w: 5,
      h: 3,
      status: 'open',
      completesWeek: null,
      openedWeek: 0,
      backlog: 0,
      condition: 1,
    });
    const result = loadSaveFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state.distress.rung).toBe(RUNG_SOUND);
    expect(result.save.state.people.aidRate).toBe(AID_DISCOUNT_RATE);
    expect(result.save.state.campus.placements).toHaveLength(2);
  });
});

describe('restructuring the administration (DD §5.5, Phase 21F)', () => {
  it('abolishes the newest seat, its salary with it, and costs a term of patience', () => {
    const base = opened().state;
    const seat = (seatId: string, appointedYear: number) => ({
      seatId,
      schoolId: null,
      filledBy: { kind: 'outside' as const },
      policy: 'balanced',
      salary: 200_000,
      appointedYear,
    });
    const state: GameState = {
      ...base,
      delegation: { seats: [seat('provost', 3), seat('vp-advancement', 7)] },
    };
    expect(cutAvailable(state, 'restructureAdmin')).toBe(true);
    const after = applyCut(state, 'restructureAdmin');
    expect(after.delegation.seats.map((s) => s.seatId)).toEqual(['provost']);
    expect(after.people.mood).toBeLessThan(state.people.mood);
    // Nothing to restructure is not a cut on offer.
    expect(cutAvailable({ ...base, delegation: { seats: [] } }, 'restructureAdmin')).toBe(false);
  });
});
