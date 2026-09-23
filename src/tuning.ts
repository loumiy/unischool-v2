// Tuning constants, in one file. Phase 31 balanced them against three
// archetype colleges (`npm run balance`, DD §17 "The balance at 1.0"); a
// change here should be read against that dashboard before it ships.

// How long one sim week lasts in real time at 1× speed.
//
// DD §2.2 budgets fifty years in 3–5 real hours, front-loaded: about five
// minutes a year while the player is hands-on. At 36 weeks a year, five
// seconds a week gives 3 min/year at 1× and ~23 s/year at 8×; with the
// beats and the questions on top, Phase 31 measured the steward's evening
// inside every span of the budget.
export const WEEK_DURATION_MS_AT_1X = 5000;

// ---------- Treasury (DD §5, Phase 5) ----------
// Dollars, per year unless the name says otherwise. First guesses at the
// scale the DD's own examples imply (a $250k parking study, a $12M
// renovation, a $500M endowment as a late ambition).

// The founding gift (DD §2.4): what is in the bank, and what is invested.
export const STARTING_CASH = 30_000_000;
export const STARTING_ENDOWMENT = 50_000_000;

// The endowment draw (DD §5.1): a set percentage of the endowment, default
// 4.5%, adjustable 3–6% at Budget & Hiring. Above the prudent line the
// draw is an overdraw: quietly corrosive once the board (Ph.8) and the
// donors (Ph.21) are watching.
export const ENDOWMENT_DRAW_DEFAULT = 0.045;
export const ENDOWMENT_DRAW_MIN = 0.03;
export const ENDOWMENT_DRAW_MAX = 0.06;
export const ENDOWMENT_DRAW_PRUDENT = 0.05;
export const ENDOWMENT_DRAW_STEP = 0.0025;

// The markets: each fiscal year's return on the endowment is drawn around
// this mean, uniformly within ± the spread.
export const ENDOWMENT_MEAN_RETURN = 0.06;
export const ENDOWMENT_RETURN_SPREAD = 0.1;

// The founding administration: the president's office, the registrar,
// the bursar. The administrative ratchet (DD §5.4, Ph.20) only adds to it.
export const FOUNDING_ADMIN_PAYROLL = 1_400_000;
// The registry, admissions and student services, per student enrolled
// (Phase 31): an administration that did not grow with the roll left a
// large college's share of payroll far under DD §17's band.
export const ADMIN_PER_STUDENT = 1_500;
// Student life, per student enrolled (Phase 31): the library's hours, the
// counsellors, the IT desk, the heating. Without it a full college cleared
// a third of its revenue every year and money stopped mattering by Year
// 10; with it the margin is the thin one colleges actually run on.
export const STUDENT_LIFE_PER_STUDENT = 7_500;
// Idle money (Phase 36): at the turn of each year the board sweeps
// operating cash beyond this many years of the new year's expenses into
// the endowment, as a quasi-endowment, unless the college has asked it not
// to.
export const RESERVES_SWEEP_YEARS = 0.75;

// Tuition dependence above this share of revenue is flagged as fragility
// (DD §5.1).
export const TUITION_DEPENDENCE_FLAG = 0.75;

// ---------- Buildings as economic objects (DD §6.4, Phase 6) ----------

// Upkeep grows with age: a fifty-year-old hall costs twice what it did new.
export const UPKEEP_AGE_RATE = 0.02;
// Deferred maintenance compounds: work left undone costs more each year.
export const BACKLOG_GROWTH_RATE = 0.06;
// A backlog worth this share of the building's cost is condition zero.
export const BACKLOG_RUIN_SHARE = 0.5;
// The share of required maintenance the budget funds, set at Budget &
// Hiring. Below 1 the difference becomes Backlog.
export const MAINTENANCE_FUNDING_DEFAULT = 1;
export const MAINTENANCE_FUNDING_STEP = 0.05;
// Where a building starts to look it: the weathering thresholds on
// condition (0–1), also what failure events (Ph.17) will read.
export const WORN_CONDITION = 0.9;
export const WEATHERED_CONDITION = 0.6;
export const DERELICT_CONDITION = 0.3;

