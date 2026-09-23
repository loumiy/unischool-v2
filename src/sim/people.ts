import { buildingById } from '../content/buildings.ts';
import {
  ADMIT_RATE_MAX,
  ADMIT_RATE_MIN,
  AID_DISCOUNT_RATE,
  APPLICANT_QUALITY_MEAN,
  APPLICANT_QUALITY_SD,
  ATTRITION_BASE,
  ATTRITION_LINE,
  ATTRITION_MAX,
  ATTRITION_PER_POINT,
  ATTRITION_PER_QUALITY_POINT,
  MOOD_DECAY_PER_YEAR,
  ATTRITION_QUALITY_LINE,
  OUTCOME_ADRIFT_BASE,
  OUTCOME_ADRIFT_MAX,
  OUTCOME_DISTINGUISHED_MAX,
  OUTCOME_QUALITY_WEIGHT,
  QUALITY_DRIFT,
  RUNG_SATISFACTION_PENALTY,
  BASE_APPLICANTS,
  CONDITION_WEIGHT,
  DINING_PENALTY,
  MARKET_TUITION,
  PRESTIGE_STUB,
  PRICE_ELASTICITY,
  ROOM_AND_BOARD_MARGIN,
  SATISFACTION_BASE,
  SEATS_PENALTY,
  SELECTIVITY_DEFAULT,
  SELECTIVITY_STEP,
  TRIPLES_OVERFLOW_SHARE,
  TRIPLES_PENALTY,
  TUITION_DEFAULT,
  TUITION_MAX,
  TUITION_MIN,
  TUITION_STEP,
  YIELD_BASE,
  YIELD_PRICE_ELASTICITY,
} from '../tuning.ts';
import { emit } from './bus.ts';
import { classLabel, WEEKS_PER_YEAR } from './calendar.ts';
import type { Placement } from './campus.ts';
import { openPlacements } from './estate.ts';
import { memoryFor, warmthFor } from './alumni.ts';
import { fadeMood } from './events.ts';
import { placementPoolFactor, placementSatisfaction } from './placement.ts';
import {
  nameNewcomers,
  tellGraduationBeats,
  tellTermBeats,
  tellYearBeats,
  type NamedStudent,
} from './students.ts';
import { quirkMorale, teachingQuality, teachingSatisfaction } from './faculty.ts';
import type { GameState } from './state.ts';

// PEOPLE (DD §8): students as cohorts, one per class year, carrying size,
// quality and satisfaction; the applicant pool and the Admissions Day
// decision that turns it into a class; the class arriving at Convocation,
// thinning each year, and graduating into the alumni ledger. Prestige,
// and identity are stubs until their phases; the pool answers only beauty,
// price and selectivity for now.

// The standing terms, set at Admissions Day and kept for the next.
export interface AdmissionTerms {
  tuition: number; // the sticker, per year
  selectivity: number; // 0–1, the share of the pool turned away
}

export interface Cohort {
  classYear: number; // the year they graduate: "the Class of '34"
  size: number;
  quality: number; // 0–100
  satisfaction: number; // 0–100
}

// What Admissions Day produced: the class committed to arrive at the next
// Convocation, and the funnel that produced it.
export interface Admissions {
  year: number; // the year the class arrives
  applicants: number;
  admitted: number;
  yieldRate: number;
  size: number;
  quality: number;
  cap: number; // the most the campus could take
  capped: boolean; // the file closed early for want of beds
}

// How a class turned out (DD §8.3): the distinguished, the placed, the
// adrift, as counts summing to the class.
export interface Outcomes {
  distinguished: number;
  placed: number;
  adrift: number;
}

export interface AlumniClass {
  classYear: number;
  size: number;
  quality: number;
  satisfaction: number; // as they left
  outcomes: Outcomes;
  // The ledger (DD §8.4, alumni.ts): the clauses their four years earned,
  // the warmth that memory set, what a reunion has nudged it by since,
  // and the year of the last one.
  memory: string[];
  warmth: number;
  nudged: number;
  lastReunion: number | null;
}

export interface People {
  terms: AdmissionTerms;
  // The aid discount on the sticker (DD §5.2): a standing rate the board
  // can cut under austerity.
  aidRate: number;
  cohorts: Cohort[];
  incoming: Admissions | null;
  lastAdmissions: Admissions | null;
  alumni: AlumniClass[];
  // The handful the game follows (students.ts): a lens on the cohorts,
  // carrying no number the sim reads back.
  named: NamedStudent[];
  nextStudentId: number;
  // What the last few events left them feeling (events.ts), in
  // satisfaction points; it fades over a couple of years.
  mood: number;
}

