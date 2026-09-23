import { describe, expect, it } from 'vitest';
import { AMBITIONS } from '../content/ambitions.ts';
import { BUILDINGS } from '../content/buildings.ts';
import { EVENTS, EVENT_CONDITIONS, EVENT_EFFECTS, type EventCondition } from '../content/events.ts';
import { neglected, opened, played } from './colleges.ts';

import { defaultResolution } from './beats.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { conditionsHold, readingOf } from './events.ts';
import { tickRunWeeks, type Run } from './run.ts';
import type { GameState } from './state.ts';

// PHASE 18 — the catalogue, read as writing rather than as data. The
// engine's own tests (events.test.ts) cover what an event DOES; these
// cover what the file SAYS, and whether any of it is unreachable.

const INLINE = EVENTS.filter((e) => e.kind === 'inline');
const SEISMIC = EVENTS.filter((e) => e.kind === 'seismic');

describe('the catalogue is the size the phase promised (DD §14)', () => {
  it('ships batch 1: ~50 inline and 6 seismic', () => {
    expect(INLINE.length).toBeGreaterThanOrEqual(50);
    expect(SEISMIC.length).toBeGreaterThanOrEqual(6);
  });

  it('spends its whole vocabulary: no reading nothing reads', () => {
    // Two content files share the vocabulary now: events name clauses in
    // `when` and ambitions in `deal` and `goal` (DD §10.2), and both pull
    // the same levers. A reading is dead only if neither reads it.
    const named = new Set([
      ...EVENTS.flatMap((e) => Object.keys(e.when)),
      ...AMBITIONS.flatMap((a) => [...Object.keys(a.deal), ...Object.keys(a.goal)]),
    ]);
    const pulled = new Set([
      ...EVENTS.flatMap((e) => e.choices.flatMap((c) => Object.keys(c.effects))),
      ...AMBITIONS.flatMap((a) => [...Object.keys(a.reward), ...Object.keys(a.penalty)]),
    ]);
    expect([...EVENT_CONDITIONS].filter((c) => !named.has(c))).toEqual([]);
    expect([...EVENT_EFFECTS].filter((e) => !pulled.has(e))).toEqual([]);
  });

  it('covers every system the game has built so far', () => {
    // One event per system is not coverage; the phase's job is a file that
    // answers whatever the player has been doing.
    const clauses = (names: EventCondition[]) =>
      EVENTS.filter((e) => names.some((n) => n in e.when)).length;
    expect(
      clauses(['backlogOver', 'conditionUnder', 'derelictOver', 'oldestBuildingOver']),
    ).toBeGreaterThanOrEqual(6);
    expect(
      clauses([
        'cashUnder',
        'cashOver',
        'debtOver',
        'deficitOver',
        'drawRateOver',
        'endowmentOver',
      ]),
    ).toBeGreaterThanOrEqual(6);
    expect(
      clauses(['facultyOver', 'teachingOver', 'teachingUnder', 'studentsPerFacultyOver']),
    ).toBeGreaterThanOrEqual(6);
    expect(
      clauses(['enrolledOver', 'satisfactionUnder', 'triplesOver', 'moodOver']),
    ).toBeGreaterThanOrEqual(8);
    expect(clauses(['alumniOver', 'warmthOver', 'warmthUnder'])).toBeGreaterThanOrEqual(5);
    expect(clauses(['programsOver', 'programsUnder', 'schoolsOver'])).toBeGreaterThanOrEqual(4);
    expect(clauses(['rungAtLeast', 'confidenceOver', 'confidenceUnder'])).toBeGreaterThanOrEqual(4);
    expect(
      clauses(['beautyOver', 'beautyUnder', 'quadsOver', 'treesUnder']),
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('the file reads like the style guide says (content/STYLE.md)', () => {
  it('says it in two or three sentences, and a letter in more', () => {
    for (const def of INLINE) {
      const sentences = def.text.split(/(?<=[.!?])\s+/).length;
      expect({ id: def.id, sentences }).toMatchObject({ id: def.id });
      expect(sentences).toBeGreaterThanOrEqual(2);
      expect(sentences).toBeLessThanOrEqual(4);
      expect(def.text.length).toBeLessThan(400);
    }
    for (const def of SEISMIC) {
      expect(def.text.length).toBeGreaterThan(400);
      expect(def.title!.length).toBeGreaterThan(2);
    }
  });

  it('labels the choices with honest verbs, never a gag', () => {
    for (const def of EVENTS) {
      for (const choice of def.choices) {
        expect(choice.label).not.toMatch(/[!?]/);
        // A label is an instruction, not a sentence about one.
        expect(choice.label).not.toMatch(/\.$/);
        expect(choice.label.length).toBeGreaterThan(3);
        expect(choice.label.length).toBeLessThan(56);
        expect(choice.label[0]).toBe(choice.label[0]!.toUpperCase());
        expect(Object.keys(choice.effects).length).toBeGreaterThan(0);
      }
    }
  });

  it('never exclaims, and keeps the second person rare', () => {
    for (const def of EVENTS) expect(def.text).not.toContain('!');
    // The register is a memo, not a narrator, so "you" is the exception —
    // the DD's own calibration example is one of them ("what they would
    // like you to do"). A budget, not a ban (content/STYLE.md).
    const addressed = EVENTS.filter((e) => /\byou'?(re|ve|ll)?\b/i.test(e.text));
    expect(addressed.length / EVENTS.length).toBeLessThan(0.1);
  });

  it('prices what costs, and names only subjects the engine can resolve', () => {
    const placeholders = /\{(\w+)\}/g;
    for (const def of EVENTS) {
      for (const match of def.text.matchAll(placeholders)) {
        expect(['building', 'faculty', 'program', 'class', 'school', 'rival', 'sport']).toContain(
          match[1],
        );
      }
      // Anything that moves real money says so where the player is choosing.
      for (const choice of def.choices) {
        const spend = Math.abs(choice.effects.cash ?? 0) + Math.abs(choice.effects.endowment ?? 0);
        if (spend >= 100_000) expect(choice.note ?? '').not.toBe('');
      }
    }
  });

  it('writes distress straight: no jokes at the bottom of the ladder', () => {
    // An event gated on the ladder or on unhappy students is written in
    // the plain register, which shows up as shorter, flatter sentences.
    const straight = EVENTS.filter(
      (e) => (e.when.rungAtLeast ?? 0) >= 2 || e.when.satisfactionUnder !== undefined,
    );
    expect(straight.length).toBeGreaterThanOrEqual(4);
    for (const def of straight) {
      expect(def.text).not.toMatch(/\b(hilarious|absurd|comic|farce|ridiculous)\b/i);
    }
  });
});

describe('nothing in the file is unreachable', () => {
  it('every event can happen to some college', { timeout: 60_000 }, () => {
    // The threshold bug this phase found by measuring: a number written
    // above the ceiling of its own reading is an event that never fires,
    // and nothing but a run will say which ones those are.
    const reached = new Set<string>();
    // What each reading actually did, so a failure can name the ceiling.
    const range = new Map<EventCondition, { min: number; max: number }>();
    const named = [...new Set(EVENTS.flatMap((e) => Object.keys(e.when)))] as EventCondition[];
    const observe = (state: GameState) => {
      for (const name of named) {
        const v = Number(readingOf(state, name).toFixed(2));
        const seen = range.get(name);
        range.set(
          name,
          seen ? { min: Math.min(seen.min, v), max: Math.max(seen.max, v) } : { min: v, max: v },
        );
      }
    };
    // Only ever ask about what is still missing: five fifty-year colleges
    // sampled every week is a lot of flood-filling otherwise.
    const outstanding = new Map(EVENTS.map((e) => [e.id, e]));
    const sample = (state: GameState) => {
      observe(state);
      if (outstanding.size === 0) return;
      for (const [id, def] of outstanding) {
        if (conditionsHold(state, def)) {
          reached.add(id);
          outstanding.delete(id);
        }
      }
    };
    const walk = (run: Run, years: number, start: Run = run) => {
      let r = start;
      for (let y = 0; y < years; y++) {
        r = tickRunWeeks(r, WEEKS_PER_YEAR, defaultResolution);
        sample(r.state);
      }
      return r;
    };
    // Four colleges, because no single one reaches the whole file: one
    // minded, one let go, one run well, and one run into the ground.
    walk(opened(4), 50);
    sample(neglected(4, 40).state);
    const watch = (r: Run) => {
      sample(r.state);
      return r;
    };
    sample(played(4, 50, watch, { drawRate: 0.06, tuition: 62_000, selectivity: 0.7 }).state);
    // One that fields teams (Phase 23): rowing needs only the stream, and
    // the field for soccer goes up after everything else.
    sample(
      played(9, 50, watch, {
        varsity: ['rowing', 'soccer'],
        athleticsBudget: 'ambitious',
        extraSites: [['playing-field', 36, 8, false]],
      }).state,
    );
    // Run into the ground two different ways: one that cannot afford
    // faculty, and one that cannot afford the faculty it has.
    sample(
      played(21, 50, watch, {
        maintenanceFunding: 0,
        drawRate: 0.08,
        selectivity: 0.3,
        hireCap: 3,
      }).state,
    );
    sample(played(13, 50, watch, { tuition: 8_000, drawRate: 0.02 }).state);
    // When this fails it should say WHY, because the answer is always a
    // number written outside the range its own reading can take, and only
    // a run knows that range (content/STYLE.md).
    const never = [...outstanding.values()].map(
      (def) =>
        `${def.id}: ${Object.entries(def.when)
          .map(([name, want]) => {
            const r = range.get(name as EventCondition);
            return `${name} wants ${want}, saw ${r ? `${r.min} .. ${r.max}` : 'nothing'}`;
          })
          .join('; ')}`,
    );
    expect(never).toEqual([]);
  });
});

describe('a test decade feels inhabited (the phase’s done-when)', () => {
  it('asks a well-run college a few questions a year, every decade of a run', () => {
    const run = played(7, 50);
    const asked = run.state.events.history;
    expect(asked.length).toBeGreaterThan(40);
    // Spread, not clustered: every decade of the fifty has weather in it.
    for (let decade = 0; decade < 5; decade++) {
      const inDecade = asked.filter(
        (h) =>
          h.week >= decade * 10 * WEEKS_PER_YEAR && h.week < (decade + 1) * 10 * WEEKS_PER_YEAR,
      );
      expect({ decade, asked: inDecade.length }).toMatchObject({ decade });
      expect(inDecade.length).toBeGreaterThan(3);
    }
    // And it is not the same three events over and over.
    expect(new Set(asked.map((h) => h.eventId)).size).toBeGreaterThan(20);
  });

  it('builds a college worth writing events about', () => {
    // Guards the harness above: if `played` stops building, hiring or
    // opening programmes, the coverage test would quietly stop covering.
    const run = played(4, 40);
    expect(run.state.campus.placements.length).toBeGreaterThan(4);
    expect(run.state.faculty.roster.length).toBeGreaterThan(3);
    expect(run.state.academics.programs.length).toBeGreaterThan(1);
    expect(BUILDINGS.length).toBeGreaterThan(8);
  });
});

describe('nothing the file says is untrue of the college (Phase 21H, content/STYLE.md)', () => {
  // A building named in an event's words, and the catalogue id it is.
  const NAMED: [RegExp, string][] = [
    [/health cent(re|er)/i, 'health-center'],
    [/\blibrary\b/i, 'library'],
    [/dining hall/i, 'dining-hall'],
    [/residence hall/i, 'residence-hall'],
    [/student cent(re|er)/i, 'student-center'],
    [/recreation cent(re|er)/i, 'recreation-center'],
    [/playing field/i, 'playing-field'],
  ];
  // Named, but not claimed of this college — with why.
  const NOT_CLAIMS: Record<string, string> = {
    'star-poached': 'the worse library is the other college’s',
  };

  it('names only buildings the event needs the college to have', () => {
    const untrue: string[] = [];
    for (const e of EVENTS) {
      if (NOT_CLAIMS[e.id]) continue;
      const words = [e.title ?? '', e.text, ...e.choices.flatMap((c) => [c.label, c.note ?? ''])];
      for (const [pattern, id] of NAMED) {
        if (words.some((w) => pattern.test(w)) && !e.needs.includes(id)) {
          untrue.push(`${e.id} names a ${id} it does not need`);
        }
      }
    }
    expect(untrue).toEqual([]);
  });

  it('charges a recurring price as a recurring cost', () => {
    const recurring = /\$[\d.]+[kKmM]? (a|per|each) year|for good|salary line/;
    const lies: string[] = [];
    for (const e of EVENTS) {
      for (const c of e.choices) {
        if (!recurring.test(c.note ?? '')) continue;
        if (c.effects.adminPayroll === undefined && c.effects.facultyPayroll === undefined) {
          lies.push(`${e.id}/${c.id}: "${c.note}" is charged once`);
        }
      }
    }
    expect(lies).toEqual([]);
  });
});
