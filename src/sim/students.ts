import { buildingById } from '../content/buildings.ts';
import { NAME_POOLS, type Gender } from '../content/faculty.ts';
import { programById, schoolById } from '../content/schools.ts';
import {
  ARCS,
  findArc,
  STUDENT_NAMES,
  type ArcCondition,
  type ArcDef,
  type ArcStage,
} from '../content/students.ts';
import {
  ARC_BEATS_PER_TERM,
  ARC_BEATS_PER_YEAR,
  ARC_BEATS_PER_STUDENT,
  NAMED_PER_CLASS_MAX,
  NAMED_PER_CLASS_MIN,
  STUDENT_LEAVES_ODDS,
} from '../tuning.ts';
import { openProgram } from './academics.ts';
import { campusBeauty } from './beauty.ts';
import { entriesBetween } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { inAusterity, inReceivership, frozen } from './distress.ts';
import { facultyOf, staffingNeed, teachingQuality } from './faculty.ts';
import { detectQuads } from './quads.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';
import type { Cohort, Outcomes } from './people.ts';

// NAMED STUDENTS (DD §8.1): the handful the game follows, three to five
// out of every arriving class. They are a LENS ON THE AGGREGATE and
// nothing more (guardrail §17.4): they carry a name, a face, a program
// and the beats that have been told about them, and not one number the
// sim reads back. Every beat is chosen from what was true of their COHORT
// at that moment — the triples it arrived into, the teaching it got, the
// ladder it lived through — so the writing dramatises the simulation
// instead of running beside it.
//
// Their dice are their own: drawn from the seed and the week rather than
// from the run's stream, exactly as the faculty market and the market
// returns are. Nothing the named students do can shift a number the sim
// would otherwise have rolled, so the lens lifts off a run without
// moving anything underneath it — the guardrail as an arithmetic fact
// rather than a promise (students.test.ts proves it).

export interface StudentBeat {
  week: number;
  arcId: string;
}

export type StudentStatus = 'enrolled' | 'graduated' | 'left';

export interface NamedStudent {
  id: string;
  name: string;
  gender: Gender; // for the portrait, as the faculty's are drawn
  heritage: string;
  classYear: number; // the year their class is due to graduate
  // The program they came to read. It is never rewritten: a program that
  // closes under them is a beat, not a migration.
  programId: string | null;
  arrivedWeek: number;
  status: StudentStatus;
  outcome: keyof Outcomes | null;
  beats: StudentBeat[];
}

// ---------- who they are ----------

// A stream of their own, off the seed: the run's dice are never spent on
// the lens (guardrail §17.4).
function streamFor(state: GameState, salt: number, n: number): Rng {
  return Rng.fromSeed((state.seed ^ Math.imul(n, 0x9e3779b9) ^ salt) >>> 0);
}

export function generateStudent(
  rng: Rng,
  id: string,
  classYear: number,
  week: number,
  programId: string | null,
): NamedStudent {
  const gender: Gender = rng.chance(0.5) ? 'male' : 'female';
  const heritage = rng.pick(Object.keys(NAME_POOLS.surnames));
  const given = rng.pick(
    (gender === 'male' ? STUDENT_NAMES.male : STUDENT_NAMES.female) as readonly string[],
  );
  return {
    id,
    name: `${given} ${rng.pick(NAME_POOLS.surnames[heritage]!)}`,
    gender,
    heritage,
    classYear,
    programId,
    arrivedWeek: week,
    status: 'enrolled',
    outcome: null,
    beats: [],
  };
}

export function namedOf(state: GameState, classYear: number): NamedStudent[] {
  return state.people.named.filter((s) => s.classYear === classYear);
}

export function enrolledNamed(state: GameState): NamedStudent[] {
  return state.people.named.filter((s) => s.status === 'enrolled');
}

export function studentById(state: GameState, id: string): NamedStudent | null {
  return state.people.named.find((s) => s.id === id) ?? null;
}

// Which year of study they are in, 1–4, from the class they belong to.
export function yearOfStudy(student: NamedStudent, year: number): number {
  return Math.min(4, Math.max(1, 4 - (student.classYear - year)));
}

// ---------- what is true of their class ----------

export interface ArcContext {
  state: GameState;
  student: NamedStudent;
  cohort: Cohort | null;
}