export function foundingPeople(): People {
  return {
    terms: { tuition: TUITION_DEFAULT, selectivity: SELECTIVITY_DEFAULT },
    aidRate: AID_DISCOUNT_RATE,
    cohorts: [],
    incoming: null,
    lastAdmissions: null,
    alumni: [],
    named: [],
    nextStudentId: 1,
    mood: 0,
  };
}

export function clampTuition(t: number): number {
  const stepped = Math.round(t / TUITION_STEP) * TUITION_STEP;
  return Math.min(TUITION_MAX, Math.max(TUITION_MIN, stepped));
}

export function clampSelectivity(s: number): number {
  const stepped = Math.round(s / SELECTIVITY_STEP) * SELECTIVITY_STEP;
  return Number(Math.min(1, Math.max(0, stepped)).toFixed(4));
}

export function enrolled(state: GameState): number {
  return state.people.cohorts.reduce((t, c) => t + c.size, 0);
}

// ---------- capacity (DD §8.2) ----------

export interface CampusCapacity {
  beds: number;
  meals: number;
  seats: number;
}

export function campusCapacity(state: GameState): CampusCapacity {
  return capacityOf(openPlacements(state));
}

// The capacity the campus will have by `week`: what is open, plus every
// site and renovation that finishes by then. Admissions counts the beds
// that will exist at Convocation, not the ones that exist today.
export function capacityAt(state: GameState, week: number): CampusCapacity {
  return capacityOf(
    state.campus.placements.filter(
      (p) => p.status === 'open' || (p.completesWeek !== null && p.completesWeek <= week),
    ),
  );
}

function capacityOf(placements: readonly Placement[]): CampusCapacity {
  const cap = { beds: 0, meals: 0, seats: 0 };
  for (const p of placements) {
    const c = buildingById(p.buildingId).capacity;
    if (!c) continue;
    cap.beds += c.beds ?? 0;
    cap.meals += c.meals ?? 0;
    cap.seats += c.seats ?? 0;
  }
  return cap;
}

// The absolute week of the next Convocation: Fall, Week 1 of next year.
export function nextConvocationWeek(state: GameState): number {
  return state.clock.year * WEEKS_PER_YEAR;
}

// Students housed in triples: those beyond the beds.
export function inTriples(state: GameState): number {
  return Math.max(0, enrolled(state) - campusCapacity(state).beds);
}

// The most the next class can be: the beds plus the triples allowance,
// less everyone who will still be here when it arrives.
export function intakeCap(state: GameState): number {
  const { beds } = capacityAt(state, nextConvocationWeek(state));
  const room = Math.floor(beds * (1 + TRIPLES_OVERFLOW_SHARE));
  const continuing = state.people.cohorts
    .filter((c) => c.classYear > state.clock.year)
    .reduce((t, c) => t + c.size, 0);
  return Math.max(0, room - continuing);
}

// THE FILE AFTER THIS ONE (Phase 21F). By Budget & Hiring the next class
// has already been admitted, so the admissions the player can still change
// are the following spring's — and the one lever on them that takes a year
// to pull is the beds. This is that file's cap, counted the way Admissions
// Day will count it: the beds that will stand at the Convocation after
// next, plus triples, less everyone who will still be here, the class
// already admitted among them.
export function followingIntakeCap(state: GameState): { cap: number; beds: number } {
  const arrives = state.clock.year + 1;
  const { beds } = capacityAt(state, arrives * WEEKS_PER_YEAR);
  const room = Math.floor(beds * (1 + TRIPLES_OVERFLOW_SHARE));
  const incoming = state.people.incoming;
  const continuing =
    state.people.cohorts.filter((c) => c.classYear > arrives).reduce((t, c) => t + c.size, 0) +
    (incoming && incoming.year === arrives ? incoming.size : 0);
  return { cap: Math.max(0, room - continuing), beds };
}

// ---------- the funnel (DD §8.2) ----------

// The price the pool feels: the net of aid, against the market's own net.
export function netTuition(tuition: number, aidRate: number): number {
  return Math.round(tuition * (1 - aidRate));
}

export function marketNetTuition(): number {
  return netTuition(MARKET_TUITION, AID_DISCOUNT_RATE);
}

