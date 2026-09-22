# UniSchool v2 — Sub-plan 21A–21I (the Phase 21 playtest pass)

**Companion to:** `docs/UNISCHOOL_V2_DEV_PLAN.md` and `docs/UNISCHOOL_V2_DESIGN.md` (**DD §n**).
**Origin:** the first full manual playthrough at the Phase 21 checkpoint, plus `docs/audits/phase-21-checkpoint.md`.
**Position:** between Phase 21 and Phase 22. The plan's own sequencing note calls for exactly this — _"Play a full manual run before building the world layer; pacing problems found here are much cheaper than at Phase 31."_

Same conventions as the parent plan: DD is canon; sim core stays React-free; new content in data files; schema bumped with a migration when state shape changes; a runnable game at the end of every phase; **no hand-balancing before Phase 31**.

The five blocker PRs proposed at the end of the audit are **withdrawn as separate PRs** and folded into 21E, 21F and 21I below, so there is one queue rather than two.

---

## What the playtest found, and where each note goes

**Already scheduled — not in this sub-plan.**

| Note                                         | Where it lands                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advancing to Established takes a long time   | **Phase 31.** A tuning constant, and the plan forbids hand-balancing before then.                                                                                         |
| Prestige reads "—" in Year 5                 | **Phase 24** fills it. 21E only stops the placeholder claiming a phase number at the player.                                                                              |
| Playing field and rec centre have no purpose | **Phase 23** gives athletics its facility requirements and results. The _student-life satisfaction_ half is not scheduled anywhere — see 21G and the open question below. |

**Working as designed — the mechanic stays, the explanation does not.**

| Note                                               | Why                                                                                                                                                                       | Fix                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Speeds 3/4 disabled                                | DD §3.2: 4× needs a Provost, 8× needs the Provost and four Deans. This is the load-bearing mechanic of the pacing budget.                                                 | 21B — say so on the disabled control.                  |
| A beat holds the clock without switching to Paused | DD §3.3: _"Speed may still be set while a beat waits, and the clock resumes at that speed."_ The hold is the sim's, so a headless run and the live game wait identically. | 21B — make the hold visible rather than change it.     |
| Admissions capped by housing                       | DD §8.2: the office _"closes the file early at the beds plus a triples allowance."_ Pillar-level.                                                                         | 21E — warn at Budget & Hiring, a year before it bites. |
| Quads need to be "mostly" enclosed                 | DD §6.2 already says _"bounded mostly by walls"_ and the threshold is 55%. The implementation is stricter than the DD, not the DD than the player.                        | 21C — fix the implementation.                          |

**Needs a decision before it can be built** — the three at the end of this file.

Everything else is 21A–21I.

---

## 21A. Controls, and the map under one hand

Pan on **WASD** as well as the arrow keys, and resolve the collision that broke it: `s` currently opens the Students screen (`App.tsx:57-64`), so a player reaching for pan opens a screen instead. Move the six screen hotkeys off the pan keys — screens take a modifier or the unclaimed letters — and give the map first claim on WASD while it has focus. Flip the camera turn so `q`/`e` go the way the hand expects (`CampusMap.tsx:778-779`), and **animate the turn**: `VIEWS` is four azimuths 90° apart (`iso.ts:36`) and `turnBy` snaps between them with no transition, which is what reads as jarring. Let the tree tool plant a chosen tree rather than only a random one. Surface the debug panel the plan shipped in Phase 1 — it exists on the backtick key and nothing says so — and put the whole key map behind the `?` the map already shows. _Done when a player can pan, turn, zoom and paint with one hand on the keyboard without opening a screen by accident, and can find out what every key does without reading the source._

## 21B. The clock you cannot miss

A held clock is invisible today: the beat holds the week (DD §3.3), the speed pills keep showing 1×, the campus keeps animating, and the only signal is a small underlined link at the far right of the ticker. Give the chrome a held state — the clock reads that it is waiting, the speed control shows it is not advancing, and the NEXT prompt is loud enough to catch a player looking at the map. Say why a speed tier is disabled on the control itself, naming the seat that would unlock it (DD §3.2). Scale the walkers' gait with the clock speed so 8× looks like 8× — DD §6.3 says they stop with the clock but not that they keep one pace under it. _Done when a player who looks away and back knows within a glance that the game is waiting for them, what it is waiting for, and why the clock will not go faster._

## 21C. Quads the player recognises

Three separate faults, one feature. **Detection leaks:** `detectQuads` floods over any unbuilt tile (`quads.ts:74-104`), so a courtyard whose corners are left open for a path drains into the rest of the campus and is then rejected for touching the edge or exceeding `QUAD_MAX_AREA`. Contain the fill — a narrow gap between two buildings is a doorway, not an exit. **Paths are invisible to it:** a rectangle drawn in paving encloses nothing today; let paved tiles count toward the boundary, at less than a wall's weight, so a player who lays out a green with paths gets a green. **The card contradicts itself:** it prints `enclosure` as "Enclosed 100%" and then `quality` through `PLACEMENT_WORDS.quadCount` as "82% enclosed" (`QuadPanel.tsx:68-88`, `placement.json:77`) — two numbers, one word. Say what each is or drop the second line. Also: the quad patch swallows every click (`quadLabels.tsx:24-29`), which is why paths and trees cannot be drawn inside one; let the paint tools through. Draw the names on hover, selection or a toggle rather than permanently. _Done when a courtyard with open corners is a quad, a rectangle of paths is a quad, the card says one thing about enclosure, and a player can plant a tree in the middle of their own green._

