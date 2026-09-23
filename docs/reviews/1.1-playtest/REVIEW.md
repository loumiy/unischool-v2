# UniSchool v2: 1.1 playtest review

_Written in Phase 52, the last phase of the 1.1 plan (`docs/UNISCHOOL_V2_DEV_PLAN_1_1.md`). It covers `main` after PRs #53–#69, played in a real browser and measured headlessly. It follows the 1.0 review (`docs/reviews/release-playtest/REVIEW.md`) question by question, so the two can be read side by side._

## How it was tested

The same four passes as the 1.0 review.

- **A new player's first run.** `tools/newplayer.mjs` drives the real app in Chromium as a first-timer who reads only the notes and the NEXT slot. It founds a college, does what each note says, answers every beat with its default, and stops at the first Convocation with a class. I read every screen it passed through, and every note it read. This pass was scripted, not a person, so it tests whether the notes lead somewhere; it cannot test whether a person would follow them.
- **The middle and the end.** I played harness saves of the steward college in the production build: Year 25, Year 40, Year 49, and three weeks before the turn of Year 50. They were founded as a research university, the steward's charter, with the notes marked read as a player's would be. I played at 8× through the passing beats, the questions and the Final Report, and opened every screen along the way.
- **Customisation.** The four charters, played by the steward on the same seed; the five styles; the charter picker on the startup screen.
- **Measurements.** `node --experimental-strip-types tools/balance.ts` plays three archetypes (steward, growth, frugal) for 50 years on three seeds each, against DD §2.2's pacing budget and §17's guardrails. It now also counts the unique events each college meets and answers. Performance was profiled in the production build, against the 1.0 build on the same machine and the same save.

A few things were fixed during the playtest and are listed at the end. Everything else below is still open.

---

## The verdict in one paragraph

1.1 did what the 1.0 review asked of it: the middle years have weight now. Prices scale with the college and bite 2–3% of a year's budget from the second decade on. Satisfaction never saturates: no class stands above 95 in any run, and the steward's classes leave at 70–85. Demand answers to teaching: a 20-point teaching drop costs 10–16% of the pool. Four charters play differently: no tag is shared by every archetype, and the land-grant college's teams win about one season in five, not every other one. The clock stops for decisions and not for ceremony: 8–22 idle beats a run, down from 58–82. And the campus looks lived in. Two things did not move enough. **A good college still gets rich**: the steward runs a 42% operating margin in Year 49, and its endowment passes a billion dollars, so the last decade is still mostly watching. **A large Year-40 campus runs at 47–48 fps at 8×**, not the 55 the plan set as the gate. On a 1.0-sized campus the build is back to 1.0's frame rate; the new campuses are simply bigger.

---

## 1. Is it intuitive for a new player?

**Yes. Most of the 1.0 sticking points are gone.**

What 1.1 fixed:

- **The one-window hiring trap is a costly recovery now, not a lost year** (Phase 39). An adjunct can be hired to any open programme in any week, on a one-year contract, at a premium, and teaches less well. The scripted first hour hired nobody at Budget & Hiring, reached for adjuncts afterwards as a player would, and had a teacher in every programme at the first Convocation. The new "Teaching by the course" note explains adjuncts the first time one is on the roster.
- **The first note says what the founding gift covers, and that borrowing is normal** ("What the gift covers"). A "Where will they be taught?" note matches "Where will they sleep?" (Phase 40).
- **The build menu collapses to a strip while a building is in hand**, and Escape puts the building down. **The title screen blurs what is behind it**, so a first-time player sees one card, not two.
- **The charter picker is on the startup screen** ([01](img/01-charter-picker.jpg)). Each charter says in one line what it costs and what it favours. That is one more decision at founding, but it is readable and has a default.
- The first hour holds: the scripted player reaches the first Convocation with 277 students, beds for 440, seats for 400, dining for 750, and one teacher in each of three programmes ([02](img/02-first-convocation.jpg)).

Where a first-timer can still get stuck:

1. **Selectivity can shrink a college quietly.** A polytechnic that holds 0.72 selectivity for fifty years, which is what the harness's polytechnic does, ends with 800–1,600 students against 3,000 for the same player on the default. It scores a C on two of three seeds, runs short of cash and spends years in distress. Nothing on Admissions Day says the class it will admit is shrinking against the beds and the payroll. Suggest a line under the selectivity dial projecting the class against last year's and against the beds.
2. **Three new notes arrive together for anyone continuing a 1.0 save** mid-run (adjuncts, projects, reputation), since their conditions all hold at once. That is harmless, but a single "What's new in 1.1" note would read better.

## 2. Is it immersive? Does it simulate a real university?

