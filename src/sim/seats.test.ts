import { describe, expect, it } from 'vitest';
import { describeEntry } from '../content/busLines.ts';
import { EVENTS, eventById } from '../content/events.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { SEATS, seatById } from '../content/seats.ts';
import { DEANS_FOR_FASTEST, ESCALATION_MONEY, FOUNDING_ADMIN_PAYROLL } from '../tuning.ts';
import { canApply } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { speedAllowed } from './clock.ts';
import { played } from './colleges.ts';
import { dispatch, newRun, replay, tickRunWeeks, type Run } from './run.ts';
import { loadSaveFile, serializeRun } from './save.ts';
import {
  choiceByRule,
  deansAppointed,
  escalates,
  foundingDelegation,
  handlerFor,
  isSeated,
  moneyMoved,
  policyChoice,
  ratchetSteps,
  seatFilled,
  seatPayroll,
  seatSlots,
  seatCandidates,
  seniorFaculty,
  type Seat,
} from './seats.ts';
import { SCHEMA_VERSION, type GameState } from './state.ts';
import { adminShareOfPayroll, annualAdminPayroll } from './treasury.ts';

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

function seatOf(seatId: string, schoolId: string | null = null): Seat {
  return {
    seatId,
    schoolId,
    filledBy: { kind: 'outside' },
    policy: seatById(seatId).defaultPolicy,
    salary: seatById(seatId).outsideSalary,
    appointedYear: 1,
  };
}

function withSeats(state: GameState, seats: Seat[]): GameState {
  return { ...state, delegation: { seats } };
}

describe('the seats the college can fill (DD §9.1)', () => {
  it('names a Provost, a Dean per school, and three offices', () => {
    expect(SEATS.map((s) => s.id).sort()).toEqual(
      ['advancement', 'dean', 'dean-of-students', 'facilities', 'provost'].sort(),
    );
    expect(SEATS.filter((s) => s.perSchool).map((s) => s.id)).toEqual(['dean']);
    for (const def of SEATS) {
      expect(def.internalSalary).toBeLessThan(def.outsideSalary);
      expect(def.ratchet).toBeGreaterThan(0);
      expect(def.policies.length).toBeGreaterThanOrEqual(2);
      expect(def.policies.map((p) => p.id)).toContain(def.defaultPolicy);
    }
  });

  it('opens a Dean’s seat only once there is a school to be dean of', () => {
    const bare = opened().state;
    expect(seatSlots(bare).filter((s) => s.def.perSchool)).toEqual([]);
    const run = played(4, 20);
    const founded = run.state.academics.schools.length;
    expect(founded).toBeGreaterThan(0);
    expect(seatSlots(run.state).filter((s) => s.def.perSchool)).toHaveLength(founded);
  });

  it('covers every domain an event can land in, or deliberately does not', () => {
    // `money` and `board` have no seat: some things are the President's,
    // and that is what makes the escalation rule mean anything (DD §9.2).
    const covered = new Set(SEATS.map((s) => s.domain));
    const domains = new Set(EVENTS.map((e) => e.domain));
    expect([...domains].filter((d) => !covered.has(d)).sort()).toEqual(['board', 'money']);
  });
});

