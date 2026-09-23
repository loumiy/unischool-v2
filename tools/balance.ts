/// <reference types="node" />
// PHASE 31 (AND 35): THE BALANCE DASHBOARD. Three archetype colleges, fifty years
// each, headless on Node, measured against DD §2.2's pacing budget and
// DD §17's guardrails. It reports; `tuning.ts` is where the answers go.
//
//   npm run balance                     # 3 archetypes x 3 seeds
//   npm run balance -- --json           # machine-readable

import { buildingById } from '../src/content/buildings.ts';
import { DEFAULT_PALETTE } from '../src/content/palettes.ts';
import { findProgram, PROGRAMS, SCHOOLS } from '../src/content/schools.ts';
import { CAMPAIGNS } from '../src/content/campaigns.ts';
import { canApply, type Action } from '../src/sim/actions.ts';
import { defaultResolution } from '../src/sim/beats.ts';
import { pendingInline, priceScale, scaledAmount } from '../src/sim/events.ts';
import { eventById } from '../src/content/events.ts';
import { entriesOfKind } from '../src/sim/bus.ts';
import { WEEKS_PER_YEAR } from '../src/sim/calendar.ts';
import { msPerWeek, speedAllowed } from '../src/sim/clock.ts';
import { staffingNeed, unassignedFaculty, facultyOf, canTeach } from '../src/sim/faculty.ts';
import { campusCapacity, enrolled } from '../src/sim/people.ts';
import { siteRefusal } from '../src/sim/reach.ts';
import { renovationCost } from '../src/sim/estate.ts';
import { dispatch, newRun, tickRunWeeks, type Run } from '../src/sim/run.ts';
import { placementSatisfaction } from '../src/sim/placement.ts';
import type { GameState } from '../src/sim/state.ts';
import { adminShareOfPayroll } from '../src/sim/treasury.ts';
import { latestTable, rankOf } from '../src/sim/league.ts';
import { FOUNDING_ADMIN_PAYROLL, PLACEMENT_CAP } from '../src/tuning.ts';
import { seatPayroll } from '../src/sim/seats.ts';

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

type Play = (run: Run, week: number) => Run;

interface Archetype {
  id: string;
  blurb: string;
  play: Play;
  resolve?: (s: GameState) => Action | null;
}

function tryAction(run: Run, action: Action): Run {
  return canApply(run.state, action).ok ? dispatch(run, action) : run;
}

// The first site, spiralling out from the middle of the campus, where the
// sim will let the building go.
function placeNear(run: Run, buildingId: string, rotated = false): Run {
  const def = buildingById(buildingId);
  const w = rotated ? def.footprint.h : def.footprint.w;
  const h = rotated ? def.footprint.w : def.footprint.h;
  const cx = 30;
  const cy = 30;
  for (let r = 0; r < 32; r++) {
    for (let dc = -r; dc <= r; dc++) {
      for (const dr of [-r, r]) {
        for (const [c, rr] of [
          [cx + dc, cy + dr],
          [cx + dr, cy + dc],
        ] as const) {
          // Leave a lane between buildings: every site steps by two.
          if ((c - cx) % 2 !== 0 || (rr - cy) % 2 !== 0) continue;
          if (siteRefusal(run.state.campus, def, c, rr, w, h) !== null) continue;
          for (const financing of ['gift', 'cash', 'debt'] as const) {
            const action = {
              type: 'placeBuilding',
              buildingId,
              col: c,
              row: rr,
              rotated,
              financing,
            } as const;
            if (canApply(run.state, action).ok) return dispatch(run, action);
          }
          return run;
        }
      }
    }
  }
  return run;
}

function has(state: GameState, id: string): number {
  return state.campus.placements.filter((p) => p.buildingId === id).length;
}

