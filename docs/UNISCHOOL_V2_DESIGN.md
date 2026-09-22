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

| Span               | Real-time target | Character                                                     |
| ------------------ | ---------------- | ------------------------------------------------------------- |
| Years 1–10         | 60–80 min        | Hands-on founding; slow clock; tutorialization by consequence |
| Years 11–25        | 70–90 min        | Growth, crunches, delegation begins; speed unlocks            |
| Years 26–40        | 50–70 min        | Land fills; renovation era; steward altitude                  |
| Years 41–50        | 30–45 min        | Fast, ceremonial, consequence-harvesting                      |
| Report & chronicle | 10–15 min        | The payoff artifact                                           |

This budget is a tuning target (Plan Phase 31), not an enforced clock. Sessions are savable; "one evening" is the designed shape, not a requirement.

### §2.3 The ending

At Year 50, Week 1: the run formally ends. The Chronicle (§12) is generated, the Final Report grades the run, the school receives its title, and the hall-of-fame entry is written. Then the player may continue in **Epilogue mode**: the sim runs on indefinitely, with a light "decade addendum" appended to the chronicle every ten years. Nothing new unlocks in epilogue; it exists so no one is ripped away from a campus they love.

### §2.4 The founding moment (starting state)

The founding hall is the player's first act, not a pre-placed fixture. Completing the startup flow (name, motif, palette — §13.1) leads directly into placing **Founders Hall** — one multi-purpose building rendered in the chosen motif and palette — as the literal first action of the run. It anchors §6.5's founding-hall historic candidacy and gives every run a founding moment the chronicle can name. The land is otherwise empty at the start; starting cash is a `tuning.ts` constant; the first class arrives at the first Convocation (§3.3).

The player types only half the name. Every school opens as _"<Name> College"_: the second word is fixed at founding and carved into the facade on the startup screen rather than typed, so the institution reads as permanent without a caption saying so. Whether and how a school later becomes a _University_ is an event's business (§10.1), not the founding screen's.

---

## §3. Time and the Calendar

### §3.1 Continuous time

Time is continuous with pause, Cities: Skylines style. The base tick is one **week**. The year has three terms — Fall (14 wks), Spring (14 wks), Summer (8 wks) — totaling 36 ticks per year. The campus map is always the home screen; management screens overlay it; the sim keeps running under open screens unless paused.

**Dates are run-relative.** Time is labeled "Year 1" through "Year 50" everywhere — the chrome clock, the ticker, the chronicle, the final report — in v1's format: _Year 12 · Fall Term · Week 3_, where the week counts within the current term (Fall 1–14, Spring 1–14, Summer 1–8). Class labels derive from the run year: the class graduating in Year 34 is "the Class of '34." There are no real-world calendar years anywhere: §16 excludes historical eras, and real years would promise era content the game deliberately does not build.

### §3.2 Speed tiers are earned by delegation

Speeds: **pause / 1× / 2× / 4× / 8×.** The top tiers are gated by administrative capacity (§9), and have been since Phase 20: 4× requires an appointed Provost; 8× requires the Provost plus at least four school Deans. Rationale: fast time is only safe when the institution can make routine decisions without you — so the player literally purchases fast-forward with payroll. This is the load-bearing mechanic that makes §2.2's budget possible and makes administrative bloat (§5.4) a real bargain rather than a tax.

### §3.3 Calendar beats

Fixed annual moments create the decide/watch rhythm. Each is a bounded screen, entered from a ticker prompt, resolvable in 1–3 minutes:

- **Spring, Week 10 — Admissions Day.** Set tuition and selectivity for the incoming class (§8.2).
- **Summer, Week 4 — Budget & Hiring.** Approve next year's budget; the hiring market is open (§7.3).
- **Fall, Week 1 — Convocation.** New class arrives; year report card lands; ambitions may be dealt (§10.2).
- **Fall, Week 12 — Board Meeting.** The board reacts to the year: confidence shifts, demands, and (in distress) impositions (§5.5).

Everything else — building, curriculum development, event resolution — is continuous and interruptible.

**Beats hold the clock.** A beat fires on the week-tick that lands on its week, and no further week passes until its screen is resolved by an action; the ticker's NEXT slot carries the prompt, and closing the screen without deciding leaves the beat waiting. Speed may still be set while a beat waits, and the clock resumes at that speed. The hold is the sim's, not the UI's, so a replay, a headless run and the live game wait at the same weeks; every beat has a stated default (§10.1's rule, applied to beats) that a headless run or a delegated seat resolves it with. Year 1 is the founding year: the doors open in its first week, so the first Convocation proper — and with it the first class (§2.4) — is Year 2's, after the run's first Admissions Day.

---

## §4. Systems Overview

Six deep systems, one cross-cutting mechanic. The discipline of pillar 1: **no seventh deep system.** Anything else must be a shallow feature of one of these.

| #   | System                 | One line                                                    | Section |
| --- | ---------------------- | ----------------------------------------------------------- | ------- |
| 1   | Treasury               | Money in, money out, and the ladder of distress             | §5      |
| 2   | Campus                 | The finite canvas: placement, beauty, condition, renovation | §6      |
| 3   | Academics              | Schools, programs, faculty, teaching quality                | §7      |
| 4   | People & Memory        | Cohorts, the named cast, the alumni ledger                  | §8      |
| 5   | Events & Ambitions     | The weather of curveballs and the temptation of goals       | §10     |
| 6   | Reputation & the World | Prestige, identity, the league of rivals                    | §11     |
| —   | Delegation             | Cross-cutting: buys speed, automates detail, ratchets cost  | §9      |

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
- **Debt service** — construction can be debt-financed; the board caps leverage at a share of the endowment. Interest accrues weekly on the balance and each loan's principal retires over a fixed term.
- **Program & student life costs** — per active program, club, and varsity team.

