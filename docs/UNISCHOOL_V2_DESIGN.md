# UniSchool v2 — Design Document

**Version:** 1.0 · **Status:** Target for "finished for now"
**Genre:** University management / institution builder · **Stack:** React + TypeScript + Vite
**Platform:** Desktop browser first; tablet-friendly later; Steam/itch packaging is a post-1.0 concern.

Sections are numbered (§) for reference from the Development Plan.

---

## §1. Vision

**One evening. Fifty years. One patch of land.**

UniSchool v2 is a one-sitting institution builder: fifty years of a university's life in 3–5 real hours. The player founds a small college on a fixed canvas, grows it into whatever their choices make it, absorbs a constant weather of money trouble and campus absurdity, and at year fifty receives a chronicle of what they built. The finished school — its campus portrait, its title, its story — hangs in a hall of fame beside the very different schools from previous runs.

The variety engine is the player, not the generator. Same land every run, same systems, no procedural terrain, no dealt starting hands. Replay value comes from expression: a different strategy, a different layout, a different identity, a different fifty years.

### §1.1 The five pillars

Every design decision must serve at least one pillar and contradict none.

1. **One evening, fifty years.** Every system must be readable at speed. If a mechanic requires study, it is wrong. Target run length: 3–5 hours to the year-50 report.
2. **The canvas is finite.** Building is aesthetic and expressive; the drama of the late game is that the land fills and you must argue with your own past — renovate, build up, or demolish something someone loves.
3. **Money is the weather.** The primary pressure is financial: tuition dependence, donor moods, maintenance debt, and the permanent ratchet of administrative growth. A university cannot die — but it can stagnate, freeze, and be humiliated.
4. **The institution remembers.** Graduating classes carry a stamped memory of their four years. Alumni giving, board pressure, and the final chronicle all flow from that ledger. Decisions in year 8 pay or bite in year 35.
5. **Wry, humane voice.** The writing is affectionate satire of academia. The comedy is real (committees, donors with conditions, rankings methodology changes); the stakes underneath it are sincere.

### §1.2 What this game is not

Not a spatial optimization puzzle (placement bonuses are light and capped). Not a failure-driven roguelike (no death, no dealt hands). Not a people-drama sim (faculty are competence and cost, not ego webs). Not endless (year 50 is the ending; the epilogue is a coda, not the game).

---

## §2. The Player and the Run

### §2.1 Three hats, sequenced

The player is architect, president, and historian — in that order, because the delegation arc (§9) rotates the hats:

- **Years 1–12, the Operator.** You touch everything: every hire, every hall, every course decision. Time moves slowly. The campus is small enough that you know it completely.
- **Years 13–35, the Executive.** Deans and offices absorb detail. You set direction, approve budgets, take the big swings, and fight the fires that escalate past your delegates. Time moves faster because you have bought the machinery that lets it.
- **Years 36–50, the Steward.** The land is full, the institution mostly runs itself, and your job is legacy: what gets preserved, what gets rebuilt, what this place will be called when the chronicle closes.

### §2.2 The real-time pacing budget

Fifty years in 3–5 hours averages ~5 minutes per year, front-loaded:

| Span | Real-time target | Character |
|---|---|---|
| Years 1–10 | 60–80 min | Hands-on founding; slow clock; tutorialization by consequence |
| Years 11–25 | 70–90 min | Growth, crunches, delegation begins; speed unlocks |
| Years 26–40 | 50–70 min | Land fills; renovation era; steward altitude |
| Years 41–50 | 30–45 min | Fast, ceremonial, consequence-harvesting |
| Report & chronicle | 10–15 min | The payoff artifact |

This budget is a tuning target (Plan Phase 31), not an enforced clock. Sessions are savable; "one evening" is the designed shape, not a requirement.

### §2.3 The ending

At Year 50, Week 1: the run formally ends. The Chronicle (§12) is generated, the Final Report grades the run, the school receives its title, and the hall-of-fame entry is written. Then the player may continue in **Epilogue mode**: the sim runs on indefinitely, with a light "decade addendum" appended to the chronicle every ten years. Nothing new unlocks in epilogue; it exists so no one is ripped away from a campus they love.