// The pool: a base, scaled by prestige (a stub), by what the layout is
// worth (placement.ts, capped), and by price position against the market.
export function applicantPool(
  terms: AdmissionTerms,
  aidRate: number = AID_DISCOUNT_RATE,
  placementFactor = 1,
): number {
  const prestige = 0.5 + PRESTIGE_STUB / 100;
  const beauty = placementFactor;
  const price = Math.pow(marketNetTuition() / netTuition(terms.tuition, aidRate), PRICE_ELASTICITY);
  return Math.round(BASE_APPLICANTS * prestige * beauty * price);
}

export function admitRate(selectivity: number): number {
  return Math.min(ADMIT_RATE_MAX, Math.max(ADMIT_RATE_MIN, 1 - selectivity));
}

export function yieldRate(terms: AdmissionTerms, aidRate: number = AID_DISCOUNT_RATE): number {
  const price = Math.pow(
    marketNetTuition() / netTuition(terms.tuition, aidRate),
    YIELD_PRICE_ELASTICITY,
  );
  return Number(Math.min(0.95, Math.max(0.05, YIELD_BASE * price)).toFixed(4));
}

// Mean quality of the admitted: the top `rate` share of a normal pool.
// E[X | X > q] = μ + σ·φ(z)/rate with z the (1−rate) quantile.
export function admittedQuality(rate: number): number {
  const z = inverseNormal(1 - rate);
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const q = APPLICANT_QUALITY_MEAN + (APPLICANT_QUALITY_SD * phi) / rate;
  return Number(Math.min(100, Math.max(0, q)).toFixed(1));
}

// Acklam's rational approximation of the standard normal quantile.
export function inverseNormal(p: number): number {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  const hi = 1 - lo;
  let q: number;
  let r: number;
  if (p < lo) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= hi) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

// The whole funnel for a set of terms, against the campus as it stands:
// what the Admissions Day screen previews and what resolving it commits.
export function runAdmissions(state: GameState, terms: AdmissionTerms): Admissions {
  const applicants = applicantPool(terms, state.people.aidRate, placementPoolFactor(state));
  const rate = admitRate(terms.selectivity);
  const admitted = Math.round(applicants * rate);
  const yr = yieldRate(terms, state.people.aidRate);
  const wanted = Math.round(admitted * yr);
  const cap = intakeCap(state);
  const size = Math.min(wanted, cap);
  return {
    year: state.clock.year + 1,
    applicants,
    admitted,
    yieldRate: yr,
    size,
    quality: admittedQuality(rate),
    cap,
    capped: wanted > cap,
  };
}

// The Admissions Day decision: set the terms, run the funnel, commit the
// class. The stated default is the standing terms.
export function closeAdmissions(
  state: GameState,
  tuition: number | undefined,
  selectivity: number | undefined,
): GameState {
  const p = state.people;
  const terms: AdmissionTerms = {
    tuition: clampTuition(tuition ?? p.terms.tuition),
    selectivity: clampSelectivity(selectivity ?? p.terms.selectivity),
  };
  const result = runAdmissions({ ...state, people: { ...p, terms } }, terms);
  return emit(
    { ...state, people: { ...p, terms, incoming: result, lastAdmissions: result } },
    {
      kind: 'admissionsClosed',
      year: result.year,
      applicants: result.applicants,
      admitted: result.admitted,
      size: result.size,
      capped: result.capped,
    },
  );
}

// ---------- money (DD §5.1–§5.2) ----------

export function annualTuition(state: GameState): number {
  return enrolled(state) * state.people.terms.tuition;
}

export function annualAid(state: GameState): number {
  return Math.round(annualTuition(state) * state.people.aidRate);
}

export function annualAuxiliaries(state: GameState): number {
  const housed = Math.min(enrolled(state), campusCapacity(state).beds);
  return housed * ROOM_AND_BOARD_MARGIN;
}

// Next year's enrollment as the budget can foresee it: everyone not
// graduating, thinned by the base attrition, plus the class committed.
export function projectedEnrollment(state: GameState): number {
  const { year } = state.clock;
  const continuing = state.people.cohorts
    .filter((c) => c.classYear > year)
    .reduce((t, c) => t + Math.round(c.size * (1 - ATTRITION_BASE)), 0);
  return continuing + (state.people.incoming?.size ?? 0);
}

// ---------- the year (DD §8.3) ----------

export function campusCondition(state: GameState): number {
  const open = openPlacements(state);
  if (open.length === 0) return 1;
  return open.reduce((t, p) => t + p.condition, 0) / open.length;
}