describe('what a seat costs, forever (DD §5.4, §9.4)', () => {
  it('adds permanent payroll from the week it is filled', () => {
    const run = played(4, 16);
    expect(annualAdminPayroll(run.state)).toBe(FOUNDING_ADMIN_PAYROLL);
    const staffed = withSeats(run.state, [seatOf('provost'), seatOf('facilities')]);
    expect(seatPayroll(staffed)).toBe(
      seatById('provost').outsideSalary + seatById('facilities').outsideSalary,
    );
    expect(annualAdminPayroll(staffed)).toBe(FOUNDING_ADMIN_PAYROLL + seatPayroll(staffed));
    expect(ratchetSteps(staffed)).toBeGreaterThan(0);
  });

  it('roughly doubles the administrative share when the suite is full', () => {
    // DD §9.4's own claim, measured: a college with faculty on the books
    // and every seat filled pays about twice the admin share it did bare.
    const run = played(4, 30);
    expect(run.state.faculty.roster.length).toBeGreaterThan(3);
    const bareShare = adminShareOfPayroll(run.state.treasury.budget);
    const full = withSeats(
      run.state,
      seatSlots(run.state).map(({ def, schoolId }) => seatOf(def.id, schoolId)),
    );
    const budget = {
      ...full.treasury.budget,
      expenses: { ...full.treasury.budget.expenses, adminPayroll: annualAdminPayroll(full) },
    };
    const fullShare = adminShareOfPayroll(budget);
    expect(fullShare).toBeGreaterThan(bareShare * 1.5);
    expect(fullShare).toBeGreaterThan(bareShare);
  });

  it('charges a year up front and refuses what cannot be paid for', () => {
    const run = played(4, 16);
    const def = seatById('facilities');
    const before = run.state.treasury.cash;
    const appointed = dispatch(run, {
      type: 'appointSeat',
      seatId: 'facilities',
      from: { kind: 'outside' },
    });
    expect(appointed.state.treasury.cash).toBe(before - def.outsideSalary);
    expect(seatFilled(appointed.state, 'facilities', null)).toBe(true);
    // And not twice.
    expect(
      canApply(appointed.state, {
        type: 'appointSeat',
        seatId: 'facilities',
        from: { kind: 'outside' },
      }),
    ).toMatchObject({ ok: false, reason: /filled/ });
    const broke = { ...run.state, treasury: { ...run.state.treasury, cash: 1000 } };
    expect(
      canApply(broke, { type: 'appointSeat', seatId: 'provost', from: { kind: 'outside' } }),
    ).toMatchObject({ ok: false, reason: /cash/ });
  });

  it('takes an internal appointment out of teaching, which is the trade', () => {
    const run = played(4, 24);
    const senior = seniorFaculty(run.state);
    expect(senior.length).toBeGreaterThan(0);
    const who = senior[0]!;
    const appointed = dispatch(run, {
      type: 'appointSeat',
      seatId: 'provost',
      from: { kind: 'internal', facultyId: who.id },
    });
    expect(appointed.state.treasury.cash).toBe(
      run.state.treasury.cash - seatById('provost').internalSalary,
    );
    // Cheaper than outside, and no longer teaching anything.
    expect(seatById('provost').internalSalary).toBeLessThan(seatById('provost').outsideSalary);
    expect(appointed.state.faculty.roster.find((f) => f.id === who.id)?.programId).toBeNull();
    expect(isSeated(appointed.state, who.id)).toBe(true);
    // And not into a second seat.
    expect(
      canApply(appointed.state, {
        type: 'appointSeat',
        seatId: 'facilities',
        from: { kind: 'internal', facultyId: who.id },
      }),
    ).toMatchObject({ ok: false, reason: /already holds/ });
  });

  it('draws a Dean from their own school, best first (Phase 21K)', () => {
    const run = played(4, 24);
    const school = run.state.academics.schools[0]!.schoolId;
    const shortlist = seatCandidates(run.state, 'dean', school);
    for (const f of shortlist) expect(f.schoolId).toBe(school);
    for (let i = 1; i < shortlist.length; i++) {
      const [a, b] = [shortlist[i - 1]!, shortlist[i]!];
      expect(a.teaching + a.research).toBeGreaterThanOrEqual(b.teaching + b.research);
    }
    // A senior from another school is refused, with the reason.
    const stranger = seniorFaculty(run.state).find((f) => f.schoolId !== school);
    if (stranger) {
      expect(
        canApply(run.state, {
          type: 'appointSeat',
          seatId: 'dean',
          schoolId: school,
          from: { kind: 'internal', facultyId: stranger.id },
        }),
      ).toMatchObject({ ok: false, reason: /own school/ });
    }
    // A standing seat takes any senior.
    expect(seatCandidates(run.state, 'provost', null).length).toBe(seniorFaculty(run.state).length);
  });

  it('will not promote somebody junior', () => {
    const run = played(4, 20);
    const junior = run.state.faculty.roster.find((f) => f.rank === 'assistant');
    if (!junior) return;
    expect(
      canApply(run.state, {
        type: 'appointSeat',
        seatId: 'provost',
        from: { kind: 'internal', facultyId: junior.id },
      }),
    ).toMatchObject({ ok: false, reason: /senior/ });
  });
});