// Renovation pays the backlog plus a contractor's fee on the build cost,
// and takes the building out of use for a stretch.
export const RENOVATION_FEE_SHARE = 0.05;
export const RENOVATION_WEEKS = 8;
// Taking a building down costs a share of what it cost to put up.
export const DEMOLITION_COST_SHARE = 0.05;

// Debt (DD §5.2): construction can be borrowed for; the board caps leverage
// at a share of the endowment. Interest accrues weekly; principal amortises
// over the term.
export const DEBT_CAP_SHARE_OF_ENDOWMENT = 0.4;
export const DEBT_INTEREST_RATE = 0.05;
export const DEBT_AMORTISATION_YEARS = 20;

// ---------- Enrollment (DD §8.2–§8.3, Phase 7) ----------

// The sticker (DD §5.1): what Admissions Day sets. The market's own sticker
// is the price the pool compares against.
export const TUITION_DEFAULT = 40_000;
export const TUITION_MIN = 15_000;
export const TUITION_MAX = 90_000;
export const TUITION_STEP = 1_000;
export const MARKET_TUITION = 40_000;
// Selectivity 0–1: the share of the pool turned away. Admit rate is
// clamped so no school admits nobody or everybody.
export const SELECTIVITY_DEFAULT = 0.5;
export const SELECTIVITY_STEP = 0.05;
export const ADMIT_RATE_MIN = 0.1;
export const ADMIT_RATE_MAX = 0.95;

// The applicant pool: a base, scaled by prestige (a stub until Phase 24),
// by campus beauty (beauty.ts), and by price position against the market.
export const BASE_APPLICANTS = 1_600;
export const PRESTIGE_STUB = 50; // 0–100
// Prestige (DD §11.1, Phase 22): every standing starts here, and moves this
// share of the way to the year's reading each year.
export const PRESTIGE_START = 25;
export const PRESTIGE_TRAIL = 0.25;
// A research reading reaches its full weight at this many faculty.
export const RESEARCH_FULL_ROSTER = 40;
// The league (DD §11.3, Phase 22): a school's axes drift with a momentum
// that decays toward nothing, noise on top, and a pull back toward the
// school's home level.
export const LEAGUE_MOMENTUM_KEEP = 0.6;
export const LEAGUE_NOISE = 1.6;
export const LEAGUE_HOME_PULL = 0.08;
// The guide changes its methodology this often, on average, after the
// first few tables.
export const METHODOLOGY_CHANGE_CHANCE = 0.1;
export const METHODOLOGY_FIRST_YEAR = 6;
// Athletics-lite (DD §8.5, Phase 23): a season is this many games, this
// many won is a title; the budget's edge on a team's strength per unit of
// factor; each varsity team reaches this many students.
export const GAMES_PER_SEASON = 10;
export const TITLE_WINS = 8;
export const VARSITY_BUDGET_EDGE = 20;
export const VARSITY_LIFE = 150;
// The rival (DD §11.3): neighbours start with this much rivalry and gain
// this much a year; every season adds one to each; a school past the line
// is the rival, from this year on at the earliest; a mid-term taunt this
// often.
export const RIVAL_NEAR_START = 3;
export const RIVAL_NEAR_YEARLY = 1;
export const RIVAL_THRESHOLD = 10;
export const RIVAL_FIRST_YEAR = 5;
export const TAUNT_CHANCE = 0.6;
// Identity (DD §11.2, Phase 24): a tag is earned after this many years
// over the upper line, shed after as many under the lower; a college is
// at most so many things.
export const TAG_EARN_AT = 0.6;
export const TAG_SHED_AT = 0.4;
export const TAG_YEARS = 2;
export const TAG_LIMIT = 3;
// Prestige's swing on the applicant pool (DD §8.2, Phase 24): neutral at
// a founding college's prestige, this share more for every hundred
// points above it.
export const PRESTIGE_POOL_SWING = 0.8;
// Poaching and shedding (DD §7.3, §11.3): a rising school's offer to a
// star; a falling school's faculty on the summer market.
export const POACH_CHANCE = 0.5;
export const POACH_STAR_SKILL = 72;
export const POACH_COUNTER_SHARE = 0.25;
export const SHED_CANDIDATES = 2;
// An event favouring a tag the college holds is this much likelier.
export const EVENT_TAG_WEIGHT = 2.5;
// The full-canvas late game (DD §6.5–§6.6, Phase 25). Another storey
// costs this share of the building's price, closes it this many weeks,
// and a building takes at most this many. At this age a building may be
// declared Historic each year, at these odds; taking a Historic building
// down costs this much goodwill. The Build menu turns to the estate below
// this share of free ground.
export const EXTEND_COST_SHARE = 0.45;
export const EXTEND_WEEKS = 16;
export const EXTEND_MAX_STOREYS = 2;
export const HISTORIC_AGE = 25;
export const HISTORIC_CHANCE = 0.06;
export const HISTORIC_FOUNDERS_CHANCE = 0.3;
export const HISTORIC_QUAD_CHANCE = 0.1;
export const HISTORIC_MEMORY_CHANCE = 0.08;
export const HISTORIC_WARMTH = 4;
export const HISTORIC_CONFIDENCE = 3;
export const HISTORIC_MOOD = 3;
export const LAND_SCARCE_SHARE = 0.55;
// The chronicle (DD §12.1, Phase 26): an era is at least this many years,
// and a run holds at most this many.
export const ERA_MIN_YEARS = 4;
export const ERA_MAX = 9;
// A stretch longer than this is split where something happened in it.
export const ERA_MAX_YEARS = 12;
// The run formally ends at the turn of this year (DD §2.3).
export const ENDING_YEAR = 50;
export const PRICE_ELASTICITY = 1.2;
// Applicant quality (0–100) is normal about a mean set by prestige; a
// selective school skims the top of it.
export const APPLICANT_QUALITY_MEAN = 55;
export const APPLICANT_QUALITY_SD = 14;
// Yield: the share of the admitted who come, falling with price.
export const YIELD_BASE = 0.35;
export const YIELD_PRICE_ELASTICITY = 0.8;