### §2.4 The founding moment (starting state)

The founding hall is the player's first act, not a pre-placed fixture. Completing the startup flow (name, motif, palette — §13.1) leads directly into placing **Founders Hall** — one multi-purpose building rendered in the chosen motif and palette — as the literal first action of the run. It anchors §6.5's founding-hall historic candidacy and gives every run a founding moment the chronicle can name. The land is otherwise empty at the start; starting cash is a `tuning.ts` constant; the first class arrives at the first Convocation (§3.3).

---

## §3. Time and the Calendar

### §3.1 Continuous time

Time is continuous with pause, Cities: Skylines style. The base tick is one **week**. The year has three terms — Fall (14 wks), Spring (14 wks), Summer (8 wks) — totaling 36 ticks per year. The campus map is always the home screen; management screens overlay it; the sim keeps running under open screens unless paused.

**Dates are run-relative.** Time is labeled "Year 1" through "Year 50" everywhere — the chrome clock, the ticker, the chronicle, the final report — in v1's format: *Year 12 · Fall Term · Week 3*, where the week counts within the current term (Fall 1–14, Spring 1–14, Summer 1–8). Class labels derive from the run year: the class graduating in Year 34 is "the Class of '34." There are no real-world calendar years anywhere: §16 excludes historical eras, and real years would promise era content the game deliberately does not build.

### §3.2 Speed tiers are earned by delegation

Speeds: **pause / 1× / 2× / 4× / 8×.** The top tiers are gated by administrative capacity (§9): 4× requires an appointed Provost; 8× requires the Provost plus at least four school Deans. Rationale: fast time is only safe when the institution can make routine decisions without you — so the player literally purchases fast-forward with payroll. This is the load-bearing mechanic that makes §2.2's budget possible and makes administrative bloat (§5.4) a real bargain rather than a tax.

### §3.3 Calendar beats

Fixed annual moments create the decide/watch rhythm. Each is a bounded screen, entered from a ticker prompt, resolvable in 1–3 minutes:

- **Spring, Week 10 — Admissions Day.** Set tuition and selectivity for the incoming class (§8.2).
- **Summer, Week 4 — Budget & Hiring.** Approve next year's budget; the hiring market is open (§7.3).
- **Fall, Week 1 — Convocation.** New class arrives; year report card lands; ambitions may be dealt (§10.2).
- **Fall, Week 12 — Board Meeting.** The board reacts to the year: confidence shifts, demands, and (in distress) impositions (§5.5).

Everything else — building, curriculum development, event resolution — is continuous and interruptible.

---

## §4. Systems Overview

Six deep systems, one cross-cutting mechanic. The discipline of pillar 1: **no seventh deep system.** Anything else must be a shallow feature of one of these.

| # | System | One line | Section |
|---|---|---|---|
| 1 | Treasury | Money in, money out, and the ladder of distress | §5 |
| 2 | Campus | The finite canvas: placement, beauty, condition, renovation | §6 |
| 3 | Academics | Schools, programs, faculty, teaching quality | §7 |
| 4 | People & Memory | Cohorts, the named cast, the alumni ledger | §8 |
| 5 | Events & Ambitions | The weather of curveballs and the temptation of goals | §10 |
| 6 | Reputation & the World | Prestige, identity, the league of rivals | §11 |
| — | Delegation | Cross-cutting: buys speed, automates detail, ratchets cost | §9 |

---

## §5. Treasury (System 1)

### §5.1 Revenue

- **Tuition** — enrollment × net tuition. Dominant early; tuition dependence above ~75% of revenue is flagged as fragility and amplifies the pain of enrollment misses.
- **Endowment draw** — a set percentage (default 4.5%, adjustable 3–6%) of the endowment. Overdrawing is possible and quietly corrosive (board confidence, donor mood).
- **Donations** — annual fund (flows from the alumni ledger, §8.4) plus discrete gift events (§10.1), which frequently come with conditions.
- **Research overhead** — a percentage skim on research activity (§7.5).
- **Auxiliaries** — housing and dining margins; athletics ticket revenue once venues exist.

### §5.2 Expenses

