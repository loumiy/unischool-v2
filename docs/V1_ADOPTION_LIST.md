# What to take from V2 into V1

A running list, feature by feature, of what to keep, modify, scrap or decide later. Built from the owner's notes on V2 and a walk through every V2 feature.

## The owner's notes on V2, in brief

- **The first hour is overwhelming.** Start with limited options, like Cities: Skylines, and unlock content over time. The first focus should be building a curriculum.
- **Too many interrupts**, asking about a university not yet built. No "a student dies" event.
- **Asset variety is the best part of V2**, unlocked over time. Specific art notes are in "Campus art", below.
- **Liked:**
  - alumni giving and reunions;
  - layout with mechanical effects;
  - identity tags (Party School, Teaching College);
  - a named rival;
  - V2's UI layout;
  - walkers;
  - quad recognition;
  - camera controls;
  - building upward;
  - renovation.
- **Disliked:**
  - the stepped calendar (beats that stop the clock);
  - the river;
  - the cars;
  - seasons at this pace;
  - the smaller parcel;
  - V2's athletic facility art.
- **V1 has the better curriculum depth and the better overall structure of mechanics.**

## Facts checked during the walkthrough

- **The parcel really is smaller.** V2's campus is 64 tiles across, V1's is 126, so V2 has roughly a quarter of V1's area.
- **40,000 students is out of reach in V2.** The most any balance run reached was about 5,200.
  - The applicant pool starts at 1,600 a year, and prestige, reputation, beauty and tags multiply it only a few times over.
  - Yield is around 40%.
  - The parcel can't house more than a small fraction of 40,000.
  - Reaching 40,000 would need a much larger pool, a commuter or off-campus mechanic, and the bigger parcel.
- **Bugs seen in V2**, to fix if the feature is adopted:
  - every adjunct in a department has the same name;
  - diner queues draw at half scale and clip through foreground objects;
  - walkers glitch when the camera rotates;
  - cars keep moving while the game is paused.

## Campus art, from the owner's notes

