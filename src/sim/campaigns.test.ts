import { describe, expect, it } from 'vitest';
import { MEMORY_CLAUSES } from '../content/alumni.ts';
import { buildingById } from '../content/buildings.ts';
import { describeEntry } from '../content/busLines.ts';
import { CAMPAIGNS, campaignById } from '../content/campaigns.ts';
import { seatById } from '../content/seats.ts';
import { CAMPAIGN_RESONANCE_PULL } from '../tuning.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import {
  advancementAppointed,
  classResponse,
  foundingAdvancement,
  launchable,
  resonanceOf,
  respondingClasses,
  restrictedFor,
  yearlyResponse,
} from './campaigns.ts';
import { played } from './colleges.ts';
import { canPay } from './estate.ts';
import { conditionsOf } from './events.ts';
import { dispatch, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import type { Seat } from './seats.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';

function withVp(state: GameState): GameState {
  const seat: Seat = {
    seatId: 'advancement',
    schoolId: null,
    filledBy: { kind: 'outside' },
    policy: seatById('advancement').defaultPolicy,
    salary: seatById('advancement').outsideSalary,
    appointedYear: state.clock.year,
  };
  return { ...state, delegation: { seats: [...state.delegation.seats, seat] } };
}

// A college old enough to have a ledger worth asking.
function withLedger(years = 40): Run {
  return played(4, years, undefined, { drawRate: 0.05, tuition: 55_000 });
}

describe('the cases for support (DD §9.3)', () => {
  it('each names a real memory clause to resonate with', () => {
    const ids = new Set(MEMORY_CLAUSES.map((c) => c.id));
    expect(CAMPAIGNS.length).toBeGreaterThanOrEqual(6);
    for (const def of CAMPAIGNS) {
      expect(def.resonates.length).toBeGreaterThan(0);
      for (const clause of def.resonates) expect(ids).toContain(clause);
      expect(def.target).toBeGreaterThan(0);
      expect(def.years).toBeGreaterThanOrEqual(2);
      expect(def.kept).not.toBe(def.missed);
    }
  });

  it('covers all three restricted kinds', () => {
    const kinds = new Set(CAMPAIGNS.map((c) => c.kind));
    expect([...kinds].sort()).toEqual(['aid', 'building', 'endowment']);
  });

  it('can each be earned by some college', () => {
    // The Phase 18/19 discipline: terms nothing reaches are a case for
    // support nobody is ever shown.
    const reached = new Set<string>();
    const watch = (r: Run) => {
      for (const def of CAMPAIGNS) if (conditionsOf(r.state, def.when)) reached.add(def.id);
      return r;
    };
    played(4, 50, watch, { drawRate: 0.06, tuition: 62_000 });
    played(21, 50, watch, { maintenanceFunding: 0, drawRate: 0.08, selectivity: 0.3, hireCap: 3 });
    played(13, 50, watch, { tuition: 8_000, drawRate: 0.02 });
    expect(CAMPAIGNS.filter((c) => !reached.has(c.id)).map((c) => c.id)).toEqual([]);
  });
});

describe('the ledger answers, class by class (DD §8.4, §9.3)', () => {
  it('gives more when the case for support is about them', () => {
    const run = withLedger();
    const def = campaignById('new-residence');
    const alumni = run.state.people.alumni;
    expect(alumni.length).toBeGreaterThan(4);
    const crowded = { ...alumni[0]!, memory: ['overcrowded'], warmth: 50, quality: 60, size: 100 };
    const untouched = { ...crowded, memory: ['quiet'] };
    expect(resonanceOf(crowded, def)).toBeCloseTo(1 + CAMPAIGN_RESONANCE_PULL, 5);
    expect(resonanceOf(untouched, def)).toBe(1);
    const year = run.state.clock.year;
    expect(classResponse(crowded, def, year)).toBeGreaterThan(classResponse(untouched, def, year));
  });

  it('gives nothing when the ledger is cold, however good the case', () => {
    const run = withLedger();
    const def = campaignById('new-residence');
    const cold = { ...run.state.people.alumni[0]!, memory: ['overcrowded'], warmth: 0 };
    expect(classResponse(cold, def, run.state.clock.year)).toBe(0);
  });

  it('names who is answering, loudest first', () => {
    const run = withLedger();
    const def = CAMPAIGNS.find((c) => conditionsOf(run.state, c.when)) ?? CAMPAIGNS[0]!;
    const rows = respondingClasses(run.state, def);
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.gives).toBeGreaterThanOrEqual(rows[i]!.gives);
    }
    expect(yearlyResponse(run.state, def)).toBe(rows.reduce((t, r) => t + r.gives, 0));
  });
});