// Financial aid (DD §5.2): the gap between sticker and net, as a share of
// the sticker. A constant until it becomes the access lever (Ph.8+).
export const AID_DISCOUNT_RATE = 0.3;
// Auxiliaries (DD §5.1): the margin on housing and dining per housed student.
export const ROOM_AND_BOARD_MARGIN = 1_800;

// Capacity (DD §8.2): enrollment may exceed the beds by this share, in
// triples, before the file closes early; beyond the beds is a satisfaction
// hit and a class-memory stamp.
export const TRIPLES_OVERFLOW_SHARE = 0.25;

// Satisfaction (0–100, DD §8.3): a base, less the crowding penalties, plus
// or minus the state of the campus.
export const SATISFACTION_BASE = 62;
export const TRIPLES_PENALTY = 18;
export const DINING_PENALTY = 10;
export const SEATS_PENALTY = 12;
export const CONDITION_WEIGHT = 20;
// Student life (Phase 21I): satisfaction points when the campus's student
// centre, health centre, recreation centre and fields reach every student.
export const STUDENT_LIFE_POINTS = 6;
// The buildings a college shows itself off from (Phase 21J): their summed
// draw on the applicant pool is capped at this share, and the alumni
// house's share of giving at the next.
export const BUILDING_DRAW_CAP = 0.15;
export const BUILDING_GIVING_CAP = 0.15;
// Attrition per year: a base, plus a share for every point of
// satisfaction under the line.
export const ATTRITION_BASE = 0.04;
export const ATTRITION_LINE = 60;
export const ATTRITION_PER_POINT = 0.004;
export const ATTRITION_MAX = 0.35;

// ---------- The distress ladder (DD §5.5, Phase 8) ----------