## 21D. The motifs' missing parts

The motif system is strong where it is finished and unfinished in three named places. On **Modern**, the facade banners are clipped flat by the signboard and take the curtain wall's tint instead of the palette's, and the apex slot draws as a pale rectangle against a pale sky. On **Classical**, the door on residence halls, the dining hall and the admin building reads as a square column rather than an opening; on **Gothic**, the entrance is a flat black void with no leaf, step or surround. Give every motif real geometry in all three parts — apex, entrance, banner — or let a motif decline a part explicitly rather than drawing an empty one. Two map faults belong with them: walkers pop out of existence at a wall instead of passing behind it (DD §6.3 promises _"walkers hide behind the walls they pass"_), and tree scatter does not exclude entrance aprons, so a conifer grows on a portico's steps (`docs/audits/phase-21/screenshots/zoom-tree-in-portico.png`). Add the **entrance sign** — the school's name on a board at the road — as a placeable landmark in Campus Tools, which is the one piece of the campus the player has been asking the map to say out loud since the founding screen. _Done when every motif's hall has a front door you would walk through, and nothing on the map appears or vanishes where it should have gone behind something._

## 21E. What the screens say

The numbers are right and several of them do not say what they are.

- **Stale phase markers.** Four player-facing "arrives in Phase N" strings name phases that shipped (`treasury.json:18,37,46`, `seats.json:164`, `faculty.json:253`). Worse, `TreasuryScreen.tsx:44` styles _any_ phase-marked line as unbuilt whenever it reads zero, so a college with sixteen buildings and $98.7M of backlog is told **"Maintenance $0 · arrives in Phase 6"**. Drop the stale markers and make the test "has this phase shipped", not "is the number zero". Retire the phase number from player-facing copy while we are here; a player should never read the development plan.
- **Backlog, where it is created.** "50% funded; the rest becomes Backlog" is the first time the word appears and it is never defined at that moment. Define it on the slider that makes it.
- **The unlabelled.** `T` and `R` on thirty-two faculty cards; `2 / 6` on every programme row; the two HUD chips whose labels are clipped to 1×1px by `chrome.css:307-313`.
- **The docket.** `AmbitionsPanel` shows a title, a date and "true today"/"not yet" and never the goal (`AmbitionsPanel.tsx:36-48`). The clauses are readable by the same `READINGS` the events use, so show the promise as a measurement — _Enrolled 466 of 800_ — on the docket and in the offer, alongside what missing it costs. A public commitment whose terms the player cannot see is not a temptation.
- **The housing warning.** Tell the player at Budget & Hiring that next year's file will close at the beds they have, while they can still break ground.
- **The build menu's reading boxes**, which are large enough to clip their own text on the corner radius.

_Done when every number a decision depends on can be named by the player, and no screen tells them about a development phase._

## 21F. Events that are true about this college

Three faults with one root: the `when` vocabulary has forty-four readings and **not one of them asks whether the college has a particular building**, so any event whose prose names one is unguardable. `winter-outbreak` fires at 120 students and opens _"The Health Centre has seen ninety students in four days"_ at a college with no health centre; three more events name a library or a dining hall they do not require. Add a standing clause — a building id the college must have open — and gate all four. Rewrite `two-body`, which asks the player to _"create a second post"_ for a candidate _"the search wants"_: the game has a summer market and a Hire button, no searches and no posts, so either the copy meets the mechanic or the event goes. And decide the **recurring cost** question: `committee-reform` labels its choice _"$120k a year, forever"_ and then pulls `cash: -120000` exactly once, because none of the ten levers is a standing cost — the satire of DD §5.4's ratchet, written but not wired. Add a standing-cost lever or stop promising one. Write the rule into `STYLE.md`: an event may not assert a fact about the college that its `when` does not require, and a price note may not name a cost the levers cannot charge. _Done when no event tells the player something about their college that is not true, and the catalogue has a test that says so._

## 21G. Buildings that do something

Four of the eleven building types — student centre, health centre, recreation centre, playing field — carry no capacity, no satisfaction term and no gate: they cost money, raise beauty by nought to one, and change nothing a player can find. DD §8.3 lists **student life** among the sources of cohort satisfaction and `satisfactionBreakdown` (`people.ts:406-431`) has no such term. Give student life its term, so the buildings the menu offers are worth the money it asks. Second, the catalogue has no notion of **enough**: nothing stops a college building four admin buildings and three student centres. Add a limit per building type to the catalogue data — one each of the singular civic buildings, many of halls, dorms and dining — and say in the build menu when one is already standing, as it already does for Founders Hall. _Done when every building in the menu changes a number the player can find, and the menu stops offering a second of something no university has two of._