**The fiscal year and the founding gift.** The fiscal year is the calendar year: the budget approved at Budget & Hiring (Summer, Week 4) takes effect at the next Convocation (Fall, Week 1), when the old year closes into the treasury's history. Year 1 runs on a founding budget struck at the default draw. The founding gift is two `tuning.ts` constants, cash in hand and an invested endowment; the endowment earns each fiscal year's **market return**, drawn around a mean with a spread and accrued in equal weekly slices, and pays out its draw the same way. Market years are the world's weather, not the run's dice: the return is derived from the seed and the year, so nothing the player does changes what the markets did. Budget lines that later systems fill (tuition, aid, faculty payroll, maintenance, debt, programs) exist at zero from the start, labelled with the phase that fills them.

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

**The ladder's clock.** The board reads the books once a term, when a term closes. Reserves are operating funds against one term of budgeted expenses. The ladder moves at most one rung a term except that exhausted reserves go straight to Freeze; two consecutive surplus terms with cash in hand climb back from Freeze or Austerity to wherever the conditions then put the college. A year frozen brings Austerity; a year of Austerity brings the interim CFO, whose term is fixed at three years whatever the books do. Board confidence (0–100) rises with sound surpluses and falls with deficits, freezes, austerity, an overdrawn endowment and students in triples. The board writes a letter, presented full-screen and holding the clock like a beat, at every rung entered on the way down, at the CFO's departure, and on the return to a sound footing. Under austerity the Board Meeting will not adjourn without a cut from the board's list; if the administration chooses none, the board chooses. The interim CFO does not borrow, and the freeze bans new construction as well as hires and programs; renovation is never banned.

---

## §6. Campus (System 2)

### §6.1 The canvas

One fixed map for every run: a bounded parcel (grid-based, ~64×64 tiles of buildable land) with a fixed frame of terrain features (tree line, a stream on one edge, a road frontage). No procedural variation. Players learn the land the way chess players learn the board; layouts differ because players differ.

### §6.2 Placement is expression, lightly rewarded

Free grid placement of buildings, paths, trees, gardens, plazas, statues, and landmarks — the v1 motif system (Georgian, Collegiate Gothic, Classical, Mission, Modern) and color palettes carry forward and remain per-building selectable. Placement bonuses exist but are small and capped so aesthetics dominate:

- **Quad bonus** — buildings enclosing a green space gain a small appeal bonus; the game detects and _names_ quads (player-editable names).
- **Pairings** — dorm near dining, labs near their school's hall, athletics near fields: small satisfaction or output bumps.
- **Campus Beauty** — a campus-wide score from greenery, landmarks, coherent motifs, and enclosed spaces; feeds application volume (§8.2) and appears in rankings flavor.

**Hard cap:** no placement-derived effect may exceed ~12% of any output. The player who ignores all of it and builds for beauty must remain fully viable. (Guardrail, see §17.)

**Beauty, for now.** Campus Beauty is a weighted mean of four shares: greenery, the trees standing against a share of the founding woodland (felling for a footprint lowers it, planting raises it); landmarks, the open buildings' beauty marks from the catalogue against a full set; upkeep, the open buildings' mean condition, because backlog is ugly; and enclosure, the quads the buildings make. Coherence takes its share when motifs become per-building. Beauty reaches the applicant pool and satisfaction only through the capped aggregation below. Every term shows its share where the score is read.

**Quads, pairings and the cap, for now.** A quad is detected, not declared: a patch of ground that is not built on, is neither water nor road, does not reach the edge of the parcel, is neither smaller than a gap between buildings nor as large as the rest of the campus, and is bounded mostly by walls. What it is worth is its enclosure, lifted by how much of it is lawn rather than paving; a few good ones make a full enclosure mark for beauty. The game names every quad it finds and the player may rename any of them; a name belongs to the space's anchor corner, so a quad rebuilt from that corner is a new quad, named afresh. Pairings are rules in a content file — dorms near dining, labs near their hall, the library among the halls — each paying its points for the share of the eligible buildings that have their partner within a short walk.

**What to plant (Phase 21A).** A tree is one integer and nothing else — its species, its size and where in its tile it stands all come back out of that seed — so the player choosing a broadleaf, a conifer or an ornamental does not widen the save: the sim hands back a seed that already means the kind asked for, found by walking forward from the one the run's dice gave it. Planting therefore costs the run exactly one number from its stream whether or not a kind was asked for, and an action log replays the same either way. "Whatever grows" remains the default, and is what every tree planted before the picker existed still is.

**Everything placement is worth passes through one function and one cap.** Beauty's swing and every pairing are summed per output and clamped to the cap (§17.2) before the sim sees them: satisfaction gets a single Placement term, the applicant pool a single factor. A new placement effect adds a term there and cannot widen the total. The arithmetic is shown rather than applied quietly — the raw sum, the cap, and what was actually used — so a player can see both that arranging well is worth something and that ignoring it costs little.

### §6.3 Ambient life

The map is the watch-state between decisions: students walk paths between the buildings they actually use, densities follow the weekly class schedule, the stadium fills on game weeks, the quads empty in summer, seasons tint the palette. Ambient life is presentational — derived from sim state, never simulated individually — but it is the single biggest carrier of the "watching it grow" feeling and is budgeted accordingly.

