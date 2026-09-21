// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// v1's whole state shape. Read it only for the field names the visuals consume (Vernacular, SchoolColors, Placement, TileCoord, grid constants). Never port the model: DD §15 governs v2's state tree.
// Central type definitions. Every system reads and writes this shared state.
// Keep this file authoritative: if a concept exists in the game, its shape lives here.

export interface GameClock {
  year: number;      // in-game year, starts at 1
  week: number;      // 1..WEEKS_PER_YEAR
}

export interface Finance {
  cash: number;          // liquid funds
  endowment: number;     // long-term reserve; earns a return and pays a fixed share of itself into income every year (see financeSystem.ts)
  endowmentCampaigns: number; // how many endowment campaigns have been run — each one costs more than the last (see financeSystem.ts's endowmentCampaign)
  // The school's standing LISTED price — what the summer slider opens at,
  // what a prospective student is quoted, and the only tuition figure any
  // projection of NEXT year's class reads. Setting it does not touch a
  // student already enrolled; it becomes the freshman entry of
  // tuitionByClass at the next admissions boundary, and nowhere else.
  listedTuition: number;
  // What each enrolled CLASS actually pays, locked at the price it was
  // admitted under and carried to graduation (see reducer.ts's
  // RESOLVE_ADMISSIONS, which advances these in lockstep with
  // students.classes). Four prices rather than one scalar because one
  // scalar meant a mid-stream raise repriced every student already on the
  // books — a school could stay cheap while it grew and then bill four
  // captive classes at the new price. Tuition revenue is the sum of four
  // products now (financeSystem.ts's financeBreakdown), never
  // enrolled x price.
  tuitionByClass: ClassTuition;
  // NO tuitionCeiling, and since Plan 07's PR B no baselineFundingPerWeek
  // or appropriationPerStudentPerYear either. All three were set by school
  // type at founding, which is the thing Plan 07 is retiring: the ceiling
  // became one constant for everybody (foundingData.ts's
  // TUITION_SLIDER_MAX), and the two appropriation halves became nothing at
  // all. What is left here is what every school has.
  weeklyOpEx: number;    // salaries + upkeep + instruction, recomputed each tick
  // How many weeks the operating account has ever closed below zero
  // (Plan 17's PR A). Counted by tickFinance the moment cash settles, so
  // it is the run's own record of solvency rather than one a reader has
  // to reconstruct from fifty summer snapshots — a school that dipped red
  // in week 30 and was back by the summer was still in the red. Read by
  // the *Never in the red* ambition and the legacy's stewardship axis;
  // written by nothing else. Monotone, like every other lifetime count.
  weeksInTheRed: number;
}

// The named needs satisfaction is broken into (see satisfactionSystem.ts).
// Each is 0..100 and is written to by a specific cluster of campus
// facilities/needs, never by an ad hoc catch-all formula — so the UI can
// show the player exactly what's dragging the single displayed number down
// and which building fixes it.
export interface SatisfactionAttributes {
  academic: number;       // library seats-to-enrolled ratio
  social: number;         // student center + rec center (ratio) + quad (flat) + live student organisations (flat, see data/studentLifeData.ts)
  basicNeeds: number;     // dining hall seats-to-enrolled ratio — the sharpest penalty curve of the five
  health: number;         // health/counseling center — dormant (scores full) below the population threshold it unlocks at
  // Dorm (+ housed Greek chapter) beds against the enrolled body — most
  // students are commuters by design, so this is NOT scored against a 1:1
  // target the way basicNeeds is (see satisfactionSystem.ts's TARGET_RATIO):
  // a school that houses a healthy minority of its students scores fully
  // adequate here. Not having enough beds for that share is what dents it.
  housing: number;
}

// The student body is FOUR aggregate CLASSES — never individuals (see
// docs/design/admissions.md's "Students: four aggregate classes"). Students
// attend four years: each summer (reducer.ts's RESOLVE_ADMISSIONS) seniors
// graduate and leave, every younger class advances a year, and the
// admissions funnel commits a new freshman class. This is NOT
// individual-student simulation — each class is a plain head count.
//
// "Class" is the year group and ONLY the year group. The other grouping of
// students this game models — research-oriented, price-sensitive, athletes —
// is a COHORT (see systems/admissions/cohorts.ts), and the two words are
// never swapped: a class is admitted in a given year, a cohort is a kind of
// applicant. Neither has anything to do with a course, which is what a
// student enrolls in (see techData.ts's Buildables).
export interface ClassCounts {
  freshman: number;
  sophomore: number;
  junior: number;
  senior: number;
}

// The same four class keys as ClassCounts, carrying dollars instead of
// people: what each class is charged per year. Deliberately its own
// interface rather than a reuse of ClassCounts — the keys match but the
// units do not, and a reader who finds one of these in `finance` should
// not have to work out whether it is money or students.
export interface ClassTuition {
  freshman: number;
  sophomore: number;
  junior: number;
  senior: number;
}

// The seven kinds of applicant the admissions model recognises. The id list
// lives HERE rather than in systems/admissions/cohorts.ts, where it used to,
// because a cohort is a concept of the game and this file is where those
// live — the same charter the header states, and the reason this file spends
// the paragraph above ClassCounts drawing the class/cohort line at all. What
// stays in cohorts.ts is everything a cohort *does*: the COHORTS table, its
// base shares, and the pull curve behind each one.
export type CohortId =
  | 'highAchievers' | 'preProfessional' | 'researchOriented'
  | 'social' | 'artsFocused' | 'priceSensitive' | 'athletes'
  | 'gradBound';

// Whole students, one count per cohort. Used for both an applicant pool's
// composition (the summer reveal) and an enrolled class's (below); the eight
// always sum to whatever total they decompose, apportioned by largest
// remainder so they are people rather than rounded fractions.
export type CohortCounts = Record<CohortId, number>;

// The same four class keys again, carrying each class's cohort composition
// AS ADMITTED. Its own interface for the reason ClassTuition is: matching
// keys, different units.
//
// WHY THIS IS STORED AND NOT DERIVED — the one thing to understand before
// touching it. Every cohort's pull is a pure function of the CURRENT
// GameState (labs standing now, teams active now, programs established now),
// so recomputing an older class's mix would apply today's campus to a class
// admitted years ago: build an arts centre and last year's seniors would
// become arts-focused in hindsight. The four classes being four different
// schools stacked on top of each other is exactly what the Enrollment tab
// exists to show, so the split is written once, at admission, and carried to
// graduation — never recomputed. See docs/design/admissions.md.
export interface ClassCohorts {
  freshman: CohortCounts;
  sophomore: CohortCounts;
  junior: CohortCounts;
  senior: CohortCounts;
}

export interface StudentBody {
  // The four classes. Total enrolled is their sum — read it via
  // totalEnrolled() rather than storing a separate total that could drift.
  classes: ClassCounts;
  // What each of those four classes is MADE OF, recorded when it was
  // admitted (see ClassCohorts above for why this is a record rather than a
  // derivation). Advanced in lockstep with `classes` and
  // finance.tuitionByClass at the one annual boundary that moves any of
  // them; the graduating seniors take theirs with them.
  cohortsByClass: ClassCohorts;
  // Total HOUSING (bed) capacity — dorms plus housed Greek chapter houses —
  // never an admissions ceiling. The one ceiling on enrollment is the
  // catalogue's seats (instructionCapacity.ts's intakeCeiling, Plan 15's
  // PR E); most students are commuters, and this is only what's needed to
  // keep the physical plant upkeep (financeSystem.ts) and the Housing
  // satisfaction attribute (satisfactionSystem.ts) honest.
  capacity: number;
  satisfaction: number;  // 0..100 — the weighted sum of satisfactionBreakdown, drifted toward smoothly (see satisfactionSystem.ts)
  satisfactionBreakdown: SatisfactionAttributes; // this week's per-attribute scores that satisfaction's target is computed from — the expandable UI reads this directly
  // Trailing-year satisfaction: summed every week and counted (see
  // satisfactionSystem.ts's tickSatisfaction), then averaged and reset at the
  // summer boundary. The average is what next year's applicant funnel reads
  // as word of mouth (see admissionsSystem.ts) — the design's "current
  // experience -> satisfaction -> next year's applications". Kept as
  // sum+count rather than a running mean so the average is exact and cheaply
  // resettable.
  satisfactionYearSum: number;
  satisfactionYearWeeks: number;
  priorYearAvgSatisfaction: number; // last completed year's average — the value the funnel actually uses
  // The crowding shortfall, accumulated the same way (see prestigeSystem.ts's
  // tickPrestige) and for the same reason: crowding is graded on the YEAR'S
  // AVERAGE at the summer report card, so a dorm finished in week 50 earns
  // two weeks of relief, not a year's. Reset with the satisfaction
  // accumulator at RESOLVE_ADMISSIONS.
  crowdingYearSum: number;
  crowdingYearWeeks: number;
  applicantPool: number; // most recent cycle's total applicants (set by the annual funnel)
  admitRate: number;     // most recent cycle's admit rate — the emergent selectivity signal prestige reacts to (see prestigeSystem.ts)
  incomingQuality: number; // most recent cycle's average quality score (0..100) of the entering freshman class — prestige's other admissions-derived input
  // WHAT LAST SUMMER'S FUNNEL READ (Plan 16's PR C): the pool it drew, the
  // six factors it multiplied to get there, and the pool's cohort split.
  // Written once at RESOLVE_ADMISSIONS and read by the next summer's
  // reveal, which puts this year's factors against last year's and says
  // WHY the pool moved — "prestige +8%, price −3%, word of mouth +21%".
  // Stored rather than recomputed because the funnel's inputs a year ago
  // (prestige before the step, that year's average satisfaction, the
  // signals as they stood) are not recoverable from today's state. Null
  // until the first summer, which has no year to compare against.
  lastFunnel: FunnelRecord | null;
}

// The six multipliers the applicant funnel is the product of (see
// admissionsSystem.ts's projectAdmissions): applicants = prestigePool ×
// priceFactor × capacityFactor × wordOfMouth × cohortDemand × stickerShock,
// before rounding. Each is a plain number, so the year-over-year line can
// divide this year's by last year's and read each one's share of the move.
export interface FunnelFactors {
  prestigePool: number;   // the pool prestige alone would draw, in applicants
  priceFactor: number;    // 0..1, the price discount against tolerance
  capacityFactor: number; // the beds floor-to-one scale
  wordOfMouth: number;    // satisfaction's multiplier, 1 at neutral
  cohortDemand: number;   // the blended cohort pull, 1 at neutral
  stickerShock: number;   // 0..1, the band-specific self-selection
}

export interface FunnelRecord {
  year: number;            // the year whose summer drew it
  applicants: number;      // the realized pool
  factors: FunnelFactors;
  cohorts: CohortCounts;   // the pool's split, summing to `applicants`
}