// Board confidence, 0–100, and what moves it each term.
export const BOARD_CONFIDENCE_START = 70;
export const CONFIDENCE_SURPLUS_GAIN = 2;
export const CONFIDENCE_DEFICIT_LOSS = 4;
export const CONFIDENCE_FREEZE_LOSS = 3;
export const CONFIDENCE_AUSTERITY_LOSS = 5;
export const CONFIDENCE_OVERDRAW_LOSS = 1;
export const CONFIDENCE_TRIPLES_LOSS = 1;

// The rungs' clocks, in terms (three a year).
export const DEFICIT_TERMS = 3; // consecutive deficit terms that make Deficit
export const SURPLUS_TERMS_TO_EXIT = 2; // consecutive surplus terms that climb back
export const AUSTERITY_AFTER_TERMS = 3; // terms frozen before the board imposes austerity
export const RECEIVERSHIP_AFTER_TERMS = 3; // terms of austerity before the interim CFO
export const RECEIVERSHIP_TERMS = 9; // three years
export const TERM_HISTORY = 12; // terms of the ledger the screen shows

// The interim CFO's policy: what the budget sliders lock to.
export const BOARD_POLICY_DRAW = 0.05;
export const BOARD_POLICY_MAINTENANCE = 0.5;

// Cutting aid takes this much off the discount at a time, to this floor.
export const AID_CUT_STEP = 0.15;
export const AID_MIN = 0;
// Restructuring the administration under austerity abolishes the newest
// seat; the term of chaos after it costs this much student mood.
export const RESTRUCTURE_MOOD = 3;
// How many years of a standing cost ("a year, forever") a decision is
// weighed as, by the seats and by the escalation threshold (Phase 21H).
export const STANDING_COST_YEARS = 5;

// ---------- Academics (DD §7.2, Phase 9) ----------

// Founding a school: a hall, this much, and a dean seat (Ph.20).
export const SCHOOL_FOUNDING_COST = 2_000_000;
// Opening a program in a founded school, and what it costs to run each
// year at the Founded tier; the tiers' cost factors scale it.
export const PROGRAM_OPENING_COST = 500_000;
export const PROGRAM_ANNUAL_COST = 250_000;

// ---------- Faculty (DD §7.3–§7.4, Phase 10) ----------
// Competence and cost. Skills are 0–100; salaries are dollars a year.

// The summer market: how many candidates are listed at Budget & Hiring,
// and the share of them working in fields the college has founded.
export const MARKET_SIZE = 8;
// ...and one more for every so many on the roster (Phase 39).
export const MARKET_PER_HIRE = 0.06;
export const MARKET_FOUNDED_SHARE = 0.75;

// The asking salary by rank, moved by skill: a hire at skill 100 asks
// SALARY_SKILL_PREMIUM/2 more than the rank's base, at skill 0 that much
// less; rounded to the thousand.
export const SALARY_BY_RANK = { assistant: 80_000, associate: 110_000, full: 150_000 } as const;
export const SALARY_SKILL_PREMIUM = 0.6;
export const SALARY_ROUNDING = 1_000;

// Where the market's skills come from: a normal around the mean, clamped,
// lifted by rank; and how ranks are dealt.
export const SKILL_MEAN = 55;
export const SKILL_SD = 14;
export const SKILL_MIN = 20;
export const SKILL_MAX = 95;
export const RANK_SKILL_BONUS = { assistant: 0, associate: 8, full: 15 } as const;
export const RANK_ODDS = { assistant: 0.5, associate: 0.3, full: 0.2 } as const;

// Teaching seats one hire can carry at full quality: a program's staffing
// need is its tier's seats over this, and quality is damped below it.
// Thirty (Phase 31): a staffed college lands near ten students a head.
export const FACULTY_TEACHING_LOAD = 30;

// Dismissal pays this many weeks of salary as severance.
export const SEVERANCE_WEEKS = 12;