**Ambient life, for now.** Walkers are the enrolment, one for every few students up to a fixed cap, thinned by the term — full in fall and spring, a trickle in summer — and they stop with the clock. Each walks a real route between two buildings the campus uses, chosen with a weight for where students live and where they go, along the cheapest way over the grid: paths first, lawn when there is no path, never through a building or the stream. Routes are found on the map's own grid and cached; walkers hide behind the walls they pass, and they carry no state the sim can see — their randomness is the map's, never the sim's stream. The lawn and the trees tint with the term: fresh in spring, sun-bleached in summer, turning through the fall.

### §6.4 Condition, backlog, and renovation

Buildings age. Funded maintenance holds condition; underfunding accrues **Backlog** per building. High-backlog buildings visibly weather, throw failure events (§10.1), and sap satisfaction. Renovation clears backlog and can **upgrade in place** — more capacity, a new motif, or (mid-game unlock) additional stories, the release valve for a full canvas.

**Construction, upkeep and the bill for neglect.** Every building type carries a build cost, an annual upkeep and a build time in the catalogue. Placing one breaks ground: the cost is paid at once, in cash or borrowed against the board's line, and the site rises on the map over its build weeks before the doors open — Founders Hall included, so the run's first year is spent building it. Upkeep grows with a building's age. At Budget & Hiring the player sets how much of the year's required maintenance the budget funds; the unfunded share accrues to each open building's **Backlog**, which compounds while it waits, and a building's **condition** is simply how much of its value the backlog has eaten — it weathers on the map as condition falls. Renovation pays the backlog plus a contractor's fee and closes the building for the works; demolition costs a share of the build cost. Construction money sits outside the income statement as the year's capital spend.

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

**Founding and opening, for now.** A school is founded in an open hall of its own — Founders Hall may house the first, and every Academic Hall houses one — for a founding cost, and its dean seat stays vacant until delegation arrives. A program opens inside a founded school for an opening cost and then costs every year at its tier: the tier sets its teaching seats, how many course levels are on the catalogue, and its cost factor. Every program opens at Founded; advancement and signatures follow. A program's six courses are generated flavour: two a level, numbered from the program's code, revealed a level at a time as the tier rises. Closing a program is free and immediate; under austerity the board's "close a program" cut closes the newest. A freeze bans founding and opening alike.

**Advancing and signatures, for now.** Advancing a tier is begun with the money in hand and a senior hire of the next tier's rank assigned to the program — an Associate Professor to reach Established, a Professor to reach Renowned — and then takes its years; the works finish only with such a lead still in place, and wait, noted, until one is. The tier reached raises the seats, the courses on the catalogue, the annual cost and the quality ceiling; its prestige contribution waits for the axis. A tier is held the same way it was reached: a program above Founded that goes a year without its lead, or under half the staff its seats need, is neglected, and two such years running drop it a tier. Up to three programs are signatures, named and dropped freely: a signature advances at half the cost, and a signature that decays is a public embarrassment — the board's confidence takes it now, and the events will make a scene of it later. A freeze bans advancing with the rest.

### §7.3 Faculty

Faculty are competence and cost, deliberately not ego-sims. Each hire has: teaching skill, research skill, salary, seniority, and one **quirk** — a single flavorful modifier ("beloved lecturer: +morale, −publications"; "grant magnet"; "never on campus Fridays"). Quirks are the personality budget: one line, mechanically real, wry in voice. The hiring market refreshes at the Summer beat (§3.3); rivals (§11.3) can poach your stars with outside offers you may counter (at ratcheting salary cost) or absorb.

**Hiring, for now.** The market is listed the moment Budget & Hiring fires and closes when the budget is approved: whoever is not hired by then takes another offer. The candidates who exist a given summer are the world's, like the market return — drawn from the seed and the year, not the run's dice — though most of them work in fields the college has founded, because that is where the searches are. A hire has a rank (assistant, associate, full) that sets a base salary, two skills that move it, one quirk that may discount or inflate it, and a field; they teach one program in that field at a time, or none, and they join the payroll the week they sign. Dismissal pays a term's salary in severance; closing a program leaves its faculty on the roster, between programs and still paid. The freeze (§5.5) is a hiring freeze first of all. Poaching, counters and delegation follow with their phases.

### §7.4 Teaching quality and program quality

Program quality = faculty quality assigned to it × tier × facility condition, damped by overcrowding (seats vs. enrollment). Program quality drives student satisfaction, outcomes (§8.3), and the Academics prestige axis.

**Quality, for now.** Faculty quality is the mean effective teaching of the hires assigned, quirks counted, damped by understaffing: a tier's seats over one hire's teaching load is the staff it needs, and short of that the quality falls in proportion. The tier's factor lifts it and the condition of the school's hall wears it. A program with nobody assigned has no quality. The campus's teaching, as the cohorts feel it at Convocation (§8.3), is program quality averaged over the open programs — nothing to study is nothing — and enters satisfaction as a swing about a neutral line, with the quirks' morale on top, capped. Overcrowding waits for enrollment by program.

### §7.5 Research (shallow feature, not seventh system)

Research is deliberately compact: a school with a lab facility and research-skilled faculty can run **one commissioned research line at a time** (pick topic breadth/depth, fund it, wait). Outputs: publications (steady prestige drip), occasional breakthroughs (prestige spike + donor interest + an event), and overhead revenue (§5.1). No tech tree, no per-project management. Research is a strategic posture — some schools will be built on it, others will ignore it entirely — not a minigame.

---

## §8. People and Memory (System 4)

### §8.1 The 40,000-character illusion