// Faculty ARE individuals with attributes. teaching/research/salary are
// CURRENT values, derived each tick from tenureWeeks and the two potential
// ceilings below — see facultyData.ts's growth-curve formulas and
// facultySystem.ts's weekly tick that applies them. A hire is an
// appreciating asset: retained faculty grow stronger (and pricier) toward
// their potential over years of tenure, then plateau.
export interface Faculty {
  id: string;
  name: string;
  field: string;
  teaching: number;   // 0..100, current — grows toward teachingPotential with tenure
  research: number;   // 0..100, current — grows toward researchPotential with tenure
  teachingPotential: number; // 0..100, ceiling teaching grows toward; rolled once, fixed for this hire's life
  researchPotential: number; // 0..100, ceiling research grows toward; rolled once, fixed for this hire's life
  tenureWeeks: number; // weeks since hire; 0 for an unhired candidate, increments weekly once on the roster
  weeksListed: number; // the mirror image of tenureWeeks: weeks this person has been sitting in the hiring market, 0 once appointed. Only the candidate pool reads it — facultySystem.ts's tickCandidatePool withdraws a listing at CANDIDATE_LISTING_WEEKS — exactly as only the roster reads tenureWeeks.
  salary: number;      // current annual salary — recomputed from current stats + a separate seniority premium curve
  courseSlots: number; // how many courses in `field` this hire can keep staffed at once — rolled at hire, grows slowly with tenure (see facultyData.ts's grownSlots). A course whose requiresFaculty is `field` occupies one slot in that field for as long as it stays 'developing' or 'done' (see techSystem.ts's canStartDevelopment) — offering more courses in a subject means hiring more (or more tenured) faculty in it.
  // How many research prizes this person has been awarded (see
  // systems/research/researchSystem.ts). Its own field rather than a bump
  // to teaching/research, because teaching, research AND salary are all
  // RECOMPUTED from potential + tenureWeeks on every single tick — a
  // permanent post-prize bump written into any of those three would be
  // erased the following week. Both the salary curve
  // (facultyData.ts's facultySalary) and the research-output formula
  // (researchData.ts's facultyResearchOutput) read this directly, so the
  // premium survives every recomputation. 0 for everyone who has never
  // won one, which is almost everyone.
  acclaim: number;
  // Flavor/biographical fields — rolled once at generation, never mutated.
  // Nationality is disproportionately American regardless of name origin
  // (reflecting how diverse American faculty rosters actually are), with the
  // remainder tied to the same cultural pool the name itself was drawn from
  // (see facultyData.ts's NAME_POOLS/rollNationality) — never assigned
  // independently of the name.
  nationality: string; // e.g. "United States", "China" — full country name, shown expanded in the UI
  flag: string;        // the nationality's flag emoji — authored data, currently unrendered (the glyphs failed to display in some browsers; see FacultyTab.tsx)
  bio: string;         // one-line biographical flavor text, shown only when the roster row is expanded
  // Rolled BEFORE the name (see facultyData.ts's generateCandidate) and used
  // to pick which of a NAME_POOL's firstMale/firstFemale lists the first
  // name itself is drawn from — a flat 50/50, and never mutated after. Its
  // other consumer is FacultyPortrait.tsx, which picks a hairstyle/garment
  // pool from it — either way, a name and a portrait that disagreed on this
  // would read as a bug, not variety, so the two are never rolled apart.
  gender: 'male' | 'female';
  // The rolled name's cultural origin pool (e.g. "Chinese", "West African"
  // — see facultyData.ts's NAME_POOLS) — distinct from `nationality`, which
  // is disproportionately American regardless of this.
  // FacultyPortrait.tsx reads it to bias skin tone the same logical way a
  // name's heritage would in reality, without pretending nationality (a
  // passport, not an ethnicity) is the right signal for that.
  heritage: string;
}

export type BuildableStatus = 'locked' | 'available' | 'developing' | 'done';

// courses, academic buildings, dorms, and campus-life facilities (and later
// sports) are all the same kind of thing: a Buildable. They differ only in
// their data, not their machinery — see docs/architecture/buildables.md.
//
// GRADUATE COURSES DELIBERATELY ADD NO KIND. A graduate program is more
// curriculum (see docs/design/graduate-programs.md): its courses are
// `course` Buildables like every other, so they are academic upkeep, they
// count toward the instruction cost of the catalogue, they occupy faculty
// course-slots, and they are unplaceable — all for free, because nothing
// had to learn about them. What distinguishes them is one optional field,
// `graduateProgram` below. A new kind (or a tier-above-tier-3 value) would
// have meant editing every `kind === 'course'` read in the codebase just to
// put them back where they already were.
export type BuildableKind = 'course' | 'building' | 'dorm' | 'facility';

// The specific campus-life need a `facility`-kind Buildable serves — see
// facilitiesData.ts. Distinguishes facilities within the shared `facility`
// kind the same way a course's major prefix distinguishes it within
// `course`; the engine itself never branches on this, only the data-driven
// systems that read effects (satisfactionSystem.ts, prestigeSystem.ts) and
// the Campus tab's grouping/display do.
export type FacilityType =
  | 'library' | 'studentCenter' | 'diningHall' | 'recCenter'
  | 'healthCenter' | 'quad' | 'lab'
  // A campus grocery store (facilitiesData.ts): a second, single-instance
  // basicNeeds feeder alongside the repeatable dining chain, not a chain of
  // its own — real campuses have several dining halls but one grocery.
  | 'grocery'
  // Recreational and arts facilities (see facilitiesData.ts): gym/pool/
  // tennisCourts feed `health` (fitness is a health need, on top of the
  // health center itself); performingArtsCenter/artGallery feed `social`.
  // All one-off (no tier upgrades) rather than the single-instance-with-
  // upgrades shape library/studentCenter/recCenter use.
  | 'gym' | 'tennisCourts' | 'pool' | 'performingArtsCenter' | 'artGallery'
  // Varsity athletics venues (facilitiesData.ts): shared COMPETITION
  // facilities for the teams in data/studentLifeData.ts's SPORTS, one per
  // venue category. Deliberately DISTINCT from the rec-facility trio above —
  // a natatorium is not the rec Swimming Pool, a stadium is not a rec field
  // — because "shared" here means shared AMONG VARSITY TEAMS in one sport
  // category, not shared with recreational use (see the PR notes' flagged
  // design fork). Hidden from the build rail until a team that needs the
  // category is granted varsity status (see Buildable.athleticsVenueReveal
  // and techSystem.ts's meetsUnlockGates).
  | 'athleticsField' | 'athleticsArena' | 'athleticsDiamond' | 'athleticsNatatorium' | 'footballStadium'
  | 'fieldHouse'; // a non-competition athletics facility that lifts every program (Plan 21's PR Q)

export interface Buildable {
  id: string;
  kind: BuildableKind;
  facilityType?: FacilityType; // set only for kind 'facility'
  tier?: number;            // 1, 2, 3... for a single-instance-with-upgrades facility (library, student center, rec center, health center, quad); undefined for repeatable-chain kinds (course, dorm, dining hall) where each id is its own rung
  name: string;
  description: string;
  cost: number;            // money spent up front, at the moment development starts
  duration: number;        // weeks of development
  prereqs: string[];       // other Buildable ids that must be 'done'; may cross kinds and majors
  requiresFaculty?: string; // a Faculty `field` that must have a free course slot (see canStartDevelopment) to start
  // The graduate program this course belongs to (a GRADUATE_PROGRAMS id in
  // techData.ts), set on every course in that program and on nothing else.
  // It is BOTH the "this is a graduate course" marker the Curriculum tab
  // styles and groups on, and the key techSystem.ts's meetsUnlockGates
  // resolves the program's parent-school gate through — one field rather
  // than a flag plus a gate id, since a graduate course is never in two
  // programs and never ungated.
  graduateProgram?: string;
  // Dynamic availability gates, re-checked every tick (unlike prereqs, which
  // only re-resolve when something finishes) because the population/prestige
  // they read can also fall back below the threshold — see techSystem.ts's
  // unlockAvailable. Both are ADDITIONAL to prereqs, not a replacement.
  // A population gate, despite the name — checked against total ENROLLED
  // students (techSystem.ts's meetsUnlockGates), not bed capacity. Kept the
  // field name it always had rather than a save-shape rename; e.g. the
  // health center: large campuses only, see facilitiesData.ts.
  minCapacityToUnlock?: number;
  minPrestigeToUnlock?: number; // e.g. a research library / athletics complex tier
  // A developed-course gate (Plan 19's PR B): this Buildable stays locked
  // until the catalogue has at least this many courses developed, in any
  // program. Only the first purchased academic hall carries it — "the
  // college is teaching enough to justify a second building" — which is
  // what keeps a $750,000 purchase out of week one now that Founders Hall
  // opens with rooms to spare and the gen-ed core it used to wait on is
  // gone. Monotone, unlike the two above (a developed course stays
  // developed), but read the same way, every tick.
  minCoursesToUnlock?: number;
  // (the third such gate is `graduateProgram` above — a graduate course
  // waits on its program's parent-school gate, which is a reading of
  // milestones and lab status rather than of any one Buildable's id)
  // The fourth such gate, set only on the five athletics venues
  // (facilitiesData.ts): stays 'locked', its own (empty) prereqs
  // notwithstanding, until a varsity team needing this Buildable's
  // facilityType category has been granted (see techSystem.ts's
  // meetsUnlockGates, which reads s.orgs.teams directly rather than a
  // separate "revealed" flag — a team's existence IS the reveal signal).
  // The Medicine/Law reveal-on-gate pattern, with team formation as the
  // gate instead of a milestone count.
  athleticsVenueReveal?: true;
  // Revealed once the school fields ANY varsity team (Plan 21's PR Q's
  // field house): a department facility rather than a sport's venue.
  athleticsDepartmentReveal?: true;
  // VENUE RUNGS (Plan 21's PR Q): how many times this venue has been
  // expanded in place — the same shape as floorsAdded, and the same
  // renovation idiom (the reducer's EXPAND_VENUE). Read by
  // systems/athletics/gate.ts for the seats.
  expansions?: number;
  // Set only on a Greek chapter's own house (see eventData.ts's
  // 'greek-housing'), one per chapter, id'd deterministically off the
  // chapter's own id rather than drawn from any static seed catalogue —
  // unlike every other flag/gate on this interface, which describes a
  // FIXED Buildable from campusData.ts/facilitiesData.ts, a chapter house
  // is manufactured at runtime the moment its petition is approved. It
  // carries no `effects`: the satisfaction bonus and housing capacity it
  // represents are applied directly to the chapter/s.students.capacity at
  // that same moment, live-read off GreekChapter.housed ever after, not
  // off this Buildable finishing. This flag's only jobs are cosmetic —
  // BuildPopup.tsx groups it under Housing (alongside, but never
  // interleaved with, the sequential dorm chain) and gives its tile a beds
  // figure despite the missing `effects`.
  chapterHouse?: true;
  // How many PROGRAM SLOTS this building holds — set only on hall-kind
  // 'building' Buildables (techData.ts's academic hall chain and Founders
  // Hall, six each) and on nothing else. A slot is where a program
  // lives: founding a program takes an empty slot in a standing hall, and
  // six programs of one school in one hall is what founds that school (see
  // the HallSlot block below and docs/design/curriculum.md). The slots
  // themselves are state in `s.halls`, not here; this is the count the
  // hall was built with, which is what lets the loader check an entry has
  // exactly as many as it should.
  slots?: number;
  // A SCHOOL gate (Plan 14's PR E): this Buildable stays locked until the
  // named school has been founded — six of its programs housed in one
  // hall, the `school-founded:<School>` milestone. Set on each lab-gated
  // major's lab (techData.ts), which used to name the school's building
  // as a prereq; the milestone is the reading that building stood for.
  // Checked in techSystem.ts's meetsUnlockGates beside the other dynamic
  // gates, since a milestone is a reading of state rather than a
  // Buildable's status.
  schoolGate?: string;
  status: BuildableStatus;
  effects?: Partial<BuildableEffects>; // read by the systems below; see each field's own comment for exactly when
  // Set only once this school's naming rights are sold (see eventData.ts's
  // 'naming-rights' decision event) — the donor's surname, applied to a
  // school building alongside overwriting `name` with the full donor
  // display text (e.g. "Johnson School of Science"). Its presence, not its
  // value, is what the Curriculum tab reads to know `name` is donor text
  // rather than the seeded catalogue name (see CurriculumTab.tsx's
  // buildSections). An additive optional field — no save migration needed.
  donorSurname?: string;
  // How many times this Buildable has been renovated in place for more
  // capacity — today, only the tier-1 library (see facilitiesData.ts's
  // nextLibraryFloor and engine/reducer.ts's RENOVATE_LIBRARY). Unlike
  // every other tiered facility, a renovation is not a second Buildable
  // placed on the map: it puts this SAME node back into 'developing' at
  // its existing spot and raises its own effects.servesPopulation on
  // completion, so this counter — not another Buildable's status — is what
  // both the reducer and the build panel read to agree on what the next
  // renovation costs and grants. Undefined means never renovated, same as 0.
  floorsAdded?: number;
  // The servesPopulation this Buildable had BEFORE the renovation it is
  // currently in, and the whole of what makes a renovation add capacity
  // rather than take it away and give it back. Set when RENOVATE_LIBRARY
  // puts the node back into 'developing'; cleared when it finishes.
  //
  // A renovating library is not a building site with nothing in it: three
  // finished floors of study seats are still open while the fourth goes up.
  // The live-read contract below says 'done' facilities are what the sums
  // count, and that reading is right for everything that has never opened —
  // this is the one case where the node is 'developing' and yet a real part
  // of it is in use, so it is spelled out as its own field rather than
  // inferred from status. Additive and optional: an old save has no
  // renovation in flight to describe, and reads as undefined.
  renovatingFrom?: number;
}

