import { describe, expect, it } from 'vitest';
import { buildingById } from '../content/buildings.ts';
import { describeEntry } from '../content/busLines.ts';
import {
  EVENTS,
  EVENT_CONDITIONS,
  EVENT_EFFECTS,
  EVENT_WORDS,
  eventById,
} from '../content/events.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import {
  EVENT_CONSEQUENCE_WEIGHT,
  EVENT_QUIET_WEEKS,
  MOOD_CAP,
  MOOD_DECAY_PER_YEAR,
  SEISMIC_MIN_YEAR,
} from '../tuning.ts';
import { canApply } from './actions.ts';
import { clockHeld, defaultResolution } from './beats.ts';
import { entriesOfKind } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { conditionFor } from './estate.ts';
import {
  applyChoice,
  conditionsHold,
  eligible,
  eventsWeek,
  fadeMood,
  fillEventText,
  firedRecently,
  foundingEvents,
  pendingInline,
  pendingSeismic,
  pendingText,
  resolveEvent,
  weightOf,
  type PendingEvent,
} from './events.ts';
import { satisfactionBreakdown } from './people.ts';
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

function years(n: number, seed = 4): Run {
  return tickRunWeeks(opened(seed), WEEKS_PER_YEAR * n, defaultResolution);
}

// A pending instance of `id`, fired this week, without waiting for the
// dice to offer it.
function pend(state: GameState, id: string, expiresIn = 3): GameState {
  const pending: PendingEvent = {
    instanceId: 'x1',
    eventId: id,
    firedWeek: state.clock.absoluteWeek,
    expiresWeek: state.clock.absoluteWeek + expiresIn,
    vars: {},
  };
  return { ...state, events: { ...state.events, pending: [pending] } };
}

describe('the event vocabulary is closed (DD §10.1)', () => {
  it('names only conditions and effects the engine can read and pull', () => {
    for (const def of EVENTS) {
      for (const name of Object.keys(def.when)) expect(EVENT_CONDITIONS).toContain(name);
      for (const choice of def.choices) {
        for (const lever of Object.keys(choice.effects)) expect(EVENT_EFFECTS).toContain(lever);
        // Every key present is a number: a key carrying `undefined` would
        // reach a lever as NaN and quietly poison whatever it touches.
        for (const amount of Object.values(choice.effects)) expect(amount).toBeTypeOf('number');
      }
    }
  });

  it('offers a real choice, and says which way it falls if nobody answers', () => {
    for (const def of EVENTS) {
      expect(def.choices.length).toBeGreaterThanOrEqual(2);
      expect(def.choices.map((c) => c.id)).toContain(def.default);
      expect(def.timeoutWeeks).toBeGreaterThanOrEqual(1);
      if (def.kind === 'seismic') expect(def.title).toBeTruthy();
    }
  });

  it('weighs an event by how much the college had to earn it', () => {
    const plain = EVENTS.find((e) => Object.keys(e.when).length === 1)!;
    const earned = EVENTS.find((e) => Object.keys(e.when).length === 2)!;
    expect(weightOf(plain)).toBeCloseTo(plain.weight * EVENT_CONSEQUENCE_WEIGHT, 6);
    expect(weightOf(earned)).toBeCloseTo(earned.weight * EVENT_CONSEQUENCE_WEIGHT ** 2, 6);
    expect(weightOf(earned) / earned.weight).toBeGreaterThan(weightOf(plain) / plain.weight);
  });
});