describe('what a seat buys: the routine (DD §9.2)', () => {
  it('handles its domain’s minor events without asking', () => {
    const run = played(4, 20);
    const minor = EVENTS.find(
      (e) => e.domain === 'estate' && e.kind === 'inline' && moneyMoved(e) <= ESCALATION_MONEY,
    )!;
    const bare = run.state;
    expect(policyChoice(bare, minor)).toBeNull();
    const staffed = withSeats(bare, [seatOf('facilities')]);
    const handled = policyChoice(staffed, minor);
    expect(handled).not.toBeNull();
    expect(handled!.seat.seatId).toBe('facilities');
    expect(minor.choices.map((c) => c.id)).toContain(handled!.choiceId);
  });

  it('escalates the large, the seismic and the unstaffed', () => {
    const run = played(4, 20);
    const everySeat = withSeats(
      run.state,
      seatSlots(run.state).map(({ def, schoolId }) => seatOf(def.id, schoolId)),
    );
    // Seismic always reaches the President, however well-staffed.
    for (const def of EVENTS.filter((e) => e.kind === 'seismic')) {
      expect(escalates(everySeat, def)).toBe(true);
    }
    // So does anything above the money threshold.
    const big = EVENTS.find((e) => e.kind === 'inline' && moneyMoved(e) > ESCALATION_MONEY)!;
    expect(escalates(everySeat, big)).toBe(true);
    expect(policyChoice(everySeat, big)).toBeNull();
    // And anything with no seat to land on — money and the board.
    const presidents = EVENTS.find((e) => e.domain === 'money' && e.kind === 'inline')!;
    expect(handlerFor(everySeat, presidents)).toBeNull();
    expect(escalates(everySeat, presidents)).toBe(true);
  });

  it('decides by the policy it was set, not at random', () => {
    const def = eventById('roof-goes');
    const spends = (id: string) => -(def.choices.find((c) => c.id === id)!.effects.cash ?? 0);
    const thrifty = choiceByRule(def, 'thrifty');
    const thorough = choiceByRule(def, 'thorough');
    expect(spends(thrifty)).toBeLessThan(spends(thorough));
    // Every rule picks something the event actually offers, for every event.
    for (const event of EVENTS) {
      for (const rule of ['thrifty', 'thorough', 'popular'] as const) {
        expect(event.choices.map((c) => c.id)).toContain(choiceByRule(event, rule));
      }
    }
  });

  it('says so in the ticker instead of asking', () => {
    const run = played(4, 24);
    const staffed = { ...run, state: withSeats(run.state, [seatOf('facilities')]) };
    const later = tickRunWeeks(staffed, WEEKS_PER_YEAR * 12, defaultResolution);
    const handled = entriesOfKind(later.state, 'eventDelegated');
    expect(handled.length).toBeGreaterThan(0);
    for (const entry of handled) {
      expect(eventById(entry.eventId).domain).toBe('estate');
      // It resolved: it is not sitting on the docket waiting.
      expect(later.state.events.pending.map((p) => p.eventId)).not.toContain(entry.eventId);
    }
    const said = describeEntry(handled[0]!, later.state);
    expect(said.text).toMatch(/Facilities Director handled it: .+\./);
  });

  it('never leaves a delegated event pending, and never asks twice', () => {
    const run = played(4, 20);
    const staffed = { ...run, state: withSeats(run.state, [seatOf('dean-of-students')]) };
    const from = staffed.state.clock.absoluteWeek;
    const later = tickRunWeeks(staffed, WEEKS_PER_YEAR * 15, defaultResolution);
    // Only what happened after the seat existed: the journal remembers the
    // years before it, when the same events did reach the President.
    const handled = entriesOfKind(later.state, 'eventDelegated').filter((e) => e.week > from);
    expect(handled.length).toBeGreaterThan(0);
    const asked = entriesOfKind(later.state, 'eventFired')
      .filter((e) => e.week > from)
      .map((e) => e.eventId);
    for (const entry of handled) {
      expect(eventById(entry.eventId).domain).toBe('students');
      expect(asked).not.toContain(entry.eventId);
    }
  });
});