// What a Buildable is contributing to the satisfaction sums RIGHT NOW.
//
// Not the same as effects.servesPopulation, which is what it will serve
// when it is finished. A 'done' facility serves its full figure; a facility
// that has never opened serves nothing; and a facility part-way through an
// in-place renovation serves what it served before the work started (see
// renovatingFrom above). Written once, here, because three separate sums
// and one drawer all have to agree about it.
export function servingPopulation(t: Buildable): number {
  if (t.status === 'done') return t.effects?.servesPopulation ?? 0;
  if (t.status === 'developing' && t.renovatingFrom !== undefined) return t.renovatingFrom;
  return 0;
}

// Effects a Buildable can grant when finished. Deliberately no reputation
// bonus here — prestige is a slow-moving stock computed and drifted toward
// separately (see prestigeSystem.ts), never a sum of completion bonuses.
//
// The first block below is applied ONCE, at the moment a Buildable finishes
// (techSystem.ts's applyEffects mutates state directly). The second block is
// never mutated into state — it's read LIVE, every tick, off every currently
// 'done' Buildable by the system that cares (satisfactionSystem.ts sums
// servesPopulation/satisfactionAttribute/flatSatisfactionBonus, through
// servingPopulation above, which is 'done' plus the one renovation case;
// prestigeSystem.ts sums prestigeContribution;
// financeSystem.ts sums upkeepPerWeek) — so a facility's contribution stays
// current even though nothing "happens" on the weeks after it finishes.
export interface BuildableEffects {
  capacityBonus: number;
  tuitionBonus: number;
  // one-time bump to the applicant pool (see docs/design/curriculum.md)
  applicantPoolBonus: number;
  unlockIds: string[];  // force these Buildable ids to 'available', regardless of their own prereqs

  // --- live-read, every tick, never mutated into state (see above) ---
  researchRateBonus: number; // added into a campus-wide multiplier on weekly research output (see systems/research/researchSystem.ts). Live-read, like upkeep: a lab that exists is research infrastructure every week it stands, not a one-off bump the week it opened. It MULTIPLIES output, it does not create it — a school with no lab of its own produces nothing however much equipment sits elsewhere on campus (see researchData.ts's lab gate)
  servesPopulation: number;    // how many students' worth of this need one instance covers, compared against total ENROLLED students (needs scale with how many students the campus actually has)
  satisfactionAttribute: keyof SatisfactionAttributes; // which breakdown attribute servesPopulation/flatSatisfactionBonus feeds
  flatSatisfactionBonus: number; // added directly to the attribute score, NOT ratio/population-scaled (the quad: cheap, and its contribution doesn't shrink as the campus grows)
  prestigeContribution: number; // 0..1 share fed into prestige's campus-life input (see prestigeSystem.ts) — the rec center's "small prestige contribution"
  upkeepPerWeek: number; // recurring operating cost, summed into weeklyOpEx alongside salaries/dorm-seat upkeep (see financeSystem.ts)
}

// ---------------------------------------------------------------------
// The campus map (see docs/architecture/campus-map.md: the map is its
// own layer reading the same state, with building/dorm/facility
// Buildables gaining placement). Placement is a PURELY VISUAL layer for
// now: where a finished building physically sits on campus. It grants
// nothing and gates nothing — a building's effects are applied when it
// finishes, never when (or whether) it is placed.
//
// Deliberately NOT a field on Buildable: keeping coordinates in a separate
// `placements` record on GameState leaves the single Buildable model
// unforked, so `course` Buildables — which are never placeable — carry no
// vestigial map fields (see docs/architecture/buildables.md).
// ---------------------------------------------------------------------

// The campus is a fixed grid of tiles. It started deliberately small (8x6)
// while the map was one panel among many, then grew to 28x12 once the map
// became the central interface; it was resized again, at the SAME 7:3
// aspect ratio, for the footprint rescale that put an academic hall at 9x9
// (see campusMap.ts's footprintOf and the PR notes) — a hall's own footprint
// grew by the same 4.5x per side that the grid did (2x2 -> 9x9, 28x12 ->
// 126x54). It was squared off after that, height alone growing 126x54 ->
// 126x126: the map is now a fixed full-viewport background panned/zoomed
// like any map app (see CampusMap.tsx's .campus-map, position: fixed;
// inset: 0), not a box squeezed beside other panels, so there is no more
// wide-short screen shape to match — a square grid reads as neutral in
// every window shape, and CampusMap.tsx's defaultView()/MAP_WIDTH/
// MAP_HEIGHT and actions.ts's createInitialState Founders Hall centering
// are both already pure functions of these two constants, so nothing else
// needed to change for the map, the founding placement, and the starting
// camera to all recentre themselves. Grow these two numbers together to
// grow the campus and keep it square.
//
// Sized against what can actually be built: the full catalogue is 60
// placeable Buildables (10 school buildings — the eight undergraduate
// halls plus BLDG-MED/BLDG-LAW, see techData.ts's
// GraduateProgramSeed.buildingId — 15 dorms, 35 facilities: 5 dining, 2
// each of library/studentCenter/recCenter/healthCenter/quad, 10 labs, and
// 11 one-off campus-life/athletics facilities) whose footprints (see
// campusMap.ts's footprintOf) total 2,179 tiles — under 14% of the now-
// square 15,876-tile grid (2,179 / 15,876), open ground and headroom for
// future content without the map reading as empty.
export const CAMPUS_GRID_WIDTH = 126;  // tiles across (columns)
export const CAMPUS_GRID_HEIGHT = 126; // tiles down (rows) — kept equal to CAMPUS_GRID_WIDTH so the map stays square

// Which Buildable kinds can be sited on the map at all. `course` is
// absent on purpose and must stay absent — a course is not a place.
export const PLACEABLE_KINDS: readonly BuildableKind[] = ['building', 'dorm', 'facility'];

// One tile on the campus grid. row is 0..CAMPUS_GRID_HEIGHT-1, col is
// 0..CAMPUS_GRID_WIDTH-1.
export interface TileCoord {
  row: number;
  col: number;
}

// How many tiles a Buildable covers, in grid units. Buildings are not all
// the same size on a real campus — a school hall is not a dorm — so a
// placement occupies a rectangle rather than a single tile. Which
// rectangle a given Buildable gets is a placement RULE, not a field on
// Buildable: it lives in campusMap.ts's footprintOf, keyed on kind (and
// facilityType), so the single Buildable model stays unforked.
export interface Footprint {
  w: number; // tiles across (columns), >= 1
  h: number; // tiles down (rows), >= 1
}

// Where one placed Buildable sits: its top-left ANCHOR tile plus the
// footprint it covers from there. It occupies rows row..row+h-1 and
// columns col..col+w-1, and every one of those tiles must be in bounds and
// otherwise empty (see campusMap.ts's canPlace).
//
// The footprint is STORED rather than re-derived from the Buildable on
// every read, so a save's layout can never silently reshape (and start
// overlapping) if the footprint table is retuned later. That is also what
// the SAVE_VERSION 3 -> 4 migration writes: a placement saved before
// footprints existed covered exactly one tile, so it loads as 1x1 (see
// persistence.ts).
export interface Placement extends TileCoord, Footprint {}

// Placed Buildable id -> the tiles it occupies. Absent id = not placed yet.
// Plain JSON (no Map/Set, no object references into `tech`) so it stays
// serializable and light for save/load — the same shape rationale as
// `developing` and `events`.
export type Placements = Record<string, Placement>;

// ---------------------------------------------------------------------
// PATHWAYS: purely decorative walkway TILES (see CampusMap.tsx) — a drawn
// path fills a whole grid square, the same unit a building's footprint is
// measured in, rather than tracing a line along the boundary between two
// tiles. Free to draw, free to delete, read by no system: exactly as
// cosmetic as the map itself, one layer further in.
//
// A path tile is identified by its own {row, col} — the same TileCoord
// every other grid-square concept (a footprint's tiles, a placement's
// anchor) already uses — so "this tile has a path on it" needs no scheme
// of its own beyond the ordinary tile grid.
//
// Drawn tiles, keyed by campusMap.ts's pathTileKey(). A plain string -> true
// record rather than a Set: GameState is JSON round-tripped whole (see
// persistence.ts), so no Map/Set may appear anywhere in it, the same
// constraint `placements` and `developing` are already under. Presence is
// the only information a key carries.
export type Pathways = Record<string, true>;

// ---------------------------------------------------------------------
// TREES: the ground the campus was founded on. A new university does not
// open on a bare plate — it opens on a piece of land with woodland already
// on it, and what a player does over the following decades is CLEAR some of
// that and keep the rest. Which is the whole mechanic here, and it is
// three rules:
//
//   - A tree lives on one TILE, the same unit a path tile and a footprint
//     are measured in, so "is there a tree here" needs no scheme of its own.
//   - BUILDING over a tree FELLS it: the reducer's PLACE_BUILDABLE deletes
//     every tree under the footprint it commits, permanently. You cleared
//     the ground to build there.
//   - PAVING over a tree only HIDES it: a path tile on a tree's tile stops
//     it being drawn, and lifting the path brings it straight back. Nothing
//     is deleted, so this is a pure render-time read of `pathways` (see
//     CampusMap.tsx) rather than a second piece of state to keep in step.
//
// The value is a SEED, not a description: the renderer derives species,
// size and the tree's offset within its own tile from it (see
// components/trees.tsx), so a grove reads as a grove rather than as a grid
// of identical lollipops, and one integer per tree is all that has to be
// saved. Keyed by campusMap.ts's pathTileKey(), the same key `pathways`
// uses — which is also what makes the path lookup above a plain key test.
//
// Visual only, like `placements` and `pathways`: no system reads it, no
// Buildable gates on it, and felling a wood — or planting one, with the
// campus tools' tree tool (PLANT_TREE / FELL_TREE) — costs and grants
// nothing.
export type Trees = Record<string, number>;