describe('a campaign needs the office that runs it (DD §9.3)', () => {
  it('offers nothing without a VP of Advancement', () => {
    const run = withLedger();
    expect(advancementAppointed(run.state)).toBe(false);
    expect(launchable(run.state)).toEqual([]);
    const staffed = withVp(run.state);
    expect(advancementAppointed(staffed)).toBe(true);
    expect(launchable(staffed).length).toBeGreaterThan(0);
  });

  it('runs one at a time, and never the same one twice', () => {
    const run = withLedger();
    const staffed = { ...run, state: withVp(run.state) };
    const first = launchable(staffed.state)[0]!;
    const going = dispatch(staffed, { type: 'launchCampaign', campaignId: first.id });
    expect(going.state.advancement.running?.campaignId).toBe(first.id);
    expect(launchable(going.state)).toEqual([]);
    const other = CAMPAIGNS.find((c) => c.id !== first.id)!;
    expect(canApply(going.state, { type: 'launchCampaign', campaignId: other.id })).toMatchObject({
      ok: false,
      reason: /already running/,
    });
    const done: GameState = {
      ...staffed.state,
      advancement: {
        ...staffed.state.advancement,
        closed: [{ campaignId: first.id, year: 30, raised: 1, met: true }],
      },
    };
    expect(canApply(done, { type: 'launchCampaign', campaignId: first.id })).toMatchObject({
      ok: false,
      reason: /has been run/,
    });
  });
});

describe('the drive, and what it leaves behind', () => {
  it('raises week by week, closes at its date, and restricts what it raised', () => {
    const run = withLedger();
    const staffed = { ...run, state: withVp(run.state) };
    const def = launchable(staffed.state).find((c) => c.kind === 'building')!;
    let going = dispatch(staffed, { type: 'launchCampaign', campaignId: def.id });
    expect(entriesOfKind(going.state, 'campaignLaunched')).toHaveLength(1);

    going = tickRunWeeks(going, WEEKS_PER_YEAR, defaultResolution);
    const afterYear = going.state.advancement.running!;
    expect(afterYear.raised).toBeGreaterThan(0);

    const closedRun = tickRunWeeks(going, WEEKS_PER_YEAR * (def.years + 1), defaultResolution);
    expect(closedRun.state.advancement.running).toBeNull();
    const closed = closedRun.state.advancement.closed.find((c) => c.campaignId === def.id)!;
    expect(closed.raised).toBeGreaterThan(afterYear.raised);
    // Building money is restricted: it is not in cash, and it is not free.
    expect(restrictedFor(closedRun.state, 'building')).toBe(closed.raised);
    const said = describeEntry(
      entriesOfKind(closedRun.state, 'campaignClosed').at(-1)!,
      closedRun.state,
    );
    expect(said.text).toBe(closed.met ? def.kept : def.missed);
    expect(said.tone).toBe(closed.met ? 'good' : 'bad');
  });

  it('puts an endowment campaign straight into the fund', () => {
    const run = withLedger();
    const staffed = withVp(run.state);
    const def = CAMPAIGNS.find((c) => c.kind === 'endowment')!;
    const primed: GameState = {
      ...staffed,
      advancement: {
        ...staffed.advancement,
        running: {
          campaignId: def.id,
          startedYear: staffed.clock.year - def.years,
          dueYear: staffed.clock.year,
          raised: 4_000_000,
        },
      },
    };
    const after = tickRunWeeks({ ...run, state: primed }, 2, defaultResolution);
    expect(after.state.advancement.running).toBeNull();
    expect(after.state.treasury.endowment).toBeGreaterThan(staffed.treasury.endowment);
    expect(restrictedFor(after.state, 'endowment')).toBe(0);
  });

  it('cools the classes it asks, which is what stops it being free', () => {
    const run = withLedger();
    const staffed = { ...run, state: withVp(run.state) };
    // A case some class remembers: the first on the list need not be one.
    const def = launchable(staffed.state).find((d) =>
      staffed.state.people.alumni.some((a) => resonanceOf(a, d) > 1),
    )!;
    const asked = new Set(
      staffed.state.people.alumni.filter((a) => resonanceOf(a, def) > 1).map((a) => a.classYear),
    );
    expect(asked.size).toBeGreaterThan(0);
    // Against a control, not against the past: the same three years warm
    // and cool the ledger for a dozen other reasons.
    const asking = tickRunWeeks(
      dispatch(staffed, { type: 'launchCampaign', campaignId: def.id }),
      WEEKS_PER_YEAR * 3,
      defaultResolution,
    );
    const quiet = tickRunWeeks(staffed, WEEKS_PER_YEAR * 3, defaultResolution);
    const warmthIn = (r: Run) => new Map(r.state.people.alumni.map((a) => [a.classYear, a.warmth]));
    const warmed = warmthIn(asking);
    const control = warmthIn(quiet);
    let cooled = 0;
    for (const [classYear, warmth] of warmed) {
      if (!asked.has(classYear)) continue;
      const alone = control.get(classYear);
      if (alone === undefined) continue;
      expect(warmth).toBeLessThan(alone);
      cooled++;
    }
    expect(cooled).toBeGreaterThan(0);
  });
});

