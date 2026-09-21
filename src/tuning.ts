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