// The generic pause-the-clock decision-event mechanism (see
// docs/architecture/interrupts.md). Any system enqueues one by setting
// `pendingInterrupt` directly on state; while it is set, the game loop
// halts ticking. The `type` tag identifies which interrupt this is —
// admissions, the U.S. News report, the tutorial, etc. — and `payload`
// carries whatever data that interrupt needs. The UI switches on `type` to
// render the right modal and dispatches an action that clears
// `pendingInterrupt` to let the clock resume. Nothing besides the
// mechanism itself lives here: no admissions, report, or tutorial content.
export interface PendingInterrupt {
  type: string;
  payload?: unknown;
}

// THE SUMMER (Plan 16's PR A): one interrupt, four beats. The year has one
// fixed stop, and everything the year produced is read at it — what the
// year built, where the school now stands, what to charge and whom to
// admit, and what the students are asking for. One `summer` interrupt with
// a `beat` index rather than four interrupts in a row, so a save written
// between beats resumes on the right beat with the clock still halted, and
// nothing can slip in between them.
//
// The beats, in order (SUMMER_BEATS below): review and standing are
// read-and-continue; the admissions decision and the student digest are
// not. RESOLVE_SUMMER_BEAT advances `beat`, carrying the tuition/admit
// decision into `decision` when it leaves the admissions beat, so the last
// beat commits exactly the figures the player set two beats earlier;
// RESOLVE_ADMISSIONS is the last beat's action and the only one that moves
// the calendar (see reducer.ts). `tuition`/`admitRate` are the sticky
// opening positions the sliders start at, exactly what the old
// `admissions` interrupt's payload carried.
export type SummerBeat = 0 | 1 | 2 | 3;
export const SUMMER_BEATS = ['Review', 'Standing', 'Admissions', 'Students'] as const;
export const SUMMER_LAST_BEAT: SummerBeat = 3;

export interface SummerDecision {
  tuition: number;
  admitRate: number;
}

export interface SummerPayload {
  beat: SummerBeat;
  // THE SEMICENTENNIAL (Plan 17's PR C): set on the fiftieth summer, whose
  // first beat is the final report in place of the year in review. Stamped
  // when the interrupt is raised so a save taken between beats still knows,
  // and so the modal's width rule (modalLayout.ts) can read it off the
  // payload alone.
  final?: boolean;
  tuition: number;    // where the tuition slider opens: last year's listed price
  admitRate: number;  // where the admit slider opens: last year's chosen rate
  decision?: SummerDecision; // set once the admissions beat has been left; what the last beat commits
}

// ---------------------------------------------------------------------
// A STUDENT DEMAND (see docs/design/student-life.md's "Student demands:
// the inverse of clubs", and systems/demands/demandSystem.ts). When
// satisfaction sits below DEMAND_SATISFACTION_THRESHOLD the student body
// asks the institution for one concrete, buildable thing, on a deadline.
// Exactly one may be open at a time.
//
// The record carries the TARGET CONDITION and the clock, and nothing else:
// the ask's prompt, headline and grievance text are looked up from
// data/demandData.ts by `metric`/`attribute` when the modal or the tab
// renders, the same way a queued milestone's headline is derived at
// celebration time rather than captured when it was awarded.
//
// The target is a number the game ALREADY tracks, never a parallel
// capacity model: `served` compares satisfactionSystem.ts's own
// servedPopulationFor(attribute) — the sum of servesPopulation across the
// 'done' facilities feeding one satisfaction attribute — against a total,
// and `capacity` compares s.students.capacity against one. So a demand is
// met by BUILDING the thing, detected off the same state the satisfaction
// score is computed from, with no acknowledge button anywhere.
//
// Plain JSON (strings, numbers, a nullable string), like every other slice.
export interface StudentDemand {
  id: string;
  // Which existing reading the target is measured against: a served
  // population, bed capacity, or (Plan 15's PR F) the catalogue's seats.
  metric: 'served' | 'capacity' | 'seats';
  // The satisfaction attribute whose served population is being demanded;
  // null for metric 'capacity' (a demand for more housing), which is
  // measured against s.students.capacity instead.
  attribute: keyof SatisfactionAttributes | null;
  // The Buildable that inspired the ask — "somewhere to eat" is whatever
  // the dining chain's next rung actually is. Captured by name as well as
  // id (like PrizeAward's facultyName) so the modal still says something
  // true if content is edited between raising and resolving.
  askId: string;
  askName: string;
  target: number;       // the demand is MET the moment the measured reading reaches this
  raisedWeek: number;   // absolute week the demand was announced; 0 while it is still queued
  deadlineWeek: number; // absolute week it expires unmet; 0 while it is still queued
}

// Cadence bookkeeping for the interrupt kinds that are neither annual nor
// player-triggered: the milestone celebration (a stop-the-clock moment for
// a genuinely special accomplishment), the authored decision events that
// give the quiet weeks between milestones their texture, and the student
// demands that low satisfaction raises. See data/eventData.ts and
// data/demandData.ts for the content and tuning constants, and
// systems/events/eventSystem.ts and systems/demands/demandSystem.ts for
// the tick functions that fire them.
//
// Plain JSON — numbers, a string array, a string -> number record and two
// nullable flat records — the same shape rationale as `developing` and
// `placements`.
export interface EventState {
  // Milestone keys (the same keys techSystem.ts writes into s.milestones)
  // that have been awarded but not yet celebrated. A QUEUE rather than a
  // fire-it-immediately call, because the week a milestone lands may
  // already belong to the summer admissions decision or the U.S. News
  // report, and only one interrupt can be pending at a time. Draining the
  // queue on a later quiet week means a celebration is delayed, never
  // lost, and neither annual interrupt has to be special-cased anywhere.
  pendingMilestones: string[];
  lastMilestoneWeek: number;   // absolute week the last celebration fired; 0 = never
  lastDecisionWeek: number;    // absolute week the last authored decision event fired; 0 = never
  // Decision event id -> how many times it has fired and the absolute
  // week it last did. Both are needed: the count enforces a per-event
  // fire cap, the week enforces the per-event repeat cooldown.
  decisionHistory: Record<string, { fires: number; lastWeek: number }>;
  // The demand the student body has rolled but not yet been able to
  // announce, because the week it landed on already belonged to another
  // interrupt or the shared cadence floor had not cleared. A QUEUE of one,
  // for exactly the reason pendingMilestones is a queue: a demand that
  // would fire during a busy week WAITS rather than being dropped. Its
  // raisedWeek/deadlineWeek are stamped when it is announced, not when it
  // is rolled, so waiting never eats into the deadline the player gets.
  pendingDemand: StudentDemand | null;
  // The demand currently outstanding, with its target and expiry. At most
  // one, ever: demands are pressure, not a to-do list. Cleared the week
  // its target is met (a satisfaction reward) or its deadline passes
  // unmet (a satisfaction penalty).
  activeDemand: StudentDemand | null;
  // Absolute week the last demand RESOLVED — met, failed, or overtaken by
  // the shortfall being fixed before it could even be announced; 0 =
  // never. The cooldown half of the cadence, and the reason a failed
  // demand cannot be followed straight away by a second unmeetable one.
  lastDemandWeek: number;
  // THE FIRST YEAR'S SCRIPT (Plan 16's PR F — see data/eventData.ts's
  // OPENING_LETTERS). Four letters from the board's chair, each with one
  // thing to do, fired through the ordinary interrupt system on the first
  // quiet week at or after its week of year one. `read` is the ids already
  // delivered, so a letter fires once; `skipped` is the player's "I know
  // the way" — on the first letter, or on the walkthrough's welcome — which
  // stands the rest of the script down for the run. Plain JSON like the
  // rest of this slice.
  //
  // `stage` is THE OPENING WALKTHROUGH (see state/opening.ts):
  // the forced first clicks of a guided founding — site the hall, see what
  // it teaches, found a fourth program — which hold the clock until they
  // are done. State rather than shell memory, so a refresh mid-walk
  // resumes on the same step. A headless founding opens at 'play'.
  opening: { read: string[]; skipped: boolean; stage: OpeningStage };
  // THE TRUSTEES' RESPONSE (Plan 17's PR D — see data/eventData.ts's
  // 'rival-passed'). The ids of every rival whose passing the player has
  // already been asked about, stamped when the event fires rather than
  // when it is answered, so a dismissed modal never comes back for the
  // same school. Once per rival for the run; a plain list of ids.
  passedResponses: string[];
}

// See state/opening.ts, which owns the order and the meaning.
export type OpeningStage = 'welcome' | 'site-hall' | 'teaching' | 'found' | 'play';

// The player's admissions policy is set once a year via the summer
// interrupt (see docs/design/admissions.md). NOTE: there is no
// AdmissionsSettings any more. Its only field was scholarshipRate, retired
// with scholarships themselves (Plan 05's PR B), and an interface with
// nothing in it is a slot the next reader has to wonder about. Admissions
// policy is now exactly one number and it lives where the price lives:
// finance.listedTuition. Selectivity and enrollment are still NOT inputs —
// they are emergent outcomes of the funnel (see admissionsSystem.ts).

export interface Rival {
  id: string;
  name: string;
  // The school's teams' name — "Owls", "Aggies", "Kestrels". Authored per
  // school in data/rivalData.ts and read by NOTHING mechanical: it exists
  // so a standings row can read as a sports page rather than a spreadsheet.
  // The player's own is University.mascot below, named at the
  // athletic-director interrupt rather than at founding.
  mascot: string;
  // The pair the school wears (see SchoolColors above), dealt off its id at
  // founding by data/schoolColors.ts's rivalColorsFor the way its derived
  // standings are, and read by nothing mechanical: Plan 18's PR E draws the
  // playoff bracket in both schools' colours.
  colors: SchoolColors;
  reputation: number;   // the metric the ranking sorts on
  momentum: number;     // hidden trend, makes rivals dynamic over decades
  // A second, independent ranking axis for athletics' standings (see
  // data/rivalData.ts's athleticStrengthFor and rivalsSystem.ts's
  // athleticRank) — deliberately NOT derived from `reputation` at read
  // time, so a rival can be an athletic power without being an academic
  // one and vice versa, the same real-world decoupling `reputation` alone
  // could never express.
  //
  // IT MOVES NOW. This used to read "static for now (no annual drift of its
  // own, unlike reputation/momentum) — a deferred deepening, not an
  // oversight", and the deepening is taken: it drifts annually on its own
  // momentum like every other axis. A playoff bracket seeded off a field
  // that never changes is a bracket whose result is known a decade in
  // advance, so the drift is a prerequisite rather than a flourish.
  //
  // THIS IS THE DEPARTMENT-WIDE NUMBER. A school's strength in one
  // particular sport is derived from it per sport, not stored — see
  // rivalData.ts's sportStrengthFor for why 100 schools x 18 sports is
  // derived rather than authored or saved.
  athleticStrength: number;
  athleticMomentum: number;
  // THE OTHER TWO RANKING AXES (see data/rivalData.ts's standingsFor and
  // systems/rivals/rivalsSystem.ts's rankedListBy). `reputation` answers
  // "how good is this university"; these answer "how good is its research"
  // and "what is it like to be a student here", and a school is free to be
  // three different things on the three lists — which is most of what makes
  // a second and third list worth having.
  //
  // Named IDENTICALLY to the player's own fields on University below, which
  // is not cosmetic: it is what lets one rankedListBy(axis) serve all four
  // leaderboards instead of a fourth hand-copied sort.
  //
  // Seeded like athleticStrength — a deterministic spread off the school's
  // own id — and drifted annually like reputation, each with its own
  // momentum so the three tables move independently.
  socialStanding: number;
  researchStanding: number;
  socialMomentum: number;
  researchMomentum: number;
}