- **Payroll** — faculty and administration. Administration only ratchets (§5.4).
- **Maintenance** — per building, scaling with size and age. Underfunding is allowed and creates Backlog (§6.4).
- **Financial aid** — the gap between sticker and net tuition; the primary access lever.
- **Debt service** — construction can be debt-financed; the board caps leverage.
- **Program & student life costs** — per active program, club, and varsity team.

### §5.3 Presentation

One Treasury screen: a cashflow strip (weekly in/out), the year budget, tuition dependence gauge, endowment, backlog total, and administrative share of payroll. Every number on it must be explainable in one tooltip sentence. The weekly cashflow figure is always visible in the app chrome (as in v1).

### §5.4 The administrative ratchet

Every delegation (§9), every office, and several event resolutions add **permanent recurring cost**. Admin cost can be cut only through a painful "restructuring" action (board approval, morale hit, a term of chaos events). This is the satire made mechanical: the machinery that makes the game playable at speed is the machinery bleeding you. The Treasury screen tracks "administrative share of payroll" as a visible creeping figure; certain events and board remarks react to it.

### §5.5 The distress ladder (struggle, not death)

There is no bankruptcy. Financial failure is a ladder, each rung survivable and narratable:

1. **Tight** — reserves under one term of expenses. Warning tone; donors murmur.
2. **Deficit** — spending exceeds revenue for 3+ consecutive terms. Board confidence drains.
3. **Freeze** — reserves exhausted: no new construction, no new hires, no new programs until two consecutive surplus terms.
4. **Austerity** — sustained freeze: the board imposes it. The player must choose cuts from a board-authored list (close a program, cut aid, defer all maintenance, restructure admin). Ambitions are locked. Campus visuals dull slightly. Prestige decays.
5. **Receivership-lite** — sustained austerity: the board installs an interim CFO for 3 years; budget sliders lock to board policy; the player retains building/curriculum direction but not the checkbook. Exit restores full control and produces a permanent chronicle scar.

Climbing down the ladder is always mechanically clear ("two surplus terms," visible on the Treasury screen).

---

## §6. Campus (System 2)

### §6.1 The canvas

One fixed map for every run: a bounded parcel (grid-based, ~64×64 tiles of buildable land) with a fixed frame of terrain features (tree line, a stream on one edge, a road frontage). No procedural variation. Players learn the land the way chess players learn the board; layouts differ because players differ.

### §6.2 Placement is expression, lightly rewarded

Free grid placement of buildings, paths, trees, gardens, plazas, statues, and landmarks — the v1 motif system (Georgian, Collegiate Gothic, Classical, Mission, Modern) and color palettes carry forward and remain per-building selectable. Placement bonuses exist but are small and capped so aesthetics dominate:

- **Quad bonus** — buildings enclosing a green space gain a small appeal bonus; the game detects and *names* quads (player-editable names).
- **Pairings** — dorm near dining, labs near their school's hall, athletics near fields: small satisfaction or output bumps.
- **Campus Beauty** — a campus-wide score from greenery, landmarks, coherent motifs, and enclosed spaces; feeds application volume (§8.2) and appears in rankings flavor.

**Hard cap:** no placement-derived effect may exceed ~12% of any output. The player who ignores all of it and builds for beauty must remain fully viable. (Guardrail, see §17.)

### §6.3 Ambient life

The map is the watch-state between decisions: students walk paths between the buildings they actually use, densities follow the weekly class schedule, the stadium fills on game weeks, the quads empty in summer, seasons tint the palette. Ambient life is presentational — derived from sim state, never simulated individually — but it is the single biggest carrier of the "watching it grow" feeling and is budgeted accordingly.

### §6.4 Condition, backlog, and renovation

Buildings age. Funded maintenance holds condition; underfunding accrues **Backlog** per building. High-backlog buildings visibly weather, throw failure events (§10.1), and sap satisfaction. Renovation clears backlog and can **upgrade in place** — more capacity, a new motif, or (mid-game unlock) additional stories, the release valve for a full canvas.

### §6.5 Historic status and the politics of demolition