**The texture was excellent at 1.0 and still is. The economics are now honest in the middle, not yet at the end.**

What 1.1 fixed:

- **Prices scale with the college** (Phase 36). The storm letter asks a Year-30 college for a share of its budget, not for $3.5M out of $116M. The median priced choice costs 2–3% of a year's budget from the second decade, where it cost 0.6–1.8% in 1.0. Idle cash sweeps into the endowment above three quarters of a year of expenses.
- **Reputation** (Phase 37): the talk at the gate follows teaching, satisfaction, graduates and the state of the buildings, and moves the pool and the yield. The frugal college's reputation falls to 12–16 by Year 50, and its enrolment to about 410.
- **Satisfaction has diminishing returns and rising expectations** (Phase 38): 0 saturated years on every run, against 11–13 for the steward in 1.0. The Students screen now charts each class as it graduated ([06](img/06-students-year-49.jpg)).
- **Faculty retire and quit** (Phase 39), and adjuncts come and go, so the roster in Year 40 is not the roster of Year 15.
- **Forty-nine new events** (Phase 51) cover what 1.1 added:
  - adjunct unions and contracts;
  - steel prices and a well found under a capital project;
  - each charter's own business: the great books list, the county fair's bees, the engineering students' footbridge;
  - good word of mouth and "What Happened?";
  - the last decades: the last founding professor, the time capsule, a heritage listing on Founders Hall, and "who comes next".

  The steward now meets 129–135 different events in a run, and its President answers 86–89 of them (80 in 1.0).

What still breaks the illusion:

1. **A well-run college still gets rich** ([05](img/05-treasury-year-49.jpg)). In Year 49 the steward takes in $173M and spends $101M, a 42% margin, and its endowment has passed $1.16B. The sweep moved the money out of the current account, which is where 1.0's review saw it, but the endowment's draw then feeds the next year's income, and the surplus compounds. Real colleges run on margins of a few percent. The fix is on the spending side: costs that grow with what a college has become (salary scales that follow prestige, a building's upkeep that grows with its age), and a board that expects a surplus to be spent.
2. **Delegated events used to repeat** without their cooldown, because a seat's answer was not written to the history. Fixed in Phase 51: see "Fixed during this playtest".

## 3. Is it easy to make meaningful progress?

**Better through Year 35. The last decade still thins out.**

- **Capital projects give the middle years something to save for** (Phase 42). The steward opens the Great Lawn around Year 12 and two more projects by Year 30–40, each moving one of the guide's axes for good. The Year-50 campus reads as built rather than stamped ([04](img/04-year-50-campus.jpg)).
- **Decade ambitions** let the college choose one or two public promises at the first Board Meeting of each decade, instead of only being offered one.
- **The screens show the run, not just today** (Phase 48): the League's rank by year ([08](img/08-league-year-49.jpg)), the Treasury's endowment and net, the Students' classes, and the Final Report's six standings over fifty years beside the campus portrait ([07](img/07-final-report.jpg)).
- **The plateau moved later but did not go away.** The steward spends all its project money in the first thirty years ($18M in the first decade, then $115M in one decade, then nothing), and every project it wants is standing by Year 40. After that, the only big things left to want are the ambitions. Suggestions:
  - a second tier of projects that only a large endowment can afford;
  - projects that can be enlarged;
  - late ambitions that ask for a specific use of the endowment ("endow twenty chairs by Year 50").

## 4. Does customisation make each build feel like the builder's?

**Yes, now mechanically as well as visually.**

- **Charters diverge** (Phase 43). The steward on seed 4, under each charter, ends as:
  - a liberal-arts college, Old Money and experience-heavy (B);
  - a research university and research powerhouse (B);
  - a polytechnic (C at 0.72 selectivity, B at the default);
  - a land-grant college, the bargain of its region and a jock school, that wins about a fifth of its seasons (A).
- **No tag is shared by every archetype on any seed.** In 1.0 every archetype earned "Artsy" on every seed.
- **Tags have teeth**: each tag moves the pool and the quality of the class, and says by how much on the League screen.
- **Buildings have silhouettes** (Phase 44): flues on the laboratories, a lit reading room on the library, a fly tower on the theatre, stands along the pitch. **Age is drawn** (Phase 46): streaks, missing slates, boarded windows and, on a historic building, ivy.
- **The hall of fame is a gallery wall** (Phase 49), and winter lights are the first cosmetic unlock.
- Still missing: alternative massings within a style (L-shapes, courtyards), and the other cosmetic unlocks (motif variants, landmark sets).

## 5. Is the pacing balanced?

**Measured, it is inside the design budget. Felt, the middle now moves.**

The steward's evening (DD §2.2, minutes for Years 1–10 / 11–25 / 26–40 / 41–50):