describe('what a seat buys: the clock (DD §3.2)', () => {
  it('is the only way to reach the top two tiers', () => {
    const run = played(4, 20);
    expect(speedAllowed(run.state, 'x2')).toBe(true);
    expect(speedAllowed(run.state, 'x4')).toBe(false);
    const withProvost = withSeats(run.state, [seatOf('provost')]);
    expect(speedAllowed(withProvost, 'x4')).toBe(true);
    expect(speedAllowed(withProvost, 'x8')).toBe(false);
    const schools = run.state.academics.schools.slice(0, DEANS_FOR_FASTEST);
    expect(schools.length).toBe(DEANS_FOR_FASTEST);
    const fast = withSeats(run.state, [
      seatOf('provost'),
      ...schools.map((s) => seatOf('dean', s.schoolId)),
    ]);
    expect(deansAppointed(fast)).toBe(DEANS_FOR_FASTEST);
    expect(speedAllowed(fast, 'x8')).toBe(true);
  });
});

describe('the org chart is part of the run', () => {
  it('replays exactly, seats and all', () => {
    let run = played(4, 22);
    run = dispatch(run, { type: 'appointSeat', seatId: 'provost', from: { kind: 'outside' } });
    run = dispatch(run, { type: 'setSeatPolicy', seatId: 'provost', policy: 'invest' });
    run = tickRunWeeks(run, WEEKS_PER_YEAR * 6, defaultResolution);
    const again = replay(run.state.seed, run.log, run.state.clock.absoluteWeek);
    expect(again.delegation).toEqual(run.state.delegation);
    expect(again.treasury.cash).toBe(run.state.treasury.cash);
  });

  it('survives a save, and gives an older one an empty chart', () => {
    let run = played(4, 18);
    run = dispatch(run, { type: 'appointSeat', seatId: 'facilities', from: { kind: 'outside' } });
    const file = JSON.parse(JSON.stringify(serializeRun(run))) as Record<string, unknown>;
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.state.delegation).toEqual(run.state.delegation);

    const old = JSON.parse(JSON.stringify(serializeRun(run))) as Record<string, unknown>;
    const state = old.state as Record<string, unknown>;
    old.version = 17;
    state.schemaVersion = 17;
    delete state.delegation;
    const migrated = loadSaveFile(old);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.save.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.save.state.delegation).toEqual(foundingDelegation());
  });

  it('refuses a policy for a seat nobody holds, and a dean with no school', () => {
    const run = played(4, 18);
    expect(
      canApply(run.state, { type: 'setSeatPolicy', seatId: 'provost', policy: 'invest' }),
    ).toMatchObject({ ok: false, reason: /vacant/ });
    expect(
      canApply(run.state, { type: 'appointSeat', seatId: 'dean', from: { kind: 'outside' } }),
    ).toMatchObject({ ok: false, reason: /which school/ });
    expect(
      canApply(run.state, {
        type: 'appointSeat',
        seatId: 'dean',
        schoolId: 'not-a-school',
        from: { kind: 'outside' },
      }),
    ).toMatchObject({ ok: false, reason: /not founded/ });
  });
});

describe('the bargain, over a run (the phase’s done-when)', () => {
  it('buying the suite visibly buys speed and visibly bleeds payroll', () => {
    const run = played(4, 30);
    const bare = run.state;
    const full = withSeats(
      bare,
      seatSlots(bare).map(({ def, schoolId }) => seatOf(def.id, schoolId)),
    );

    // Speed: bought.
    expect(speedAllowed(bare, 'x8')).toBe(false);
    expect(speedAllowed(full, 'x8')).toBe(true);

    // Payroll: bled, permanently, and the Treasury reads it.
    expect(annualAdminPayroll(full)).toBeGreaterThan(annualAdminPayroll(bare) * 2);
    expect(seatPayroll(full)).toBeGreaterThan(1_000_000);

    // And the routine stops reaching the player: the same twelve years,
    // handled instead of asked.
    const asked = (state: GameState) => {
      const later = tickRunWeeks({ ...run, state }, WEEKS_PER_YEAR * 12, defaultResolution);
      return {
        fired: entriesOfKind(later.state, 'eventFired').length,
        handled: entriesOfKind(later.state, 'eventDelegated').length,
      };
    };
    const alone = asked(bare);
    const staffed = asked(full);
    expect(staffed.handled).toBeGreaterThan(alone.handled);
    expect(staffed.fired).toBeLessThan(alone.fired);
  });
});