At age 25, buildings may gain **Historic** status (higher odds for the founding hall, named quads' enclosures, and buildings with strong class memories attached, §8.4). Demolishing a historic building costs alumni goodwill and donor mood, triggers protest events, and permanently marks the chronicle. Sometimes it is still the right call. This is pillar 2's centerpiece: the late game is arguing with your own past, and the game makes the argument audible.

### §6.6 The full-canvas late game

Around years 25–35 a healthy school fills the land. Building shifts to rebuilding: renovation, vertical growth, demolition politics, and beautification. The Build menu reorients to reflect this (renovation tab surfaces first when land is scarce). There is no land expansion purchase — the boundary is the point.

---

## §7. Academics (System 3)

### §7.1 Reimagined granularity: programs, not courses

v1 managed 427 individual courses; at five minutes per year, that is the wrong unit. v2's unit is the **program** (≈ a major). Courses still exist as generated flavor — a program's catalog listing shows auto-composed course names taught by its faculty — but the player's decisions are per-program. The v1 curriculum screen's visual language (the card rows, development states, the wall of empty slots) carries forward; its content is programs and their tiers.

### §7.2 Structure

- **6 Schools:** Arts & Letters · Science · Engineering · Business · Health · Law. Each school is founded explicitly (a building + a founding cost + a dean seat), and founding order is a defining strategic choice.
- **~30 Programs** distributed across schools. Each program has three tiers: **Founded → Established → Renowned.** Advancing a tier requires investment (money + a qualified senior hire + time) and raises capacity, quality ceiling, and prestige contribution.
- **Signature Programs:** the player may designate up to 3 programs as signatures — cheaper to advance, weighted in identity (§11.2) and rankings, and expected: letting a signature decay is a public embarrassment (events fire).

### §7.3 Faculty

Faculty are competence and cost, deliberately not ego-sims. Each hire has: teaching skill, research skill, salary, seniority, and one **quirk** — a single flavorful modifier ("beloved lecturer: +morale, −publications"; "grant magnet"; "never on campus Fridays"). Quirks are the personality budget: one line, mechanically real, wry in voice. The hiring market refreshes at the Summer beat (§3.3); rivals (§11.3) can poach your stars with outside offers you may counter (at ratcheting salary cost) or absorb.

### §7.4 Teaching quality and program quality

Program quality = faculty quality assigned to it × tier × facility condition, damped by overcrowding (seats vs. enrollment). Program quality drives student satisfaction, outcomes (§8.3), and the Academics prestige axis.

### §7.5 Research (shallow feature, not seventh system)

Research is deliberately compact: a school with a lab facility and research-skilled faculty can run **one commissioned research line at a time** (pick topic breadth/depth, fund it, wait). Outputs: publications (steady prestige drip), occasional breakthroughs (prestige spike + donor interest + an event), and overhead revenue (§5.1). No tech tree, no per-project management. Research is a strategic posture — some schools will be built on it, others will ignore it entirely — not a minigame.

---

## §8. People and Memory (System 4)

### §8.1 The 40,000-character illusion

Students are simulated as **cohorts** (per program, per class year) carrying aggregate satisfaction, quality, and outcome distributions. On top of the aggregate, each incoming class surfaces **3–5 named students** — portrait, program, and a scripted-from-state arc of 3–5 ticker beats across their four years ("Ada Okafor (CHEM '31) switched to English after the lab flooding"; "…won the Rhodes"; "…dropped out during the austerity year"). Named students are a **lens on the aggregate** — their arcs are selected to dramatize what the numbers already say — never a separate simulation.

### §8.2 Admission

At Admissions Day (§3.3) the player sets **tuition** and **selectivity**; the applicant pool's size and shape were already determined by prestige, beauty, price position, and — crucially — **perceived identity** (§11.2): a party school draws party applicants; a research powerhouse draws grinds. You reap what you're known for, not what you say you are. The resulting class's size, quality, and revenue then simply *happen to you*, and housing/dining capacity constrain it physically (overflow forces triples, an instant satisfaction hit and a class-memory stamp).

### §8.3 Four years and out

Cohorts progress annually: satisfaction (from housing, teaching, campus beauty, student life, current events) and quality (from program quality) evolve; attrition removes students from unhappy or low-quality cohorts; graduation converts cohorts to alumni.

### §8.4 The alumni ledger and class memory

At graduation each class is stamped with a **class memory**: one generated line summarizing their four years ("The Class of '34: overcrowded, under-heated, national champions"). The memory sets that class's baseline **warmth**, which decades later drives annual-fund giving, campaign response (§9.3), reunion events, and the occasional named alum returning as donor, regent, or public critic. Warmth can be nudged later (reunions, outreach, honorary degrees) but never rewritten — the ledger is the game's long memory and the mechanical heart of pillar 4. Named students' outcomes (§8.1) echo here: the student the player watched in year 12 is the donor — or the op-ed author — of year 38.

### §8.5 Student life (shallow feature)

Clubs, Greek life, and varsity athletics are toggled investments with facility requirements, a satisfaction contribution, an identity contribution (§11.2), and an event surface (chapter scandal, championship run). No roster management; athletics seasons resolve as periodic results influenced by facilities and an athletics budget slider.

---

## §9. Delegation (cross-cutting)

### §9.1 Seats

Delegable seats: **Provost** (academic routine), **six Deans** (one per founded school), **Facilities Director** (maintenance triage), **Dean of Students** (student-life routine), **VP of Advancement** (donor routine, unlocks campaigns). Each seat is filled from senior faculty (cheaper, morale-positive, removes them from teaching) or outside hire (better, pricier, ratchet-heavier).

### §9.2 What a seat does

Each filled seat (a) **automates** a category of routine decisions according to a one-choice policy slider the player sets ("Facilities: triage worst-first / protect historic / cheapest-first"), (b) **filters events** — minor events in its domain auto-resolve per policy and appear as ticker notices rather than choices, and (c) **contributes to speed gating** (§3.2). Escalations still reach the player: anything touching money above a threshold, historic buildings, or ambitions always surfaces.

### §9.3 Advancement (donor machinery)

The VP of Advancement unlocks **campaigns**: multi-year fundraising drives against a stated goal (a building, endowment growth, aid). Campaign response is computed from the alumni ledger — which classes are warm, which are wealthy now, which the goal resonates with. Campaigns are the late-game's primary revenue swing and the ledger's payoff surface.

### §9.4 The cost

Every seat adds permanent payroll and a step of administrative ratchet (§5.4). The full executive suite roughly doubles administrative share of payroll across a run. The player should feel the trade every time: speed and sanity, purchased with structural cost.

---

## §10. Events and Ambitions (System 5)

### §10.1 The event weather

Events are frequent — the world keeps punching — and almost all resolve **inline in the ticker**: the ticker item expands to a sentence of setup and 2–3 choice chips; unresolved events time out to a stated default after a few weeks. The game does not pause for them. **Seismic events** (recession, major scandal, storm damage, a protest era, a transformative bequest) are rare — a handful per run — and do pause, presented as full-screen letters.

Event sourcing is weighted toward **consequence**: the engine prefers firing events whose preconditions the player caused (high backlog → failure events; overcrowding → housing events; high admin share → bureaucracy comedy; a rival's rise → poaching). Pure randomness exists but is the minority. Frequency scales down slightly per delegation seat (that's what the seats are for) and up during distress.

**Content targets:** ~120 inline events + ~20 seismic at 1.0, each with 2–3 choices, written to the voice guide (§13.3). Authoring pipeline is data-driven (JSON + conditions + effects) so content grows cheaply post-1.0.

### §10.2 Ambitions: dealt temptations

At milestones and Convocations, the game deals **ambition offers** — concrete, public commitments with a deadline, a reward, and a failure cost ("Field a varsity football team in a proper stadium within 8 years"; "Place three programs in the national top ten by year 30"; "Grow the endowment past $500M before the founder's centennial"). The player holds at most **3 active ambitions**; declining is free; accepting is public. Success: prestige, board confidence, donor enthusiasm, a chronicle entry. Failure: board confidence hit, a prestige dent, and a wry chronicle entry. Ambitions are the overreach engine (pressure #2): the game's job is to make the player want one more than they can afford.

A run's dealt pool (~24 ambitions at 1.0) is filtered by school identity and state, so ambitions feel aimed at *this* university.

---

## §11. Reputation and the World (System 6)

### §11.1 Prestige

Prestige is the long-term composite across six axes (kept from v1's report card): **Academics, Research, Student Experience, Athletics, Access, Financial Strength.** Axes move slowly; prestige is a trailing indicator by design — you cannot buy it this year, only earn it over an era.

### §11.2 Perceived identity

Separately from prestige, the school accrues **identity tags** derived from behavior: *Research Powerhouse, Teaching College, Party School, Jock School, Artsy, Commuter, Country Club, Pressure Cooker, The Bargain, Old Money.* Tags are earned and shed slowly, are visible ("what the guidebooks say"), shape the applicant pool (§8.2), color event selection and writing, and headline the final report's title. Identity is the mechanical answer to "a university that is uniquely theirs."

### §11.3 The league

A background league of **24 AI schools** simulated shallowly: each has prestige axes, an identity, and simple annual drift plus reactions (a rising school poaches; a falling one sheds faculty you can grab). A **rankings screen** shows the annual table — with a deliberately quirky methodology that occasionally *changes*, to the visible outrage of everyone (satire hook and a genuine strategic wrinkle). One league school emerges as **the rival** through organic triggers (geographic proximity on the fictional map, repeated athletic meetings, a poached dean) and thereafter gets extra presence: taunting ticker items, head-to-head framing at board meetings, a dedicated line on the rankings screen. Rivals exist to make year 40 tense when the campus is finished; they are pressure #3 and sized accordingly — no deep AI, just a living table.

---

## §12. Endgame: Chronicle, Report, Hall of Fame

### §12.1 The chronicle

Generated at year 50 (and viewable in draft anytime as "the History screen"): the run's fifty years partitioned into **named eras** detected from state trajectory ("The Founding," "The Hargrove Years," "The Troubles," "The Second Campaign"), each era summarized with its defining events, buildings, classes, and numbers; notable alumni (drawn from named students, §8.1) with their outcomes; a building timeline; the rival saga. The chronicle is the historian-hat payoff and the run's primary artifact — written in the game's voice, exportable as an image/text share sheet.

### §12.2 The final report

Six-axis grading (§11.1) against the fifty-year arc, ambition record, financial verdict, the identity title — a composed line, e.g., *"Blackmoor University: a research powerhouse that never learned to feed its undergraduates"* — and a final mark. The report judges the whole arc, not the final snapshot: a school that rose from austerity outranks one that coasted.

### §12.3 Hall of fame and cosmetic meta

Each completed run hangs in the **hall of fame**: campus portrait (a rendered map snapshot), name, colors, title, final grades, and chronicle link. Meta-progression is deliberately light: completed runs unlock **cosmetics only** — additional palettes, motif variants, statue and landmark sets, seasonal decorations. Nothing mechanical is ever gated. The hall is the reason to play again; the cosmetics are the souvenir.

---

## §13. Presentation

### §13.1 Art direction

Carry forward v1's visual identity wholesale: the isometric campus map, the five architectural motifs, the palette system, the cream/maroon/gold UI chrome, the startup flow (name, motif, colors — "Open the Doors"). Evolve rather than replace: richer ambient life (§6.3), seasonal tinting, weathering states for backlog, and a consistent iconography pass. The startup screen and map are the two things v1 already got right; v2's art budget goes to making the map feel *alive* rather than making it different.

### §13.2 UI shell

Keep v1's layout grammar: persistent bottom bar (Campus · Curriculum · Faculty · Students · Treasury · League · History · Build), top-left identity chip, top-right speed controls and date, bottom ticker with the NEXT prompt. Full-screen management overlays in v1's card style (the curriculum screen's visual language generalizes to all screens). Two additions: the ticker becomes the event-resolution surface (§10.1), and every screen obeys the **one-tooltip rule** — any number explained in one sentence on hover.

### §13.3 Writing voice

Wry, affectionate satire of academia; sincerity underneath. House rules: institutions are absurd, individuals are humane; jokes live in specifics ("the Committee on Committee Reform"), never in mockery of students; distress is written straight — austerity is not funny to the people in it; every event's choices are labeled with honest verbs, not gags. Calibration examples to be maintained in a style guide file alongside event content:

> *"The Faculty Senate has voted 31–2 to express 'grave concern' about the parking situation. It is unclear what they would like you to do, and neither of the two dissenters can be located."*
> — [Fund a parking study · $250k] [Express reciprocal concern · Free]

> *"Hurricane damage to Whitfield Hall is worse than feared. The engineers' report uses the word 'char' as a verb."*
> — [Full renovation · $12M] [Stabilize and defer · $3M, +Backlog] [Demolish · the Class of '41 will write letters]

### §13.4 Audio (1.0 scope)

A small, state-aware music system: a founding theme, a growth theme, a distress undertone, a late-game/ceremonial theme, seasonal ambience on the map (crowd murmur scaling with enrollment, stadium roar on game weeks). SFX for placement, money, ticker, and the year-turn. Nothing adaptive beyond state switching.

---

## §14. Content Budgets ("finished for now")

| Content | 1.0 target |
|---|---|
| Schools | 6 |
| Programs | 30 (each ×3 tiers) |
| Building types | ~40 (across academic, residential, dining, life, athletics, admin, landmarks) + renovation/vertical variants |
| Motifs / palettes | 5 motifs (from v1) / 8 palettes + unlockable cosmetic sets |
| Inline events | ~120 |
| Seismic events | ~20 |
| Ambition pool | 24 |
| Named students | 3–5 per class (portrait pool ~80, arc-beat templates ~60) |
| Faculty quirks | ~40 |
| Identity tags | 10 |
| League schools | 24 (named, crested, persistent within a run) |
| Era name templates | ~30 |

---

## §15. Technical Architecture

- **Sim/UI separation.** The simulation is a pure TypeScript core (no React imports): `state + actions → tick(state) → state`, advanced on a fixed weekly tick by a driver. UI subscribes to snapshots. This enables headless fast-simulation for balance testing (Plan Phase 31) and keeps 8× speed cheap.
- **Determinism.** Single seeded RNG stream owned by the sim core; identical seed + action log replays identically. (The seed varies per run for event/market variety — "same blank slate" refers to the map and starting conditions, not the RNG.)
- **State shape.** One serializable state tree; save = state + version + action log tail. Saves in IndexedDB with autosave every year-turn and manual slots; export/import as file. Schema versioning with migrations from day one.
- **Rendering.** The map remains SVG/DOM (proven in v1) unless profiling in Phase 31 forces a canvas layer for ambient students; ambient life is interpolated presentation from sim state, decoupled from tick rate.
- **Content as data.** Events, ambitions, programs, buildings, quirks, era templates: JSON with a small condition/effect DSL, validated at build time. Writing lives in content files, not code.
- **Performance target.** 50 years at 8× with a full campus at 60fps on a mid-range laptop; headless 50-year sim in under 60 seconds.

---

## §16. Out of Scope (the cut list)

Explicitly not in this version, however tempting: historical eras and founding scenarios · procedural terrain or multiple maps · faculty relationship/ego simulation · roster-level athletics · course-level curriculum management · land expansion · multiplayer or shared leagues · mobile layouts · difficulty modes (one tuned experience; the distress ladder is the difficulty) · mod support (data-driven content keeps the door open; the door stays closed for 1.0).

---

## §17. Design Tensions and Guardrails

Named so they get watched, not rediscovered:

1. **Depth vs. the evening.** "C:S-middle depth" and "3–5 hours" coexist only because there are six systems, not ten. Any proposed mechanic must name which existing system it belongs to or which it replaces.
2. **Aesthetic freedom vs. bonuses.** The ~12% cap (§6.2) is a hard rule. If testing shows players min-maxing layout instead of expressing, lower the cap.
3. **Event frequency vs. flow.** "Frequent curveballs" must not become notification fatigue: budget ~1 player-decided event per 2–4 weeks of sim time at mid-game, declining with delegation. Tune in Phase 31.
4. **Named students must stay a lens.** The moment a named student needs their own simulation to stay coherent, the feature has overgrown; arcs are selected from cohort truth.
5. **The ratchet must hurt but not dominate.** Administrative share of payroll should land at 25–40% by year 50 for a normal run — felt, complained about, survivable.
6. **The chronicle is the score.** Any feature that makes players optimize a number at the expense of a story is suspect; the final report grades arcs, not snapshots.