// ---------------------------------------------------------------------
// RESEARCH (see docs/design/research.md). Player-commissioned initiatives —
// one per research facility, keyed by the facility's Buildable id so "one
// at a time" is a property of the shape rather than a rule somebody has to
// enforce — plus the lifetime counters each run adds to. Deliberately
// AGGREGATE where it counts: publications, breakthroughs, prizes and grant
// income are one tally for the whole institution rather than a per-school
// ledger, because nothing reads them per school. Everything here is a plain
// number, a plain string or an array of flat records — the same
// JSON-round-trippable shape rationale as
// `events` and `placements`.
// ---------------------------------------------------------------------

// One awarded research prize, queued for its celebration. The faculty
// member's details are CAPTURED here rather than looked up when the modal
// renders, so the celebration still says something true if the winner has
// been dismissed in the weeks between the award and the quiet week it
// finally fires on.
export interface PrizeAward {
  facultyId: string;
  facultyName: string;
  field: string;
  prizeName: string;
}

// THE REPORT A CONCLUDED PROJECT FILES. Queued by researchSystem.ts when
// an initiative runs its course, and rendered as the `research-complete`
// interrupt — the one modal research is allowed, and now the right one.
//
// It used to be the prize that stopped the clock, through a separate
// `research-prize` interrupt, which meant the modal celebrated the trophy
// while the five years of work that earned it passed as a log line. The
// completion IS the event; the award is one of its results, and sits in
// here as one field among the outputs rather than as an interrupt of its
// own.
//
// Names are CAPTURED rather than looked up later, the same reason
// PrizeAward captured them: the week a project ends may not be the week
// the report fires, and a professor can be dismissed or a topic re-authored
// in between. A report says what was true when the work finished.
export interface InitiativeReport {
  topicId: string;
  topicName: string;
  labId: string;
  labName: string;
  depth: InitiativeDepth;
  years: number;              // rounded to one decimal, as the log line reports it
  facultyNames: string[];
  publications: number;
  breakthroughs: number;
  grantIncome: number;
  award: PrizeAward | null;   // the one thing that can only be won at conclusion
}

// How deep a commitment an initiative is. Lives here rather than beside
// its tuning table (data/researchData.ts's INITIATIVE_DEPTHS) because this
// module is the base of the import graph — everything reads types, types
// reads nothing — and the depth is part of the saved shape.
export type InitiativeDepth = 'pilot' | 'project' | 'program' | 'landmark';

// A piece of research the player commissioned: a named topic, run out
// of one research facility by named people, for years. See
// data/researchData.ts's initiative block for the model and
// data/researchTopics.ts for the topics themselves.
//
// Participants are COMMITTED for the duration: their course slots go to
// zero and whatever they were teaching is orphaned (see techSystem.ts's
// isCommitted), which is what makes starting one a real institutional
// decision rather than a free upgrade for anybody idle.
export interface Initiative {
  labId: string;            // the facility hosting it — the slot IS the key in `initiatives`
  topicId: string;
  depth: InitiativeDepth;
  participantIds: string[];
  weeksTotal: number;
  weeksRemaining: number;
  // Banked during the run. breakthroughs is what gates the award roll at
  // conclusion; the rest are for the report it leaves behind.
  publications: number;
  breakthroughs: number;
  grantIncome: number;
  banked: number;           // output banked toward the next publication (see researchData.ts's PUBLICATION_POINTS)
}

// What an initiative leaves behind once it ends — the university's own
// research record, and the only place a finished project is still visible.
// Bounded (see INITIATIVE_HISTORY_LIMIT) because a long run would
// otherwise grow this without limit.
export interface CompletedInitiative {
  topicId: string;
  depth: InitiativeDepth;
  year: number;
  facultyNames: string[];
  publications: number;
  breakthroughs: number;
  grantIncome: number;
  award: string | null;     // the prize name, when the work took one
  cancelled?: true;         // ended early by the player, forfeiting its funding
}

export const INITIATIVE_HISTORY_LIMIT = 24;

export interface ResearchState {
  // DEAD STATE, kept rather than removed. This was the campus-wide bank
  // that lab-equipped faculty trickled into and outputs were bought out
  // of; initiatives replaced it (decision 7 — idle capacity produces
  // nothing, the way to produce is to start something), so nothing writes
  // it and, since the Faculty tab stopped displaying a figure that had
  // read zero ever since, nothing reads it either. Left in the saved shape
  // exactly as Faculty.morale was: harmless, and not worth a migration to
  // delete. Do not wire it back up — if research ever needs a stock
  // again it should be per-initiative, where the work actually is.
  points: number;
  lifetimePoints: number;  // every point ever produced, never spent down — display only, so the Faculty tab can show the long arc rather than a stock that sawtooths
  publications: number;    // papers, monographs, case studies and exhibited works — the cheap, frequent output (see researchData.ts's RESEARCH_OUTPUTS). A monotone stock like the others; feeds prestige at a steep discount to a breakthrough (see prestigeSystem.ts's researchScore)
  grants: number;          // research grants awarded so far
  grantIncome: number;     // total cash those grants brought in — displayed in the Treasury, since a grant lands as a one-off rather than as a line of the weekly statement
  breakthroughs: number;   // published breakthroughs. A monotone STOCK, and the whole of research's reach into prestige: prestigeSystem.ts's researchScore reads this (never s.self.reputation directly — see that file)
  prizes: number;          // prizes awarded; counts for a heavier share of the same capped prestige input
  // Running initiatives, KEYED BY THE FACILITY hosting each one — which is
  // how "one initiative per facility" is enforced by the shape of the data
  // rather than by a rule somebody has to remember to check. A facility is
  // vacant exactly when it has no key here.
  initiatives: Record<string, Initiative>;
  completedInitiatives: CompletedInitiative[]; // newest first, capped at INITIATIVE_HISTORY_LIMIT
  lastOutputWeek: number;  // absolute week the last research output landed; 0 = never. The cooldown half of the cadence, exactly like events.lastDecisionWeek
  pendingCompletions: InitiativeReport[]; // concluded but not yet reported — a QUEUE for the same reason events.pendingMilestones is one: the week a project ends may already belong to admissions or the U.S. News report, and only one interrupt can be pending at a time. Drained one at a time (see eventSystem.ts): each is a report on a different project and they do not read as one modal.
}

// ---------------------------------------------------------------------
// STUDENT ORGANISATIONS (see docs/design/student-life.md). Two layers,
// the second gated by the first: clubs, which form once the campus has a
// student center, and — only if the player has explicitly approved a
// Hellenic Council — Greek chapters on top of them.
//
// Everything here is plain JSON (numbers, strings, booleans, arrays of flat
// records) for the same reason `events`, `placements` and `research` are:
// the whole GameState is JSON-round-tripped into one localStorage key, so
// no Map, no Set and no reference into `tech` may appear (see
// state/persistence.ts).
//
// The two live lists ARE the source of truth for both mechanical effects an
// organisation has: financeSystem.ts sums `upkeepPerWeek` across them every
// week, and satisfactionSystem.ts sums their social contribution into the
// satisfaction TARGET every week. Neither is ever mutated into a total
// stored elsewhere, which is what makes disbanding a chapter actually
// remove its cost and its contribution rather than leaving a baked-in
// number behind.
// ---------------------------------------------------------------------

// What every student organisation carries, whatever kind it is. Membership
// is NOT stored: it is derived from these three fields plus current
// enrollment (see data/studentLifeData.ts's orgMembership), so it can never
// drift from the school it belongs to and costs nothing per week to keep
// current.
export interface StudentOrgBase {
  id: string;
  name: string;
  foundedYear: number;
  // The two founding facts membership is derived FROM: how many students
  // signed up on day one, and how big the school was that day. A club
  // founded at 400 students that still has 40 members reads as a much
  // bigger deal than the same 40 at 18,000 — which is exactly the per-org
  // variation the display is for.
  foundingMembers: number;
  foundingEnrolled: number;
  // Weekly running cost, in DOLLARS, fixed at the moment the player
  // approved this organisation and sized then as a share of a week of
  // operating cost (see studentLifeData.ts's ORG_UPKEEP_WEEKS_OF_OPEX).
  // Fixed rather than re-derived every week because deriving a line of
  // opex FROM opex is circular; what it costs the school to keep this
  // club running does not need to grow with the school's budget forever.
  upkeepPerWeek: number;
}

export interface StudentClub extends StudentOrgBase {
  // Set once at formation (see data/studentLifeData.ts's SPORT_CLUB_SHARE
  // roll) and never changed afterward: a SPORTS id if this club plays a
  // sport, or null for an ordinary interest club. The discriminator a
  // varsity petition's eligibility reads — item 1's "subset of club
  // formations are sport clubs".
  sport: string | null;
  // The year this club was last offered (and declined) the varsity
  // petition, or null if it has never been asked. A decline is not
  // permanent: sportClubsAwaitingVarsity (studentLifeData.ts) re-offers the
  // petition VARSITY_PETITION_MIN_TENURE_YEARS after this year, the same
  // tenure gate a club clears once to be asked at all — a club that says no
  // gets to grow and ask again, not close the door forever. An approval
  // never sets this: the club is promoted straight to a VarsityTeam and
  // removed from s.orgs.clubs (see promoteToVarsityTeam), so there is no
  // club record left here to re-ask. Always null for a non-sport club,
  // since only a sport club is ever offered the question (see
  // data/eventData.ts's 'varsity-petition').
  varsityLastAskedYear: number | null;
}

// A Greek-letter chapter. Everything a chapter needs beyond a club is
// about the two things that can happen to it later: a scandal has to be
// able to name and disband exactly one chapter, and the housing petition
// has to be able to ask each chapter at most once.
export interface GreekChapter extends StudentOrgBase {
  kind: 'fraternity' | 'sorority';
  // The chapter's three letters as LETTERS — 'ΑΒΓ' for Alpha Beta Gamma.
  // Stored rather than derived at every read because it is what goes on the
  // chapter house's pediment on the campus map, and a building should not be
  // re-parsing an English sentence on every frame to find out its own name.
  // Derived from `name` on load for saves that predate the field (see
  // persistence.ts), which is exact: the name is the letters.
  glyphs: string;
  housed: boolean;       // a dedicated chapter house has been built for them
  housingAsked: boolean; // they have already petitioned for one — never ask again, whatever the answer was
}