describe('an event fires only where it fits (DD §10.1)', () => {
  it('holds a condition against the state, not against nothing', () => {
    const run = years(1);
    // Year 1 is not year 6, and a clause that fails keeps the event out.
    expect(conditionsHold(run.state, eventById('storm'))).toBe(false);
    expect(conditionsHold(run.state, eventById('recession'))).toBe(false);
    expect(eligible(run.state, 'seismic')).toEqual([]);
    // `yearAtLeast: 3` is the parking study's whole claim on the world.
    const later = { ...run.state, clock: { ...run.state.clock, year: 4 } };
    expect(conditionsHold(later, eventById('parking-study'))).toBe(true);
  });

  it('reads an Under clause as a floor, not a ceiling', () => {
    const run = years(2);
    const sound = run.state;
    expect(conditionsHold(sound, eventById('heating-fails'))).toBe(false);
    const hall = buildingById('founders-hall');
    const worn: GameState = {
      ...sound,
      campus: {
        ...sound.campus,
        placements: sound.campus.placements.map((p) => ({
          ...p,
          backlog: hall.cost * 0.2,
          condition: conditionFor(hall, hall.cost * 0.2),
        })),
      },
    };
    expect(worn.campus.placements[0]!.condition).toBeLessThan(0.8);
    expect(conditionsHold(worn, eventById('heating-fails'))).toBe(true);
  });

  it('will not ask the same thing twice inside its cooldown', () => {
    const run = years(4);
    const def = eventById('parking-study');
    const asked: GameState = {
      ...run.state,
      events: {
        ...run.state.events,
        history: [
          {
            eventId: def.id,
            choiceId: def.default,
            week: run.state.clock.absoluteWeek - 4,
            timedOut: true,
          },
        ],
      },
    };
    expect(firedRecently(asked, def)).toBe(true);
    expect(eligible(asked, 'inline')).not.toContain(def);
    const longAfter: GameState = {
      ...asked,
      clock: {
        ...asked.clock,
        absoluteWeek: asked.clock.absoluteWeek + def.cooldownYears * WEEKS_PER_YEAR,
      },
    };
    expect(firedRecently(longAfter, def)).toBe(false);
  });

  it('keeps the world quiet for a few weeks after one resolves', () => {
    const run = years(3);
    const busy: GameState = {
      ...run.state,
      events: { ...run.state.events, pending: [], lastResolvedWeek: run.state.clock.absoluteWeek },
    };
    for (let i = 0; i < EVENT_QUIET_WEEKS; i++) {
      const week = { ...busy, clock: { ...busy.clock, absoluteWeek: busy.clock.absoluteWeek + i } };
      expect(eventsWeek(week).events.pending).toEqual([]);
      // The quiet costs nothing: the dice are not rolled at all.
      expect(eventsWeek(week).rng).toEqual(week.rng);
    }
  });
});