function staff(run: Run, cap: number): Run {
  let r = run;
  // Hire into understaffed programmes in the candidate's field.
  if (r.state.faculty.marketOpen) {
    for (const c of [...r.state.faculty.market]) {
      if (r.state.faculty.roster.length >= cap) break;
      const need = r.state.academics.programs.find(
        (p) =>
          findProgram(p.programId)?.schoolId === c.schoolId &&
          facultyOf(r.state, p.programId).length < staffingNeed(p),
      );
      if (!need) continue;
      r = tryAction(r, { type: 'hire', candidateId: c.id, programId: need.programId });
    }
  }
  // Nobody paid to teach nothing: assign the idle where they can teach.
  for (const f of unassignedFaculty(r.state)) {
    const target = r.state.academics.programs
      .filter((p) => canTeach(r.state, f, p.programId))
      .sort(
        (a, b) => facultyOf(r.state, a.programId).length - facultyOf(r.state, b.programId).length,
      )[0];
    if (target)
      r = tryAction(r, { type: 'assignFaculty', facultyId: f.id, programId: target.programId });
  }
  return r;
}

function academicYear(run: Run, maxPrograms: number, cashFloor: number, ambition = false): Run {
  let r = run;
  if (ambition) {
    // Raise the programmes that are staffed, a tier at a time, and name
    // the best two the college's signatures.
    for (const p of r.state.academics.programs) {
      if (r.state.treasury.cash < cashFloor) break;
      if (facultyOf(r.state, p.programId).length >= staffingNeed(p))
        r = tryAction(r, { type: 'advanceProgram', programId: p.programId });
    }
    for (const p of r.state.academics.programs)
      r = tryAction(r, { type: 'designateSignature', programId: p.programId });
  }
  for (const school of SCHOOLS) {
    for (const p of r.state.campus.placements) {
      const a = { type: 'foundSchool', schoolId: school.id, placementId: p.id } as const;
      if (canApply(r.state, a).ok && r.state.treasury.cash > cashFloor) {
        r = dispatch(r, a);
        break;
      }
    }
  }
  for (const program of PROGRAMS) {
    if (r.state.academics.programs.length >= maxPrograms) break;
    if (r.state.treasury.cash < cashFloor) break;
    r = tryAction(r, { type: 'openProgram', programId: program.id });
  }
  return r;
}

// Build to need, a building a year at most of each kind.
function buildToNeed(run: Run, full: boolean): Run {
  let r = run;
  const s = r.state;
  const cap = campusCapacity(s);
  const students = enrolled(s) + (s.people.incoming?.size ?? 150);
  if (cap.beds < students * 1.05)
    r = placeNear(r, full && has(s, 'residence-hall') > 2 ? 'apartments' : 'residence-hall');
  if (cap.meals < students)
    r = placeNear(r, has(s, 'dining-hall') > 1 && full ? 'food-hall' : 'dining-hall');
  if (cap.seats < students)
    r = placeNear(r, has(s, 'academic-hall') < 5 ? 'academic-hall' : 'lecture-theatre');
  if (!full) return r;
  const y = s.clock.year;
  const once: [string, number][] = [
    ['library', 3],
    ['student-center', 4],
    ['health-center', 6],
    ['playing-field', 5],
    ['admissions-office', 7],
    ['recreation-center', 9],
    ['counselling-center', 12],
    ['alumni-house', 14],
    ['gymnasium', 16],
    ['cafe', 10],
    ['fountain', 11],
    ['museum', 20],
    ['science-center', 18],
    ['chapel', 24],
  ];
  for (const [id, year] of once) {
    if (y >= year && has(r.state, id) === 0) {
      r = placeNear(r, id);
      break;
    }
  }
  return r;
}

// Mend the estate: whatever has worn below the line, worst first, while
// the cash stays above the floor. A steward does this every year; a player
// who never does watches the halls their schools teach in fall down.
function renovate(run: Run, below: number, cashFloor: number): Run {
  let r = run;
  const worn = r.state.campus.placements
    .filter((p) => p.status === 'open' && p.condition < below)
    .sort((a, b) => a.condition - b.condition);
  for (const p of worn) {
    if (r.state.treasury.cash - renovationCost(p) < cashFloor) break;
    r = tryAction(r, { type: 'renovate', placementId: p.id });
  }
  return r;
}

