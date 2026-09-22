# UniSchool v2 — Sub-plan 21A–21K (the Phase 21 playtest pass)

**Companion to:** `docs/UNISCHOOL_V2_DEV_PLAN.md` and `docs/UNISCHOOL_V2_DESIGN.md` (**DD §n**).
**Origin:** the first full manual playthrough at the Phase 21 checkpoint, plus `docs/audits/phase-21-checkpoint.md`.
**Position:** between Phase 21 and Phase 22. The plan's own sequencing note calls for exactly this — _"Play a full manual run before building the world layer; pacing problems found here are much cheaper than at Phase 31."_

Same conventions as the parent plan: DD is canon; sim core stays React-free; new content in data files; schema bumped with a migration when state shape changes; a runnable game at the end of every phase; **no hand-balancing before Phase 31**.

The five blocker PRs proposed at the end of the audit are **withdrawn as separate PRs** and folded into 21F, 21G and 21K, so there is one queue rather than two.

**Three DD changes were raised in chat and decided** (per CLAUDE.md's rule); each is written back into the DD by the phase that carries it, flagged in that PR's body:

| DD          | Was                                                                                             | Now                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| §6.4        | _"Founders Hall included, so the run's first year is spent building it"_                        | A few weeks, not twenty-four. The ritual stays; the wait does not. **21B.**                                           |
| §3.1 / §6.3 | Three terms, four tints, no winter                                                              | Winter as weather, not as a term: snow cover, snowfall, and an event surface that only the cold weeks reach. **21E.** |
| §8.3 / §14  | "Student life" named as a satisfaction source with no phase owning it; 11 of ~40 building types | Student life gets its term now, and the catalogue goes to budget. **21H, 21I.**                                       |

---

## What the playtest found, and where each note goes

**Already scheduled — not in this sub-plan.**

| Note                                         | Where it lands                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advancing to Established takes a long time   | **Phase 31.** A tuning constant, and the plan forbids hand-balancing before then.                                                                       |
| Prestige reads "—" in Year 5                 | **Phase 24** fills it. 21F only stops the placeholder naming a development phase at the player.                                                         |
| Playing field and rec centre have no purpose | **Phase 23** gives athletics its facility requirements, seasons and results. The _satisfaction_ half of student life is 21H's — see the DD table above. |

**Working as designed — the mechanic stays, the explanation does not.**

| Note                                               | Why                                                                                                                                                                       | Fix                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Speeds 3/4 disabled                                | DD §3.2: 4× needs a Provost, 8× needs the Provost and four Deans. This is the load-bearing mechanic of the whole pacing budget.                                           | 21B — say so on the disabled control.                  |
| A beat holds the clock without switching to Paused | DD §3.3: _"Speed may still be set while a beat waits, and the clock resumes at that speed."_ The hold is the sim's, so a headless run and the live game wait identically. | 21B — make the hold visible rather than change it.     |
| Admissions capped by housing                       | DD §8.2: the office _"closes the file early at the beds plus a triples allowance."_ Pillar-level.                                                                         | 21F — warn at Budget & Hiring, a year before it bites. |
| Quads need to be "mostly" enclosed                 | DD §6.2 already says _"bounded mostly by walls"_ and the threshold is 55%. The implementation is stricter than the DD, not the DD than the player.                        | 21C — fix the implementation.                          |

Everything else is 21A–21K.

---

## 21A. Controls, and the map under one hand

Pan on **WASD** as well as the arrow keys, and resolve the collision that broke it: `s` currently opens the Students screen (`App.tsx:57-64`), so a player reaching for pan opens a screen instead. Move the six screen hotkeys off the pan keys and give the map first claim on WASD while it has focus. Flip the camera turn so `q`/`e` go the way the hand expects (`CampusMap.tsx:778-779`), and **animate the turn**: `VIEWS` is four azimuths 90° apart (`iso.ts:36`) and `turnBy` snaps between them with no transition, which is what reads as jarring and disorienting. Let the tree tool plant a chosen tree rather than only a random one. Surface the debug panel the plan shipped in Phase 1 — it exists on the backtick key and nothing says so — and put the whole key map behind the `?` the map already shows. _Done when a player can pan, turn, zoom and paint with one hand on the keyboard without opening a screen by accident, and can find out what every key does without reading the source._

## 21B. The opening, and the clock you cannot miss

**The opening.** Founders Hall is 24 build weeks, two thirds of Year 1, and the run's first act is followed by two thirds of a year of nothing. Cut it to a few weeks so the player places the hall, watches it rise, and is running a college within the first month. DD §6.4's sentence about the first year being spent building it is amended in this PR; the ritual it describes — break ground, watch, open the doors — is the part worth keeping.

**The clock.** A held clock is invisible today: the beat holds the week (DD §3.3), the speed pills keep showing 1×, the campus keeps animating, and the only signal is a small underlined link at the far right of the ticker. Give the chrome a held state — the clock reads that it is waiting, the speed control shows it is not advancing, and the NEXT prompt is loud enough to catch a player looking at the map. Say why a speed tier is disabled on the control itself, naming the seat that would unlock it (DD §3.2). Scale the walkers' gait with the clock speed so 8× looks like 8×; DD §6.3 says they stop with the clock but not that they keep one pace under it. _Done when the first ten minutes contain a college rather than a construction site, and a player who looks away and back knows in a glance that the game is waiting for them, what for, and why the clock will not go faster._

## 21C. Quads the player recognises

Three faults, one feature. **Detection leaks:** `detectQuads` floods over any unbuilt tile (`quads.ts:74-104`), so a courtyard whose corners are left open for a path drains into the rest of the campus and is then rejected for touching the edge or exceeding `QUAD_MAX_AREA`. Contain the fill — a narrow gap between two buildings is a doorway, not an exit. **Paths are invisible to it:** a rectangle drawn in paving encloses nothing today; let paved tiles count toward the boundary, at less than a wall's weight, so a player who lays out a green with paths gets a green. **The card contradicts itself:** it prints `enclosure` as "Enclosed 100%" and then `quality` through `PLACEMENT_WORDS.quadCount` as "82% enclosed" (`QuadPanel.tsx:68-88`, `placement.json:77`) — two numbers, one word. Say what each is, or drop the second line. Also: the quad patch swallows every click (`quadLabels.tsx:24-29`), which is why paths and trees cannot be drawn inside one; let the paint tools through. Draw the names on hover, selection or a toggle rather than permanently across the ground. _Done when a courtyard with open corners is a quad, a rectangle of paths is a quad, the card says one thing about enclosure, and a player can plant a tree in the middle of their own green._

## 21D. The motifs' missing parts

The motif system is strong where it is finished and unfinished in three named places. On **Modern**, the facade banners are clipped flat by the signboard and take the curtain wall's tint instead of the palette's, and the apex slot draws as a pale rectangle against a pale sky. On **Classical**, the door on residence halls, the dining hall and the admin building reads as a square column rather than an opening; on **Gothic**, the entrance is a flat black void with no leaf, step or surround. Give every motif real geometry in all three parts — apex, entrance, banner — or let a motif decline a part explicitly rather than drawing an empty one. Two map faults belong with them: walkers pop out of existence at a wall instead of passing behind it (DD §6.3 promises _"walkers hide behind the walls they pass"_), and tree scatter does not exclude entrance aprons, so a conifer grows on a portico's steps (`docs/audits/phase-21/screenshots/zoom-tree-in-portico.png`). Add the **entrance sign** — the school's name on a board at the road — as a placeable landmark in Campus Tools; it is the one piece of the campus the player has wanted the map to say out loud since the founding screen. _Done when every motif's hall has a front door you would walk through, and nothing on the map appears or vanishes where it should have gone behind something._

## 21E. Winter on the map

The year has three terms and four tints and no cold. Winter arrives as weather rather than as a term, so nothing that counts terms has to be re-cut: **snow cover** on the ground, the roofs and the paths, **snowfall** over the map, bare trees, and the palette going quiet — across the late-Fall and early-Spring weeks, so the cold arrives at the end of one term and leaves in the middle of the next, which is what winter does. Extend `season.ts`'s four states rather than replacing them, and budget the snowfall deliberately the way Phase 13 budgeted the walkers (DD §15). Then give winter an **event surface**: the heating, the roof, the walk to the refectory, the term that starts in the dark. The `when` vocabulary already carries the calendar readings to gate on, so this half is content against an engine that is ready for it. _Done when a player can tell the season from the map without looking at the clock, and the cold weeks ask questions the warm ones never do._

## 21F. What the screens say

The numbers are right and several of them do not say what they are.

- **Stale phase markers.** Four player-facing "arrives in Phase N" strings name phases that shipped (`treasury.json:18,37,46`, `seats.json:164`, `faculty.json:253`). Worse, `TreasuryScreen.tsx:44` styles _any_ phase-marked line as unbuilt whenever it reads zero, so a college with sixteen buildings and $98.7M of backlog is told **"Maintenance $0 · arrives in Phase 6"**. Drop the stale markers and make the test "has this phase shipped", not "is the number zero". Retire the phase number from player-facing copy while we are here: a player should never read the development plan.
- **Backlog, where it is created.** "50% funded; the rest becomes Backlog" is the first time the word appears and it is never defined at that moment. Define it on the slider that makes it.
- **The unlabelled.** `T` and `R` on thirty-two faculty cards; `2 / 6` on every programme row; the two HUD chips whose labels are clipped to 1×1px by `chrome.css:307-313`.
- **The docket.** `AmbitionsPanel` shows a title, a date and "true today"/"not yet" and never the goal (`AmbitionsPanel.tsx:36-48`). The clauses are readable by the same `READINGS` the events use, so show the promise as a measurement — _Enrolled 466 of 800_ — on the docket and in the offer, alongside what missing it costs. A public commitment whose terms the player cannot see is not a temptation; it is a rumour.
- **The housing warning.** Tell the player at Budget & Hiring that next year's file will close at the beds they have, while they can still break ground.
- **The build menu's reading boxes**, which are large enough to clip their own text on the corner radius.

_Done when every number a decision depends on can be named by the player, and no screen mentions a development phase._

## 21G. Events that are true about this college

Three faults with one root: the `when` vocabulary has forty-four readings and **not one asks whether the college has a particular building**, so any event whose prose names one is unguardable. `winter-outbreak` fires at 120 students and opens _"The Health Centre has seen ninety students in four days"_ at a college with no health centre; three more name a library or a dining hall they do not require. Add a standing clause — a building id the college must have open — and gate all four. Rewrite `two-body`, which asks the player to _"create a second post"_ for a candidate _"the search wants"_: the game has a summer market and a Hire button, no searches and no posts, so either the copy meets the mechanic or the event goes. And build the **standing cost** the satire already assumes: `committee-reform` labels its choice _"$120k a year, forever"_ and then pulls `cash: -120000` exactly once, because none of the ten levers is a recurring charge — DD §5.4's ratchet, written but not wired. Add the lever, and let the administrative share start climbing from the events that deserve it. Write both rules into `STYLE.md`: an event may not assert a fact about the college its `when` does not require, and a price note may not name a cost the levers cannot charge. _Done when no event tells the player something untrue about their own college, and the catalogue has a test that says so._

## 21H. Buildings that do something

Four of the eleven building types — student centre, health centre, recreation centre, playing field — carry no capacity, no satisfaction term and no gate: they cost money, raise beauty by nought to one, and change nothing a player can find. DD §8.3 lists **student life** among the sources of cohort satisfaction and `satisfactionBreakdown` (`people.ts:406-431`) has no such term. Give student life its term, so the buildings the menu offers are worth the money it asks, and let the health centre gate the events that name it (21G). Second, the catalogue has no notion of **enough**: nothing stops a college building four admin buildings and three student centres. Add a per-type limit to the catalogue data — one each of the singular civic buildings, many of halls, dorms and dining — and say in the build menu when one already stands, as it does for Founders Hall. _Done when every building in the menu changes a number the player can find, and the menu stops offering a second of something no university has two of._

## 21I. The catalogue to budget

DD §14 budgets **~40 building types** across academic, residential, dining, life, athletics, admin and landmarks; there are eleven. No phase in the parent plan owns the gap — Phase 25 owns the renovation and vertical _variants_, and Phase 30's content budget lists events, ambitions, quirks, arcs and eras but not buildings. This is that phase: the catalogue filled out against the categories the build menu already has, each type with its footprint, cost, upkeep, build weeks, capacities, beauty mark, limit (21H) and blurb, and each with motif geometry in all five styles (21D's parts, reused rather than re-drawn). Landmarks are the cheapest win per tile and the most expressive — statues, gates, fountains, the bell tower — and DD §12.3 has the hall of fame unlocking more of them later, so the set wants room to grow. **May be split into 21I-a and 21I-b** (the data and the categories; the motif geometry) — on the parent plan's own precedent for Phase 30, and likely to be needed here. _Done when a player who has built one of everything has built a university, and the late game has things left to want._