describe('a choice pulls the levers it names (DD §10.1)', () => {
  it('moves money, confidence, mood and warmth', () => {
    const run = years(3);
    const before = run.state;
    const after = applyChoice(before, eventById('committee-reform'), 'adopt');
    // "$120k a year, forever" is a standing cost now (Phase 21H): nothing
    // leaves the bank today, and the administration's payroll carries it
    // this year, next year and every year after.
    expect(after.treasury.cash).toBe(before.treasury.cash);
    expect(after.treasury.standing.admin).toBe(before.treasury.standing.admin + 120000);
    expect(after.treasury.budget.expenses.adminPayroll).toBe(
      before.treasury.budget.expenses.adminPayroll + 120000,
    );
    expect(after.distress.confidence).toBe(
      Math.min(100, Math.max(0, before.distress.confidence + 1)),
    );
    const thanked = applyChoice(before, eventById('committee-reform'), 'thank');
    expect(thanked.people.mood).toBeCloseTo(before.people.mood + 1, 2);
  });

  it('spreads backlog over the open buildings and re-reads their condition', () => {
    const run = years(2);
    const hall = buildingById('founders-hall');
    const damaged = applyChoice(
      { ...run.state, treasury: { ...run.state.treasury, cash: 10_000_000 } },
      eventById('roof-goes'),
      'tarpaulin',
    );
    const p = damaged.campus.placements[0]!;
    expect(p.backlog).toBe(250000);
    expect(p.condition).toBe(conditionFor(hall, 250000));
    expect(p.condition).toBeLessThan(1);
    // Repairs cannot drive a building past sound.
    const repaired = applyChoice(damaged, eventById('roof-goes'), 'fix');
    expect(repaired.campus.placements[0]!.backlog).toBe(0);
    expect(repaired.campus.placements[0]!.condition).toBe(1);
  });

  it('keeps mood inside its cap and lets it fade', () => {
    const run = years(2);
    const elated = { ...run.state, people: { ...run.state.people, mood: MOOD_CAP } };
    expect(applyChoice(elated, eventById('committee-reform'), 'thank').people.mood).toBe(MOOD_CAP);
    expect(fadeMood(MOOD_CAP, MOOD_DECAY_PER_YEAR)).toBeLessThan(MOOD_CAP);
    expect(Math.abs(fadeMood(-4, MOOD_DECAY_PER_YEAR))).toBeLessThan(4);
    expect(fadeMood(0, MOOD_DECAY_PER_YEAR)).toBe(0);
  });

  it('is a term of satisfaction, so the students feel what happened', () => {
    const run = years(3);
    const total = run.state.people.cohorts.reduce((t, c) => t + c.size, 0);
    const glum = { ...run.state, people: { ...run.state.people, mood: -5 } };
    const glad = { ...run.state, people: { ...run.state.people, mood: 5 } };
    expect(satisfactionBreakdown(glum, total).events).toBe(-5);
    expect(satisfactionBreakdown(glad, total).events).toBe(5);
    expect(satisfactionBreakdown(glad, total).total).toBeGreaterThan(
      satisfactionBreakdown(glum, total).total,
    );
  });
});

describe('an unanswered event settles itself (DD §10.1)', () => {
  it('resolves into its stated default the week it expires, and says so', () => {
    const run = years(3);
    const asked = pend(run.state, 'parking-study', 2);
    expect(pendingInline(asked)?.eventId).toBe('parking-study');
    const waiting = eventsWeek({
      ...asked,
      clock: { ...asked.clock, absoluteWeek: asked.clock.absoluteWeek + 1 },
    });
    expect(waiting.events.pending).toHaveLength(1);
    const settled = eventsWeek({
      ...asked,
      clock: { ...asked.clock, absoluteWeek: asked.clock.absoluteWeek + 2 },
    });
    expect(settled.events.pending).toEqual([]);
    expect(settled.events.history.at(-1)).toMatchObject({
      eventId: 'parking-study',
      choiceId: eventById('parking-study').default,
      timedOut: true,
    });
    const line = describeEntry(entriesOfKind(settled, 'eventResolved').at(-1)!, settled);
    expect(line.text).toBe(
      EVENT_WORDS.timeout.replace(
        '{choice}',
        eventById('parking-study').choices.find((c) => c.id === eventById('parking-study').default)!
          .label,
      ),
    );
    expect(line.tone).toBe('bad');
  });

  it('applies the default’s effects, not nothing', () => {
    const run = years(3);
    const asked = pend(run.state, 'committee-reform', 0);
    const settled = eventsWeek(asked);
    expect(settled.people.mood).toBeCloseTo(run.state.people.mood + 1, 2);
    expect(settled.distress.confidence).toBe(Math.max(0, run.state.distress.confidence - 1));
  });
});