const STEWARD: Archetype = {
  id: 'steward',
  blurb: 'builds to need, staffs every programme, delegates on schedule, fields teams',
  play: (run, week) => {
    let r = staff(run, 200);
    if (week % WEEKS_PER_YEAR === 2) {
      r = renovate(r, 0.8, 3_000_000);
      r = buildToNeed(r, true);
      r = academicYear(r, 14, 4_000_000, true);
      const y = r.state.clock.year;
      if (y >= 4)
        r = tryAction(r, { type: 'appointSeat', seatId: 'provost', from: { kind: 'outside' } });
      if (y >= 7)
        r = tryAction(r, { type: 'appointSeat', seatId: 'advancement', from: { kind: 'outside' } });
      if (y >= 10)
        r = tryAction(r, { type: 'appointSeat', seatId: 'facilities', from: { kind: 'outside' } });
      if (y >= 12)
        r = tryAction(r, {
          type: 'appointSeat',
          seatId: 'dean-of-students',
          from: { kind: 'outside' },
        });
      if (y >= 8)
        for (const school of r.state.academics.schools)
          r = tryAction(r, {
            type: 'appointSeat',
            seatId: 'dean',
            schoolId: school.schoolId,
            from: { kind: 'outside' },
          });
      for (const c of CAMPAIGNS) r = tryAction(r, { type: 'launchCampaign', campaignId: c.id });
      for (const sportId of ['rowing', 'soccer', 'basketball'])
        r = tryAction(r, { type: 'setVarsity', sportId, on: true });
    }
    return r;
  },
};

const GROWTH: Archetype = {
  id: 'growth',
  blurb:
    'builds fast on debt, opens everything, delegates early — and pulls back when the board does',
  play: (run, week) => {
    // Aggressive, not suicidal: a growth player still reads the ladder.
    const stretched = run.state.distress.rung > 0 || run.state.treasury.cash < 2_000_000;
    let r = staff(run, stretched ? run.state.faculty.roster.length : 200);
    if (week % 12 === 2 && !stretched) r = buildToNeed(r, true);
    if (week % WEEKS_PER_YEAR === 2) {
      r = renovate(r, 0.6, 1_000_000);
      r = academicYear(r, 24, 1_000_000, true);
      for (const seatId of ['provost', 'facilities', 'dean-of-students', 'advancement'])
        r = tryAction(r, { type: 'appointSeat', seatId, from: { kind: 'outside' } });
      for (const school of r.state.academics.schools)
        r = tryAction(r, {
          type: 'appointSeat',
          seatId: 'dean',
          schoolId: school.schoolId,
          from: { kind: 'outside' },
        });
      for (const c of CAMPAIGNS) r = tryAction(r, { type: 'launchCampaign', campaignId: c.id });
    }
    return r;
  },
};

const FRUGAL: Archetype = {
  id: 'frugal',
  blurb: 'builds only what the students need, a small faculty, no administration',
  play: (run, week) => {
    let r = staff(run, 24);
    if (week % WEEKS_PER_YEAR === 2) {
      r = buildToNeed(r, false);
      r = academicYear(r, 6, 8_000_000);
    }
    return r;
  },
};

export const ARCHETYPES: readonly Archetype[] = [STEWARD, GROWTH, FRUGAL];

// ---------- the measurements ----------

// Real time, estimated (DD §2.2): the fastest speed the college has
// earned, capped by the span's character, plus a player's minute for each
// beat and twenty seconds for each question and letter.
const SPAN_CAP: [number, number, 'x1' | 'x2' | 'x4' | 'x8'][] = [
  [1, 10, 'x1'],
  [11, 25, 'x2'],
  [26, 40, 'x4'],
  [41, 50, 'x8'],
];
// A player sits the first beats slowly and the late ones quickly.
const BEAT_SECONDS = [50, 40, 35, 30];
const EVENT_SECONDS = 20;

interface Report {
  archetype: string;
  seed: number;
  adminShare: number;
  askedPer: number; // weeks per player-decided event, years 15–35
  delegatedPer: number;
  placementShare: number;
  spans: number[]; // minutes per §2.2 span
  mark: string;
  rank: number | null;
  enrolled: number;
  faculty: number;
  seats: number;
  distressYears: number;
  tags: string[];
  // The administration's payroll, by where it came from (DD §5.4).
  axes: Record<string, number>;
  money: { cash: number; endowment: number; debt: number; revenue: number; expenses: number }[];
  admin: { founding: number; seats: number; ratchet: number; faculty: number };
  // The middle years, measured (Phase 35, DD §17's 1.1 guardrails).
  middle: Middle;
}