// Every condition a beat may name (content/students.ts keeps the list
// closed). Each reads the cohort or the campus — never the student.
const CONDITIONS: Record<ArcCondition, (c: ArcContext) => boolean> = {
  always: () => true,
  triples: ({ state }) => inTriplesNow(state),
  crowdedDining: ({ state }) => overCapacity(state, 'meals'),
  crowdedSeats: ({ state }) => overCapacity(state, 'seats'),
  derelict: ({ state }) =>
    state.campus.placements.some((p) => p.status === 'open' && p.condition < 0.75),
  beautiful: ({ state }) => campusBeauty(state) >= 65,
  hasQuad: ({ state }) => detectQuads(state.campus).length > 0,
  goodTeaching: ({ state }) => teachingQuality(state) >= 55,
  noTeaching: ({ state }) => teachingQuality(state) === 0,
  thinFaculty: ({ state, student }) => {
    const program = student.programId ? openProgram(state, student.programId) : null;
    return program !== null && facultyOf(state, program.programId).length < staffingNeed(program);
  },
  austerity: ({ state }) => inAusterity(state),
  frozen: ({ state }) => frozen(state),
  receivership: ({ state }) => inReceivership(state),
  strongClass: ({ cohort }) => cohort !== null && cohort.quality >= 65,
  weakClass: ({ cohort }) => cohort !== null && cohort.quality < 45,
  unhappy: ({ cohort }) => cohort !== null && cohort.satisfaction < 50,
  happy: ({ cohort }) => cohort !== null && cohort.satisfaction >= 70,
  newBuilding: ({ state }) =>
    entriesBetween(
      state,
      Math.max(0, state.clock.absoluteWeek - WEEKS_PER_YEAR),
      state.clock.absoluteWeek,
    ).some((e) => e.kind === 'buildingCompleted'),
  programClosed: ({ state, student }) =>
    student.programId !== null && openProgram(state, student.programId) === null,
  programAdvanced: ({ state, student }) =>
    student.programId !== null &&
    entriesBetween(
      state,
      Math.max(0, state.clock.absoluteWeek - WEEKS_PER_YEAR),
      state.clock.absoluteWeek,
    ).some((e) => e.kind === 'programAdvanced' && e.programId === student.programId),
};

function inTriplesNow(state: GameState): boolean {
  return overCapacity(state, 'beds');
}

function overCapacity(state: GameState, of: 'beds' | 'meals' | 'seats'): boolean {
  const total = state.people.cohorts.reduce((t, c) => t + c.size, 0);
  const cap = campusCapacityOf(state);
  return total > cap[of];
}

// The capacity read, from the catalogue: this module leans on people.ts
// for nothing, so people.ts can drive it without a cycle of substance.
function campusCapacityOf(state: GameState): { beds: number; meals: number; seats: number } {
  const cap = { beds: 0, meals: 0, seats: 0 };
  for (const p of state.campus.placements) {
    if (p.status !== 'open') continue;
    const c = buildingById(p.buildingId).capacity;
    cap.beds += c?.beds ?? 0;
    cap.meals += c?.meals ?? 0;
    cap.seats += c?.seats ?? 0;
  }
  return cap;
}

export function conditionHolds(when: ArcCondition, ctx: ArcContext): boolean {
  return CONDITIONS[when](ctx);
}

// ---------- the beats ----------

function cohortOf(state: GameState, student: NamedStudent): Cohort | null {
  return state.people.cohorts.find((c) => c.classYear === student.classYear) ?? null;
}

export function eligibleArcs(state: GameState, student: NamedStudent, stage: ArcStage): ArcDef[] {
  const ctx: ArcContext = { state, student, cohort: cohortOf(state, student) };
  const told = new Set(student.beats.map((b) => b.arcId));
  return ARCS.filter((a) => a.stage === stage && !told.has(a.id) && conditionHolds(a.when, ctx));
}

function pickWeighted(rng: Rng, arcs: ArcDef[]): ArcDef {
  const total = arcs.reduce((t, a) => t + a.weight, 0);
  let pick = rng.next() * total;
  for (const a of arcs) {
    pick -= a.weight;
    if (pick <= 0) return a;
  }
  return arcs[arcs.length - 1]!;
}

function tell(student: NamedStudent, arc: ArcDef, week: number): NamedStudent {
  return { ...student, beats: [...student.beats, { week, arcId: arc.id }] };
}

// ---------- the year (called from people.ts) ----------

// A class arrives: three to five of them are given names and faces, and
// the program they came to read if there is one to read.
export function nameNewcomers(
  state: GameState,
  classYear: number,
): { named: NamedStudent[]; nextId: number } {
  const rng = streamFor(state, 0x5ad1, classYear);
  const count = rng.int(NAMED_PER_CLASS_MIN, NAMED_PER_CLASS_MAX);
  const programs = state.academics.programs.map((p) => p.programId);
  const named: NamedStudent[] = [];
  let nextId = state.people.nextStudentId;
  for (let i = 0; i < count; i++) {
    const programId = programs.length > 0 ? rng.pick(programs) : null;
    named.push(
      generateStudent(rng, `s${nextId++}`, classYear, state.clock.absoluteWeek, programId),
    );
  }
  return { named, nextId };
}

export interface YearBeats {
  named: NamedStudent[];
  told: { student: NamedStudent; arc: ArcDef }[];
}

