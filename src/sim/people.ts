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
  BASE_APPLICANTS,
  BEAUTY_STUB,
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
import { quirkMorale, teachingSatisfaction } from './faculty.ts';
import type { GameState } from './state.ts';

// PEOPLE (DD §8): students as cohorts, one per class year, carrying size,
// quality and satisfaction; the applicant pool and the Admissions Day
// decision that turns it into a class; the class arriving at Convocation,
// thinning each year, and graduating into the alumni ledger. Prestige,
// beauty and identity are stubs until their phases; the pool answers only
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

export interface AlumniClass {
  classYear: number;
  size: number;
  quality: number;
  satisfaction: number; // as they left
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
}

export function foundingPeople(): People {
  return {
    terms: { tuition: TUITION_DEFAULT, selectivity: SELECTIVITY_DEFAULT },
    aidRate: AID_DISCOUNT_RATE,
    cohorts: [],
    incoming: null,
    lastAdmissions: null,
    alumni: [],
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

// ---------- the funnel (DD §8.2) ----------

// The price the pool feels: the net of aid, against the market's own net.
export function netTuition(tuition: number, aidRate: number): number {
  return Math.round(tuition * (1 - aidRate));
}

export function marketNetTuition(): number {
  return netTuition(MARKET_TUITION, AID_DISCOUNT_RATE);
}

export function applicantPool(terms: AdmissionTerms, aidRate: number = AID_DISCOUNT_RATE): number {
  const prestige = 0.5 + PRESTIGE_STUB / 100;
  const beauty = 0.75 + BEAUTY_STUB / 200;
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
  const applicants = applicantPool(terms, state.people.aidRate);
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

// Satisfaction from what the campus gives them: housing, dining, seats,
// the state of the buildings, the teaching (faculty.ts) and the faculty's
// quirks. Student life arrives with its phase.
export function satisfactionFor(state: GameState, total: number): number {
  const cap = campusCapacity(state);
  let s = SATISFACTION_BASE;
  if (total > 0 && total > cap.beds) s -= TRIPLES_PENALTY * ((total - cap.beds) / total);
  if (total > 0 && total > cap.meals) s -= DINING_PENALTY * ((total - cap.meals) / total);
  if (total > 0 && total > cap.seats) s -= SEATS_PENALTY * ((total - cap.seats) / total);
  s += (campusCondition(state) - 1) * CONDITION_WEIGHT;
  s += teachingSatisfaction(state) + quirkMorale(state);
  return Number(Math.min(100, Math.max(0, s)).toFixed(1));
}

export function attritionRate(satisfaction: number): number {
  const below = Math.max(0, ATTRITION_LINE - satisfaction);
  return Math.min(ATTRITION_MAX, ATTRITION_BASE + below * ATTRITION_PER_POINT);
}

// Commencement, the first week of summer: the class whose year it is
// graduates into the ledger.
export function graduate(state: GameState): GameState {
  const { year } = state.clock;
  const leaving = state.people.cohorts.filter((c) => c.classYear <= year);
  if (leaving.length === 0) return state;
  let next: GameState = {
    ...state,
    people: {
      ...state.people,
      cohorts: state.people.cohorts.filter((c) => c.classYear > year),
      alumni: [
        ...state.people.alumni,
        ...leaving.map((c) => ({
          classYear: c.classYear,
          size: c.size,
          quality: c.quality,
          satisfaction: c.satisfaction,
        })),
      ],
    },
  };
  for (const c of leaving) {
    next = emit(next, { kind: 'classGraduated', classYear: c.classYear, size: c.size });
  }
  return next;
}

// Convocation, the first week of fall: every cohort's year is scored and
// thinned, and the committed class arrives.
export function arrive(state: GameState): GameState {
  const { year } = state.clock;
  const p = state.people;
  const incoming = p.incoming && p.incoming.year === year ? p.incoming : null;
  const total = enrolled(state) + (incoming?.size ?? 0);
  const satisfaction = satisfactionFor(state, total);
  const rate = attritionRate(satisfaction);
  let left = 0;
  const cohorts = p.cohorts.map((c) => {
    const gone = Math.round(c.size * rate);
    left += gone;
    return { ...c, size: c.size - gone, satisfaction };
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
  if (left > 0) next = emit(next, { kind: 'studentsLeft', count: left });
  if (incoming && incoming.size > 0) {
    const triples = Math.max(0, total - campusCapacity(state).beds);
    next = emit(next, {
      kind: 'classArrived',
      classYear: year + 3,
      size: incoming.size,
      quality: incoming.quality,
      triples,
    });
  }
  return next;
}

// The people system, weekly: two moments a year.
export function peopleWeek(state: GameState): GameState {
  const { clock } = state;
  if (clock.week !== 1) return state;
  if (clock.term === 'summer') return graduate(state);
  if (clock.term === 'fall') return arrive(state);
  return state;
}

export function cohortLabel(c: Pick<Cohort, 'classYear'>): string {
  return classLabel(c.classYear);
}
