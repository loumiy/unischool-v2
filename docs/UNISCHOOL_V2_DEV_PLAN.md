# UniSchool v2 — Development Plan

**Companion to:** `docs/UNISCHOOL_V2_DESIGN.md` (referenced throughout as **DD §n**). This plan lives at `docs/UNISCHOOL_V2_DEV_PLAN.md`.
**Method:** Numbered phases sized for ~1–2 hours of Claude Code work each. Feed one phase at a time to Claude Code and let it propose the PRs to execute it. Phases within a stage are ordered by dependency; stages are strictly sequential.

## Conventions for every phase

- **The design document is canon.** Where a phase and DD conflict, DD wins; where DD is silent, the phase decides and the decision gets written back into DD.
- **Definition of done, always:** typechecks clean · sim core remains React-free (DD §15) · new content lives in data files, not code (DD §15) · save schema version bumped with migration if state shape changed · a runnable game at the end of every phase, even if ugly.
- **Placeholder policy:** phases may stub systems ahead of them with typed no-op interfaces, never with fake behavior that later phases must un-teach.
- **Tuning values** (prices, rates, thresholds) are first-guess constants in a single `tuning.ts` until Phase 31; do not hand-balance before then.

---

## Stage 0 — Foundation (the machine before the game)

**1. Repo scaffold and the sim core contract.**
Fresh Vite + React + TS repo. Establish the architecture of DD §15: `sim/` (pure TS: state tree, action types, `tick()`, seeded RNG), `ui/` (React), `content/` (JSON + schema validation), `tuning.ts`. Weekly tick driver with pause/1×/2×/4×/8× (gating stubbed open). Serializable state, autosave/load to IndexedDB, schema version 1, seed captured at new-game. A debug panel (state inspector, time controls, action log). _Done when a blank "campus" advances through calendar weeks (DD §3.1) and survives save/reload._

**2. App shell and identity flow, ported from v1.**
Port and adapt v1's startup flow (name, motif, palette — DD §13.1) and UI chrome grammar (DD §13.2): bottom bar with stubbed screens, identity chip, date/speed controls, ticker strip with a NEXT slot. Establish the design-token layer (cream/maroon/gold, typography) as the single styling source. _Done when a player can found "Blackmoor," pick colors, land on an empty map with live chrome, then place Founders Hall as the run's first action (DD §2.4)._

**3. The canvas and building placement.**
The fixed 64×64 parcel with its terrain frame (DD §6.1). Grid placement/demolition of buildings from a data-driven building catalog (~10 seed types for now), motif + palette rendering per building, paths and trees. Camera pan/zoom. _Done when a campus can be laid out, saved, reloaded, and looks like UniSchool._

**4. Calendar beats and the event bus.**
Terms and the four calendar beats (DD §3.3) firing as ticker prompts that open placeholder screens. An internal event bus the sim uses for anything notable (building placed, year turned, threshold crossed) — the spine that events (Ph.17), the chronicle (Ph.26), and class memories (Ph.16) will all consume. _Done when a year cycles through all four beats and the bus log shows a coherent history._

## Stage 1 — The economic spine (money is the weather)

**5. Treasury core.**
Revenue/expense categories, weekly cashflow, the year budget, endowment + draw (DD §5.1–§5.2), the Treasury screen with the one-tooltip rule (DD §5.3, §13.2). Chrome shows balance + weekly delta. _Done when money moves believably over simulated years._

**6. Buildings as economic objects.**
Construction costs (cash or debt, board leverage cap), per-building maintenance, condition aging, Backlog accrual and its visual weathering (DD §6.4). Renovation action clearing backlog. _Done when neglect visibly and financially compounds._

**7. Enrollment loop v0.**
Admissions Day screen: tuition + selectivity sliders → applicant pool (prestige/beauty stubs as constants) → class size/quality/revenue; cohort objects with annual progression, attrition, graduation (DD §8.2–§8.3 minus identity inputs). Housing/dining capacity constrains enrollment with the overflow-triples consequence. _Done when a decade of classes flows through and tuition dependence is a real number on the Treasury screen._

**8. The distress ladder.**
All five rungs with entry/exit conditions, board letters at transitions, the Freeze and Austerity restrictions, the receivership-lite lockout (DD §5.5). _Done when a deliberately mismanaged school rides the ladder down and climbs back without dying._