| Build | Seed 4            | Seed 11           | Seed 21           | Budget                        |
| ----- | ----------------- | ----------------- | ----------------- | ----------------------------- |
| 1.0   | 80 / 75 / 60 / 33 | —                 | —                 | 60–80 / 70–90 / 50–70 / 30–45 |
| 1.1   | 73 / 73 / 51 / 30 | 73 / 72 / 50 / 29 | 70 / 68 / 51 / 31 | 60–80 / 70–90 / 50–70 / 30–45 |

- **Beats stop the clock only when there is a decision** (Phase 41). Idle stops fell from 58–82 a run to 8–22. The rest pass in the ticker with a short card, which says what happened and what the seats decided ([03](img/03-year-26-passing-beat.jpg)).
- **Events arrive every 3.2–3.9 weeks in total**, inside §17's 2–4. The President of a staffed college answers one every 10–12 weeks, where it was one in 15 in 1.0: a seat now keeps a handled event's cooldown, so fewer routine questions repeat and more new ones reach the desk.
- **Years 41–50 are at the bottom of the budget** (29–31 minutes against 30–45). This is the late-game plateau from section 3, measured in minutes rather than felt: with the projects built, there is less to stop for.
- **The frugal college still runs long** (about 5 hours: 73 / 83 / 75–80 / 50–53), because fast speeds are bought with seats and it buys none. That is the design's bargain, as in 1.0.

## 6. Is it fun?

**Yes in the opening, the middle and the ending. The last decade is the weak stretch now.**

New fun moments:

- choosing a charter and watching it become a different college;
- the first adjunct saving a term;
- saving for the Great Lawn, and the first Commencement held on it;
- a steel price letter while the research park is going up;
- a decade's promise chosen, not dealt;
- a class that leaves at 84 satisfaction, not 98;
- a title that is an event again;
- the Final Report's chart of fifty years beside the campus it describes.

The fun killers, in order of cost:

1. **Money in the last decade**: a 42% margin and a billion-dollar endowment.
2. **Nothing left to build after Year 40**.
3. **The selectivity trap**, which can quietly shrink a college.
4. **8× on a large campus drops frames** (see Performance).

## Scores, question by question

Scored 1–5 by the reviewer against the same six questions. The 1.0 column scores the 1.0 review's own verdicts, so the two columns are one reader's judgment, not two independent playtests.

| Question         | 1.0 | 1.1 | Why it moved                                                                          |
| ---------------- | --- | --- | ------------------------------------------------------------------------------------- |
| 1. Intuitive     | 3.5 | 4   | The hiring trap, the gift and seats notes, the build strip, the title blur            |
| 2. Immersive     | 3   | 3.5 | Scaled prices, reputation, no saturation, 49 new events; late-game money still unreal |
| 3. Progress      | 2.5 | 3.5 | Projects, decade ambitions, history charts; the last decade still thins               |
| 4. Customisation | 3   | 4   | Charters diverge, tags have teeth, silhouettes and age, the gallery wall              |
| 5. Pacing        | 2.5 | 3.5 | Idle stops down by three quarters or more, spans in budget, events every 3–4 weeks    |
| 6. Fun           | 3   | 3.5 | The middle has decisions with prices; the last decade is still thin                   |

Every question scores at least as well as in 1.0, and the three middle questions (progress, pacing, fun) improve.

## Performance

Production build, headless Chromium with software rendering, a Year-40 steward campus at 8×:

| Build and campus                                               | fps   | 95th-percentile frame | Long tasks in 15 s |
| -------------------------------------------------------------- | ----- | --------------------- | ------------------ |
| 1.0 build, 1.0 campus (31 buildings)                           | 56    | 16.8 ms               | 10–11              |
| 1.1 before Phase 52, 1.1 campus (43 buildings, 3,100 students) | 44–47 | 33.4 ms               | 6–16               |
| 1.1 after Phase 52, 1.0 campus                                 | 57    | 16.8 ms               | —                  |
| 1.1 after Phase 52, 1.1 campus                                 | 47–48 | 33.4 ms               | 0–1                |

Phase 52 found and fixed the build's own regression. Every week the estate's wear made a new placements array, and every layer was keyed on it, so the map rebuilt its walk grid, routes, dressing, crowd and every building each tick. It also made the map draw a deferred state and added a level-of-detail rule at 4× and 8×. On the same campus as 1.0 the build is now as fast as 1.0 and has no long tasks. **The 55-fps gate is not met on the 1.1 steward's own Year-40 campus**, which has 40% more buildings and nearly twice the students, and costs about 9 fps. The next step is a static-layer rule: draw what does not move (ground, buildings, dressing) once into a cached layer, and animate only the crowd over it. A 50-year headless run still takes about 1 s.