## 21H. Delegation you choose

An internal appointment does not ask who: `SeatsPanel.tsx:100` hardcodes `senior[0]`, the first eligible name on the roster, and `seats.ts:81` filters candidates by rank alone — so a professor of Health can be made Dean of the School of Science. Offer the eligible seniors by name with what each costs and what their programme loses, and draw a Dean's candidates from that Dean's own school. While in here, surface the seats: the org chart sits 2.9 screens below the fold of the Faculty screen behind thirty-two cards, and it is the machinery that buys the clock speed the player has been wondering about since 21B. _Done when appointing a dean is a choice between named people from the right school, and a player who wants to know why time is slow can find the org chart._

## 21I. The hard edges

Four places where the sim permits what the institution would not. Each is a rule, not a number, so none of them is Phase 31's.

- **Reachability.** The stream severs 312 tiles — 8.2% of the parcel — and no path may cross it (`campus.ts:108-112`), there is no bridge in the catalogue, and the sim allows 1,507 legal placements on the far bank, lecture halls among them. Refuse a placement with no walking route to the road, in the wording the terrain refusals already use. Whether the far bank should instead become reachable is the open question below.
- **The maintenance latch.** `applyCut(…, 'deferMaintenance')` zeroes the standing level, this budget and the pending one (`distress.ts:165-176`) and nothing raises it; receivership overwrites the same standing level with board policy and does not hand it back. `approveBudget` then offers the zeroed figure as the stated default forever (`treasury.ts:355`, `BeatScreen.tsx:134`). Remember the college's own level, restore it when the emergency ends, and say so in the board's letter. Schema bump with migration.
- **Demolition of an occupied hall.** `canApply('demolish')` checks only that the building exists and the cash is there (`actions.ts:203-209`), so the hall housing a school can be sold for the demolition fee; the school runs on pointing at nothing and `hallName()` returns the raw placement id, printing **`p1`** where a building name belongs (`academics.ts:367-369`). Refuse it with a reason, and make `hallName` fail into a word.
- **Founders Hall.** Its own catalogue blurb calls it _"the last thing anyone will agree to demolish"_ and the sim sells it like any other. DD §6.5 makes it the historic candidate. Make the fiction and the rule agree.

_Done when nothing the sim allows would make a registrar laugh, and the four `it.fails` cases in `src/sim/audit.phase-21.test.ts` that this sub-plan is responsible for have been promoted to `it` or re-aimed at Phase 31._

---

## Sequencing notes

- **21A and 21B are the cheapest wins in the queue** and fix the two complaints that coloured the whole playthrough (the controls fighting the player, and not noticing the game had stopped). Do them first regardless of what the answers below are.
- **21C, 21D and 21G all touch the map and the catalogue**; 21G bumps the schema and 21C changes what `detectQuads` returns, so beauty and the §17.2 aggregation move with it. Re-run `tools/guardrails.ts` after 21C and record the new §17.2 figure — the cap must still hold.
- **21F needs an engine change before its content change** (the standing clause, and the standing-cost lever if that question goes that way), so it is one phase and not two PRs.
- **21I is the audit's queue** and is last because none of it is visible in a playthrough — which is exactly why it needs the tests rather than the eye.
- **Left for Phase 31, recorded so they are not rediscovered:** teaching is nearly free to abandon (−1% to −4% enrolment, more cash on two seeds in three); the estate is profitable to abandon (every building ruined, richer on all three seeds); admin share lands at 49.7–51.1% against §17.5's 25–40%; the event cadence is five to ten times slower than §17.3's target. All four are measured in `docs/audits/phase-21-checkpoint.md` and pinned in `src/sim/audit.phase-21.test.ts`.
- **Left for Phase 32:** the 635 kB single JS chunk, `buildingMotifs.tsx` its largest contributor. 21D will add to it.

## Open questions — these three change the work

1. **Founders Hall's build time.** DD §6.4 is explicit: _"the site rises on the map over its build weeks before the doors open — Founders Hall included, so the run's first year is spent building it."_ It is 24 weeks in the catalogue, two thirds of Year 1. Making it instant or nearly so is a change to an existing DD decision, not a gap, so it wants your call rather than a phase's.
2. **Winter.** There is no winter. The year is Fall 14 · Spring 14 · Summer 8 (DD §3.1) and `season.ts` tints spring, summer, early fall and late fall. A winter _tint_ across the Fall/Spring boundary costs almost nothing and changes no rule; a winter _term_ is a change to the calendar every system counts in.
3. **Student life.** Athletics arrives in Phase 23 with its facility requirements. The satisfaction contribution DD §8.3 promises has no phase at all, which is why the student centre and health centre do nothing. 21G assumes we build it now; the alternative is to hold it for 23 and accept two more phases of buildings that only cost money.

**Assumed unless you say otherwise:** the camera turn is animated between the existing four positions rather than given eight; building limits are one each of admin building, student centre, health centre and recreation centre, two of the library, and no limit on halls, dorms, dining and playing fields; the standing-cost lever gets built, because §5.4's ratchet is the satire and the event is already written for it.
