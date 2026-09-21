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