## 21J. Delegation you choose

An internal appointment does not ask who: `SeatsPanel.tsx:100` hardcodes `senior[0]`, the first eligible name on the roster, and `seats.ts:81` filters candidates by rank alone — so a professor of Health can be made Dean of the School of Science. Offer the eligible seniors by name with what each costs and what their programme loses, and draw a Dean's candidates from that Dean's own school. While in here, surface the seats: the org chart sits 2.9 screens below the fold of the Faculty screen behind thirty-two cards, and it is the machinery that buys the clock speed 21B taught the player to want. _Done when appointing a dean is a choice between named people from the right school, and a player who wants to know why time is slow can find the org chart._

## 21K. The hard edges

Four places where the sim permits what the institution would not. Each is a rule, not a number, so none of them is Phase 31's.

- **Reachability.** The stream severs 312 tiles — 8.2% of the parcel — and no path may cross it (`campus.ts:108-112`), there is no bridge in the catalogue, and the sim allows 1,507 legal placements on the far bank, lecture halls among them. Refuse a placement with no walking route to the road, in the wording the terrain refusals already use. A **bridge** is the better game and 21I is where it would live: the college's own Civil Engineering blurb reads _"Bridges, roads and the buildings the college keeps losing to backlog"_, and its Environmental programme reads _"the stream at the edge of campus"_ — the fiction already has both. Decide which in 21I; the refusal in 21K is the floor either way.
- **The maintenance latch.** `applyCut(…, 'deferMaintenance')` zeroes the standing level, this budget and the pending one (`distress.ts:165-176`) and nothing raises it; receivership overwrites the same standing level with board policy and does not hand it back. `approveBudget` then offers the zeroed figure as the stated default forever (`treasury.ts:355`, `BeatScreen.tsx:134`). Remember the college's own level, restore it when the emergency ends, and say so in the board's letter. Schema bump with migration.
- **Demolition of an occupied hall.** `canApply('demolish')` checks only that the building exists and the cash is there (`actions.ts:203-209`), so the hall housing a school can be sold for the demolition fee; the school runs on pointing at nothing and `hallName()` returns the raw placement id, printing **`p1`** where a building name belongs (`academics.ts:367-369`). Refuse it with a reason, and make `hallName` fail into a word.
- **Founders Hall.** Its own catalogue blurb calls it _"the last thing anyone will agree to demolish"_ and the sim sells it like any other building. DD §6.5 makes it the historic candidate. Make the fiction and the rule agree.