describe('restricted money builds the thing it was raised for (DD §5.1)', () => {
  it('pays for a building and can pay for nothing else', () => {
    const run = withLedger();
    const hall = buildingById('residence-hall');
    const funded: GameState = {
      ...run.state,
      treasury: { ...run.state.treasury, cash: 0 },
      advancement: {
        ...run.state.advancement,
        restricted: { building: hall.cost + 1_000_000, endowment: 0, aid: 0 },
      },
    };
    // No cash at all, and the hall is still affordable — from the gift.
    expect(canPay(funded, hall.cost, 'cash')).toBe(false);
    expect(canPay(funded, hall.cost, 'gift')).toBe(true);
    // Somewhere the ground will actually take it.
    let built = { ...run, state: funded };
    for (let col = 2; col < 56 && built.state === funded; col += 6) {
      for (let row = 2; row < 56 && built.state === funded; row += 6) {
        built = dispatch(built, {
          type: 'placeBuilding',
          buildingId: 'residence-hall',
          col,
          row,
          rotated: false,
          financing: 'gift',
        });
      }
    }
    expect(built.state.campus.placements.length).toBe(funded.campus.placements.length + 1);
    expect(built.state.treasury.cash).toBe(0);
    expect(restrictedFor(built.state, 'building')).toBe(1_000_000);

    // Aid money will not build anything.
    const aidOnly: GameState = {
      ...funded,
      advancement: {
        ...funded.advancement,
        restricted: { building: 0, endowment: 0, aid: 20_000_000 },
      },
    };
    expect(canPay(aidOnly, hall.cost, 'gift')).toBe(false);
  });
});

describe('the docket survives the run', () => {
  it('replays exactly, campaigns and all', () => {
    const run = withLedger(34);
    const staffed = { ...run, state: withVp(run.state) };
    const def = launchable(staffed.state)[0]!;
    // Replay rebuilds from the log, so the VP has to be appointed by an
    // action rather than dropped into the state.
    let real = dispatch(run, {
      type: 'appointSeat',
      seatId: 'advancement',
      from: { kind: 'outside' },
    });
    real = dispatch(real, { type: 'launchCampaign', campaignId: def.id });
    real = tickRunWeeks(real, WEEKS_PER_YEAR * 5, defaultResolution);
    const again = replay(real.state.seed, real.log, real.state.clock.absoluteWeek);
    expect(again.advancement).toEqual(real.state.advancement);
  });

  it('survives a save, and gives an older one an empty office', () => {
    const run = withLedger(30);
    const file = JSON.parse(JSON.stringify(serializeRun(run))) as Record<string, unknown>;
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.state.advancement).toEqual(run.state.advancement);

    const old = JSON.parse(JSON.stringify(serializeRun(run))) as Record<string, unknown>;
    const state = old.state as Record<string, unknown>;
    old.version = 18;
    state.schemaVersion = 18;
    delete state.advancement;
    const migrated = loadSaveFile(old);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.save.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.save.state.advancement).toEqual(foundingAdvancement());
  });
});

describe('a late-game building, funded by the classes who loved you', () => {
  it('is realistic (the phase’s done-when)', () => {
    const run = withLedger(40);
    const staffed = { ...run, state: withVp(run.state) };
    const def = launchable(staffed.state).find((c) => c.kind === 'building')!;
    let going = dispatch(staffed, { type: 'launchCampaign', campaignId: def.id });
    going = tickRunWeeks(going, WEEKS_PER_YEAR * def.years + 4, defaultResolution);

    const closed = going.state.advancement.closed.find((c) => c.campaignId === def.id)!;
    // Enough, in the end, to put a real building up.
    const hall = buildingById('residence-hall');
    expect(closed.raised).toBeGreaterThan(hall.cost);
    expect(restrictedFor(going.state, 'building')).toBeGreaterThan(hall.cost);

    // And it came from the ledger, not the treasury: the classes the case
    // was about carried it.
    const rows = respondingClasses(staffed.state, def);
    const resonant = rows.filter((r) => r.resonance > 1);
    expect(resonant.length).toBeGreaterThan(0);
    const fromResonant = resonant.reduce((t, r) => t + r.gives, 0);
    const fromEveryone = rows.reduce((t, r) => t + r.gives, 0);
    expect(fromResonant / fromEveryone).toBeGreaterThan(0.25);
  });
});