// A hired member of the athletics staff — a head coach, an assistant coach,
// or a trainer (see VarsityTeam below and data/studentLifeData.ts's coach
// hiring pool). Mirrors Faculty's own hiring-pool shape (a rolled ceiling
// grown toward over tenure, a salary recomputed live from current quality —
// see facultyData.ts's grownStat/facultySalary) deliberately: Athletics V2's
// whole ask was a SEPARATE pool that follows the same mechanism, not a new
// one. Simpler than Faculty by one axis — one `quality` stat, not a
// teaching/research split — since a coach is evaluated on one thing, not
// two.
export interface Coach {
  id: string;
  name: string;
  gender: 'male' | 'female';
  // The name pool's cultural origin, kept so the portrait can weight skin
  // tone by it — the exact same field, from the exact same source, that
  // Faculty.heritage carries (see components/FacultyPortrait.tsx). It used
  // to be rolled and discarded, which meant a coach could only ever have
  // been drawn with a face unrelated to their own name.
  heritage: string;
  // A head/assistant coach candidate's field is the SPORTS id (see
  // data/studentLifeData.ts) they coach — 'soccer-m', 'lacrosse-w', etc. — so
  // only a candidate for THIS team's own sport is hireable into either of
  // those two roles. A trainer's field is always TRAINER_FIELD
  // ('strength-conditioning'): strength & conditioning is a discipline, not
  // a sport, so one trainer pool serves every team regardless of sport.
  field: string;
  quality: number;          // current, 0..100 — grown toward qualityPotential over tenureWeeks, like Faculty.teaching/research
  qualityPotential: number; // ceiling, rolled once at generation — and since Plan 21's PR K, NOT what the card prints (see `scouted`)
  // NOW, OR LATER (Plan 21's PR K). A candidate is a prospect or a veteran:
  // `age` in years; `startQuality` is what they were worth the week they
  // were listed and what growth climbs from (a veteran starts near their
  // ceiling, a prospect far under it); `plateauYears` is how long the climb
  // takes (short for a veteran, long for a prospect). `scouted` is the
  // RANGE the card prints — the ceiling is uncertain until tenure resolves
  // it, and a better athletic director scouts a narrower range. All four
  // are optional so a coach written before them reads as a prospect of 40
  // whose ceiling is known; the readers default them (studentLifeData.ts's
  // coachProfile).
  age?: number;
  startQuality?: number;
  plateauYears?: number;
  scouted?: [number, number];
  tenureWeeks: number;      // weeks assigned to a team's roster; 0 for a candidate still on the market
  weeksListed: number;      // weeks on the market; stops mattering once hired, exactly like Faculty.weeksListed
  salary: number;           // current annual salary, recomputed live from quality + tenureWeeks (see coachSalaryFor)
}

// A sport club that petitioned and was granted varsity status (see
// data/eventData.ts's 'varsity-petition' and data/studentLifeData.ts). Lives
// alongside clubs/chapters in s.orgs.teams, reusing the same flat-per-org
// capped social contribution and weeks-of-opex upkeep contract every other
// organisation here does. Promoted straight FROM a StudentClub (same id —
// see studentLifeData.ts's promoteToVarsityTeam), so the club stops drawing
// its old club-level contribution the same week.
export interface VarsityTeam extends StudentOrgBase {
  sport: string;               // a SPORTS id (see data/studentLifeData.ts)
  // The venue facilityType this sport needs, CAPTURED at grant time rather
  // than re-derived from `sport` on every read — so a later retune of the
  // sport -> venue-category mapping can never strand an existing team's
  // reference to the venue it was actually promised.
  venueCategory: FacilityType;
  // The three roles Athletics V2 asks every team to staff (see Coach
  // above). All three start vacant (null) the week a team goes varsity —
  // hired from s.orgs.coachCandidates through the Athletics tab, same as a
  // faculty hire, rather than auto-generated the way a v1 team's single
  // coachName used to be. A vacant role is a real, felt gap: teamQuality
  // (studentLifeData.ts) scores it at the same floor an empty course slot
  // would.
  headCoach: Coach | null;
  assistantCoach: Coach | null;
  trainer: Coach | null;
  // Whether the team can actually compete yet. Goes straight to 'active' if
  // a compatible venue was already 'done' when the petition was granted
  // (the "second team in a category" case); otherwise it sits here until
  // the shared venue Buildable it is waiting on finishes (see
  // systems/studentlife/studentLifeSystem.ts's tick).
  status: 'awaitingVenue' | 'active';
  // A POSTSEASON BAN (Plan 21's PR P): the last year the program may not
  // enter the bracket. Set by the recruiting scandal, read by playoffs.ts;
  // absent or past = eligible. A cash penalty is ignorable by year twenty;
  // losing a season is not.
  postseasonBanThroughYear?: number;
}

// One organisation that has formed and is waiting on the player's answer at
// the next summer admissions boundary (see docs/design/student-life.md:
// clubs and new chapters are a batched DIGEST folded into an interrupt that
// already exists, never a modal of their own). Carries everything needed to
// turn it into a live organisation on approval, so approving is a move
// rather than a re-roll.
export interface OrgPetition {
  id: string;
  kind: 'club' | 'chapter';
  name: string;
  greekKind?: 'fraternity' | 'sorority'; // set only for kind 'chapter'
  // Set only for kind 'club': a SPORTS id if the formation roll drew a sport
  // club, null otherwise (see data/studentLifeData.ts's SPORT_CLUB_SHARE).
  // Carried through to the live StudentClub on approval, unchanged — the
  // discriminator is rolled once, at formation, like everything else here.
  sport?: string | null;
  foundedYear: number;
  foundingMembers: number;
  foundingEnrolled: number;
  upkeepPerWeek: number; // sized in weeks of opex the week the petition was raised
}

// The one athletics-wide recruiting & scholarship budget dial (see
// data/studentLifeData.ts's ATHLETICS_BUDGET_TIERS). Scales every active
// varsity team's social contribution AND the whole program's upkeep
// together, same as the investment tier it replaces — deliberately not a
// per-team budget, so athletics stays one lever the player turns for the
// whole department, not a line item per sport — and now ALSO feeds
// teamQuality (studentLifeData.ts): a bigger budget means better recruiting,
// not just a bigger program.
export type AthleticsBudgetTier = 'low' | 'medium' | 'high';

// One sport's postseason, from the only point of view that exists here: the
// player's. A school that does not field the sport has no result, and a
// program outside its sport's strongest eight has `finish: 'missed'` — which
// is a RESULT rather than an absence, and the one that makes a coach's salary
// a decision.
export interface SeasonResult {
  year: number;
  sport: string;
  seed: number | null;      // the player's seed in the bracket; null = did not qualify
  finish: 'champion' | 'final' | 'semifinal' | 'quarterfinal' | 'missed';
  banned?: boolean;         // 'missed' because the program was serving a postseason ban (Plan 21's PR P)
  beaten: string[];         // schools the player beat, in order, by name and mascot
  lostTo: string | null;
  champion: string;         // who took the title — may be the player
  championMascot: string;
}

// One occasion's result, in a season record (see StudentOrgState.season).
export interface OccasionResult {
  occasion: 'opener' | 'rivalry' | 'homecoming';
  week: number;
  opponent: string;      // name and mascot
  opponentStrength: number;
  won: boolean;
  upset: boolean;        // the weaker side by a wide margin won
}

export interface SeasonRecord {
  year: number;
  wins: number;
  losses: number;
  results: OccasionResult[];
}

// The all-time record against a sport's designated rival (Plan 21's PR M).
// `streak` is signed: positive is the player's run of consecutive wins,
// negative the rival's.
export interface RivalryRecord {
  wins: number;
  losses: number;
  streak: number;
}

export interface StudentOrgState {
  clubs: StudentClub[];
  chapters: GreekChapter[];
  teams: VarsityTeam[];
  // The standing coach/trainer hiring pool (see Coach above and
  // data/studentLifeData.ts's tickCoachCandidatePool) — mirrors s.candidates
  // (Faculty's own market), just scoped to athletics and kept separate per
  // the design ask for its own pool.
  coachCandidates: Coach[];
  // Petitions raised since the last summer boundary, drained wholesale
  // there: approved ones become organisations, the rest are declined.
  pendingPetitions: OrgPetition[];
  // The Greek gate, and the whole reason no Greek content can appear
  // unbidden. Every Greek-related eligible() reads `approved`; `offered`
  // records that the one-time question has been ASKED, so declining it
  // closes Greek life for the rest of the run.
  hellenicCouncilApproved: boolean;
  hellenicCouncilOffered: boolean;
  lastFormationWeek: number; // absolute week a club or chapter last formed; 0 = never
  athleticsBudget: AthleticsBudgetTier;
  // THE PRIORITY LIST (Plan 21's PR G): the department's programs in the
  // order the player put them, as team ids. The ORDER is the stored thing
  // and the only stored thing — the pot, the funded line and therefore the
  // bands are derived from it every read (studentLifeData.ts's
  // departmentPot), so they can never disagree with the money. A team
  // missing from the list (promoted before the list existed, or an id the
  // list carries for a team that is gone) is handled by the derivation, not
  // by a migration: unknown ids are dropped, unlisted teams are appended.
  teamOrder: string[];
  // THE ARRIVAL (Plan 21's PR O). `studentCenterWeek` is the absolute week
  // the first student centre finished (0 = not yet), read by the first
  // sport club's pity timer: a pipeline is a guarantee, not a lottery.
  // `mascotBeatPending` is set the summer the first sport club is
  // recognised and fires the naming beat on the next quiet week — the
  // mascot is chosen there, two decades before the department, and the
  // director's modal stops asking once it is.
  studentCenterWeek: number;
  mascotBeatPending: boolean;
  // THE ATHLETIC DIRECTOR, hired once the first team exists (see
  // systems/events/eventSystem.ts's fireAthleticDirectorOffer). A `Coach`
  // rather than a fourth kind of person, because that is exactly what they
  // are: somebody with a quality, a salary and a field — theirs being
  // AD_FIELD, which marks a role the way TRAINER_FIELD marks a discipline.
  //
  // They do two things, and both are real or the hire would be another pure
  // cost. Their quality is a DEPARTMENT-WIDE addend to every team's
  // teamQuality, beside the budget tier's own bonus — a different lever from
  // the budget, since one is people and the other is money. And they are the
  // voice: the shortage interrupts and the championship reports are written
  // as the AD speaking, which is what makes a periodic "your wrestling
  // program has no head coach" read as somebody doing their job rather than
  // the UI nagging.
  athleticDirector: Coach | null;
  // THE POSTSEASON (see systems/athletics/playoffs.ts).
  //
  // `lastSeason` is keyed by sport id and OVERWRITTEN every year, so it can
  // never grow: forty years times eighteen sports of stored brackets is an
  // archive nobody reads inside a save that has to stay JSON-plain. A bracket
  // is a thing that happened for one modal's duration; what survives it is a
  // result and, sometimes, a title.
  //
  // `titles` is the monotone half — the school's own championships, and the
  // only part of the postseason any system reads back (campus-life standing,
  // see prestigeSystem.ts). `pendingTitles` is the queue of sports won this
  // year but not yet reported, drained on a quiet week exactly as a milestone
  // is: the playoff week may already belong to something else.
  lastSeason: Record<string, SeasonResult>;
  titles: Array<{ sport: string; year: number }>;
  pendingTitles: string[];
  // THE SEASON (Plan 21's PR N, systems/athletics/season.ts): each active
  // team's four dated occasions a year — an opener, the rivalry game, a
  // homecoming date, the postseason — resolved the week they happen, each
  // writing a log line, and a record accumulating. `season` is keyed by
  // sport and OVERWRITTEN each year like lastSeason, so it cannot grow;
  // `rivalries` is the monotone half: the all-time record and the streak
  // against the sport's designated rival (PR M), which is derived, never
  // stored. Four dates is not a schedule — see season.ts for the line.
  season: Record<string, SeasonRecord>;
  rivalries: Record<string, RivalryRecord>;
  // The absolute week the AD offer was last PUT, set when the interrupt
  // fires rather than when it is answered. 0 = never asked.
  //
  // At fire time, deliberately. Declining is not a one-shot the way the
  // Hellenic Council is — a school that cannot afford a director in year 12
  // must not lose the position for the rest of the run — so the offer has to
  // come back, and something has to say when it last went out. Stamping it on
  // the DECLINE would leave a gap: anything that clears the interrupt without
  // going through the decline (the generic resolve path, a harness dismissing
  // an interrupt it does not recognise) leaves no record, and the offer
  // re-fires the very next quiet week, forever, starving every other event
  // that shares that slot. That is not hypothetical — it is what happened the
  // first time this was written, and sim/balanceSim.ts's decision-event count
  // fell from 52 over forty years to 8.
  athleticDirectorAskedWeek: number;
}

