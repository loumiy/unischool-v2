import { describe, expect, it } from 'vitest';
import { TAG_EARN_AT, TAG_YEARS } from '../tuning.ts';
import { entriesOfKind } from './bus.ts';
import { played } from './colleges.ts';
import { tagPoolFactor, tagQualityShift, turnPerception } from './tags.ts';
import type { GameState } from './state.ts';

// PRESTIGE AND IDENTITY (DD §11.1–§11.2, Phase 24). Done when two
// differently-played schools show visibly different tags and applicant
// pools.

describe('what the guidebooks say', () => {
  const dear = played(4, 35, undefined, { tuition: 62_000, selectivity: 0.7, drawRate: 0.06 });
  // Cheap and lean, and choosy enough to keep its students good: since the
  // college pays for every student it admits (Phase 31), a bargain that
  // hires freely and admits anyone cannot stay one.
  const cheap = played(4, 35, undefined, {
    tuition: 18_000,
    drawRate: 0.05,
    hireCap: 24,
    selectivity: 0.6,
  });

  it('tells two differently run colleges apart, in their tags and their pools', () => {
    const a = dear.state;
    const b = cheap.state;
    expect(a.perception.tags).toContain('country-club');
    expect(b.perception.tags).toContain('the-bargain');
    expect(a.perception.tags).not.toEqual(b.perception.tags);
    const pa = a.people.lastAdmissions!;
    const pb = b.people.lastAdmissions!;
    // A third more, not twice (Phase 37): the pool now also answers to the
    // teaching, and the dear college teaches better than the bargain.
    expect(pb.applicants).toBeGreaterThan(pa.applicants * 1.2);
    expect(pa.quality).toBeGreaterThan(pb.quality);
  });

  it('journals what it starts and stops calling the college', () => {
    expect(entriesOfKind(dear.state, 'tagEarned').length).toBeGreaterThan(0);
    const earned = entriesOfKind(cheap.state, 'tagEarned').map((e) => e.tag);
    const shed = entriesOfKind(cheap.state, 'tagShed').map((e) => e.tag);
    for (const t of shed) expect(earned).toContain(t);
  });

  it('earns a tag only after it has been true for years, not for one', () => {
    const s = cheap.state;
    const blank: GameState = { ...s, perception: { tags: [], earning: {}, shedding: {} } };
    let t = turnPerception(blank);
    expect(t.perception.tags).toEqual([]);
    for (let i = 1; i < TAG_YEARS; i++) t = turnPerception(t);
    expect(t.perception.tags.length).toBeGreaterThan(0);
    expect(TAG_EARN_AT).toBeGreaterThan(0.5);
  });

  it('moves the pool by the tags it holds', () => {
    const s = cheap.state;
    const none: GameState = { ...s, perception: { tags: [], earning: {}, shedding: {} } };
    expect(tagPoolFactor(none)).toBe(1);
    expect(tagQualityShift(none)).toBe(0);
    const bargain: GameState = {
      ...none,
      perception: { ...none.perception, tags: ['the-bargain'] },
    };
    expect(tagPoolFactor(bargain)).toBeGreaterThan(1);
  });
});

describe('poaching and shedding, wired to the league (DD §7.3, §11.3)', () => {
  it('puts a rising school’s offer to a star on the docket, and a falling school’s faculty on the market', () => {
    let shedSeen = 0;
    // Seed 21: which colleges rise and fall is the world's dice, and since
    // the decade's ambitions (Phase 42) draw on the run's stream too, seed
    // 4's scripted college no longer meets a suitor inside 35 years.
    const run = played(21, 35, (r) => {
      if (r.state.faculty.marketOpen)
        shedSeen = Math.max(shedSeen, r.state.faculty.market.filter((f) => f.fromSchool).length);
      return r;
    });
    expect(shedSeen).toBeGreaterThan(0);
    const offers = run.state.bus.filter(
      (e) => e.kind === 'eventFired' && e.eventId === 'the-outside-offer',
    );
    expect(offers.length).toBeGreaterThan(0);
    const history = run.state.events.history.filter((h) => h.eventId === 'the-outside-offer');
    // Every offer is answered, bar one still on the docket at the end.
    expect(history.length).toBeGreaterThanOrEqual(offers.length - 1);
    // Every star let go is journalled by name, to the college that took them.
    const released = history.filter((h) => h.choiceId === 'release').length;
    expect(entriesOfKind(run.state, 'facultyPoached')).toHaveLength(released);
  });
});