// Teaching quality (DD §7.4, §8.3) in satisfaction: the swing, in points,
// between no teaching at all and perfect teaching, neutral at the line.
export const TEACHING_WEIGHT = 20;
export const TEACHING_NEUTRAL = 50;
// Quirks that touch morale add up to this much either way, no more.
export const QUIRK_MORALE_CAP = 6;

// ---------- Advancement and signatures (DD §7.2, §7.4, Phase 11) ----------

// Advancing a tier: money, a qualified senior hire (the tier's lead rank,
// content/schools.json) assigned to the program, and time. The works
// complete only with the lead still in place.
export const ADVANCEMENT = {
  established: { cost: 1_500_000, years: 2 },
  renowned: { cost: 4_000_000, years: 3 },
} as const;
// Up to this many signature programs; theirs advance at this share of the cost.
export const SIGNATURE_LIMIT = 3;
export const SIGNATURE_ADVANCE_DISCOUNT = 0.5;
// A program above Founded is neglected in a year it has no lead of its
// tier's rank or under this share of its staff; after this many years
// running it drops a tier. A signature decaying costs the board this much
// confidence (the public embarrassment, until events fire).
export const NEGLECT_STAFFING_SHARE = 0.5;
export const DECAY_AFTER_YEARS = 2;
export const SIGNATURE_DECAY_CONFIDENCE = 5;

// ---------- Quality, satisfaction and outcomes (DD §7.4, §8.3, Phase 12) ----------

// Campus beauty in satisfaction: the swing across the scale, neutral at 50.
export const BEAUTY_WEIGHT = 8;
// Current conditions: what living through each rung of the ladder costs
// every cohort, in satisfaction points, Sound to Receivership.
export const RUNG_SATISFACTION_PENALTY = [0, 0, 1, 3, 6, 9] as const;
// Each Convocation a continuing cohort's quality closes this share of the
// gap to the campus's teaching quality.
export const QUALITY_DRIFT = 0.25;
// Attrition also rises with low quality: below the line, this much a point.
export const ATTRITION_QUALITY_LINE = 40;
export const ATTRITION_PER_QUALITY_POINT = 0.003;
// Graduation outcomes: a class's score is quality weighted against how it
// left; distinguished graduates rise with the score above the middle, the
// adrift with the score below it, over a base.
export const OUTCOME_QUALITY_WEIGHT = 0.7;
export const OUTCOME_DISTINGUISHED_MAX = 0.3;
export const OUTCOME_ADRIFT_MAX = 0.4;
export const OUTCOME_ADRIFT_BASE = 0.05;

// ---------- Campus beauty and ambient life (DD §6.2–§6.3, Phase 13) ----------

// Beauty, 0–100, is a weighted mean of its terms (beauty.ts): greenery is
// the trees standing against this share of the founding woodland; landmarks
// are the buildings' beauty marks (content/buildings.json) against this
// many; upkeep is the open buildings' mean condition; enclosure is the
// quads the buildings make (quads.ts). Coherent motifs take their share
// when motifs become per-building.
export const GREENERY_TARGET_SHARE = 0.6;
export const LANDMARK_TARGET = 6;
export const BEAUTY_WEIGHTS = {
  greenery: 0.3,
  landmarks: 0.25,
  upkeep: 0.25,
  enclosure: 0.2,
} as const;
// Beauty's swing on the applicant pool, either way, under the ~12% cap on
// placement-derived effects (DD §6.2).
export const BEAUTY_POOL_SWING = 0.12;

// Ambient life is presentational (DD §6.3): how many students walk the map
// at most, one walker per this many enrolled, and the crowd by term.
export const MAX_WALKERS = 60;
// The most snowflakes on screen at once in the heaviest snowfall (Phase
// 21E). Presentational, budgeted like the walkers: each is one element the
// compositor moves.
export const SNOWFLAKES = 110;
export const STUDENTS_PER_WALKER = 6;
export const AMBIENT_DENSITY = { fall: 1, spring: 1, summer: 0.15 } as const;

// ---------- Quads, pairings and the cap (DD §6.2, §17.2, Phase 14) ----------