// WHICH ARCHITECTURE THIS CAMPUS WAS BUILT IN. Chosen at founding and
// permanent: a campus's architecture is what it was built as, so nothing
// offers to change it later.
//
// Lives here rather than in components/buildingSpec.ts because it is a fact
// about the school that gets saved, not a drawing detail — buildingSpec.ts
// imports it, the same direction it already imports Buildable. The palette
// behind each name is that module's (see its VERNACULARS table).
//
export type Vernacular = 'georgian' | 'gothic' | 'classical' | 'mission' | 'modern';

// The colours a school wears (Plan 18's PR B): the pair the player picked
// at founding, or the pair a rival was dealt. Two CSS colours and nothing
// else — the pair's name and id belong to the startup screen's table
// (data/schoolColors.ts), not to the save. Presentation only: no system
// reads either field. The player's pair is the game's theme (see
// components/theme.ts); a rival's is unread until the playoff bracket and
// the annual report draw it.
export interface SchoolColors {
  primary: string;   // the dominant colour — the dock, the primary button's outline, eyebrows
  secondary: string; // the accent — the active tab, the primary button's fill, the focus ring
}

// NO SchoolType. Private/public was the game's only starting fork and
// Plan 07 retired it — see data/foundingData.ts for what it was and why it
// went. Everything about a school emerges from play now, which is what
// docs/design/progression.md always said should happen.

export interface University {
  // The institution's name in two halves. The player writes only the
  // first at founding ("Blackmoor"); the second is fixed institutional
  // form, and starts as "College" for every school. Completing the first
  // lab offers a one-time promotion to "University" (see the 'charter'
  // interrupt in systems/events/eventSystem.ts) — the whole of that
  // feature is this string plus the flag below. Kept as two fields rather
  // than one formatted string so nothing ever has to parse a name to
  // decide what may be renamed.
  name: string;
  suffix: string;       // "College", then "University" if the charter is taken. May be empty on a run resumed from a save written before the split (see persistence.ts's v6 -> v7)
  universityCharterOffered: boolean; // the one-time offer has been made — set whether it was accepted or declined, so it never comes back around
  // What this school's teams are called (see Rival.mascot). EMPTY until the
  // athletic director is hired, which is the interrupt that asks for it —
  // deliberately not the startup screen, which would ask a decade before
  // anything wears the name. Empty is a real state every reader must
  // handle: a school with no varsity program has no mascot and is not
  // pretending otherwise.
  mascot: string;
  reputation: number;   // player's own rank metric — the ACADEMIC axis, and the one the whole economy reads (see systems/prestige/prestigeSystem.ts)
  // Last summer's report card (Plan 15's PR B): the year score prestige
  // stepped toward, and what each input was graded. Null until the first
  // summer. Written only by prestigeSystem.ts's gradeYear; read by the
  // History tab's Standing panel, which shows the grade beside each input.
  reportCard: ReportCard | null;
  // The other two standings, added beside `reputation` and never inside it
  // (see docs/design/progression.md's "Three standings"). Both are stocks of
  // exactly the same shape — a target computed weekly from durable inputs,
  // drifted toward at PRESTIGE_DRIFT_RATE — and both are READINGS: no system
  // reads either one back. Admissions, tuition, the applicant pool and the
  // balance sim all still read `reputation` alone.
  socialStanding: number;
  researchStanding: number;
  vernacular: Vernacular; // the architecture the campus is built in, fixed at founding
  colors: SchoolColors;   // the pair the school wears, picked beside the vernacular and fixed the same way (see SchoolColors)
  // THE SEALED RECORD (Plan 17's PR C). Null until the fiftieth summer,
  // when the reducer's RESOLVE_ADMISSIONS writes state/legacy.ts's reading
  // once — before anything about that summer changes the school, so it is
  // exactly what the final report showed — and never again. Play goes on
  // afterwards and nothing that happens changes this; the History tab
  // shows it as the record, sealed in the fiftieth year.
  legacy: Legacy | null;
  // Everyone who has ever held a chair here: the founding five plus every
  // appointment since (facultySystem.ts's appointFaculty is the one door).
  // Monotone; dismissals do not subtract. The final report's "faculty who
  // served", which no roster count can give.
  facultyServed: number;
}

// THE SUMMER REPORT CARD. At the admissions boundary the standing's inputs
// are graded for the year just ended and summed into a year score on the
// same 5..150 scale prestige lives on; prestige then steps toward that
// score by a fraction of the gap — a small one upward, a large one downward
// (see prestigeSystem.ts's gradeYear). `grades` is keyed by the breakdown's
// input keys, one contribution each, so the panel can put "this year's
// grade" beside every row without naming one.
export interface ReportCard {
  year: number;                    // the year that was graded
  score: number;                   // the year score, clamped to the band
  grades: Record<string, number>;  // input key -> the contribution it was graded
  before: number;                  // prestige the morning of the report
  after: number;                   // prestige after the step
}

// THE LEGACY (Plan 17's PR B): six graded axes and a name, read off state
// at any moment by state/legacy.ts's legacy(s), and written ONCE — onto
// University.legacy, at the fiftieth summer (PR C) — as the record the run
// is remembered by. Six grades rather than a score, on purpose: a single
// number invites optimising one thing; six let a run be an A in research
// and a C in teaching and be *called* something for it. The name is
// flavour, chosen from an authored table by the pattern of grades; the six
// grades are the record. Plain JSON — strings and numbers — so a sealed
// legacy survives a save untouched.
export type LegacyGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type LegacyAxisKey = 'breadth' | 'concentration' | 'teaching' | 'research' | 'reach' | 'stewardship' | 'campusLife';

export interface LegacyAxis {
  key: LegacyAxisKey;
  label: string;
  score: number;      // 0..1, before banding
  grade: LegacyGrade;
  detail: string;     // one line about what the reading actually read
}

export interface Legacy {
  year: number;               // the year the reading was taken (the fiftieth, when sealed)
  axes: LegacyAxis[];         // six, in a fixed order (see state/legacy.ts's AXES)
  name: string;               // "a great research university" — the sentence the run is called
  table: 'great' | 'sound' | 'troubled'; // which authored table the name came from (see state/legacy.ts)
}

// The institution's full display name. The one place the two halves are
// joined, so a school resumed from a pre-split save (empty suffix) reads
// exactly as it always did rather than picking up a stray space.
export function institutionName(u: University): string {
  return u.suffix ? `${u.name} ${u.suffix}` : u.name;
}

// Total enrolled across the four classes — the whole student body. Derived,
// never stored, so it can never drift from the classes it sums. Every
// per-student reading (tuition, instruction cost, appropriations, scale)
// goes through this.
export function totalEnrolled(s: StudentBody): number {
  return s.classes.freshman + s.classes.sophomore + s.classes.junior + s.classes.senior;
}

// One year's worth of the school's headline numbers, appended once a year
// at the admissions boundary (see reducer.ts's RESOLVE_ADMISSIONS — the
// game's only annual boundary). This is the game's time series: the long
// arc the docs/design/gameplay.mdis about is otherwise invisible, because
// every stat on screen is a "right now" reading with no memory.
//
// Deliberately NUMBERS ONLY — no functions, no Dates, no references into
// `tech`/`rivals` — so the whole history survives a JSON round trip
// untouched when save/load lands, and so its size stays predictable: one
// small flat record per in-game year (a 50-year run is 50 of these).
// Anything derivable from these fields (catalogue percentage, year-over-
// year deltas) is derived at read time by the views, never stored here.
export interface YearSnapshot {
  year: number;           // the year that just CLOSED; the snapshot is the state the school carries into year + 1
  prestige: number;       // self.reputation after that year's drift
  rank: number;           // 1-indexed national rank at that moment, recorded whether or not the player has unlocked the rankings reveal yet
  enrolled: number;       // the class the admissions funnel just committed
  cash: number;
  coursesDone: number;    // 'done' course Buildables — the catalogue's progress
  programsEstablished: number; // program-established milestones awarded so far
  satisfaction: number;   // 0..100
  // THE YEAR'S OWN FIGURES (Plan 16's PR B), as distinct from the stocks
  // above, which are readings of the moment: what the year did, so the
  // review beat and the History table can carry it without re-deriving it
  // from a log that is capped.
  net: number;                 // cash now less cash a year ago — the year's net, campaigns and grants included
  applicants: number;          // the pool this summer's funnel drew
  admitRate: number;           // the share of it the school chose to take (0..1)
  incomingQuality: number;     // the average quality of the class that enrolled (0..100)
  satisfactionAverage: number; // the year's average satisfaction — what word of mouth and welfare read
  coursesFinished: number;     // courses that finished developing during the year
  attrition: number;           // students who did not return at this summer
  graduated: number;           // the seniors who left at this summer (Plan 17's PR C) — summed over a run, the students the school taught
}

// ---------------------------------------------------------------------
// WHERE EVERY PROGRAM LIVES. A hall Buildable's id -> its program slots,
// positional: slot 3 is slot 3 forever, so the hall panel can draw a 2x3
// grid whose tiles never shuffle under the player.
//
// A PROGRAM ID is the major's course-code prefix ('FINA', 'MECH' — the
// same prefix milestoneSchools() keys a major by) or a graduate program's
// id ('MED', 'PHDE'). Nothing here is a
// Buildable id: a program is the nine (or however many) courses that share
// a prefix, and it is housed as a unit.
//
// A hall's entry is written the week the hall FINISHES (techSystem.ts),
// with every slot empty — a hall under construction has no room to put
// anything in yet — and Founders Hall's is seeded at founding with the
// three founding programs in its first three slots (actions.ts, Plan 19).
// From then on the entry is the
// whole answer to "what is in this building": founding a program fills a
// slot, relocating one moves it, and a school is founded by a READING over
// this record (six slots, one school) rather than by any flag written
// beside it. See docs/design/curriculum.md.
//
// PROGRAMS ARRIVE THREE AT A TIME. After the gen-ed core the player is
// never shown forty-two doors: `programOffers` holds the three programs
// that can be founded right now, drawn from what remains, and founding
// one draws a replacement (systems/techtree/programOffers.ts). The offer
// is GLOBAL — the same three at any free slot on campus — and there is no
// reroll and no decline: the three stand until one is taken. Empty until
// the core is complete, and shorter than three only when fewer programs
// remain to offer.
//
// A SEPARATE RECORD, keyed by id, for the same reason `placements` and
// `courseFaculty` are: something true of one KIND of Buildable that must
// not fork the single Buildable model. Unlike those two, this one IS read
// by systems — the tier-2 gate asks whether a course's program is housed,
// dedication asks what a hall holds — so it is not visual-only, and the
// loader's sanitizeHalls treats a bad entry as a lie to correct rather
// than a glitch to drop. Plain data: an array of one-field objects, no
// references into `tech`, so it survives a JSON round trip untouched.
export interface HallSlot {
  programId: string | null;
  // Set while the program is IN TRANSIT to this slot (Plan 14's PR F): the
  // weeks left before it is teaching again. Relocation is free in money
  // and expensive in time — a program in transit contributes no teaching
  // quality, its courses cannot be started or advanced, and it does not
  // count toward its hall's dedication until it arrives. Ticked down by
  // techSystem.ts and deleted at zero; absent means settled.
  transitWeeks?: number;
}