- The library and the conservatory: drop the odd block on top (V2's "reading room" feature).
- The lecture theatre: drop the wide cylinder (the "drum").
- The performing arts centre: drop the giant block (the "fly tower").
- The student centre, dining hall and food hall: drop the blue strip down one side (the "glazed end").
- Most buildings have a path in front of the entrance: not needed.
- The playing field and stadium: the stands overlap the playing surface. Use V1's athletic facilities instead.
- The stadium doesn't read as a stadium, and the Championship Stadium is just a bigger field. It should be a real stadium.
- Grand landmarks reuse assets drawn elsewhere, which undoes the payoff of committing to one and waiting. Each needs bespoke art.
- The observatory should be taller, with more building under the dome.
- The river doesn't look good and adds nothing (scrapped, #35 and #37).
- The cars are rectangles (dropped, #40).
- The diner queues are half scale and clip (dropped, #40).

## Decisions

| #   | Feature                                | Decision     | Notes                                                                                                                                                                                                                                          |
| --- | -------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Charters (founding choice)             | Scrap        | No founding charter. Identity is earned in play.                                                                                                                                                                                               |
| 2   | Onboarding notes                       | Modify       | Keep the one-time letters from officials, tied to a milestone unlock track, so each introduces what just unlocked.                                                                                                                             |
| 3   | Founding sequence                      | Modify       | Start with a short curated build list (Founders Hall, one residence, one dining hall, one academic building). Founding the first school and programs is step one. The rest unlocks by milestones.                                              |
| 4   | Calendar beats                         | Decide later | V2's four clock-stopping moments. Alternative: always-open panels that take effect at the next term, with calendar moments as ticker cards.                                                                                                    |
| 5   | Speed tiers earned by delegation       | Keep         | 1× and 2× free, 4× needs a Provost, 8× needs a Provost and three deans.                                                                                                                                                                        |
| 6   | Inline events (ticker questions)       | Modify       | Keep the writing, the stated defaults and the weighting toward what the player caused. Hold events back early and scale the cadence with the college's size.                                                                                   |
| 7   | Seismic letters (clock-stopping)       | Keep         | The rare, long, full-screen letters, as V2 has them.                                                                                                                                                                                           |
| 8   | Seasons on the map                     | Decide later | Options: one subtle cue only, or a setting that's off by default.                                                                                                                                                                              |
| —   | "A student dies" event (`the-loss`)    | Scrap        | From the owner's notes: no tragic interrupts of this kind.                                                                                                                                                                                     |
| 9   | Treasury model                         | Keep         | Sticker price minus aid, housing and dining fees, endowment draw rate, gifts. Expense lines. Buildings financed by cash, debt or gift.                                                                                                         |
| 10  | Distress ladder                        | Keep         | Sound → Tight → Deficit → Freeze → Austerity → Receivership, with board letters and cuts. No bankruptcy.                                                                                                                                       |
| 11  | Administrative ratchet                 | Modify       | Keep the admin-share figure and the permanent cost of seats. Drop standing costs added by events.                                                                                                                                              |
| 12  | Scaled prices and the cash sweep       | Modify       | Keep event prices that scale with the budget. No automatic sweep: moving cash into the endowment is a player action only.                                                                                                                      |
| 13  | Schools and programs                   | Scrap        | Keep V1's curriculum.                                                                                                                                                                                                                          |
| 14  | Faculty market and profiles            | Modify       | Keep the profiles: rank, two skills (teaching, research), a quirk, a field. The market is always open, with a slowly refreshing pool of candidates. No hiring window.                                                                          |
| 15  | Adjuncts                               | Scrap        | Not needed once hiring is always open.                                                                                                                                                                                                         |
| 16  | Faculty churn                          | Modify       | Keep retirement and poaching with counter-offers. Drop random quitting.                                                                                                                                                                        |
| 17  | Admissions funnel                      | Decide later | V2's sticker and selectivity dials, a pool shaped by prestige, beauty, price, tags and reputation, and beds capping the class. If adopted, add a projection line: expected class against beds and last year.                                   |
| 18  | Satisfaction and attrition             | Keep         | Itemised signed terms, rising expectations, diminishing returns above 80, attrition from unhappy classes.                                                                                                                                      |
| 19  | Named students                         | Decide later | 3–5 per class with ticker arcs. The smaller option was 1–2, seen only at arrival and graduation.                                                                                                                                               |
| 20  | Reputation                             | Modify       | Fold into one standing with prestige, answering to both the rankings and quality (teaching, satisfaction, outcomes, condition).                                                                                                                |
| 21  | Class memory and alumni ledger         | Keep         | A one-line memory per class sets its warmth. Warmth, means and time since graduating drive annual-fund giving for decades.                                                                                                                     |
| 22  | Reunions                               | Keep         | Pay to warm a class a little, up to a ceiling.                                                                                                                                                                                                 |
| 23  | Campaigns                              | Keep         | Multi-year drives for a building, the endowment or aid. Classes give more when the cause matches their memory. Asking cools warmth. The money is restricted to its purpose and can pay for buildings.                                          |
| 24  | Delegation seats                       | Keep         | Provost, a Dean per school, Facilities, Dean of Students, VP Advancement. Filled from faculty or from outside. Each answers its domain's routine events by policy, and together they unlock speeds.                                            |
| 25  | Ambitions                              | Keep         | Public promises with a deadline, a reward and a penalty, offered at Convocation.                                                                                                                                                               |
| 26  | Decade ambitions                       | Keep         | At the first Board Meeting of each decade, choose one or two promises from a short list.                                                                                                                                                       |
| 27  | Capital projects                       | Modify       | Keep the mechanic: big, slow builds that lift a league standing, payable half from the endowment. Redesign the set and the art: V1-style athletic facilities and a real stadium. Add a later tier so there's something to build after Year 40. |
| 28  | Historic status                        | Keep         | Buildings 25+ years old can be declared Historic: prestige, warmth and ivy, costlier upkeep, demolition politics. Founders Hall can't be demolished.                                                                                           |
| 29  | League table and prestige              | Modify       | Adopt V2's league and six standings (academics, research, student experience, athletics, access, financial strength) with a fixed methodology. Keep V1's larger pool of schools.                                                               |
| 30  | Identity tags                          | Keep         | Party School, Teaching College, Research Powerhouse, Old Money, Jock School, The Bargain, Pressure Cooker, Commuter, Artsy: earned from play, moving the pool, favouring related events, with their reasons shown.                             |
| 31  | The rival                              | Keep         | A neighbouring college by table position: ticker taunts, a board-meeting line, extra intensity in athletics, faculty poaching.                                                                                                                 |
| 32  | Athletics                              | Modify       | Adopt V2's system: varsity teams need venues, a lean/standard/ambitious budget, seasons, a schedule that climbs as the college rises, titles feeding the standing and the Jock School tag. Keep V1's facilities, or improve on them.           |
| 33  | Layout effects and campus beauty       | Keep         | Beauty from greenery, landmarks, condition and quads feeds applications and satisfaction. Small pairing bumps. All layout effects capped at about 12%.                                                                                         |
| 34  | Quad detection                         | Modify       | Detect quads automatically. Paths are part of a quad and never split it. Also let the player designate a quad by hand when detection misses one. New: curved and diagonal paths.                                                               |
| 35  | Paths and reachability                 | Modify       | Adopt painted paths, walkers preferring them, desire lines, and the rule that every building must be reachable from the road. Scrap the stream and the footbridge entirely.                                                                    |
| 36  | Condition, renovation, building upward | Keep         | Backlog from underfunded maintenance, visible weathering, failure events, renovation under scaffolding, added storeys.                                                                                                                         |
| 37  | The parcel                             | Modify       | Keep V1's large parcel, with no stream. Borrow the road edge and the founding woodland: trees to clear or keep, which feed beauty.                                                                                                             |
| 38  | Walkers                                | Modify       | Adopt V2's walkers on real routes, cut by walls. Rethink the walker-to-student ratio for V1's scale of 40,000+ students. Fix the rotation glitch.                                                                                              |
| 39  | Ground dressing                        | Modify       | Keep desire lines and bike racks. Lamps and benches are placed by the player along paths, not scattered by rule (their spacing was odd). Scrap the rest: bins, entrance aprons, car park, bus stop.                                            |
| 40  | Crowds, queues and cars                | Modify       | Keep crowds in the stands on game weeks only. Drop the dining queues and the cars.                                                                                                                                                             |
| 41  | Building catalogue (~44 types)         | Modify       | Port the catalogue, gated behind the milestone unlock track: a few types at founding, more as enrolment, schools and prestige grow. Apply the Campus art fixes.                                                                                |
| 42  | Building features (silhouettes)        | Modify       | Keep only the parts that read well: flues, flagpoles, balconies. Drop or redesign the reading room, drum, fly tower and glazed end. No V2 stands.                                                                                              |
| 43  | Landmarks and grand landmarks          | Modify       | Keep the mechanic: pick one of three grand landmarks, a long build, a big payoff. Give each bespoke art, built in visible stages.                                                                                                              |
| 44  | Visible age                            | Keep         | Streaks, lost slates, boarded windows, and for derelict buildings weeds and a fence. Ivy on historic buildings.                                                                                                                                |
| 45  | Camera controls                        | Keep         | Pan (WASD or arrows), quarter-turn rotation (Q/E), ten tilt pitches (Z/X), zoom, Home to reset. Fix the walkers under rotation.                                                                                                                |
| 46  | Colours on campus                      | Keep         | The college's flag over Founders Hall and admin. Banners on lamp posts at Convocation and Commencement (lamps are player-placed, #39).                                                                                                         |
| 47  | Construction on the map                | Keep         | A crane and scaffolding drawn as solid shapes, the building rising over its build weeks, a progress bar. Scaffolding for renovations.                                                                                                          |
| 48  | Trees                                  | Keep         | A founding woodland. Plant or fell by tile (broadleaf, conifer, ornamental). Trees count toward beauty. Events can plant or take trees.                                                                                                        |
| 49  | UI shell                               | Scrap        | Keep V1's layout. The owner's first notes said they liked V2's UI layout, so this may need another look (see the end).                                                                                                                         |
| 50  | Event panel                            | Modify       | Port the panel: domain stripe, choices with prices, countdown, "Left alone, this settles as…". Events come less often, and none in the first year.                                                                                             |
| 51  | History charts                         | Keep         | Rank by year (League), endowment and net (Treasury), each class's size and satisfaction (Students), six standings over the run (Final Report).                                                                                                 |
| 52  | Explanations and accessibility         | Keep         | Every number explains itself on hover. Itemised breakdowns. Settings for text size, colour-blind-safe colours and reduced motion.                                                                                                              |
| 53  | The chronicle                          | Keep         | A History screen that writes the run as eras named from what happened, each with its firsts, buildings, crises and classes.                                                                                                                    |
| 54  | The Final Report                       | Keep         | At Year 50: a mark graded over the whole arc, the six standings with first- and last-decade averages, a title built from the tags, the guide's last word, a campus portrait, a fifty-year chart.                                               |
| 55  | The Epilogue                           | Keep         | Play on after the report, with a chronicle addendum every ten years.                                                                                                                                                                           |
| 56  | Hall of fame and unlocks               | Modify       | Finished runs hang on the title screen as framed portraits with plaques. Replace winter lights with other unlocks, such as motif variants and landmark sets.                                                                                   |
| 57  | Audio                                  | Keep         | Synthesised from a data file. Four state-driven themes with B sections, ambience scaled by enrolment, a stadium roar, effects, and a listening bench. The levels still need tuning by ear.                                                     |
| 58  | Writing voice and style guide          | Modify       | Adopt `content/STYLE.md`, but use the wry satire sparingly. A joke works the first time only, so keep jokes out of text that repeats often (notices, recurring cards, tooltips).                                                               |
| 59  | Simulation architecture                | Keep         | Pure, dependency-free sim: state plus actions, a weekly tick, one seeded random generator, every action logged for exact replay, versioned saves with migrations, content in validated data files.                                             |
| 60  | Balance and dev tools                  | Keep         | Headless balance dashboard (three archetypes, three seeds, guardrails), event reachability test, scripted new-player browser run, performance profiler, debug panel.                                                                           |

## Summary

- **Keep:** 29. **Modify:** 23. **Scrap:** 4. **Decide later:** 4. Plus one owner-requested scrap, the "student dies" event.
- **Still to decide:**
  - #4, calendar beats;
  - #8, seasons;
  - #17, the admissions funnel;
  - #19, named students.
- **New work that isn't in V2**, needed by the decisions above:
  - A **milestone unlock track**, Cities: Skylines style. It drives the founding build list (#3), the onboarding notes (#2) and the building catalogue (#41). V2 has no equivalent, so it's the biggest new design task.
  - An **always-open faculty market** with a slowly refreshing candidate pool (#14).
  - **Curved and diagonal paths**, and **quads designated by hand** (#34).
  - **Player-placed lamps and benches** (#39).
  - **Walker scaling for 40,000+ students** (#38).
  - A **later tier of capital projects** and a **real stadium** (#27, #32).
  - **Bespoke grand landmark art**, built in stages (#43).
- **Points to check against each other:**
  - #49 scraps V2's UI shell, but the first notes said V2's UI layout was liked. Worth confirming which parts, if any, to borrow.
  - #5 keeps speed tiers that are unlocked by delegation seats (#24, kept), and 8× needs three deans, which assumes V1's curriculum has schools a dean can sit over (#13 keeps V1's curriculum).
  - #7 keeps clock-stopping seismic letters, while #6 and #50 cut how often events come and hold them back in the first year. A cooldown or first-year hold for letters too would keep the two consistent.