## Stage 2 — The academic core

**9. Schools, programs, and the curriculum screen.**
Data model for 6 schools / 30 programs / 3 tiers (DD §7.2); school founding as building + cost + (stub) dean seat. Curriculum screen in v1's visual language showing programs as the unit with generated course flavor (DD §7.1). _Done when schools can be founded and programs opened, with the screen readable at a glance._

**10. Faculty market and hiring.**
Faculty entities (teaching, research, salary, seniority, quirk — DD §7.3), the summer hiring market, assignment to programs, payroll integration. Quirk catalog seeded (~15 of the 40). _Done when a faculty roster staffs the curriculum and the budget feels them._

**11. Program advancement and signatures.**
Tier advancement requirements and effects; the 3-signature designation with its costs and expectations (DD §7.2); seat capacity vs. enrollment overcrowding damping (DD §7.4). _Done when building an Established program is a multi-year project the player can plan around._

**12. Quality, satisfaction, and outcomes v0.**
Program quality formula (DD §7.4); cohort satisfaction from housing, teaching, beauty-stub, and current conditions; graduation outcomes distribution. Wire attrition to satisfaction/quality. _Done when cause→effect from investment to student experience is traceable in the debug panel._

## Stage 3 — The living campus

**13. Ambient life and campus beauty.**
Students visibly walking real paths between buildings they plausibly use, density following the term calendar, seasonal tinting (DD §6.3); the Campus Beauty score from greenery/landmarks/coherence feeding the applicant pool (replacing Ph.7's stub). Performance-budget this phase deliberately (DD §15). _Done when the map is worth watching between decisions._

**14. Quads, pairings, and the 12% cap.**
Quad detection + naming, adjacency pairings, all placement effects implemented behind a single capped aggregation (DD §6.2, guardrail §17.2). _Done when bonuses exist, show their math in tooltips, and provably cannot dominate._

**15. Named students.**
The sampling system: 3–5 per class with portraits, program affiliation, and arc beats selected from cohort truth into the ticker (DD §8.1, guardrail §17.4). Portrait pool and arc-template content files started (~half of DD §14 targets). _Done when a player can recognize and follow a student across four years._

**16. Class memory and the alumni ledger.**
Graduation stamping from the event-bus history of those four years; the ledger with warmth per class; annual fund giving computed from it; reunion/outreach nudges (DD §8.4). _Done when a housing crunch in year 12 measurably dents giving in year 30 (verify via headless fast-sim)._

## Stage 4 — Pressure and story

**17. The event engine.**
Data-driven inline events: JSON schema (conditions on state, weighted selection, choices, effects, timeout default), ticker expansion UI, consequence-weighted sourcing, seismic full-screen letter presentation (DD §10.1). Ship with ~10 proof events. _Done when the pipeline turns a JSON file into a playable, wry dilemma._

**18. Event content, batch 1.**
~50 inline + 6 seismic events across all systems built so far, written to the voice guide; establish `content/STYLE.md` with DD §13.3's rules and examples as the authoring reference. _Done when a test decade feels inhabited and the tone is consistent._

**19. Ambitions.**
The offer/accept/deadline/resolve loop, 3-active cap, dealing filtered by school state, board-confidence and chronicle consequences (DD §10.2). Seed 12 of the 24-ambition pool. _Done when the player can be tempted into overreach and pay for it._

**20. Delegation.**
All seats, internal-vs-outside filling, policy sliders, event filtering/auto-resolution, escalation rules, speed-tier gating replacing Phase 1's stub, and the administrative ratchet wired into Treasury (DD §9.1–§9.2, §9.4, §5.4, §3.2). _Done when buying the executive suite visibly buys speed and visibly bleeds payroll._

**21. Advancement and donors.**
VP of Advancement, campaigns against the ledger, discrete gift events with conditions, endowment growth mechanics (DD §9.3, §5.1). _Done when a late-game building can realistically be funded by the classes who loved you._

## Stage 5 — The wider world

**22. The league.**
24 persistent AI schools with axes, identities, annual drift, and reactions; the rankings screen; the shifting-methodology wrinkle (DD §11.3). _Done when the table moves believably over 50 headless years._

**23. The rival and athletics-lite.**
Rival emergence triggers and extra presence (taunts, board framing); varsity toggles, facility requirements, seasonal results, championship/scandal event hooks (DD §11.3, §8.5). _Done when year-40 rankings have an antagonist._

**24. Prestige and identity.**
Six trailing axes; identity tags earned/shed from behavior, shaping applicant mix, event selection, and future report language (DD §11.1–§11.2); poaching wired to the league (DD §7.3). _Done when two differently-played schools show visibly different tags and applicant pools._

## Stage 6 — Fifty years

**25. The full-canvas late game.**
Vertical/renovation building variants, Historic status with its demolition politics and protest events, Build-menu reorientation under land scarcity (DD §6.5–§6.6). _Done when a full map presents rebuild-vs-preserve dilemmas rather than a dead end._

**26. The chronicle.**
Era detection and naming from state trajectory, the History screen (draft chronicle viewable anytime), notable-alumni selection, building timeline, rival saga (DD §12.1). Era-template content file. _Done when a completed test run reads as a story a player would screenshot._

**27. The ending.**
Year-50 final report: axis grades over the arc, ambition record, financial verdict, composed identity title; the transition into Epilogue mode with decade addenda (DD §12.2, §2.3). _Done when the run lands — the report should feel like a verdict, not a stat dump._

**28. Hall of fame and cosmetic meta.**
Campus-portrait snapshot renderer, persistent hall across runs, cosmetic unlock system (palettes, motif variants, landmark sets — DD §12.3, §14). _Done when finishing a run leaves a souvenir and a reason to start another._

## Stage 7 — Ship it

**29. Onboarding by consequence.**
The first-hour experience: systems introduced as fiction when first caused (a letter, a request — per the original vision), contextual help, the one-tooltip audit across every screen (DD §13.2). No modal tutorial. _Done when a new player reaches year 5 without documentation._

**30. Content to full budget.**
Events to ~120 + 20, ambitions to 24, quirks to 40, arc templates and portraits to target, era templates to 30 (DD §14). Pure content phase against the established pipelines and style guide. _May be split into 30a/30b if authoring runs long._

**31. Balance instrumentation and the pacing pass.**
Headless autoplay harness (scripted archetype strategies over 50 years in <60s, DD §15); dashboards for the guardrail metrics (DD §17: admin share 25–40%, event cadence, placement-bonus share, run length vs. §2.2 budget); tune `tuning.ts` against them. _Done when three archetype runs land inside the DD §2.2 and §17 envelopes._

**32. Audio.**
State-aware music switching, map ambience scaling with enrollment/season, core SFX set, audio settings (DD §13.4). _Done when the game sounds like itself with eyes closed._

**33. Hardening.**
Save-migration test suite across all schema versions, 50-year performance profiling against DD §15 targets (canvas fallback for ambient life only if profiling demands), error boundaries, crash-safe autosave. _Done when a full evening run is boring, technically._

**34. Release.**
Settings (colorblind-safe palette variants, font scaling, autosave cadence), main menu with hall of fame front and center, credits, itch.io build pipeline, a README for real players. _Done when a stranger can download it, play an evening, and hang a school in the hall._

---

## Sequencing notes

- **The first playable moment is Phase 8** (money + buildings + enrollment + distress = a game, however bare). Evaluate feel there before Stage 2 — it is the cheapest point to revise DD §5.
- **The second checkpoint is Phase 21**: all pressure systems live. Play a full manual run before building the world layer; pacing problems found here are much cheaper than at Phase 31. _Done: `docs/audits/phase-21-checkpoint.md` is the audit, and the playtest that followed it produced `docs/UNISCHOOL_V2_DEV_PLAN_21X.md` — phases 21A–21I, which run between Phase 21 and Phase 22._
- **Content phases (18, 30) are the schedule risk.** Writing 140 good events in-voice is the least automatable work in the plan; start drafting event ideas in a backlog file from Phase 17 onward, and treat every playtest complaint as an event prompt.
- Phases average 1–2 Claude Code hours but 13, 20, 26, and 31 are the likeliest to run long; each has a natural split point (13: walkers/beauty · 20: seats/gating · 26: detection/screen · 31: harness/tuning) if a phase needs to become two PRs' worth after review.