describe('the player answers through the action log (DD §15)', () => {
  it('takes a choice that belongs to the event, and refuses one that does not', () => {
    const run = years(3);
    const asked = { ...run, state: pend(run.state, 'parking-study') };
    expect(
      canApply(asked.state, { type: 'resolveEvent', instanceId: 'x1', choiceId: 'study' }),
    ).toMatchObject({ ok: true });
    expect(
      canApply(asked.state, { type: 'resolveEvent', instanceId: 'x1', choiceId: 'rebuild' }),
    ).toMatchObject({ ok: false });
    expect(
      canApply(asked.state, { type: 'resolveEvent', instanceId: 'nope', choiceId: 'study' }),
    ).toMatchObject({ ok: false });
    const answered = dispatch(asked, { type: 'resolveEvent', instanceId: 'x1', choiceId: 'study' });
    expect(answered.state.events.pending).toEqual([]);
    expect(answered.state.events.history.at(-1)).toMatchObject({
      eventId: 'parking-study',
      choiceId: 'study',
      timedOut: false,
    });
  });

  it('replays the same, dice and all', () => {
    const run = years(6);
    const again = replay(run.state.seed, run.log, run.state.clock.absoluteWeek);
    expect(again.events).toEqual(run.state.events);
    expect(again.people.mood).toBe(run.state.people.mood);
    expect(again.rng).toEqual(run.state.rng);
  });
});

describe('an event can be put on the docket by hand (authoring)', () => {
  it('fires a named event whatever the world says, once', () => {
    const run = years(2);
    const struck = dispatch(run, { type: 'debug/fireEvent', eventId: 'storm' });
    // Year 2 is nowhere near the storm's conditions, and that is the point.
    expect(conditionsHold(run.state, eventById('storm'))).toBe(false);
    expect(pendingSeismic(struck.state)?.eventId).toBe('storm');
    expect(pendingText(pendingSeismic(struck.state)!)).not.toContain('{');
    expect(canApply(struck.state, { type: 'debug/fireEvent', eventId: 'storm' })).toMatchObject({
      ok: false,
    });
    expect(canApply(struck.state, { type: 'debug/fireEvent', eventId: 'nope' })).toMatchObject({
      ok: false,
    });
  });
});

describe('a seismic event is a letter that holds the clock (DD §10.1)', () => {
  it('stops the week until it is answered, and has a way of answering itself', () => {
    const run = years(SEISMIC_MIN_YEAR + 1);
    const struck = { ...pend(run.state, 'storm', 4), pendingBeat: null };
    expect(pendingSeismic(struck)?.eventId).toBe('storm');
    expect(pendingInline(struck)).toBeNull();
    expect(clockHeld(struck)).toBe(true);
    const answer = defaultResolution(struck);
    expect(answer).toMatchObject({ type: 'resolveEvent', instanceId: 'x1' });
    const after = resolveEvent(struck, 'x1', eventById('storm').default);
    expect(clockHeld(after)).toBe(false);
  });

  it('an inline event does not hold the clock', () => {
    const run = years(3);
    expect(clockHeld({ ...pend(run.state, 'parking-study'), pendingBeat: null })).toBe(false);
  });
});

describe('an event keeps the sentence it fired with', () => {
  it('resolves its subjects once, at firing', () => {
    const named = pendingText({
      instanceId: 'x1',
      eventId: 'roof-goes',
      firedWeek: 1,
      expiresWeek: 4,
      vars: { building: 'Founders Hall' },
    });
    expect(named).toContain('Founders Hall');
    expect(named).not.toContain('{building}');
    // Nothing left unresolved is silently blanked: an unknown key survives
    // as itself rather than turning the sentence into a hole.
    expect(fillEventText('a {nobody} here', {})).toBe('a {nobody} here');
  });

  it('names a building the college actually has', () => {
    const run = years(4);
    const s = eventsWeek({
      ...run.state,
      events: { ...run.state.events, pending: [], lastResolvedWeek: -100 },
    });
    for (const p of s.events.pending) {
      if (p.vars.building !== undefined) {
        const names = run.state.campus.placements.map((x) => buildingById(x.buildingId).name);
        expect(names).toContain(p.vars.building);
      }
    }
  });
});

