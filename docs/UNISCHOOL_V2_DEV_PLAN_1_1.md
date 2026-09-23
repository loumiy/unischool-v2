# UniSchool v2 — Development Plan for 1.1 (Phases 35–52)

**Companion to:** `docs/UNISCHOOL_V2_DEV_PLAN.md` and `docs/UNISCHOOL_V2_DESIGN.md` (**DD §n**).
**Origin:** the release playtest, `docs/reviews/release-playtest/REVIEW.md`, and the three Phase 21 audit findings still open as `it.fails` in `src/sim/audit.phase-21.test.ts`.
**Position:** after Phase 34. 1.0 is a complete game with a strong opening and ending. 1.1 is about **the middle**: Years 15–45, where a competent college is rich, its students are as happy as the scale allows, its teams win nearly every season, and the questions arrive with prices it no longer notices. 1.1 also carries a full **visual refinement** pass.

## Conventions

The same as the parent plan, with one change now that Phase 31 is behind us:

- The DD is canon. Sim core stays React-free and dependency-free. New content goes in data files. The schema is bumped with a migration whenever the state shape changes. Every phase ends with a runnable game. One branch and one PR per phase, named `phase-NN-...`.
- **Tuning is measured, not guessed.** Every sim phase states its target as a number on the `npm run balance` dashboard. Phase 35 adds the measures this plan needs; each later phase runs the dashboard before and after and puts both readings in its PR body. A phase is not done until its numbers are in band on all three archetypes and all three seeds, or the PR says which ones aren't and why.
- **Visual phases are checked by eye, with evidence.** Each one ends with a contact sheet: the same scenes shot before and after, from the scenario saves in `tools/.scenarios/`, in all five styles where the change touches buildings. The PR body carries the sheet.
- **Changes to existing DD decisions are raised in chat before the phase starts** (CLAUDE.md). The table below lists the ones this plan expects to need. Additive decisions are written back into the DD in the phase's own PR, as before.

## DD decisions this plan proposes to change

| DD           | Now                                                                  | Proposed                                                                                                              | Phase  |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| §3.3         | Every calendar beat holds the clock until it is resolved             | A beat with no decision to make, at a college in good standing, is recorded in the ticker and does not stop the clock | **41** |
| §7.3         | The faculty market opens once a year, at Budget & Hiring             | Off-cycle adjuncts can be hired at any time: dearer, weaker, on one-year contracts                                    | **39** |
| §10.1        | An event choice's cost is a fixed sum in dollars                     | A cost can be written as a share of the college's own budget or estate, so the same letter stings at every size       | **36** |
| §8.2         | The applicant pool answers to price, prestige, layout, draw and tags | It also answers to teaching quality, satisfaction and the condition of the campus, through a lagged reputation        | **37** |
| §2.4 / §11.2 | Every college is founded the same way; identity is earned only       | A founding charter picks a starting emphasis that shifts costs, demand and some content                               | **43** |

---

## Where every review note goes

| Review note                                                                                | Phase          |
| ------------------------------------------------------------------------------------------ | -------------- |
| Cash piles up: $104M by Year 26, $307M by Year 49 for the steward                          | **36**         |
| Event prices don't scale ("Rebuild properly: $3.5M" to a college holding $116M)            | **36**         |
| No way to move surplus cash into the endowment                                             | **36**         |
| Demand barely answers to quality; the three open Phase 21 audit findings                   | **37**         |
| Satisfaction saturates at 98 in every class                                                | **38**         |
| 77 titles in 50 years for the steward's three teams                                        | **38**         |
| One hiring window a year, with no recovery for missing it                                  | **39**         |
| Teaching seats aren't explained                                                            | **40**         |
| The founding gift doesn't cover the founding checklist                                     | **40**         |
| The title screen draws over the founding form                                              | **40**         |
| The build menu covers the ground you are placing on                                        | **40**         |
| Laboratory card wording; "No rival yet" every autumn; "Time, and who buys it" arrives late | **40**         |
| About 200 clock-stopping beats a run, many with nothing to decide                          | **41**         |
| The middle plateaus: nothing big to save for or aim at                                     | **42**         |
| Ambitions arrive as offers, never as goals the player chooses                              | **42**         |
| Strategies converge; every archetype earns "Artsy"; nothing is exclusive                   | **43**         |
| Most buildings are a box with a roof; twelve of 44 share the "pavilion" form               | **44**         |
| Condition shows only as a colour filter                                                    | **46**         |
| The campus has no dressing: no lamps, benches, cars, flags or parking                      | **45**, **47** |
| No history charts: rank, money and enrolment exist only as today's number                  | **48**         |
| The audio mix was never heard by a person                                                  | **50**         |