// THE HARD CAP (DD §6.2, guardrail §17.2): no placement-derived effect may
// exceed this share of any output. Every such effect is aggregated once
// (placement.ts) and clamped here, so the player who ignores layout and
// builds for beauty stays fully viable.
export const PLACEMENT_CAP = 0.12;

// A quad is an enclosed open space: at least this many tiles, at most this
// many (beyond it, it is just the rest of the campus), and at least this
// much of its boundary against building walls.
export const QUAD_MIN_AREA = 6;
export const QUAD_MAX_AREA = 150;
export const QUAD_MIN_ENCLOSURE = 0.55;
// A quad's quality is its enclosure, lifted by how green it is; this many
// good quads make a full enclosure mark for beauty.
export const QUAD_GREEN_WEIGHT = 0.5;
export const QUAD_TARGET = 3;
// A doorway is a hole through something thin: a gap at most this wide in
// something at most this deep. The detector seals one before it floods, so
// a courtyard left open for a path to run through is still a courtyard,
// while a long alley or a narrow light well — narrow but not a hole in
// anything — is left as the open ground it is (Phase 21C).
export const QUAD_DOORWAY_WIDTH = 2;
export const QUAD_DOORWAY_DEPTH = 2;
// What a paved edge is worth against a building wall when the paving is
// what encloses the space. Less than a wall, and enough on its own to pass
// QUAD_MIN_ENCLOSURE, so a green laid out entirely in paths is a green.
export const QUAD_PATH_WEIGHT = 0.6;

// How far apart two buildings can stand and still count as paired: tiles
// between their nearest edges.
export const PAIRING_RADIUS = 8;

// ---------- Named students (DD §8.1, §17.4, Phase 15) ----------

// How many of each arriving class the game follows, and how much it says
// about them: a few beats at each term's turn rather than a year's worth
// in one week, and a handful in a lifetime, so the ticker stays a ticker
// (§17.3) and everyone the game named is heard from (§8.1's 3–5 beats).
export const NAMED_PER_CLASS_MIN = 3;
export const NAMED_PER_CLASS_MAX = 5;
export const ARC_BEATS_PER_YEAR = 4;
export const ARC_BEATS_PER_TERM = 3;
export const ARC_BEATS_PER_STUDENT = 4;
// A named student leaves at their class's attrition rate, times this: the
// ones the game follows are no likelier to go than anyone else, but a
// class bleeding students should visibly lose one of them.
export const STUDENT_LEAVES_ODDS = 2.5;

// ---------- Class memory and the alumni ledger (DD §8.4, Phase 16) ----------

// Warmth (0–100) is set at graduation: mostly how they felt, partly how
// they turned out, plus what their four years earned them in clauses.
export const WARMTH_FROM_SATISFACTION = 0.6;
export const WARMTH_FROM_OUTCOMES = 0.4;
// How many clauses a memory carries, most telling first.
export const MEMORY_CLAUSE_LIMIT = 3;
// The admissions office fills the beds and the triples allowance with
// them every year, so a little crowding is the normal state of the place
// and worth no clause. A CRUNCH is beds going out from under students
// already here — a hall demolished or shut for the works — and this many
// lost is enough for a class to remember it.
export const MEMORY_BEDS_LOST = 1;
// A class counts as thinned when it loses this share of itself, and as
// having watched the campus rise at this many buildings finished.
export const MEMORY_THINNED_SHARE = 0.18;
export const MEMORY_BUILDINGS = 2;
export const MEMORY_DEFICIT_YEARS = 2;
export const MEMORY_DISTINGUISHED_SHARE = 0.15;
export const MEMORY_ADRIFT_SHARE = 0.25;

// The annual fund (DD §5.1): what one alum gives in a year at neutral
// warmth, average means and full maturity. Warmth doubles it or kills it;
// means follow the class's quality; giving ramps over the years it takes
// a class to get established.
export const GIVING_PER_ALUM = 220;
export const GIVING_MATURITY_YEARS = 20;
export const GIVING_YOUNG_SHARE = 0.15;