// ---------------------------------------------------------------------
// WHO TEACHES WHAT. Course id -> the id of the Faculty member the player
// chose to teach it, written when development starts and editable
// afterwards (REASSIGN_COURSE_FACULTY).
//
// A SEPARATE RECORD, keyed by id, rather than a field on Buildable — for
// exactly the reason `placements` is a separate record and not a field on
// Buildable (see docs/architecture/buildables.md). A building's location
// and a course's instructor are the same SHAPE of fact: something true of
// one KIND of Buildable, which must not fork the single Buildable model
// that serves all four kinds. Courses are never placed and so never carry
// a `placements` entry; buildings never have instructors and so never
// carry one here. Same reasoning, same shape, in both directions.
//
// WHY THIS IS REAL STATE AND NOT A PROJECTION. It used to be neither: the
// engine tracked only per-field slot CAPACITY, and who taught what was a
// deterministic round-robin computed on read (see
// systems/faculty/facultyAssignment.ts, which now reads this record
// instead). That was fine while the answer was only ever a caption. It
// cannot carry a course QUALITY GRADE, which is what lands next: hire one
// more person into a field and the round-robin silently re-pairs every
// course in it, so a grade computed off it would change whenever the
// roster did, for reasons the player never chose and cannot see. Letting
// the player pick is what makes the pairing stable enough to grade.
//
// An id here may go STALE in exactly one way: the person is dismissed
// (FIRE_FACULTY clears their entries) or is otherwise no longer on the
// roster. A course that is offered but has no live entry is UNSTAFFED —
// see techSystem.ts's isUnstaffed. That is a real, visible state the
// player has to fix, not an error: it is the "department left
// understaffed, its courses on hold" chain the
// docs/design/faculty.mdfaculty section describes. Unstaffed courses
// hold no slot, so dismissing someone frees their field capacity at the
// same moment it orphans their courses.
//
// A plain id -> id record, the same shape rationale as `milestones` and
// `pathways`: no Map, no reference into `faculty` or `tech`, so it
// survives a JSON round trip untouched.
export type CourseFaculty = Record<string, string>;

export interface GameState {
  clock: GameClock;
  finance: Finance;
  students: StudentBody;
  faculty: Faculty[];
  tech: Buildable[];
  developing: Record<string, number>; // course id -> weeks remaining
  courseFaculty: CourseFaculty;       // course id -> the faculty member teaching it; the player's choice, made when development starts (see the CourseFaculty block above)
  halls: Record<string, HallSlot[]>;  // hall Buildable id -> its program slots, positional (see the HallSlot block above)
  programOffers: string[];            // the programs on offer right now — three, or fewer only when fewer remain (see the HallSlot block above and systems/techtree/programOffers.ts)
  searches: Record<string, number>;   // faculty field -> weeks left on a posted search for a candidate in it (see systems/faculty/facultySearch.ts)
  placements: Placements;            // Buildable id -> the campus tiles it covers; visual only (see the campus map block above)
  pathways: Pathways;                 // drawn walkway tiles; visual only, read by no system (see the Pathways block above)
  trees: Trees;                       // the founding woodland, tile -> render seed; felled by building, hidden by paving (see the Trees block above)
  rivals: Rival[];
  self: University;
  history: YearSnapshot[];       // one entry per completed in-game year, oldest first — the game's only time series (see YearSnapshot above)
  log: LogEntry[];               // recent events, newest first
  pendingInterrupt: PendingInterrupt | null; // set => clock halts until resolved
  events: EventState;            // cadence bookkeeping for milestone celebrations and authored decision events (see EventState above)
  orgs: StudentOrgState;         // the student organisations the campus has grown: clubs, Greek chapters, and the petitions waiting on the next summer digest (see StudentOrgState above)
  research: ResearchState;       // the research stock, what it has produced, and the prize queue (see ResearchState above)
  candidates: Faculty[];         // the standing academic job market: a long, always-churning list of people available to appoint right now. facultySystem.ts's tickCandidatePool ages every listing, withdraws the ones that have been up too long, and tops the pool back up to CANDIDATE_POOL_TARGET each week — there is no posting, no fee, and no wait (see facultyData.ts's churn block)
  started: boolean;              // false only during the pre-game startup screen (name + school type)
  hasEnteredRankings: boolean;   // true once the one-time "you've entered the top 50" reveal has fired
  milestones: Record<string, boolean>; // milestone key -> awarded, so each curriculum milestone bonus fires once
  // AMBITIONS (Plan 17's PR A): ambition id -> the year it was reached.
  // A record of named achievements — the first hall, a school founded,
  // first in the nation, a prize, fifty years — written once each and
  // never revoked, the same durable shape as `milestones` with a year in
  // place of the boolean. Detected weekly by systems/ambitions/
  // ambitionsSystem.ts off readings that already exist; authored in
  // data/ambitionsData.ts. Ambitions GATE NOTHING and grant nothing: they
  // are the objectives, and the legacy (PR B) is the consequence. Plain
  // id -> number, so it survives a JSON round trip untouched.
  ambitions: Record<string, number>;
  seen: SeenState;               // what the player has already been shown, for the curriculum/build/faculty alert badges (see SeenState above)
}

// ---------------------------------------------------------------------
// ALERT BADGES: a small red "new content" marker on a toolbar icon (and,
// for the build menu, on the specific category tab holding the new item),
// cleared the moment the player actually looks at the thing it's pointing
// at. Three independent slices, one per menu that can raise one:
//   - courseIds: every course id the Curriculum tab has ever rendered on
//     screen for this player (see tabs/CurriculumTab.tsx's
//     visibleCourseIds) — a course counts as "seen" the instant it's
//     revealed while the tab is open, whatever its own status is, since
//     revealing it (not finishing it) is the moment there was something
//     new to notice.
//   - buildableIds: every placeable Buildable id (building/dorm/facility)
//     the build popup has rendered as a tile while its OWN category tab
//     was the active one (see components/BuildPopup.tsx) — so a building
//     that appears in a tab the player hasn't switched to yet stays
//     unseen, and the build button's badge stays lit, even while the
//     popup itself is open on a different tab.
//   - tabIds: every gated tab (see components/TabNav.tsx's TAB_GATES) whose
//     gate has been noticed OPEN. Unlike the other three this is not a
//     badge: it is what keeps the one-off "the Research view is now
//     available" log line one-off — including across a save that resumes
//     with the gate already open, and across a gate that closes and reopens
//     (a school that disbands its last varsity team and founds another does
//     not get told twice).
//   - candidateIds: DEAD STATE. It fed the Faculty tab's alert badge —
//     an unseen candidate in a field the school was short on — and that
//     badge is retired: it was a prompt to run the old hiring loop, and
//     hiring now happens where the shortage is felt (see FacultyTab.tsx and
//     Toolbar.tsx's TAB_ALERT). Nothing writes it and nothing reads it. Left
//     in the saved shape exactly as Faculty.morale and ResearchState.points
//     were, rather than spending a migration to remove a record that costs
//     nothing; the weekly prune that used to bound its growth went with the
//     writes, since an empty record does not grow.
//
// Each is a plain id -> true record, the same shape rationale as
// `pathways` and `milestones`: no Map/Set, no reference into `tech`, so it
// survives a JSON round trip untouched. Ids only ever get ADDED here (by
// the MARK_SEEN action — see actions.ts) except for candidateIds, which
// the weekly tick prunes down to whoever is still actually listed (see
// reducer.ts's TICK case) — the candidate market churns constantly, so
// without pruning this would grow without bound over a long run, unlike
// the other two, which are bounded by the size of the (fixed) course/
// building catalogue.
export interface SeenState {
  courseIds: Record<string, true>;
  buildableIds: Record<string, true>;
  candidateIds: Record<string, true>;
  tabIds: Record<string, true>;
}

// WHAT KIND OF THING A LOG LINE REPORTS (Plan 16's PR B). Optional, and
// set only on the lines two readers group by: the year in review
// (state/yearInReview.ts), which sorts the closing year's log into the
// sections of the summer's first beat, and the toasts (Plan 16's PR G),
// which surface the handful of kinds that never stop the clock. A line
// with no topic is texture — it is in the ticker and the log, and nothing
// else reads it. Tagging at the WRITE rather than parsing the message is
// what keeps both readers honest when a sentence is reworded.
export type LogTopic =
  | 'course'              // a course finished developing
  | 'building'            // a hall, dorm or facility finished
  | 'program'             // a program founded in a hall
  | 'milestone'           // a milestone awarded (established, distinguished, a school founded)
  | 'ambition'            // an ambition reached (Plan 17's PR A) — a record, never a stop
  | 'appointment'         // somebody joined the faculty
  | 'departure'           // somebody left it
  | 'prize'               // a research prize
  | 'research-started'    // an initiative commissioned
  | 'research-concluded'  // an initiative ended with nothing worth a modal (papers, or nothing)
  | 'research-reported'   // an initiative ended and a report is queued
  | 'publication'
  | 'breakthrough'
  | 'grant'
  | 'demand-raised' | 'demand-met' | 'demand-failed'
  | 'petition'            // a club or chapter petitioned for recognition
  | 'organisations'       // the summer digest's answer
  | 'candidate'           // somebody worth noticing listed on the market
  | 'team'                // a varsity team's venue finished
  | 'admissions' | 'attrition' | 'report-card' | 'money';

export interface LogEntry {
  year: number;
  week: number;
  message: string;
  kind: 'info' | 'good' | 'bad';
  topic?: LogTopic;
  // The id of the thing the line is about — a Buildable, a program, a
  // faculty member — when there is one. What lets a reader group "Developed:
  // Data Structures." under its school without parsing the sentence, and a
  // toast open the right place.
  subject?: string;
}

// How many log entries are kept. Weekly attrition spam is gone, so what
// remains is milestones, completions, admissions cycles and postings — a
// deep enough cap that a completed major or a finished school building is
// still readable in the ticker weeks later instead of being pushed out by
// the next few routine lines. Lives here rather than in the reducer because
// the year in review reads it too: a year whose lines have started falling
// off the end has to say so.
export const LOG_CAP = 200;

export const WEEKS_PER_YEAR = 52; // the one place the game's year length lives — every system (clock, annual interrupts, finance annualization) reads from this

// THE RUN'S LENGTH (Plan 17). A university's arc is a human lifetime — a
// founder's career, the first class back for its fiftieth reunion — and
// the fiftieth summer files the final report and seals the record (see
// state/legacy.ts). The clock does not stop: the game goes on as a
// sandbox for anyone who wants it to, and nothing after this year changes
// the legacy. Every reader of "how long is a run" — the History tab's
// countdown, the two year-fifty ambitions, the semicentennial beat, the
// sim's horizon — reads this one constant.
export const SEMICENTENNIAL_YEAR = 50;
