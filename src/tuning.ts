// First-guess tuning constants, in one file, until Phase 31's pacing pass.
// Do not hand-balance before then (docs/UNISCHOOL_V2_DEV_PLAN.md, conventions).

// How long one sim week lasts in real time at 1× speed.
//
// DD §2.2 budgets fifty years in 3–5 real hours, front-loaded: about five
// minutes a year while the player is hands-on. At 36 weeks a year, eight
// seconds a week gives ~4.8 min/year at 1× and ~36 s/year at 8×, which is the
// right neighbourhood for the early game and for the late game respectively.
// It is a feel constant, so expect Phase 31 to move it.
export const WEEK_DURATION_MS_AT_1X = 8000;

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
export const FOUNDING_ADMIN_PAYROLL = 1_800_000;

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

// The applicant pool: a base, scaled by prestige and beauty (stubs until
// Phases 24 and 13), and by price position against the market.
export const BASE_APPLICANTS = 1_600;
export const PRESTIGE_STUB = 50; // 0–100
export const BEAUTY_STUB = 50; // 0–100
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
// Attrition per year: a base, plus a share for every point of
// satisfaction under the line.
export const ATTRITION_BASE = 0.04;
export const ATTRITION_LINE = 60;
export const ATTRITION_PER_POINT = 0.004;
export const ATTRITION_MAX = 0.35;