// A reunion: what it costs a head, what it adds to warmth, and how far a
// class can be warmed in total — the four years they had are not up for
// revision (DD §8.4).
export const REUNION_COST_PER_HEAD = 90;
export const REUNION_WARMTH = 4;
export const REUNION_WARMTH_CAP = 12;

// ---------- The event engine (DD §10.1, §17.3, Phase 17) ----------

// How often the world punches. The DD budgets about one event every two
// to four weeks at mid-game, the President's share declining with
// delegation; the engine rolls each week against this, more often when the
// college is in trouble and never while something is already waiting.
// Phase 31 measured one every three to four weeks all told.
export const EVENT_WEEKLY_ODDS = 1 / 3;
// Prices that grow with the college (Phase 36, DD §10.1): an event's sums
// are written for a college of this budget, and multiplied by how much
// bigger this one is, up to the ceiling; sums below the floor price a
// thing, not a size, and stay as written.
export const EVENT_PRICE_REFERENCE_BUDGET = 15_000_000;
export const EVENT_PRICE_SCALE_MAX = 12;
export const EVENT_PRICE_FIXED_BELOW = 25_000;
export const EVENT_DISTRESS_ODDS = 0.02; // added per rung on the ladder
export const EVENT_QUIET_WEEKS = 1; // after one resolves, before another can fire

// Consequence-weighted sourcing (DD §10.1): an event whose preconditions
// the player caused is preferred over one that could fire anywhere. Every
// condition an event names multiplies its weight by this.
export const EVENT_CONSEQUENCE_WEIGHT = 1.8;

// A seismic event is rare and holds the clock; the engine will not deal
// one until the run has some history to shake.
export const SEISMIC_MIN_YEAR = 6;
export const SEISMIC_ODDS_SHARE = 0.08; // of events fired, roughly

// Mood: what the last few events left the students feeling, in
// satisfaction points. It fades toward nothing over a couple of years.
export const MOOD_CAP = 10;
export const MOOD_DECAY_PER_YEAR = 0.5;

// ---------- Phase 19: ambitions (DD §10.2) ----------

// Three promises at once is as many as the college will make.
export const AMBITION_CAP = 3;
// The chance a Convocation puts something on the table, when there is room.
export const AMBITION_DEAL_ODDS = 0.45;

// ---------- Phase 20: delegation (DD §9) ----------

// Who can be promoted into a seat: senior faculty only (DD §9.1).
export const SEAT_SENIOR_RANKS: readonly string[] = ['associate', 'full'];
// 8× needs the Provost and this many Deans (DD §3.2).
export const DEANS_FOR_FASTEST = 4;
// Above this, an event reaches the President however well-staffed the
// college is (DD §9.2). Roughly a building's worth of consequence.
export const ESCALATION_MONEY = 500_000;

// ---------- Phase 21: advancement (DD §9.3) ----------

// How much harder a campaign asks than the standing annual fund.
export const CAMPAIGN_PULL = 3.2;
// Extra pull per memory clause the case for support is actually about.
export const CAMPAIGN_RESONANCE_PULL = 0.9;
// What a week of asking costs a class that is being asked personally.
export const CAMPAIGN_ASK_COOLING = 0.004;

// REPUTATION (DD §8.2, Phase 37): the talk at the school gate. Once a year,
// at Commencement, it moves REPUTATION_TRAIL of the way to a reading of
// what the students are getting — the teaching, how they feel, how the
// last few classes turned out, the state of the buildings — weighted as
// below. It is neutral at REPUTATION_NEUTRAL, and each point either side
// moves the applicant pool by REPUTATION_POOL_SWING percent and the yield
// by REPUTATION_YIELD_SWING percent, never below the floor.
export const REPUTATION_START = 50;
export const REPUTATION_NEUTRAL = 50;
export const REPUTATION_TRAIL = 0.4;
export const REPUTATION_OUTCOME_CLASSES = 4;
export const REPUTATION_WEIGHTS = {
  teaching: 0.45,
  satisfaction: 0.25,
  outcomes: 0.15,
  condition: 0.15,
} as const;
export const REPUTATION_POOL_SWING = 2.5;
export const REPUTATION_YIELD_SWING = 0.5;
export const REPUTATION_POOL_FLOOR = 0.5;