interface Middle {
  cashCover: number[]; // operating cash as years of expenses, at Years 10, 20, 30, 40 and 50
  sting: (number | null)[]; // median priced choice as a share of the budget, per decade
  saturatedYears: number; // years with any class above 95 satisfaction
  titleRate: number; // titles per varsity season
  demandResponse: number | null; // applicant-pool change after a 20-point teaching drop at Year 25
  idleBeats: number; // clock-stopping beats with nothing to decide
  reputation: number[]; // the talk at the gate (Phase 37), at Years 10, 20, 30, 40 and 50
  tagsEver: string[];
}

// A beat with nothing to decide: the Board Meeting of a sound college with
// no cuts on its list, and a Convocation with no promise to accept. The
// other two beats set terms and budgets, which is always a decision.
function idleBeat(s: GameState, beatId: string): boolean {
  if (beatId === 'board-meeting') return s.distress.rung < 2 && s.ambitions.offered === null;
  if (beatId === 'convocation') return s.ambitions.offered === null;
  return false;
}

// The costliest priced choice an event offers, as a share of the year's
// budgeted expenses; null when no choice costs cash.
function stingOf(s: GameState, eventId: string): number | null {
  // At the price the letter quoted: the college's size applied (Phase 36).
  const scale = priceScale(s);
  const costs = eventById(eventId)
    .choices.map((c) => -scaledAmount(c.effects.cash ?? 0, scale))
    .filter((c) => c > 0);
  if (costs.length === 0) return null;
  const budget = Object.values(s.treasury.budget.expenses).reduce((t, v) => t + v, 0);
  return budget > 0 ? Math.max(...costs) / budget : null;
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

// What four years of teaching twenty points worse does to the pool: the
// same college from Year 25, twice, once with every teacher weaker.
function demandResponse(
  run: Run,
  play: Play,
  resolve: (s: GameState) => Action | null,
  week0: number,
): number | null {
  const weaker: Run = {
    ...run,
    state: {
      ...run.state,
      faculty: {
        ...run.state.faculty,
        roster: run.state.faculty.roster.map((f) => ({
          ...f,
          teaching: Math.max(0, f.teaching - 20),
        })),
      },
    },
  };
  let a = run;
  let b = weaker;
  for (let w = 0; w < 4 * WEEKS_PER_YEAR; w++) {
    a = play(tickRunWeeks(a, 1, resolve), week0 + w);
    b = tickRunWeeks(b, 1, resolve);
    // The weaker college keeps its roster weak: no hiring around the test.
    b = { ...b, state: { ...b.state, faculty: { ...b.state.faculty, market: [] } } };
  }
  const pa = a.state.people.lastAdmissions?.applicants ?? 0;
  const pb = b.state.people.lastAdmissions?.applicants ?? 0;
  return pa > 0 ? (pb - pa) / pa : null;
}

export function measure(a: Archetype, seed: number): Report {
  let run = dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
  const spans = [0, 0, 0, 0];
  const money: Report['money'] = [];
  const cashCover: number[] = [];
  const reputation: number[] = [];
  const stings: number[][] = [[], [], [], [], []];
  let saturatedYears = 0;
  let idleBeats = 0;
  let response: number | null = null;
  let heard = 0;
  // A player answers the question on the strip when it arrives, as the
  // stated default unless they have a reason not to.
  const resolve =
    a.resolve ??
    ((st: GameState): Action | null => {
      const inline = pendingInline(st);
      if (inline)
        return {
          type: 'resolveEvent',
          instanceId: inline.instanceId,
          choiceId: eventById(inline.eventId).default,
        };
      return defaultResolution(st);
    });
  for (let week = 0; week < 50 * WEEKS_PER_YEAR; week++) {
    const before = run.state;
    if (week === 25 * WEEKS_PER_YEAR) response = demandResponse(run, a.play, resolve, week);
    run = tickRunWeeks(run, 1, resolve);
    run = a.play(run, week);
    for (const e of run.state.bus.slice(heard)) {
      const decade = Math.min(4, Math.floor(e.week / (10 * WEEKS_PER_YEAR)));
      if (e.kind === 'eventFired') {
        const sting = stingOf(run.state, e.eventId);
        if (sting !== null) stings[decade]!.push(sting);
      }
      if (e.kind === 'beatFired' && idleBeat(run.state, e.beatId)) idleBeats++;
    }
    heard = run.state.bus.length;
    if (week % WEEKS_PER_YEAR === 0 && run.state.people.cohorts.some((c) => c.satisfaction > 95))
      saturatedYears++;
    if (week > 0 && week % (10 * WEEKS_PER_YEAR) === 0) {
      const t = run.state.treasury;
      const spend = Object.values(t.budget.expenses).reduce((x, v) => x + v, 0);
      cashCover.push(spend > 0 ? t.cash / spend : 0);
      reputation.push(Math.round(run.state.people.reputation));
    }
    if (week % (10 * WEEKS_PER_YEAR) === 40) {
      const t = run.state.treasury;
      const sum = (o: object) => Object.values(o).reduce((x: number, v) => x + (v as number), 0);
      money.push({
        cash: t.cash,
        endowment: t.endowment,
        debt: t.debt,
        revenue: sum(t.budget.revenue),
        expenses: sum(t.budget.expenses),
      });
    }
    const y = before.clock.year;
    const span = SPAN_CAP.findIndex(([from, to]) => y >= from && y <= to);
    if (span >= 0) {
      const cap = SPAN_CAP[span]![2];
      const order = ['x1', 'x2', 'x4', 'x8'] as const;
      let speed: (typeof order)[number] = 'x1';
      for (const sp of order)
        if (order.indexOf(sp) <= order.indexOf(cap) && speedAllowed(before, sp)) speed = sp;
      spans[span]! += msPerWeek(speed) / 60000;
    }
  }
  const s = run.state;
  {
    const spend = Object.values(s.treasury.budget.expenses).reduce((x, v) => x + v, 0);
    cashCover.push(spend > 0 ? s.treasury.cash / spend : 0);
    reputation.push(Math.round(s.people.reputation));
  }
  const inWindow = (w: number) => w >= 15 * WEEKS_PER_YEAR && w < 35 * WEEKS_PER_YEAR;
  const asked = entriesOfKind(s, 'eventFired').filter((e) => inWindow(e.week)).length;
  const delegated = entriesOfKind(s, 'eventDelegated').filter((e) => inWindow(e.week)).length;
  // Decision time, by span.
  for (const e of s.bus) {
    const y = Math.floor(e.week / WEEKS_PER_YEAR) + 1;
    const span = SPAN_CAP.findIndex(([from, to]) => y >= from && y <= to);
    if (span < 0) continue;
    if (e.kind === 'beatFired') spans[span]! += BEAT_SECONDS[span]! / 60;
    if (e.kind === 'eventFired' || e.kind === 'boardLetter') spans[span]! += EVENT_SECONDS / 60;
  }
  const table = latestTable(s);
  const seasons = entriesOfKind(s, 'seasonClosed');
  const middle: Middle = {
    cashCover: cashCover.map((c) => Number(c.toFixed(2))),
    sting: stings.map((xs) => {
      const m = median(xs);
      return m === null ? null : Number(m.toFixed(4));
    }),
    saturatedYears,
    titleRate: seasons.length ? seasons.filter((e) => e.title).length / seasons.length : 0,
    demandResponse: response === null ? null : Number((response as number).toFixed(3)),
    idleBeats,
    reputation,
    tagsEver: [...new Set(entriesOfKind(s, 'tagEarned').map((e) => e.tag))],
  };
  return {
    archetype: a.id,
    seed,
    adminShare: adminShareOfPayroll(s.treasury.budget),
    askedPer: asked ? (20 * WEEKS_PER_YEAR) / asked : Infinity,
    delegatedPer: delegated ? (20 * WEEKS_PER_YEAR) / delegated : Infinity,
    placementShare: Math.abs(placementSatisfaction(s).applied) / (PLACEMENT_CAP * 100),
    spans: spans.map((m) => Number(m.toFixed(0))),
    mark: s.ending.report?.mark ?? '—',
    rank: table ? rankOf(table) : null,
    enrolled: enrolled(s),
    faculty: s.faculty.roster.length,
    seats: s.delegation.seats.length,
    distressYears: new Set(
      entriesOfKind(s, 'rungChanged')
        .filter((e) => e.to >= 3)
        .map((e) => Math.floor(e.week / WEEKS_PER_YEAR)),
    ).size,
    tags: s.perception.tags,
    axes: { ...s.prestige.axes },
    money,
    admin: {
      founding: FOUNDING_ADMIN_PAYROLL,
      seats: seatPayroll(s),
      ratchet: s.treasury.standing.admin,
      faculty: s.treasury.budget.expenses.facultyPayroll,
    },
    middle,
  };
}

// DD §17's 1.1 guardrails (Phase 35): the bands the middle years are held
// to. Cash cover from Year 10; sting in every decade; the rest per run.
export const MIDDLE_BANDS = {
  cashCover: [0.25, 1.0],
  sting: [0.01, 0.05],
  saturatedYears: [0, 0],
  titleRate: [0.1, 0.25],
  demandResponse: [-1, -0.1],
  idleBeats: [0, 25],
} as const;

const inside = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

function middleLine(r: Report): string {
  const m = r.middle;
  const B = MIDDLE_BANDS;
  const flag = (ok: boolean) => (ok ? 'ok' : 'OUT');
  const cover = m.cashCover.slice(1);
  const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
  return [
    `cash cover ${m.cashCover.join('/')}y ${flag(cover.every((c) => inside(c, B.cashCover)))}`,
    `sting ${m.sting.map(pct).join('/')} ${flag(m.sting.every((x) => x === null || inside(x, B.sting)))}`,
    `saturated ${m.saturatedYears}y ${flag(inside(m.saturatedYears, B.saturatedYears))}`,
    `titles ${(m.titleRate * 100).toFixed(0)}% of seasons ${flag(m.titleRate === 0 || inside(m.titleRate, B.titleRate))}`,
    `demand ${pct(m.demandResponse)} for −20 teaching ${flag(m.demandResponse !== null && inside(m.demandResponse, B.demandResponse))}`,
    `idle beats ${m.idleBeats} ${flag(inside(m.idleBeats, B.idleBeats))}`,
    `reputation ${m.reputation.join('/')}`,
  ].join(' · ');
}

const BUDGET = [
  [60, 80],
  [70, 90],
  [50, 70],
  [30, 45],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes('--json');
  const reports: Report[] = [];
  for (const a of ARCHETYPES) for (const seed of [4, 11, 21]) reports.push(measure(a, seed));
  if (json) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    console.log('PHASE 31 BALANCE DASHBOARD — DD §2.2 and §17, three archetypes × three seeds\n');
    for (const r of reports) {
      const inBand = r.adminShare >= 0.25 && r.adminShare <= 0.4;
      // DD §17.3: one event per 2–4 weeks at mid-game, the President's
      // share declining with delegation — so the band is on the total.
      const everyWeeks = 1 / (1 / r.askedPer + 1 / r.delegatedPer);
      const cadence = everyWeeks >= 2 && everyWeeks <= 4;
      const spans = r.spans.map((m, i) => `${m}/${BUDGET[i]![0]}–${BUDGET[i]![1]}`).join(' ');
      console.log(
        `${r.archetype.padEnd(8)} seed ${String(r.seed).padStart(2)}  admin ${(r.adminShare * 100).toFixed(0)}% ${inBand ? 'ok' : 'OUT'} · events 1/${everyWeeks.toFixed(1)}wk ${cadence ? 'ok' : 'OUT'} (asked 1/${r.askedPer.toFixed(1)}, delegated 1/${r.delegatedPer.toFixed(1)}) · placement ${(r.placementShare * 100).toFixed(0)}% of cap · minutes ${spans} · mark ${r.mark} rank ${r.rank} · ${r.enrolled} students ${r.faculty} faculty ${r.seats} seats · ${r.distressYears}y distress · ${r.tags.join(',') || 'no tags'}`,
      );
      console.log(`         middle  ${middleLine(r)}`);
    }
    // Tags every archetype earned, seed by seed (0 is the band).
    for (const seed of [4, 11, 21]) {
      const sets = reports.filter((r) => r.seed === seed).map((r) => new Set(r.middle.tagsEver));
      const shared = [...sets[0]!].filter((t) => sets.every((x) => x.has(t)));
      console.log(
        `seed ${seed}: tags every archetype earned: ${shared.join(', ') || 'none'} ${shared.length === 0 ? 'ok' : 'OUT'}`,
      );
    }
  }
}
