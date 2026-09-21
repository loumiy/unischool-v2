// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// v1 founding preset (starting cash etc.) alongside the founding vernacular. Only FOUNDING_VERNACULAR is a startup-flow concern; the numbers belong to tuning.ts.
import type { Vernacular } from '../state/types';

// ---------------------------------------------------------------------
// WHERE EVERY SCHOOL STARTS. One set of conditions, for everybody.
//
// This file was schoolTypeData.ts and held two of these — a private preset
// and a public one, the game's single starting fork. Plan 07 retired the
// fork over three PRs: PR A took the tuition ceiling, PR B took the state
// appropriation, and this one takes what was left, which by then was three
// numbers and a label.
//
// WHY IT WENT rather than being kept and rebalanced: the two halves that
// made it a real decision were a cap and a subsidy that existed to offset
// the cap. Remove either and the other has no job. What remained —
// slightly less cash, slightly less prestige, a bigger applicant pool —
// was not a different kind of school, it was the same school with its
// opening dials nudged, presented at the one moment a player knows least
// about what those dials do. docs/design/progression.md has always said
// "archetypes emerge, they are not chosen"; the fork was the one place the
// game contradicted that, and now it doesn't.
//
// The startup screen asks for a name and nothing else (see
// components/StartupScreen.tsx). Keep it that way: anything that wants to
// vary between schools belongs in play, not here.
// ---------------------------------------------------------------------

export interface FoundingPreset {
  startingCash: number;
  startingReputation: number;
  startingApplicantPool: number;
}

// ---------------------------------------------------------------------
// STARTING CONDITIONS — the top of the growth loop's first turn.
//
// The intro (gen-ed) loop is deliberately FRICTIONLESS: starting cash is
// sized to cover the whole gen-ed ramp — six core courses, a few job
// postings and hires, the cheap early campus-life buildings — with room
// to spare, so a new player learns "develop a course, hire faculty"
// without money ever entering their head. The pinch is supposed to arrive
// one loop later, when the tier-1 build-out drags weeklyOpEx up (see
// financeSystem.ts's cost drivers), not in week three.
//
// Everything after that is priced against MID/LATE-game income, never
// against this cushion — see financeSystem.ts.
// ---------------------------------------------------------------------

// Both types start at the same tuition and endowment; the fork is in the
// three numbers below them. Tuition still has real room to move at the
// year-1 summer decision (raising it is meant to feel like a decision —
// it shrinks the applicant pool, see admissionsSystem.ts's
// PRICE_SENSITIVITY — not a free win), but it no longer starts so low
// that a normal founding opening reads as a false-alarm cash scare that
// only the summer decision can fix: well under TUITION_SLIDER_MAX below
// and under the founding revenue-maximizing net price (~$15k, per
// admissionsSystem.ts's price-tolerance model), so the pinch comes from
// the tier-1 build-out dragging opex up (see techData.ts's
// TIER_COURSE_COST and financeSystem.ts's cost drivers), not from an
// artificially low starting price.
export const STARTING_TUITION = 13_000;

// WHERE THE TUITION SLIDER ENDS, and nothing more than that.
//
// This used to be `tuitionCeiling`, a per-school-type number: 22,000 for a
// public school and 100,000 for a private one. The low one was a real
// mechanic — a public school traded pricing power for a subsidy, and the
// cap was most of what made it a different school. The high one already
// was not: Plan 05's PR E raised it precisely so that nothing would ever
// reach it, and stopped printing it, leaving a private school with a
// number that exists only to stop the slider somewhere.
//
// Plan 07 retires the public/private fork, so the cap stops being a policy
// about what KIND of school this is and becomes what it now honestly is: a
// control needs a top. Named for what it does rather than for what it used
// to mean — calling it a ceiling would keep implying a rule that is no
// longer being enforced.
//
// Deliberately out of reach rather than tuned. The highest-priced strategy
// in sim/balanceSim.ts closes a 40-year run around 38k, and the deficit
// surcharge tops out well under this, so a player who hits this number has
// left the part of the curve the game is balanced over — which is the
// difference between a bound and a cap.
export const TUITION_SLIDER_MAX = 100_000;
export const STARTING_ENDOWMENT = 3_000_000; // pays out ~$120k/yr from day one (see financeSystem.ts's ENDOWMENT_PAYOUT_RATE)