describe('events over a long run', () => {
  it('asks a few questions a decade, and never leaves one hanging', () => {
    const run = years(30, 9);
    const fired = entriesOfKind(run.state, 'eventFired').length;
    const resolved = run.state.events.history.length;
    expect(fired).toBeGreaterThan(5);
    expect(resolved).toBe(fired - run.state.events.pending.length);
    // Nothing waits past its own deadline.
    for (const p of run.state.events.pending) {
      expect(p.expiresWeek).toBeGreaterThan(run.state.clock.absoluteWeek);
    }
    // Every reading stays a number: a poisoned lever shows up here first.
    expect(Number.isFinite(run.state.treasury.cash)).toBe(true);
    expect(Number.isFinite(run.state.people.mood)).toBe(true);
    for (const p of run.state.campus.placements) {
      expect(Number.isFinite(p.backlog)).toBe(true);
      expect(Number.isFinite(p.condition)).toBe(true);
    }
  });

  it('asks a college about what it did, not just about the weather', () => {
    // Consequence-weighted sourcing, measured rather than asserted. With
    // the catalogue full (Phase 18) both colleges are asked plenty — the
    // cadence is the engine's odds now, not an empty pool — so what
    // separates them is WHICH questions arrive, and that separation is
    // total: the estate's failures belong to the college that caused them.
    const minded = years(30, 4);
    let neglected = tickRunWeeks(opened(4), 31, defaultResolution);
    expect(neglected.state.pendingBeat).toBe('budget-and-hiring');
    neglected = dispatch(neglected, {
      type: 'resolveBeat',
      beatId: 'budget-and-hiring',
      maintenanceFunding: 0,
    });
    neglected = tickRunWeeks(neglected, WEEKS_PER_YEAR * 30, defaultResolution);

    const askedOf = (run: Run) => new Set(run.state.events.history.map((h) => h.eventId));
    const neglectful = askedOf(neglected);
    const attentive = askedOf(minded);
    // Thirty years is an inhabited stretch either way (DD §10.1).
    expect(attentive.size).toBeGreaterThan(12);
    expect(neglectful.size).toBeGreaterThan(12);
    // The estate only writes to the administration that let it go.
    // Most of the estate's failures reach the neglectful college in thirty
    // years — the pool grows with every phase, so not every one — and none
    // reaches the attentive one.
    const failures = ['roof-goes', 'roof-slates', 'flooded-basement', 'heating-fails'];
    expect(failures.filter((f) => neglectful.has(f)).length).toBeGreaterThanOrEqual(3);
    for (const failure of failures) expect(attentive).not.toContain(failure);
  });

  it('draws each one from the run’s own stream, so a save resumes it', () => {
    const run = years(12, 21);
    const file = JSON.parse(JSON.stringify(serializeRun(run))) as unknown;
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.state.events).toEqual(run.state.events);
    const reopened: Run = { state: loaded.save.state, log: loaded.save.log };
    const onwards = tickRunWeeks(run, WEEKS_PER_YEAR, defaultResolution);
    const resumed = tickRunWeeks(reopened, WEEKS_PER_YEAR, defaultResolution);
    expect(resumed.state.events).toEqual(onwards.state.events);
  });
});

describe('save migration v15 → v16', () => {
  it('gives an older save an empty docket and an even mood', () => {
    const run = years(5);
    const file = JSON.parse(JSON.stringify(serializeRun(run))) as Record<string, unknown>;
    const state = file.state as Record<string, unknown>;
    file.version = 15;
    state.schemaVersion = 15;
    delete state.events;
    delete (state.people as Record<string, unknown>).mood;
    const loaded = loadSaveFile(file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.save.state.people.mood).toBeTypeOf('number');
    expect(loaded.save.state.events.pending).toEqual([]);
    expect(loaded.save.state.events.nextId).toBeGreaterThanOrEqual(1);
  });

  it('a founding docket is empty and quiet', () => {
    expect(foundingEvents()).toEqual({
      pending: [],
      history: [],
      lastResolvedWeek: 0,
      nextId: 1,
    });
    expect(entriesOfKind(newRun(1).state, 'eventFired')).toEqual([]);
  });
});