---

## Stage A — Keep the middle hard

Phases 35–38 are the core of 1.1 and run strictly in order. Each changes the economy the next one is tuned against.

**35. Measure the middle.**
Before changing the economy, add the readings this plan tunes against to `tools/balance.ts`, and record today's values as the baseline.

- **Cash cover:** operating cash as years of expenses, per decade.
- **Event sting:** the median cash cost of a presented choice as a share of that year's operating budget, per decade.
- **Saturation:** years with any class above 95 satisfaction.
- **Title rate:** titles per varsity season.
- **Demand response:** the applicant-pool change when teaching quality drops 20 points, with everything else held.
- **Idle beats:** calendar beats that stopped the clock with no decision to make.
- **Tag overlap:** tags shared by all three archetypes.

Write the bands each will be held to into DD §17 as an additive guardrail. _Done when the dashboard prints all seven for every archetype and seed, and `docs/reviews/release-playtest/` has a baseline table to compare against._

**36. Money that means something.**
Two changes, one goal: in every decade, a choice should cost something the college notices.

- **Prices that scale with the college (DD §10.1).** A choice's cash effect can be written as a share of the operating budget (`budgetShare`) or of the estate's replacement value (`estateShare`), with a floor in dollars so Year 1 still reads right. Convert the events whose cost is about size, not about a thing: roofs, storms, rescues, gifts and settlements. Leave the ones that price a thing (a vet's bill for the lodge cat) in dollars. The event panels show the resolved dollar figure, never the formula.
- **A home for surplus cash.** Add a Treasury action that moves operating cash into the endowment as a quasi-endowment. The board's confidence rises when reserves beyond a term's expenses are invested rather than hoarded. Named gifts, endowed chairs and buildings named after donors become visible uses of that fund.

_Done when the steward's cash cover sits between a quarter and a full year of expenses in every decade from Year 10, the event sting median sits between 1% and 5% of the budget in every decade, and the frugal college's cash stops growing without bound._

**37. Demand that answers to quality.**
Give the college a **reputation**: a slow-moving, lagged reading of what its recent students actually got, fed by teaching quality, satisfaction, outcomes and the condition of the buildings they lived in. It moves the applicant pool and the yield alongside price and prestige (DD §8.2). A college that starves its faculty or lets its halls rot fills fewer beds within a few years, not only a worse grade at Year 50. Show it on the Students screen as a line with its causes, the way the placement factor is shown now. _Done when the three open Phase 21 audit findings are promoted from `it.fails` to `it`, the dashboard's demand response is at least 10% of the pool for a 20-point teaching drop, and the steward's rank and enrolment are no worse than in the Phase 35 baseline._ Schema bump: reputation is state.

**38. No ceilings you can sit on.**

- **Satisfaction:** students judge the college against what it has promised. Expectations rise with prestige and tuition, so a top-ten college's students want more than a new college's did. Each source of satisfaction gets diminishing returns near the top.
- **Athletics:** opponents scale with the college's own standing and athletics budget, so winning the conference gets harder as the college rises.
- **Rivals:** the rival's strength tracks the college's.

_Done when no archetype has a year with any class above 95 satisfaction, the steward's title rate is between 10% and 25% of seasons, and satisfaction and athletics still reward investment: the steward beats the frugal college on both by a clear margin._ Schema bump if expectations are stored.

## Stage B — The first hour and the long hour

Phases 39–41 are independent of each other and can run in any order after Stage A.

**39. Staffing without a trap (DD §7.3).**

- **Adjuncts.** The Faculty screen offers adjuncts at any time of year. They cost about 1.5× a year's salary, cap teaching quality below a hire's, and leave at the end of a one-year contract. Missing Budget & Hiring becomes a costly recovery instead of a lost year.
- **Staffing on the Curriculum screen.** Each programme shows what staffing it needs, and a single "staff with adjuncts" action is offered where nobody teaches.
- **Faculty leave for reasons.** Retirement at the end of a career, and departures when morale is low, so the roster is never finished.

_Done when a college that approves its first budget without hiring has taught programmes by Convocation, at a visible cost, and the steward's faculty count stays within 10% of the Phase 35 baseline._ Schema bump: contracts are state.

**40. The first hour, finished.**
Every onboarding gap from the review:

- **"Where will they be taught?"** A note on teaching seats, matching "Where will they sleep?", and a line under Curriculum's seat counter naming the buildings that add seats.
- **The founding money.** Either the founding gift covers the checklist (Founders Hall, a residence hall, a dining hall, a school, three programmes and a teaching building), or the first note says plainly that colleges borrow to build and shows how. Decide with the Phase 35 dashboard, not by feel.
- **The title screen** hides or blurs the founding form behind it.
- **The build menu** collapses to a strip while a building is in hand, so the ghost and the ground are never under the panel.
- **Wording:**
  - The Laboratory card says what a laboratory gives.
  - The Board Meeting stops repeating "No rival yet…" once it has said it.
  - "Time, and who buys it" arrives the first time the player reaches for a locked speed, not in Year 3.

_Done when a scripted new-player run (the browser playtest from the review, automated in `tools/`) reaches its first Convocation with beds, seats, dining and teachers for every programme, having read only the notes and the NEXT slot. Also, no two chrome panels overlap the ghost at 1440 × 900._

**41. Beats that earn their stop (DD §3.3).**

- **Beats with nothing to decide don't stop the clock.** When a beat has no decision to make and the college is in good standing, it plays as a ticker line and a short card that fades without stopping the clock. A board with something to say still stops it, and so does any beat with a decision. This needs the DD change raised in chat first.
- **Convocation earns its screen.** It gains what makes it worth stopping for: the class's named students, the promise the board wants to make, and the year's one headline.
- **A year in review.** Add an optional card at the turn of the year that folds the year's delegated decisions into one read.

_Done when the dashboard's idle-beat count is under 25 per run for the steward, and a sound college's year stops the clock only for decisions._

## Stage C — Something to build towards

Phases 42–43 follow Stage A, because both are tuned against the new economy.

**42. Projects and promises for the middle years.**

- **Capital projects.** Add a handful of multi-year, prestige-defining projects that need saving for:
  - a research park
  - a medical school or law school (a seventh school, with its own building set)
  - a second quad masterplan
  - a stadium
  - a performing arts centre

  Each takes several years of works, a campaign or the endowment to fund, and changes what the college is: new programmes, new event pools and a tag. They show on the map as a fenced, phased works site that grows over the years.

- **Decade ambitions.** At the first Board Meeting of each decade, the player picks one or two public ambitions from a short, dealt list (DD §10.2), instead of only accepting offers.

_Done when every archetype has a project it can afford in each decade from Year 15, the steward completes at least two by Year 50, and the dashboard shows cash spent on projects in every decade._ Schema bump: projects are state.

**43. Builds that diverge (DD §2.4, §11.2).**

- **A founding charter.** Choose one on the startup screen: liberal arts, research university, polytechnic or land-grant. Each shifts costs, starting demand, which schools are cheaper to found, and which events and projects are dealt. It is not a class and does not lock anything forever: a charter is the college's first identity, and it can drift.
- **Tags with teeth.** Each tag gains one mechanical effect beyond the pool (for example: a Research Powerhouse wins more grants, and a Party School pays more for discipline). The tag formulas are re-read against the catalogue, so opening Arts & Letters first no longer makes every college "Artsy".
- **Mutually exclusive landmarks.** A college builds one grand landmark from a set of three, chosen by its charter or tags.

_Done when the three archetypes earn no tag in common, four charters played by the steward produce four different Year-50 axis profiles on the dashboard, and the final-report titles differ._ Schema bump: the charter is part of identity.

## Stage D — Visual refinement

Phases 44–49 are presentation only: `src/ui/` and content, never `src/sim/` state. They can run in parallel with Stages B and C, one at a time, each against the contact-sheet rule above. They are ordered by how much of the screen they touch: buildings first, then the ground they stand on, then light, age, life, and the chrome around the map.

**44. A silhouette for every building.**
Twelve of the 44 building types share the "pavilion" form, and most non-landmark buildings read as a box with a roof in the style's material. Give each type a massing that says what it is:

- **Laboratories:** a long block with ventilation stacks and a service yard.
- **Libraries:** a tall reading room with long windows over a lower stack wing.
- **Residences:** repeated bays with many small windows, and balconies in the Modern style.
- **Dining halls:** a large-roofed hall with a glazed end.
- **Lecture theatres:** a raked, windowless drum on a foyer.
- **Athletics:** a clear-span roof, with stands where there is a pitch.
- **Admin:** a formal front with a flagpole.

Add an L-shaped or courtyard variant for the larger footprints, chosen by rotation and neighbours so a row of residences doesn't read as stamped. Keep every form inside its footprint and its label anchor, so placement, shadows and depth sorting are untouched. _Done when a contact sheet of the whole catalogue, in all five styles, has no two types sharing a silhouette at the default zoom, and the Year-40 crowded campus still holds 55+ fps at 8× in the production build._

**45. The ground the campus stands on.**
The land between buildings is lawn and hand-drawn paths. Make it read as a campus that people use:

- **Wear.** Walker routes wear desire lines into the grass over the years. The existing desire-path event gets a visible cause, and paving a worn line is a satisfying fix.
- **Hard landscape.** Paved plazas at busy doors; kerbs and edging where paths meet lawn; car parks by the road for a commuter college; a bus stop at the gate.
- **Dressing, placed by rule, never by hand.** Lamps along paths, benches at quad edges, bike racks at residences, bins at dining halls, all scattered by density and style. It is purely presentational and seeded per tile, so it is stable across reloads.
- **Water.** A slow shimmer on the stream, ice on it in winter, and the footbridge's reflection.

_Done when a Year-30 campus in each style looks lived-in at the default zoom, the ground layer costs under 2 ms a frame at 8× with 1,500 students, and nothing on the ground intercepts a click meant for a tile._

**46. Age you can see.**
Condition is now only a colour filter (`map.css`: worn, weathered, derelict). Draw it instead:

- **Worn:** streaked walls and a patched roof.
- **Weathered:** stained stone, missing slates and one boarded window.
- **Derelict:** boarded windows, broken glazing, a fence and weeds at the door.

Draw the opposite end too. Historic buildings gain ivy and a patina that deepens with age, and new buildings are crisp. The Renovate action gets a before/after flash when the scaffold comes down. _Done when a player can pick out the three worst buildings on a Year-40 neglected campus without the condition overlay (checked by a person on a screenshot), and the overlay and the drawing never disagree._

**47. Light, flags and a campus that is used.**

- **The sun moves with the seasons.** It is low and gold in winter, with longer shadows and warm lit windows. It is high and white in summer. The title screen stands at golden hour.
- **The college's colours are everywhere a college puts them.** Flags on the admin building and Founders Hall; banners on lamp posts at Convocation and Commencement; the crest on the gate.
- **Crowds with purpose:**
  - gowns on the lawn in Convocation week
  - a crowd in the stands and players on the pitch in game weeks
  - a queue at the dining hall at the busy hour
  - snowball scatter in winter
- **Traffic on the road**, scaled by enrolment.

It all comes from the calendar and the state, so it stays deterministic and presentational (DD §6.3). _Done when the same save, stepped a week at a time through a year, shows at least one visible sign of each calendar beat on the map, and the walker budget (`MAX_WALKERS`) and the frame budget still hold._

**48. The screens, refined.**
The screens are well written but visually one register: cream cards and tables.

- **History, not just today's number.** Add small charts for what already has one in the sim: rank by year on League, cash, endowment and net by year on Treasury, enrolment and satisfaction by class on Students, and the prestige axes over the run on the Final Report. They use one chart style, drawn from the tokens so both colour schemes read.
- **Event and letter headers carry their domain** (estate, academic, students, advancement, money, board) as an icon and a colour stripe, so the strip can be scanned.
- **A layout audit** across all tabs: one grid, one spacing scale, one table style, figures in tabular numerals, and no card inside a card.
- **Motion with meaning.** Numbers that change tick to their new value, a new building's card slides in on the journal, and all of it honours `prefers-reduced-motion`.
- **The Final Report shows the campus portrait** beside its mark. The chronicle can be read as a yearbook, one spread per era.

_Done when every tab passes a layout checklist (grid, spacing, table style, empty states, 390 px width) recorded in the PR, and every chart is legible at 130% text in the colour-blind-safe scheme._

**49. The hall and the frame.**

- **The hall of fame becomes a gallery wall.** Portraits hang in frames that take the college's colours, each with a brass plaque (name, mark, title and years), and open to the Final Report and the chronicle.
- **Portrait framing.** The portrait is framed on the campus, not the parcel's empty corners. Take it at golden hour in the college's last season.
- **Visual cosmetic unlocks.** The unlocks DD §12.3 names but 1.0 left for later: motif variants, landmark sets and seasonal decorations. They stay cosmetic only.

_Done when a hall of five finished colleges reads as five different places at a glance, and each unlock has a visible, cosmetic-only effect covered by a test that it changes no sim reading._

## Stage E — Sound, words and the second playtest

**50. The audio mix, by ear.**
The soundtrack is synthesised and has never been heard by a person. Its levels are first guesses in `content/audio.json`. **This phase needs a human listener.** Claude can prepare the tools but cannot judge the result:

- a debug panel to solo and loop each theme, ambience layer and effect
- a scripted tour through the four themes and the seasons

The listener sets the levels and flags anything harsh, repetitive or wrong. Add variations to each theme (a B section, a second arpeggio pattern) so fifty years of one theme doesn't wear. _Done when a listener has signed off each theme and effect in the PR, and a four-hour run's music never repeats the same eight bars more than a set number of times in a row._

**51. Content for the new systems.**
Write events, ambitions and notes for everything Stages A–C added:

- adjunct and contract events
- capital-project letters, both setbacks and ribbon-cuttings
- charter-specific events
- reputation events: good word of mouth and bad press
- decade-flavoured late-game events, so Years 40–50 read differently from Years 20–30

Also convert the remaining size-dependent event prices to shares (Phase 36). Hold everything to the reachability harness. _Done when every new system has at least eight events or letters that can reach some college, and the steward sees at least 90 unique events in a run (80 in 1.0)._

**52. The second playtest, and 1.1.**
Repeat the release playtest exactly:

- a new player's first run in a real browser
- the harness saves played through Year 50
- the dashboard across all archetypes and seeds
- the performance profile

Write `docs/reviews/1.1-playtest/REVIEW.md` in the same shape as the 1.0 review, so the two can be compared question by question. Retune anything the new review measures out of band, and tag the release. _Done when the review's six questions each score at least as well as in 1.0, the "middle" questions (progress, pacing, fun) improve, and a `v1.1.0` tag builds the itch.io zip._

---

## Sequencing notes

- **Stage A first, and in order.** Money (36) changes what demand (37) is worth, and both change where saturation (38) bites. Tuning any of them out of order means tuning it twice.
- **Stage D can run alongside B and C.** The visual phases touch only `src/ui/` and content, never sim state. Interleave them with the sim phases, so a long balance phase doesn't stall visible progress. Phase 44 is the best first pick: it changes the most pixels and depends on nothing.
- **Performance is a gate for 44, 45 and 47.** Phase 33 measured 56–59 fps at 8× on a Year-40 campus in the production build. Each of these PRs re-measures it and holds 55 or better. If a phase breaks it, the dressing or the massing gets a level-of-detail rule before the phase merges. It does not wait for a later phase.
- **Human-only steps:** Phase 50's listening. The itch.io push needs `BUTLER_API_KEY` and `ITCH_TARGET` in the repository settings before the Phase 52 tag. Each of Phases 46 and 49 has one judgment ("can a person pick out the three worst buildings", "five different places at a glance") that a person should confirm on the PR's screenshots.
- **Likely to run long:** 36 (converting events to shares touches the whole catalogue), 42 (projects need state, UI, map works and content), 44 (fifteen forms across five styles) and 48 (seven tabs). Each has a natural split into two PRs:
  - 36: prices / endowment
  - 42: projects / ambitions
  - 44: academic and residential / everything else
  - 48: charts / layout audit