// Satisfaction, term by term (DD §8.3): what the campus gives them —
// housing, dining, seats, the state of the buildings — the teaching
// (faculty.ts) and the faculty's quirks, what the layout is worth
// (placement.ts, capped), what the events have left them feeling, and the
// conditions of the day (the ladder). Every term is a
// signed number of points, so the debug panel can trace cause to effect.
// Student life arrives with its phase.
export interface SatisfactionBreakdown {
  base: number;
  housing: number;
  dining: number;
  seats: number;
  condition: number;
  teaching: number;
  morale: number;
  placement: number;
  events: number;
  conditions: number;
  total: number; // clamped 0–100
}

export function satisfactionBreakdown(state: GameState, total: number): SatisfactionBreakdown {
  const cap = campusCapacity(state);
  const over = (have: number) => (total > 0 && total > have ? (total - have) / total : 0);
  const b = {
    base: SATISFACTION_BASE,
    housing: -TRIPLES_PENALTY * over(cap.beds),
    dining: -DINING_PENALTY * over(cap.meals),
    seats: -SEATS_PENALTY * over(cap.seats),
    condition: (campusCondition(state) - 1) * CONDITION_WEIGHT,
    teaching: teachingSatisfaction(state),
    morale: quirkMorale(state),
    placement: placementSatisfaction(state).applied,
    events: state.people.mood,
    conditions: -(RUNG_SATISFACTION_PENALTY[state.distress.rung] ?? 0),
  };
  const sum =
    b.base +
    b.housing +
    b.dining +
    b.seats +
    b.condition +
    b.teaching +
    b.morale +
    b.placement +
    b.events +
    b.conditions;
  return { ...b, total: Number(Math.min(100, Math.max(0, sum)).toFixed(1)) };
}

export function satisfactionFor(state: GameState, total: number): number {
  return satisfactionBreakdown(state, total).total;
}

// The share of a cohort that leaves in a year: a base, rising below the
// satisfaction line, and rising again below the quality line.
export function attritionRate(satisfaction: number, quality = 100): number {
  const unhappy = Math.max(0, ATTRITION_LINE - satisfaction);
  const weak = Math.max(0, ATTRITION_QUALITY_LINE - quality);
  return Math.min(
    ATTRITION_MAX,
    ATTRITION_BASE + unhappy * ATTRITION_PER_POINT + weak * ATTRITION_PER_QUALITY_POINT,
  );
}

// A cohort's quality after a year of the campus's teaching: part of the
// way from where it was to the teaching it got.
export function driftedQuality(quality: number, teaching: number): number {
  return Number((quality + (teaching - quality) * QUALITY_DRIFT).toFixed(1));
}

// The class's score and its outcomes (DD §8.3), as counts.
export function outcomeScore(quality: number, satisfaction: number): number {
  return quality * OUTCOME_QUALITY_WEIGHT + satisfaction * (1 - OUTCOME_QUALITY_WEIGHT);
}

export function outcomesFor(quality: number, satisfaction: number, size: number): Outcomes {
  const score = outcomeScore(quality, satisfaction);
  const above = Math.min(1, Math.max(0, (score - 50) / 50));
  const below = Math.min(1, Math.max(0, (50 - score) / 50));
  const distinguished = Math.round(size * above * OUTCOME_DISTINGUISHED_MAX);
  const adrift = Math.min(
    size - distinguished,
    Math.round(size * (OUTCOME_ADRIFT_BASE + below * OUTCOME_ADRIFT_MAX)),
  );
  return { distinguished, placed: size - distinguished - adrift, adrift };
}

// Commencement, the first week of summer: the class whose year it is
// graduates into the ledger.
// A class leaves the books and joins the ledger, stamped with one line
// about the four years it had (DD §8.4).
function stampClass(state: GameState, c: Cohort): AlumniClass {
  const outcomes = outcomesFor(c.quality, c.satisfaction, c.size);
  const memory = memoryFor(state, c, outcomes);
  return {
    classYear: c.classYear,
    size: c.size,
    quality: c.quality,
    satisfaction: c.satisfaction,
    outcomes,
    memory,
    warmth: warmthFor(c, outcomes, memory),
    nudged: 0,
    lastReunion: null,
  };
}