// --- Founding class mix (see actions.ts's createInitialState) ----------
// A founded college opens with ALL FOUR class years present and BALANCED —
// roughly equal freshman / sophomore / junior / senior counts — rather than
// a freshman-only lump, so there is a graduating class from year one and the
// body opens at the steady-state structure a campus would otherwise take
// years of lumpy cycles to reach.
//
// The founding body is commuters, every one of them: there is no dorm at
// founding (see campusData.ts — the starting dorm is seeded 'available',
// not 'done', like every other one in the chain), and enrollment is not
// capacity-gated at all any more (see admissionsSystem.ts) — so this is
// simply the school's starting size, independent of anything the player
// later builds. 350 matches the founding dorm's own bed count purely by
// naming coincidence (a real founding class is roughly the size of a real
// first dorm), not because anything ties the two together.
//
// The remainder from dividing by four is loaded onto the younger classes,
// so the "ramp" is at most a one-student tilt toward the freshmen.
export const FOUNDING_BODY = 350;
const FOUNDING_PER_CLASS = Math.floor(FOUNDING_BODY / 4);
const FOUNDING_REMAINDER = FOUNDING_BODY - FOUNDING_PER_CLASS * 4; // 0..3, spread over the younger classes
export const FOUNDING_CLASSES = {
  freshman: FOUNDING_PER_CLASS + (FOUNDING_REMAINDER > 0 ? 1 : 0),
  sophomore: FOUNDING_PER_CLASS + (FOUNDING_REMAINDER > 1 ? 1 : 0),
  junior: FOUNDING_PER_CLASS + (FOUNDING_REMAINDER > 2 ? 1 : 0),
  senior: FOUNDING_PER_CLASS,
} as const; // { freshman: 88, sophomore: 88, junior: 87, senior: 87 }, all commuters

// THE FOUNDING COLLEGE (Plan 19): the programs housed in Founders Hall
// before the player sees the game, by program id (techData.ts's major
// prefixes), and how many of each one's courses open developed. Three
// Social Sciences & Humanities majors, two courses each — six courses,
// because six at instructionCapacity.ts's SEATS_PER_COURSE is the 480
// seats the founding body sits in; and these three because they are what
// the five founding professors (actions.ts) can teach. Plain ids here, so
// the founding letters (eventData.ts) can read them without a cycle
// through the state module; actions.ts turns them into courses.
export const FOUNDING_PROGRAMS: readonly string[] = ['ENGL', 'HIST', 'PHIL'];
export const FOUNDING_COURSES_PER_PROGRAM = 2;

// THE PRIVATE PRESET'S NUMBERS, kept as they were rather than averaged
// with the public ones. Not a judgment that a private opening is the right
// one — it is that six of the seven strategies in sim/balanceSim.ts are
// fitted against exactly these three values, so adopting them is the
// choice that moves the balance least while the fork comes out. Splitting
// the difference would have retuned every strategy at once and made PR C
// impossible to read.
//
// So they are TUNABLE and nothing here is load-bearing about them. The
// founding applicant pool in particular is worth revisiting: 150 was the
// smaller of the two, and the backlog's "admit-rate curve's early slope"
// item is about the same founding funnel from the other end. Both should
// be re-fitted together, against ADMIT_PROBES, rather than nudged here.
// WHICH ARCHITECTURE A NEW CAMPUS IS BUILT IN. One value today, so this is
// a constant rather than a choice; Plan 07's PR K turns it into the startup
// screen's one remaining question once PRs G, H and I have given it
// something to choose between.
export const FOUNDING_VERNACULAR: Vernacular = 'georgian';

export const FOUNDING_PRESET: FoundingPreset = {
  startingCash: 1_400_000,
  // Was BASE_STARTING_REPUTATION (40) plus a per-type bonus of +10 or -5.
  // With one preset the two numbers had nothing to add up, so they are one
  // number.
  startingReputation: 50,
  startingApplicantPool: 150,
};