// NO CEILINGS YOU CAN SIT ON (Phase 38). Satisfaction: students judge the
// college against its promise — up to EXPECTATION_PRESTIGE_POINTS off at
// full prestige, and EXPECTATION_PRICE_POINTS off for a net price twice the
// market's (half as much back for a bargain) — and above
// SATISFACTION_SOFT_FROM each point of the sum counts for
// SATISFACTION_TOP_RETURN of a point.
export const EXPECTATION_PRESTIGE_POINTS = 10;
export const EXPECTATION_PRICE_POINTS = 6;
export const SATISFACTION_SOFT_FROM = 80;
export const SATISFACTION_TOP_RETURN = 0.4;
// Athletics: the schedule climbs with the college. Every point of its
// athletics standing above ATHLETICS_CLIMB_FROM adds ATHLETICS_CLIMB to
// every opponent, and a bigger budget buys a harder schedule
// (ATHLETICS_BUDGET_SCHEDULE of the budget's own edge). The rival raises
// its game: it closes RIVAL_MATCH of any gap to the college.
export const ATHLETICS_CLIMB_FROM = 30;
export const ATHLETICS_CLIMB = 0.42;
export const ATHLETICS_BUDGET_SCHEDULE = 0.6;
export const RIVAL_MATCH = 0.6;

// STAFFING WITHOUT A TRAP (Phase 39, DD §7.3). An adjunct can be hired to
// any open programme at any time of year: a one-year contract at
// ADJUNCT_SALARY_PREMIUM times an assistant's asking salary, whose
// teaching is capped at ADJUNCT_TEACHING_CAP and research at
// ADJUNCT_RESEARCH_CAP. Faculty leave for reasons: a career runs
// FACULTY_CAREER_YEARS from the rank they were hired at (give or take
// FACULTY_CAREER_SPREAD), and in a bad year — the ladder at Austerity or
// worse, or their school's hall falling down — FACULTY_LEAVE_CHANCE of them
// take another post.
export const ADJUNCT_SALARY_PREMIUM = 1.5;
export const ADJUNCT_TEACHING_CAP = 45;
export const ADJUNCT_RESEARCH_CAP = 15;
export const ADJUNCT_CONTRACT_YEARS = 1;
export const FACULTY_CAREER_YEARS = { assistant: 34, associate: 26, full: 18 } as const;
export const FACULTY_CAREER_SPREAD = 6;
export const FACULTY_LEAVE_CHANCE = 0.1;
export const FACULTY_LEAVE_HALL_BELOW = 0.3;

// CAPITAL PROJECTS (Phase 42). A project may be paid for out of the
// endowment, up to this share of the fund at once.
export const ENDOWMENT_PROJECT_SHARE = 0.5;
// Decade ambitions (Phase 42): every DECADE_YEARS, at the Board Meeting,
// a list of DECADE_LIST from which the college may take DECADE_PICKS.
export const DECADE_YEARS = 10;
export const DECADE_LIST = 3;
export const DECADE_PICKS = 2;

// FOUNDING CHARTERS (Phase 43). The charter's school is founded at this
// share of the cost, its capital project and its grand landmark at theirs,
// and its lean on the standings and the pool fades to nothing by this year.
export const CHARTER_SCHOOL_SHARE = 0.5;
export const CHARTER_PROJECT_SHARE = 0.75;
export const CHARTER_LANDMARK_SHARE = 0.5;
export const CHARTER_FADE_YEARS = 25;
// ...to this floor for the lean on the standings and the tag, never to
// nothing; and the charter's own tag's indicator is nudged by this much.
export const CHARTER_LEAN_FLOOR = 0.35;
export const CHARTER_TAG_NUDGE = 0.7;