Students are simulated as **cohorts** (per program, per class year) carrying aggregate satisfaction, quality, and outcome distributions. On top of the aggregate, each incoming class surfaces **3–5 named students** — portrait, program, and a scripted-from-state arc of 3–5 ticker beats across their four years ("Ada Okafor (CHEM '31) switched to English after the lab flooding"; "…won the Rhodes"; "…dropped out during the austerity year"). Named students are a **lens on the aggregate** — their arcs are selected to dramatize what the numbers already say — never a separate simulation.

**The lens, for now.** Three to five of every arriving class are given a name, a face and the program they came to read; the game says who they are in the ticker as the class arrives. A beat is a template in a content file with a CONDITION attached — a named fact about their class at that moment: the triples it arrived into, the crowding it eats and studies in, the teaching it is getting, the buildings coming up or falling down around it, the rung of the ladder it is living on, whether its own program still exists. Only beats whose condition holds are eligible, so the writing is selected from cohort truth rather than invented on top of it; each student hears each beat once, a couple of beats are told each Convocation, and a handful in a lifetime, so the ticker stays a ticker. Someone the game is following leaves when their class is losing people, and graduates with one of the outcomes their class actually had, drawn in its own proportions. Their dice come off the seed rather than the run's stream, and nothing about them is read back by any system: the lens can be lifted off a run and every number underneath it is unchanged, which is the guardrail as arithmetic rather than intention.

### §8.2 Admission

At Admissions Day (§3.3) the player sets **tuition** and **selectivity**; the applicant pool's size and shape were already determined by prestige, beauty, price position, and — crucially — **perceived identity** (§11.2): a party school draws party applicants; a research powerhouse draws grinds. You reap what you're known for, not what you say you are. The resulting class's size, quality, and revenue then simply _happen to you_, and housing/dining capacity constrain it physically (overflow forces triples, an instant satisfaction hit and a class-memory stamp).

**The funnel, for now.** Until prestige (§11.1) and identity (§11.2) are live, the pool is a base scaled by a prestige stub, by campus beauty (§6.2) within its cap, and by price position against a market sticker: applications and yield both fall as the sticker rises. Selectivity is the share of the pool turned away; the admitted are the top of a normal quality distribution, so a selective office buys quality with numbers. Financial aid is a standing discount on the sticker until it becomes the access lever. The office counts the beds that will exist at the coming Convocation, sites included, and closes the file early at the beds plus a triples allowance.

### §8.3 Four years and out

Cohorts progress annually: satisfaction (from housing, teaching, campus beauty, student life, current events) and quality (from program quality) evolve; attrition removes students from unhappy or low-quality cohorts; graduation converts cohorts to alumni.