// A few of them have something happen at each term's turn, and — at
// Convocation, when their class is losing people — one of them may be
// among the lost. WHO is told about is the dice; WHAT is told is the
// cohort's truth, and the least-told are asked first so that nobody the
// game named goes four years unmentioned.
export function tellYearBeats(
  state: GameState,
  attrition: number,
  budget = ARC_BEATS_PER_YEAR,
): YearBeats {
  const week = state.clock.absoluteWeek;
  const rng = streamFor(state, 0xbea7, week);
  const told: { student: NamedStudent; arc: ArcDef }[] = [];
  const byId = new Map(state.people.named.map((s) => [s.id, s]));
  const here = state.people.named.filter(
    (s) => s.status === 'enrolled' && s.beats.length < ARC_BEATS_PER_STUDENT,
  );
  // One of them leaves, at the rate their class is leaving at.
  let leavers = 0;
  const candidates = [...here];
  if (candidates.length > 0 && rng.chance(Math.min(1, attrition * STUDENT_LEAVES_ODDS))) {
    const student = rng.pick(candidates);
    const arcs = eligibleArcs(state, student, 'leaving');
    if (arcs.length > 0) {
      const arc = pickWeighted(rng, arcs);
      byId.set(student.id, { ...tell(student, arc, week), status: 'left' });
      told.push({ student, arc });
      leavers = 1;
    }
  }
  // The rest of the year's news.
  // Shuffled, then ordered by how little has been said about them.
  const rest = candidates
    .filter((s) => byId.get(s.id)!.status === 'enrolled')
    .map((s) => ({ s, k: rng.next() }))
    .sort((a, b) => a.s.beats.length - b.s.beats.length || a.k - b.k)
    .map((x) => x.s);
  for (let i = 0; i < budget - leavers && rest.length > 0; i++) {
    const student = rest.shift()!;
    const arcs = eligibleArcs(state, student, 'year');
    if (arcs.length === 0) continue;
    const arc = pickWeighted(rng, arcs);
    byId.set(student.id, tell(byId.get(student.id)!, arc, week));
    told.push({ student, arc });
  }
  return { named: state.people.named.map((s) => byId.get(s.id)!), told };
}

// Commencement: each of them leaves with one of the outcomes their class
// actually had, drawn in the class's own proportions.
// The turn of a term that is not Convocation: the year's news, spread.
export function tellTermBeats(state: GameState): YearBeats {
  return tellYearBeats(state, 0, ARC_BEATS_PER_TERM);
}

export function tellGraduationBeats(
  state: GameState,
  cohort: Cohort,
  outcomes: Outcomes,
): YearBeats {
  const week = state.clock.absoluteWeek;
  const rng = streamFor(state, 0x6a2d, week * 97 + cohort.classYear);
  const told: { student: NamedStudent; arc: ArcDef }[] = [];
  const named = state.people.named.map((s) => {
    if (s.classYear !== cohort.classYear || s.status !== 'enrolled') return s;
    const outcome = pickOutcome(rng, outcomes);
    const arcs = eligibleArcs(state, s, outcome);
    const arc = arcs.length > 0 ? pickWeighted(rng, arcs) : null;
    const graduated: NamedStudent = {
      ...(arc ? tell(s, arc, week) : s),
      status: 'graduated',
      outcome,
    };
    if (arc) told.push({ student: s, arc });
    return graduated;
  });
  return { named, told };
}

export function pickOutcome(rng: Rng, outcomes: Outcomes): keyof Outcomes {
  const total = outcomes.distinguished + outcomes.placed + outcomes.adrift;
  if (total <= 0) return 'placed';
  let pick = rng.next() * total;
  for (const key of ['distinguished', 'placed', 'adrift'] as const) {
    pick -= outcomes[key];
    if (pick <= 0) return key;
  }
  return 'placed';
}

// ---------- the words (content/students.json fills these) ----------

// One beat, in words: the template from content/students.json with the
// student and their campus filled in. The journal and the Students screen
// both read a beat through here, so a beat is worded once.
export function beatLine(state: GameState, student: NamedStudent, arcId: string): string {
  const arc = findArc(arcId);
  if (!arc) return arcId;
  const vars = arcVars(state, student);
  return arc.line.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

export function arcVars(state: GameState, student: NamedStudent): Record<string, string> {
  const program = student.programId ? programById(student.programId) : null;
  const quad = detectQuads(state.campus)[0];
  const cls = `'${String(student.classYear % 100).padStart(2, '0')}`;
  return {
    name: student.name,
    first: student.name.split(' ')[0]!,
    tag: program ? `${program.code} ${cls}` : cls,
    code: program?.code ?? '',
    class: cls,
    program: program?.name ?? 'no subject in particular',
    school: program ? schoolById(program.schoolId).name : 'the college',
    quad: quad?.name ?? 'the lawn',
  };
}