_Done when nothing the sim allows would make a registrar laugh, and the `it.fails` cases in `src/sim/audit.phase-21.test.ts` that this sub-plan owns have been promoted to `it` or re-aimed at Phase 31._

---

## Sequencing notes

- **21A and 21B are the cheapest wins in the queue** and fix the three things that coloured the whole playthrough: the controls fighting the player, not noticing the game had stopped, and the empty first year. Do them first.
- **21C, 21D, 21E, 21H and 21I all touch the map or the catalogue**, and they compound in that order: 21D settles the motif parts that 21I must draw twenty-nine more of, 21H settles the catalogue's shape that 21I fills, and 21E's snow has to sit on whatever 21I adds. Doing 21I before 21D or 21H means drawing everything twice.
- **21C moves the guardrail.** Containing the flood fill and counting paths will change how many quads a campus has, which changes enclosure, which changes beauty, which changes the §17.2 aggregation. Re-run `tools/guardrails.ts` after 21C and record the new figure — the 12% cap must still hold, and DD §6.2's "a few good ones make a full enclosure mark" may want its `QUAD_TARGET` revisited by Phase 31 rather than here.
- **21G needs an engine change before its content change** — the standing clause and the standing-cost lever — so it is one phase, not two PRs.
- **21I is this sub-plan's schedule risk**, the way Phase 18 and Phase 30 are the parent plan's: twenty-nine building types is authoring, and authoring is the least automatable work here. Split it the moment it runs long.
- **21K is the audit's queue** and is last because none of it shows in a playthrough — which is exactly why it needs tests rather than an eye.
- **Left for Phase 31, recorded so they are not rediscovered:** teaching is nearly free to abandon (−1% to −4% enrolment, and more cash on two seeds in three); the estate is profitable to abandon (every building ruined, richer on all three seeds, never distressed); admin share lands at 49.7–51.1% against §17.5's 25–40%; the event cadence is five to ten times slower than §17.3's target. All four are measured in `docs/audits/phase-21-checkpoint.md` and pinned in `src/sim/audit.phase-21.test.ts`. **21G's standing-cost lever and 21H's student-life term both move the first three**, so re-measure before tuning.
- **Left for Phase 32:** the 635 kB single JS chunk, `buildingMotifs.tsx` its largest contributor. 21D, 21E and 21I all add to it; profile at the end of 21I rather than at the end of the sub-plan.

## Still assumed, unless you say otherwise

- The camera turn is animated between the existing four positions rather than given eight in-between ones (21A).
- Build limits: one each of admin building, student centre, health centre and recreation centre; two of the library; no limit on halls, dorms, dining and playing fields (21H).
- The far bank of the stream becomes reachable by a **bridge** in 21I rather than staying permanently off-limits; 21K's placement refusal ships either way (21I, 21K).