The profile also turned up a flaw in how 1.0 was compared: the auto-clicker could not answer a seismic letter in the 1.0 build, so an earlier run measured 1.0 on a held clock. The table above uses a clicker that answers letters, with both builds advancing 21–22 weeks in the window.

## Recommendations for 1.2, in priority order

1. **Late-game money**: costs that grow with prestige and age, and a board that expects surpluses to be spent, until a well-run college's margin sits in single digits.
2. **Something to build after Year 40**: a second tier of projects for large endowments, enlargeable projects, late ambitions that name a use for the endowment.
3. **A static map layer at speed**, to hold 55 fps on a Year-40 1.1 campus at 8×.
4. **Admissions Day projects the class** against last year's class and against the beds, so selectivity cannot shrink a college quietly.
5. **A "What's new" note** for saves carried across versions.
6. **The Stage D items not built**:
   - massing variants (L-shape, courtyard);
   - ticking numbers;
   - the yearbook chronicle;
   - the 390px layout audit;
   - motif variants and landmark sets.
7. **The human steps the plan names**:
   - a listener to set the audio levels on the Phase 50 bench;
   - a person to confirm the Phase 46 and 49 visual judgments on screenshots;
   - `BUTLER_API_KEY` and `ITCH_TARGET` in the repository settings, so a release tag pushes to itch.io as well as building the zip.

## Fixed during this playtest (Phase 52)

- **Frame drops at speed**:
  - the map's layers are keyed on the campus layout, not on the placements array;
  - a building redraws only when its wear crosses a stage;
  - the map draws a deferred state;
  - the crowd rebuilds only when its size changes;
  - the stream's glint is drawn in short runs;
  - at 4× and 8× the season's wash blends at normal and the glint holds still.
- **Chart labels collided** on the Final Report ("Student experience" over "Financial strength") and ran off the right edge. End labels are now spread a line apart, and the margin fits the longest.
- **Titles**: a land-grant steward won 24–30% of its seasons. `ATHLETICS_CLIMB` went from 0.35 to 0.42, which holds it at 19–23%, inside the 10–25% band.
- **The idle-beat measure** counted a Board Meeting that deals the decade's list as idle. It is a decision, and the dashboard now says so.
- **The dashboard** reports unique events met and answered, events answered, letters, and titles over a run.
- Fixed in Phase 51, found while measuring for this review:
  - a delegated event now keeps its cooldown;
  - a note that quotes a standing cost is no longer quoted at the college's scale while the payroll is charged the sum as written.

## Numbers behind this review

| Archetype (seed 4) | Mark · rank at Y50 | Students · faculty | Admin share | Events the President answered | Unique events of 193 (answered · met) | Titles |
| ------------------ | ------------------ | ------------------ | ----------- | ----------------------------- | ------------------------------------- | ------ |
| Steward            | B · 2nd            | 3,095 · 163        | 31%         | 210 (40 seismic)              | 89 · 135                              | 0 †    |
| Growth             | B · 7th            | 4,350 · 200        | 30%         | 185 (37 seismic)              | 68 · 140                              | 0      |
| Frugal             | D · 25th           | 412 · 24           | 46%         | 351 (28 seismic)              | 114 · 114                             | 0      |

† The steward is founded as a research university, which fields no teams. The same steward founded as a land-grant college wins 29 titles on seed 4 (23% of seasons), 24 on seed 11 (19%) and 26 on seed 21 (21%).

The guardrails, all nine runs (DD §17; band in brackets):

- **Saturated years** [0]: 0 on every run.
- **Demand response** [a drop of at least 10%]: −10% to −16% on eight of nine runs. Growth seed 4 is at −9.8%, and frugal seed 4 at −0.8%, where reputation is already at the floor.
- **Idle beats** [25 or fewer]: 8–11 for the steward, 16–22 for growth, 2 for frugal.
- **Tag overlap** [none]: none on every seed.
- **Sting** [1–5% each decade]: 2–4% from the second decade for the steward and growth colleges, with two decades at 0.6% (steward seed 21's third, growth seed 21's fifth). The first decade is 0.6–1.7%, and under 1% on four of six runs, because the catalogue is priced for a founding college. The frugal college spends almost nothing: 0.5–1.0% throughout.
- **Cash cover** [0.25–1.0 years, from Year 20]: 0.76–0.79 for the steward from Year 30. Year 20 is 0.15–0.28, the years a steward pays for a capital project. Growth is 0.1–0.88 across the run. Frugal is 1.3–2.5 from Year 30.
- **Admin share** [25–40%]: 30–35% for steward and growth, 46–50% for frugal (49% in 1.0).