**The year's two moments.** Cohorts are one per class year, labelled by the year they graduate. Commencement is the first week of summer: the class whose year it is graduates into the ledger. Convocation is the first week of fall: every cohort's satisfaction is re-scored from the campus as it stands (beds, dining seats, teaching seats, the buildings' condition; teaching and student life when they arrive), attrition thins each cohort at a rate rising with unhappiness, and the class committed at Admissions Day arrives. Tuition, aid and auxiliaries follow the students enrolled week by week.

**Quality, attrition and outcomes, for now.** Satisfaction is a sum of signed terms, each traceable: a base; what the beds, the dining seats and the teaching seats fail to cover; the buildings' condition; the teaching (§7.4) about a neutral line; the faculty's quirks; the campus's beauty about the middle (a stub until the campus is scored, §6.2); and the conditions of the day, which is what living through each rung of the ladder costs. Each Convocation a continuing cohort's quality closes part of the gap to the teaching it had, so a class admitted strong is wasted by weak programs and a class admitted weak is lifted by strong ones; attrition rises below a satisfaction line and again below a quality line, cohort by cohort. At Commencement a class is scored — quality weighted against how it left — and its outcomes fixed as counts: the distinguished, rising with the score above the middle; the adrift, a base rising as the score falls below it; the placed, the rest. Outcomes are stamped on the ledger for the class memory and the warmth that follow (§8.4).

### §8.4 The alumni ledger and class memory

At graduation each class is stamped with a **class memory**: one generated line summarizing their four years ("The Class of '34: overcrowded, under-heated, national champions"). The memory sets that class's baseline **warmth**, which decades later drives annual-fund giving, campaign response (§9.3), reunion events, and the occasional named alum returning as donor, regent, or public critic. Warmth can be nudged later (reunions, outreach, honorary degrees) but never rewritten — the ledger is the game's long memory and the mechanical heart of pillar 4. Named students' outcomes (§8.1) echo here: the student the player watched in year 12 is the donor — or the op-ed author — of year 38.

**The ledger, for now.** A class is stamped at Commencement from the journal of its four years and the numbers it left with: each clause in a content file names a condition — beds that went out from under them, a department that closed, a freeze or an austerity or the receivers, a school founded, buildings rising, how they felt, how they turned out — and a class earns every clause it deserves. Warmth counts all of them; the LINE quotes the loudest few, because a memory is one sentence and not a transcript. Note what is deliberately NOT a clause: the admissions office fills the beds and the triples allowance every year, so ordinary crowding is the normal state of the place and worth remarking on only when it is worse than that.

Warmth pays out through the annual fund, week by week: a class gives by its warmth, its means, and how long it has had to get established, so nobody gives much in their twenties and a warm class keeps giving for forty years. A reunion costs a little and warms a class a little, up to a fixed ceiling — nudged, never rewritten. The point of the whole arrangement is arithmetic rather than sentiment: a housing crunch in year 12 is still measurably thinning the annual fund in year 30, and the ledger screen shows the line, the warmth and the cheque side by side so the player can trace it.

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

**Campaigns as built (Phase 21).** A campaign is a row in `src/content/campaigns.json` with a kind (building, endowment or aid), a target, a term in years, `when` terms over the same closed vocabulary events and ambitions use, and — the half that is new — a list of **memory clauses it resonates with** (§8.4). The Housing Campaign resonates with `overcrowded` and `thinned`; the Aid Campaign with `thinned`, `adrift`, `austerity` and `cuts`. A class that carries the clause takes the case for support personally and gives to it; a class that does not gives anyway, less. The loader refuses a campaign that names a clause no memory file defines, because a typo there would silently mean "nobody feels asked" rather than failing to load.

**The take is the annual fund's own arithmetic, asked harder.** Each week a campaign raises, class by class, on the same three terms §8.4 already uses — warmth, means, maturity — multiplied by the campaign's pull and by how personally the class takes it. So the ledger is not a number the campaign consults; it is the thing that answers, and the screen shows which four years are paying, loudest first, with the ones the case is about marked as such. A cold class gives nothing to a perfect case, which is the ledger's whole point.

**Asking spends warmth.** Every week a campaign asks, the classes it is asking cool slightly. §8.4's "nudged, never rewritten" runs both ways: a campaign spends the warmth the college banked rather than earning more of it, which is what stops a big ledger being free money and what makes the VP's "ask about them first" policy mean something.

**Restricted funds (§5.1).** What a campaign raises is restricted to what it was raised for, and stays restricted whether the drive met its number or not. Endowment money goes straight into the fund; building and aid money waits in its own pot. Construction gained a third financing beside cash and debt — `gift` — which spends building money and nothing else, and which the game offers first when it is available, because restricted money cannot be spent on anything else anyway. **A missed campaign is partial credit, not a loss:** the shortfall is in the wording, the money is in the pot.

**What it is worth, measured at both ends.** A college that has built a ledger — sixteen buildings, thirty faculty, forty years — answers a campaign with about $5M a year, comfortably funding a building over a term. A college that built almost nothing answers the same case with about a fifteenth of that and misses its number, keeping what it raised. The targets in the file are calibrated to the first of those, so the second is not a trap so much as an honest quotation: the panel tells the player what the ledger would give **before** they launch, and a thin ledger says so in that figure. The spread between those two colleges is wide enough that the numbers are a Phase 31 tuning question rather than a settled one, and are recorded here as measurements rather than decisions.

### §9.4 The cost

Every seat adds permanent payroll and a step of administrative ratchet (§5.4). The full executive suite roughly doubles administrative share of payroll across a run. The player should feel the trade every time: speed and sanity, purchased with structural cost.

**The seats as built (Phase 20).** Ten of them: the Provost, one Dean per _founded_ school (so the Dean's seat does not exist until there is a school to be dean of), the Facilities Director, the Dean of Students and the VP of Advancement — whose campaigns (§9.3) are Phase 21's, while the seat, its payroll and its ratchet are here. Each is filled once, from the roster or from outside, and paid for forever: a year of the salary up front and the salary on the admin line every year after, with the internal appointment cheaper, and costing a programme its lecturer, because an internal appointment stops teaching.

**A policy is a preference over effects, not per-event authoring.** Each seat offers three policies that map to three rules the engine applies to whatever the event already carries: take the cheapest way through, take the thorough way and the bill, or take whichever lands best with the students. The rules are universal; the labels are the seat's own, because a Provost and a Facilities Director do not describe the same instinct the same way. This is what makes delegation content-free — a seat can handle an event written years later without either knowing about the other. The DD's own example named "protect historic" as a Facilities policy; that one is not built, because nothing in the state yet distinguishes a historic building from an old one, and a policy the engine cannot honour is worse than one it does not offer.

**What escalates (§9.2), exactly.** A seismic letter, anything whose largest choice moves more than the escalation threshold in cash or endowment, and anything in a domain with no seat. Every event carries a `domain`, and two of the six — `money` and `board` — have no seat at all. That is deliberate: some things are the President's, and a rule about escalation means nothing if everything can be delegated away.

**What it is worth, measured.** A college with every seat filled reaches 8×, pays over a million a year in salaries it can never stop paying, more than doubles its administrative payroll, and over the same twelve years is asked fewer questions and has more of them handled. The bargain is legible in both directions on one screen: the org chart shows the top speed the college has bought and the salaries it is bleeding, side by side, and a filled seat keeps saying what it costs and since when.

**Not built, and named here so it is not assumed.** §5.4's restructuring — the painful, board-approved way to cut administrative cost — has no action yet, so seats are one-way. A run can buy the suite and cannot sell it, which makes the ratchet a ratchet, but leaves the "painful way back" the DD promises for a later phase.

---

## §10. Events and Ambitions (System 5)

### §10.1 The event weather

Events are frequent — the world keeps punching — and almost all resolve **inline in the ticker**: the ticker item expands to a sentence of setup and 2–3 choice chips; unresolved events time out to a stated default after a few weeks. The game does not pause for them. **Seismic events** (recession, major scandal, storm damage, a protest era, a transformative bequest) are rare — a handful per run — and do pause, presented as full-screen letters.

Event sourcing is weighted toward **consequence**: the engine prefers firing events whose preconditions the player caused (high backlog → failure events; overcrowding → housing events; high admin share → bureaucracy comedy; a rival's rise → poaching). Pure randomness exists but is the minority. Frequency scales down slightly per delegation seat (that's what the seats are for) and up during distress.

**Content targets:** ~120 inline events + ~20 seismic at 1.0, each with 2–3 choices, written to the voice guide (§13.3). Authoring pipeline is data-driven (JSON + conditions + effects) so content grows cheaply post-1.0.

**The engine, as built (Phase 17).** An event is a row in `content/events.json`: an id, a kind, a weight, a cooldown in years, a `when` map of clauses, a sentence, a timeout in weeks, two or three choices with an optional price note, and the id of the choice it settles into unanswered. Clauses and effects are two closed vocabularies — a clause names a reading of the state and an effect names a lever the engine can pull — so a writer can reach nothing the engine has not agreed to, and a content file can never smuggle in code. Both lists live in `src/content/events.ts` and grew with the writing: forty-four readings across the calendar, the treasury, the ladder, the estate, the campus, the faculty, the programmes, the students and the ledger, and ten levers (`cash`, `endowment`, `debt`, `confidence`, `mood`, `backlog`, `warmth`, `quality`, `enrollment`, `trees`). The vocabulary is kept honest from the other end too: a test fails if the file declares a reading no event reads, or a lever no choice pulls. Consequence weighting is arithmetic on the clauses: an event's weight is multiplied by a constant for each clause it carries, so an event the college had to earn outranks one that could happen to anybody. Subjects (`{building}`, `{faculty}`, `{class}`) are resolved once, at firing, so a sentence does not drift while it waits. The effects of a choice land through the levers and, for the students, through **mood**: a small signed term of satisfaction (§8.3's "current events") that the last few events leave behind and that fades over a year or two, so a run's weather is felt and then forgotten.

**Cadence, measured twice.** With the eleven proof events of Phase 17, an attentive decade asked about one question and a neglected decade asked seven or eight: the pool was empty most weeks, so the content's conditions set the cadence and the engine's odds never got a say. With the batch-1 catalogue (Phase 18: sixty-four inline, six seismic) the pool is rarely empty, and the cadence is the odds again — about one and a half to two questions a year, every decade of a fifty-year run, with twenty or more distinct events in a single run. Consequence-weighted sourcing did not stop working when the file filled up; it stopped showing as _volume_ and started showing as _kind_. Both colleges get weather, and the separation is total: the roof, the slates, the flooded basement and the cold lecture theatre are asked only of the administration that let them happen, and the college that paid its maintenance bill never hears about any of them.

**A threshold is a claim about a distribution, and the run is the only authority on it.** Phase 18 wrote fifteen thresholds that measurement then moved. Some sat in the tail — `teachingOver: 55` against a teaching quality that tops out near 49, `warmthOver: 55` against a ledger that averages thirty — and would have fired for nobody. Two sat above the ceiling of their own reading and were therefore _always_ true, which is worse: a clause that cannot fail is not a clause, and the event it belongs to fires everywhere. The engine cannot catch either, because both are well-formed data; only a run can. So the catalogue is guarded by a test that walks five colleges — one minded, one let go, one run well, two run into the ground different ways — and asserts that every event in the file can happen to at least one of them, reporting the observed range of any reading whose event never came up.

**Answers compound into the estate.** A seismic event left to its stated default defers real damage: an unanswered fire closes the east end and adds to the backlog, that backlog compounds at the estate's own rate, and the estate's failure events then become eligible on a college that has been paying its maintenance bill in full. Condition is no longer a function of the maintenance slider alone — it is a function of the slider and of whether the post gets answered — and a college that ignores its letters for twenty years ends up with a building the inspector writes about.

**Where an event lives on screen.** The inline panel is the ticker strip's own storey: it sits above the strip, over the map, and the clock keeps running underneath it. It steps aside for a full screen rather than floating over that screen's buttons — from inside a screen the NEXT slot names the question instead and takes the player back out to the map to answer it. A seismic event is a letter in the board's shell (§5.5) under the president's letterhead, and it holds the clock on exactly the same footing as a letter from the board: the same hold, and the same default resolution if a headless run steps past it.

### §10.2 Ambitions: dealt temptations

At milestones and Convocations, the game deals **ambition offers** — concrete, public commitments with a deadline, a reward, and a failure cost ("Field a varsity football team in a proper stadium within 8 years"; "Place three programs in the national top ten by year 30"; "Grow the endowment past $500M before the founder's centennial"). The player holds at most **3 active ambitions**; declining is free; accepting is public. Success: prestige, board confidence, donor enthusiasm, a chronicle entry. Failure: board confidence hit, a prestige dent, and a wry chronicle entry. Ambitions are the overreach engine (pressure #2): the game's job is to make the player want one more than they can afford.

A run's dealt pool (~24 ambitions at 1.0) is filtered by school identity and state, so ambitions feel aimed at _this_ university.

**Ambitions are slow events (Phase 19).** An ambition is a row in `src/content/ambitions.json` and reads and writes through the **same two closed vocabularies the events use**: `deal` and `goal` are clauses over the same forty-odd readings, and `reward` and `penalty` pull the same levers. There is no second engine — an ambition is an event with a date on it instead of a choice, and nothing an ambition can reach is anything an event could not. The loader refuses two things a writer will otherwise do: a goal with no clauses, and a goal the dealing terms already satisfy (a promise that is true the day it is made is a report, not a temptation).

**The year's turn is where promises are made and kept.** Convocation deals at most one offer, answered on the beat screen as part of resolving it — so the offer needs no hold of its own, and the answer rides on the same action as the rest of the year's turn. Declining is free and is what happens if the player says nothing, which is the whole temptation: the cost of a promise is only ever paid by the college that made one. The same Convocation reads out every promise whose date has arrived, pays or charges for it, and takes it off the docket. Three at once is the cap, and the panel says so when it is reached.

**The docket lives on the History screen**, which is the chronicle in draft (§12.1) and which Phase 26 will fill properly. An ambition kept or missed _is_ a chronicle entry — it is written in the content file, in the college's own voice, and the journal carries it warmly or otherwise — so the promises are the chronicle's first tenant rather than a panel that will have to move.

**Reachability is a content invariant, not a code one.** The Phase 18 lesson applies to ambitions with one extra edge: an ambition whose terms never hold is never dealt, and one whose goal is out of reach is not a temptation but a trap. Both are well-formed data, so the same guard covers them — the scripted colleges of `src/sim/colleges.ts` are walked and every ambition must be dealable to one of them and have its goal met by one of them, with the observed range of any failing reading printed. Building it found four: a campus ambition whose terms the college was never bleak enough to meet, a goal set above the enrolment ceiling, a goal that asked for selectivity and size together (which never happen together), and — worst — a title that promised six faculties over a goal that checked three. A promise the player reads and a promise the game checks have to be the same promise.

---

## §11. Reputation and the World (System 6)

### §11.1 Prestige

Prestige is the long-term composite across six axes (kept from v1's report card): **Academics, Research, Student Experience, Athletics, Access, Financial Strength.** Axes move slowly; prestige is a trailing indicator by design — you cannot buy it this year, only earn it over an era.

### §11.2 Perceived identity

Separately from prestige, the school accrues **identity tags** derived from behavior: _Research Powerhouse, Teaching College, Party School, Jock School, Artsy, Commuter, Country Club, Pressure Cooker, The Bargain, Old Money._ Tags are earned and shed slowly, are visible ("what the guidebooks say"), shape the applicant pool (§8.2), color event selection and writing, and headline the final report's title. Identity is the mechanical answer to "a university that is uniquely theirs."

### §11.3 The league

A background league of **24 AI schools** simulated shallowly: each has prestige axes, an identity, and simple annual drift plus reactions (a rising school poaches; a falling one sheds faculty you can grab). A **rankings screen** shows the annual table — with a deliberately quirky methodology that occasionally _changes_, to the visible outrage of everyone (satire hook and a genuine strategic wrinkle). One league school emerges as **the rival** through organic triggers (geographic proximity on the fictional map, repeated athletic meetings, a poached dean) and thereafter gets extra presence: taunting ticker items, head-to-head framing at board meetings, a dedicated line on the rankings screen. Rivals exist to make year 40 tense when the campus is finished; they are pressure #3 and sized accordingly — no deep AI, just a living table.

---

## §12. Endgame: Chronicle, Report, Hall of Fame

### §12.1 The chronicle

Generated at year 50 (and viewable in draft anytime as "the History screen"): the run's fifty years partitioned into **named eras** detected from state trajectory ("The Founding," "The Hargrove Years," "The Troubles," "The Second Campaign"), each era summarized with its defining events, buildings, classes, and numbers; notable alumni (drawn from named students, §8.1) with their outcomes; a building timeline; the rival saga. The chronicle is the historian-hat payoff and the run's primary artifact — written in the game's voice, exportable as an image/text share sheet.

### §12.2 The final report

Six-axis grading (§11.1) against the fifty-year arc, ambition record, financial verdict, the identity title — a composed line, e.g., _"Blackmoor University: a research powerhouse that never learned to feed its undergraduates"_ — and a final mark. The report judges the whole arc, not the final snapshot: a school that rose from austerity outranks one that coasted.

### §12.3 Hall of fame and cosmetic meta

Each completed run hangs in the **hall of fame**: campus portrait (a rendered map snapshot), name, colors, title, final grades, and chronicle link. Meta-progression is deliberately light: completed runs unlock **cosmetics only** — additional palettes, motif variants, statue and landmark sets, seasonal decorations. Nothing mechanical is ever gated. The hall is the reason to play again; the cosmetics are the souvenir.

---

## §13. Presentation

### §13.1 Art direction

Carry forward v1's visual identity wholesale: the isometric campus map, the five architectural motifs, the palette system, the cream/maroon/gold UI chrome, the startup flow (name, motif, colors — "Open the Doors"). Evolve rather than replace: richer ambient life (§6.3), seasonal tinting, weathering states for backlog, and a consistent iconography pass. The startup screen and map are the two things v1 already got right; v2's art budget goes to making the map feel _alive_ rather than making it different.

### §13.2 UI shell

Keep v1's layout grammar: persistent bottom bar (Campus · Curriculum · Faculty · Students · Treasury · League · History · Build), top-left identity chip, top-right speed controls and date, bottom ticker with the NEXT prompt. Full-screen management overlays in v1's card style (the curriculum screen's visual language generalizes to all screens). Two additions: the ticker becomes the event-resolution surface (§10.1), and every screen obeys the **one-tooltip rule** — any number explained in one sentence on hover.

**The keyboard, as built (Phase 21A).** The map owns the left hand, and no screen may take a key from it: W/A/S/D and the arrows glide the camera, Q and E turn it a quarter turn round the campus, Z and X tilt it, Home restores the opening view, R turns the building being placed and P arms the path tool. The screens sit on the keys the map does not want — C, F, U, T, G, H, and L for the journal — and Students moved off `s` because the map had the better claim on it. Every claim is declared in one table (`src/ui/keys.ts`) and a test asserts they are disjoint, because a key bound in two files is a bug no type can catch and the playtest found one. The same table renders the key list behind the map's `?`, so the keys a player is told about cannot drift from the keys the game answers.

**A quarter turn is a turn, not a cut, and it goes round what you are looking at.** The view snaps between four fixed azimuths, and it moves between them rather than jumping: the azimuth eases over about a quarter of a second so the player can see which way the campus went. It turns about one point, found when the turn starts and held for the whole of it — the ground a little below the middle of the screen, because a building is drawn standing up from its footprint and the mass is what the player means by "this building". A hall centred before a turn is still centred after it. The cost is honest and bounded — every frame of it re-projects the campus, which is six to twenty-six re-renders depending on how full the land is — and it buys the one thing a cut cannot, which is knowing where you now are.

**The tilt, as built (Phase 21A).** Ten fixed pitches, from eleven degrees — nearly level, where the halls stand up and the campus reads as a panorama — to ninety, a true bird's eye where heights vanish and the campus is its own site plan. The ladder is stepped in the SINE of the pitch rather than the angle, because the sine is the factor the grid's depth is squashed by and so is what the eye actually reads; even steps in degrees would crowd at the top. Every value is a simple ratio, which is what keeps tile edges on a clean pixel slope. Trees answer the tilt with everything else: a tree is a vertical object, so as the camera leans overhead its trunk foreshortens away, its crown settles onto the trunk rather than standing above it, and a broadleaf spreads, because a canopy covers more ground than its elevation suggests. A conifer keeps a quarter of its rise and none of the spread, so a spruce stays a tight dark mark among the broad ones — which is how a wood reads from the air. Walkers answer it the same way: the body squats and widens into shoulders and the head becomes most of what is left, so the crowd is still on the lawn when the camera is overhead rather than foreshortened out of existence. Everything that stands up keeps a floor, for that reason.

**The works are massing, not a diagram (Phase 21A).** A site's crane and scaffold are built from filled shapes like everything else on the map — a latticed mast on its ballast, the cab, the A-frame and its ties, a tapering jib with its trolley and hook, the counter-jib and its weights; scaffold standards with two lifts of ledgers and a brace. They were strokes, and a stroke stays a hairline at every zoom, which left the one object on the map that says _a building is going up here_ reading as a drawing among buildings that have bulk.

### §13.3 Writing voice

Wry, affectionate satire of academia; sincerity underneath. House rules: institutions are absurd, individuals are humane; jokes live in specifics ("the Committee on Committee Reform"), never in mockery of students; distress is written straight — austerity is not funny to the people in it; every event's choices are labeled with honest verbs, not gags. Calibration examples are maintained in `src/content/STYLE.md`, the authoring reference for everything with words in it (established Phase 18); the two below are its anchors:

> _"The Faculty Senate has voted 31–2 to express 'grave concern' about the parking situation. It is unclear what they would like you to do, and neither of the two dissenters can be located."_
> — [Fund a parking study · $250k] [Express reciprocal concern · Free]

> _"Hurricane damage to Whitfield Hall is worse than feared. The engineers' report uses the word 'char' as a verb."_
> — [Full renovation · $12M] [Stabilize and defer · $3M, +Backlog] [Demolish · the Class of '41 will write letters]

### §13.4 Audio (1.0 scope)

A small, state-aware music system: a founding theme, a growth theme, a distress undertone, a late-game/ceremonial theme, seasonal ambience on the map (crowd murmur scaling with enrollment, stadium roar on game weeks). SFX for placement, money, ticker, and the year-turn. Nothing adaptive beyond state switching.

---

## §14. Content Budgets ("finished for now")

| Content            | 1.0 target                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Schools            | 6                                                                                                            |
| Programs           | 30 (each ×3 tiers)                                                                                           |
| Building types     | ~40 (across academic, residential, dining, life, athletics, admin, landmarks) + renovation/vertical variants |
| Motifs / palettes  | 5 motifs (from v1) / 8 palettes + unlockable cosmetic sets                                                   |
| Inline events      | ~120                                                                                                         |
| Seismic events     | ~20                                                                                                          |
| Ambition pool      | 24                                                                                                           |
| Named students     | 3–5 per class (portrait pool ~80, arc-beat templates ~60)                                                    |
| Faculty quirks     | ~40                                                                                                          |
| Identity tags      | 10                                                                                                           |
| League schools     | 24 (named, crested, persistent within a run)                                                                 |
| Era name templates | ~30                                                                                                          |

---

## §15. Technical Architecture

- **Sim/UI separation.** The simulation is a pure TypeScript core (no React imports): `state + actions → tick(state) → state`, advanced on a fixed weekly tick by a driver. UI subscribes to snapshots. This enables headless fast-simulation for balance testing (Plan Phase 31) and keeps 8× speed cheap.
- **Determinism.** Single seeded RNG stream owned by the sim core; identical seed + action log replays identically. (The seed varies per run for event/market variety — "same blank slate" refers to the map and starting conditions, not the RNG.)
- **State shape.** One serializable state tree; save = state + version + action log tail. Saves in IndexedDB with autosave every year-turn and manual slots; export/import as file. Schema versioning with migrations from day one.
- **Rendering.** The map remains SVG/DOM (proven in v1) unless profiling in Phase 31 forces a canvas layer for ambient students; ambient life is interpolated presentation from sim state, decoupled from tick rate.
- **Content as data.** Events, ambitions, programs, buildings, quirks, era templates: JSON with a small condition/effect DSL, validated at build time. Writing lives in content files, not code.
- **The journal (event bus).** The sim records what is notable — the charter, the doors opening, a building placed or demolished, a term begun, a year turned, a beat fired and resolved — as typed entries in state, each stamped with its week. The ticker, the History screen (§12.1), class memory (§8.4) and the event engine (§10.1) read this journal rather than watching state change; the words for an entry live in a content file, so an entry is worded once for every surface.
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