export function graduate(state: GameState): GameState {
  const { year } = state.clock;
  const leaving = state.people.cohorts.filter((c) => c.classYear <= year);
  if (leaving.length === 0) return state;
  const farewells: { student: NamedStudent; arcId: string }[] = [];
  let named = state.people.named;
  for (const c of leaving) {
    const result = tellGraduationBeats(
      { ...state, people: { ...state.people, named } },
      c,
      outcomesFor(c.quality, c.satisfaction, c.size),
    );
    named = result.named;
    for (const t of result.told) farewells.push({ student: t.student, arcId: t.arc.id });
  }
  let next: GameState = {
    ...state,
    people: {
      ...state.people,
      named,
      cohorts: state.people.cohorts.filter((c) => c.classYear > year),
      alumni: [...state.people.alumni, ...leaving.map((c) => stampClass(state, c))],
    },
  };
  for (const c of leaving) {
    const outcomes = outcomesFor(c.quality, c.satisfaction, c.size);
    next = emit(next, {
      kind: 'classGraduated',
      classYear: c.classYear,
      size: c.size,
      distinguished: outcomes.distinguished,
      adrift: outcomes.adrift,
    });
    next = emit(next, { kind: 'classRemembered', classYear: c.classYear });
  }
  for (const f of farewells) {
    next = emit(next, { kind: 'studentBeat', studentId: f.student.id, arcId: f.arcId });
  }
  return next;
}

// Convocation, the first week of fall: every cohort's year is scored, its
// quality drifts toward the teaching it had, it is thinned at its own
// rate, and the committed class arrives.
export function arrive(state: GameState): GameState {
  const { year } = state.clock;
  const p = state.people;
  const incoming = p.incoming && p.incoming.year === year ? p.incoming : null;
  const enrolledBefore = enrolled(state);
  const total = enrolledBefore + (incoming?.size ?? 0);
  const satisfaction = satisfactionFor(state, total);
  const teaching = teachingQuality(state);
  let left = 0;
  const cohorts = p.cohorts.map((c) => {
    const quality = driftedQuality(c.quality, teaching);
    const gone = Math.round(c.size * attritionRate(satisfaction, quality));
    left += gone;
    return { ...c, size: c.size - gone, satisfaction, quality };
  });
  if (incoming && incoming.size > 0) {
    cohorts.push({
      classYear: year + 3,
      size: incoming.size,
      quality: incoming.quality,
      satisfaction,
    });
  }
  let next: GameState = {
    ...state,
    people: { ...p, cohorts, incoming: incoming ? null : p.incoming },
  };
  // The named are drawn AFTER the cohorts are re-scored, so every beat
  // reads the year the students are actually living through.
  const newcomers =
    incoming && incoming.size > 0
      ? nameNewcomers(next, year + 3)
      : { named: [], nextId: p.nextStudentId };
  next = {
    ...next,
    people: {
      ...next.people,
      named: [...next.people.named, ...newcomers.named],
      nextStudentId: newcomers.nextId,
    },
  };
  const beats = tellYearBeats(next, enrolledBefore > 0 ? left / enrolledBefore : 0);
  next = {
    ...next,
    people: {
      ...next.people,
      named: beats.named,
      // What the events did fades over a couple of years (events.ts).
      mood: fadeMood(next.people.mood, MOOD_DECAY_PER_YEAR),
    },
  };
  if (left > 0) next = emit(next, { kind: 'studentsLeft', count: left });
  if (incoming && incoming.size > 0) {
    const triples = Math.max(0, total - campusCapacity(state).beds);
    next = emit(next, {
      kind: 'classArrived',
      classYear: year + 3,
      size: incoming.size,
      quality: incoming.quality,
      triples,
      enrolled: total,
    });
    if (newcomers.named.length > 0) {
      next = emit(next, {
        kind: 'studentsNamed',
        classYear: year + 3,
        names: newcomers.named.map((s) => s.name),
      });
    }
  }
  for (const t of beats.told) {
    next = emit(next, { kind: 'studentBeat', studentId: t.student.id, arcId: t.arc.id });
  }
  return next;
}

// The people system, weekly: two moments a year.
export function peopleWeek(state: GameState): GameState {
  const { clock } = state;
  if (clock.week !== 1) return state;
  if (clock.term === 'fall') return arrive(state);
  // The other two terms turn with a few of the named students' news, so a
  // year's beats are not all told in one week (students.ts) — except at
  // Commencement, whose farewells are that week's news on their own.
  if (clock.term === 'summer') {
    const graduating = state.people.cohorts.some((c) => c.classYear <= clock.year);
    const done = graduate(state);
    return graduating ? done : termBeats(done);
  }
  return termBeats(state);
}

function termBeats(state: GameState): GameState {
  const beats = tellTermBeats(state);
  if (beats.told.length === 0) return state;
  let next: GameState = { ...state, people: { ...state.people, named: beats.named } };
  for (const t of beats.told) {
    next = emit(next, { kind: 'studentBeat', studentId: t.student.id, arcId: t.arc.id });
  }
  return next;
}

export function cohortLabel(c: Pick<Cohort, 'classYear'>): string {
  return classLabel(c.classYear);
}
