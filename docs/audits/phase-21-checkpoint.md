# Phase 21 checkpoint audit

All pressure systems are live. This verifies phases 1–21 before Stage 5.

**This is an audit, not a fix pass.** No game behaviour changed, no tuning
constant was touched. Three things were added, and nothing else:

| added                                                                       | why                                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `tools/` (harness, smoke, guardrails, scenarios, screenshots, density)      | the instrumentation this audit needed, and the seed of Phase 31's harness                |
| `src/sim/invariants.test.ts`, `src/sim/audit.phase-21.test.ts`              | claims that were untested, written as tests; four are `it.fails` findings                |
| `playwright-core` (devDependency), an `eslint.config.js` block for `tools/` | to drive the browser for §5, and to keep `npm run check` green with `tools/` in the repo |

Every verdict below cites a test name, a command and its output, a
`file:line`, or a screenshot path.

**Contents** — [1 Hygiene](#1-hygiene) · [2 Plan conformance](#2-plan-conformance-phases-121) ·
[3 Design-doc conformance](#3-design-doc-conformance) · [4 Headless smoke run](#4-headless-smoke-run) ·
[5 UI and art review](#5-ui-and-art-review) · [6 Triage](#6-triage)

---

## 1. Hygiene

`npm run check` (typecheck · lint · format check · Vitest) and `npm run build`,
at `audit-phase-21`:

```
$ npm run check
 Test Files  28 passed (28)
      Tests  369 passed | 4 expected fail (373)
EXIT=0

$ npm run build
dist/assets/index-DeXbw9Is.css   69.77 kB │ gzip:  12.12 kB
dist/assets/index-eQoGpxFu.js   635.15 kB │ gzip: 196.78 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 574ms
```

The build passes with one warning: the single JS chunk is 635 kB raw,
197 kB gzipped, past Vite's 500 kB threshold. `src/ui/map/buildingMotifs.tsx`
is 3,270 lines and 92 kB of source on its own — the five motifs' SVG
vocabulary, all of it loaded before the founding screen draws. Not urgent, and
not a Stage 5 problem, but it belongs on Phase 32's profiling list rather than
being discovered there.

The four "expected fail" are `it.fails` cases in `src/sim/audit.phase-21.test.ts`
— the findings of this audit, pinned so that the phase which fixes one is told
at once. They are listed under [A1](#a1-teaching-is-nearly-free-to-abandon),
[A2](#a2-the-estate-is-profitable-to-abandon) and [A3](#a3-an-emergency-cut-outlives-the-emergency).

**Sim-core isolation (DD §15).** `src/sim/architecture.test.ts` walks every
non-test file under `sim/` and `content/` plus `tuning.ts` and asserts that
every import is relative and none reaches `/ui/`. That forbids React, every
third-party package and every Node builtin, and it is stronger than
`eslint.config.js`'s `no-restricted-imports`, which names a fixed list
(`react`, `react-dom`, `idb`, `**/ui/**`) and would not catch a new package.
The test is the authority and it is complete for static imports.

The stronger proof is that `tools/harness.ts` imports the sim core and runs
fifty simulated years on bare Node with no bundler:

```
$ npx tsx tools/smoke.ts
slowest 50-year run: 472ms (DD §15 target: 60000ms)
```

Two gaps in the isolation test, neither urgent:

- It skips `*.test.ts` (`architecture.test.ts:38`), so a sim test may import
  anything. Defensible — tests need Vitest — but it means the sim's _test_
  graph is unguarded.
- It matches static `import`/`export … from` only, so `await import('x')`
  inside sim code would pass.

**Schema and migrations.** Current version is 19 (`src/sim/state.ts`).
`src/sim/invariants.test.ts` (added here, 7 tests, all passing) walks the
migration ladder from an authentic v1 save — the shape actually shipped at
commit `51aca06`, `rng` and `marks` included — up to 19 and hashes the result.
An earlier run of this test failed; the fault was a synthetic fixture of mine
that omitted `rng`, not the ladder. The ladder is sound.

**Determinism.** `stateHash()` in the same file gives a stable, key-sorted
fingerprint of a `GameState`; the replay test asserts that
`replay(seed, log, toWeek)` reproduces it exactly.

---

## 2. Plan conformance, phases 1–21

Each phase quoted from `docs/UNISCHOOL_V2_DEV_PLAN.md`.

| #   | "Done when…"                                                                                                                             | Verdict                             | Evidence                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | _a blank "campus" advances through calendar weeks (DD §3.1) and survives save/reload_                                                    | **PASS**                            | `src/sim/calendar.test.ts`, `src/sim/campus.test.ts:242`; `invariants.test.ts` round-trips v1→v19                                                                                                                                                                                                                                    |
| 2   | _a player can found "Blackmoor," pick colors, land on an empty map with live chrome, then place Founders Hall as the run's first action_ | **PASS**                            | `01-startup-1-name`, `01-startup-3-choices`, `02-empty-map-siting`, `03-founders-hall-placed` — the whole flow, captured                                                                                                                                                                                                             |
| 3   | _a campus can be laid out, saved, reloaded, and looks like UniSchool_                                                                    | **PASS**                            | `07-stress-dense-map--1440x900.png`; every scenario in `tools/.scenarios/` is a reloaded save                                                                                                                                                                                                                                        |
| 4   | _a year cycles through all four beats and the bus log shows a coherent history_                                                          | **PASS**                            | `src/sim/bus.test.ts`, `calendar.test.ts`; `12-beat-*` screenshots, all four                                                                                                                                                                                                                                                         |
| 5   | _money moves believably over simulated years_                                                                                            | **PASS**                            | `06-mature-y32-treasury--1440x900.png`; `tools/smoke.ts` shows no non-finite or negative quantity across 6 × 50 years                                                                                                                                                                                                                |
| 6   | _neglect visibly and financially compounds_                                                                                              | **PARTIAL**                         | _Visibly_ yes — `CampusMap.tsx:127-129` weathers to `derelict`. _Financially_ the sign is inverted: thirty unfunded years leave the college **richer** on all three seeds. See [A2](#a2-the-estate-is-profitable-to-abandon)                                                                                                         |
| 7   | _a decade of classes flows through and tuition dependence is a real number on the Treasury screen_                                       | **PASS**                            | `06-mature-y32-students` (four cohorts, attrition 9.4%); tuition dependence gauge on the Treasury screen                                                                                                                                                                                                                             |
| 8   | _a deliberately mismanaged school rides the ladder down and climbs back without dying_                                                   | **PASS**                            | `tools/smoke.ts`: growth reaches rung 5 and exits on all three seeds (`rung max 5 / exited yes`); `11-rung-0` … `11-rung-5`                                                                                                                                                                                                          |
| 9   | _schools can be founded and programs opened, with the screen readable at a glance_                                                       | **PASS**                            | `06-mature-y32-curriculum--1440x900.png` — 4/6 schools, 20/30 programs, tiers legible                                                                                                                                                                                                                                                |
| 10  | _a faculty roster staffs the curriculum and the budget feels them_                                                                       | **PASS**                            | `06-mature-y32-faculty`; payroll $3.59M/yr on the Treasury statement                                                                                                                                                                                                                                                                 |
| 11  | _building an Established program is a multi-year project the player can plan around_                                                     | **PASS**                            | `academics.test.ts`; the Curriculum screen states the gate in words: "Needs an Associate Professor assigned to advance"                                                                                                                                                                                                              |
| 12  | _cause→effect from investment to student experience is traceable in the debug panel_                                                     | **PASS**                            | `satisfactionBreakdown()` (`people.ts:406`) names ten terms; the Students screen renders them                                                                                                                                                                                                                                        |
| 13  | _the map is worth watching between decisions_                                                                                            | **PASS (not observable in stills)** | `src/ui/map/ambient.tsx` animates walkers over real routes (`routes.ts: findRoute/walkGrid/doors`); `src/ui/map/season.ts` tints four seasons. Every screenshot is a paused frame, so this audit cannot judge the motion — see [5b](#5b-art-correctness)                                                                             |
| 14  | _bonuses exist, show their math in tooltips, and provably cannot dominate_                                                               | **PASS**                            | §17.2 measured at 73% of its own cap (worst of six runs); the Build menu prints "LAYOUT +5.9 · of 12 allowed" (`14-build-menu--1440x900.png`)                                                                                                                                                                                        |
| 15  | _a player can recognize and follow a student across four years_                                                                          | **PASS, with a content note**       | `06-mature-y32-students`: four named students with portraits, programme, year and dated beats. Two of the four visible cards repeat another's line verbatim — see [5c](#5c-new-player-comprehension)                                                                                                                                 |
| 16  | _a housing crunch in year 12 measurably dents giving in year 30 (verify via headless fast-sim)_                                          | **PASS**                            | `tools/smoke.ts`: Y31 fund −18.6% / −16.7% / −23.6% against control, 4 classes marked `overcrowded` on each seed                                                                                                                                                                                                                     |
| 17  | _the pipeline turns a JSON file into a playable, wry dilemma_                                                                            | **PASS**                            | `13-event-inline--1440x900.png` — the roof event, two priced choices, stated timeout, stated default                                                                                                                                                                                                                                 |
| 18  | _a test decade feels inhabited and the tone is consistent_                                                                               | **PASS**                            | 64 inline + 6 seismic in `events.json`; `src/content/STYLE.md`; `eventContent.test.ts` coverage guard walks scripted colleges                                                                                                                                                                                                        |
| 19  | _the player can be tempted into overreach and pay for it_                                                                                | **NOT EXERCISED**                   | 12 ambitions load and `ambitions.test.ts` passes, but every scripted college answers beats with `defaultResolution`, which declines. The History screen at Y33 reads "Nothing promised, and nothing owed" (`06-mature-y32-history`). A harness gap, not a game defect — but it means no run in this audit tested the loop end to end |
| 20  | _buying the executive suite visibly buys speed and visibly bleeds payroll_                                                               | **PASS on the plan, FAIL on §17.5** | Speed: growth reaches 4× in Y1 and 8× in Y29–34; passive never (`tools/smoke.ts`). Payroll: admin share 49.7–51.1%, against the DD's 25–40% band — see [§17.5](#175-administrative-share-of-payroll--out-of-band)                                                                                                                    |
| 21  | _a late-game building can realistically be funded by the classes who loved you_                                                          | **PASS**                            | `campaigns.test.ts`; the `campaign-running` scenario carries a live drive                                                                                                                                                                                                                                                            |

### Where the harness, not the game, was at fault

Two things this audit first read as defects turned out to be defects in my own
instrumentation. Both are recorded because the corrected reading is the finding.

- **"32 faculty, none teaching."** `06-mature-y32-faculty--1440x900.png` shows
  TEACHING 0 and "32 on the roster are not teaching anything." That college was
  built by `tools/harness.ts`'s `GROWTH`, which hires with
  `programId: fit?.programId ?? null` and builds only fifteen sites, so most
  candidates' fields have no open programme and they are hired into the air.
  The sim refuses the assignment with a clear reason —
  `"the program is not open in their field"` — and the _shipped_ scripted
  college (`src/sim/colleges.ts`) does staff its programmes, which
  `audit.phase-21.test.ts > the scripted college does staff its programmes`
  now asserts. The UI flagged the problem loudly and correctly in three places.
- **"Paths that generate badly."** Two art findings (A-3, A-7) assumed the game
  lays paths and lays them poorly. It does not lay them at all: every path is
  painted by the player, and both screenshots were showing what
  `tools/scenarios.ts` did or did not draw. Both are withdrawn in §5b.
- **"Motif bleed."** Buildings other than the founding hall looked unchanged
  across motifs. Measuring the same region across all five motif screenshots
  disproves it: the north-east neighbour reads `rgb(149,155,133)` under
  georgian and `rgb(172,190,188)` under modern. The motif reaches every
  building. It reads strongly on brick and faintly on limestone and render.

---

## 3. Design-doc conformance

### The §17 guardrails, measured

`npx tsx tools/guardrails.ts`, three seeds × two strategies, 50 years.

#### §17.5 Administrative share of payroll — **OUT OF BAND**

Target 25–40%.

```
passive/4, /11, /21: 100.0%  [seats 0/4, faculty 0]   OUT OF BAND
growth/4:             50.0%  [seats 8/8, faculty 32]  OUT OF BAND
growth/11:            51.1%  [seats 8/8, faculty 32]  OUT OF BAND
growth/21:            49.7%  [seats 8/8, faculty 32]  OUT OF BAND
```

Both ends miss, for different reasons. The passive college has no faculty at
all, so its share is 100% by construction and the reading is meaningless rather
than alarming — a college with an empty denominator should probably not report
a ratio. The growth college fills all eight seats and hires 32 faculty and
still lands ten points above the ceiling, which is the real finding: at the
scale a fifty-year run reaches, the seat salaries are simply too large a share
of a payroll this size. Phase 31 owns the number.

Note that `adminShareOfPayroll(s.treasury.budget)` reads the budget, so the
harness's unassigned-faculty gap does not distort it.

#### §17.3 Player-decided event cadence — **OUT OF BAND**

Target 1 per 2–4 weeks, measured mid-game over 540 weeks.

```
passive/4:   1 per 19.3 wk (28 asked,  0 delegated)  — with beats: 1 per 6.1 wk
passive/11:  1 per 20.8 wk (26 asked,  0 delegated)  — with beats: 1 per 6.2 wk
passive/21:  1 per 21.6 wk (25 asked,  0 delegated)  — with beats: 1 per 6.3 wk
growth/4:    1 per 25.7 wk (21 asked, 31 delegated)  — with beats: 1 per 6.6 wk
growth/11:   1 per 27.0 wk (20 asked, 36 delegated)  — with beats: 1 per 6.7 wk
growth/21:   1 per 38.6 wk (14 asked, 35 delegated)  — with beats: 1 per 7.2 wk
```

Five to ten times slower than the target on events alone; roughly twice as slow
once the four calendar beats are counted, which is the fairer reading since a
beat is a decision the player makes. Delegation behaves exactly as §17.3
predicts — it takes 31–36 questions off the desk and drops the ask rate
further — so the mechanism is right and the dial is low. Phase 31.

#### §17.2 Placement bonuses against the 12% cap — **WITHIN CAP**

```
worst seen: 73% of its own cap (cap is 12% of each output) — WITHIN CAP
growth/21: satisfaction 7.983/12 pts (67%), pool 0.0880/0.12 (73%)
```

Each effect is compared against its own limit, which is the only commensurable
comparison: `placementSatisfaction` caps at `PLACEMENT_CAP * 100` = 12
satisfaction points, `placementPoolEffect` at `PLACEMENT_CAP` = 0.12 as a
multiplier. (An earlier pass of this audit compared 7.98 satisfaction points
against 0.12 and wrongly called it a breach.) The aggregation in
`src/sim/placement.ts` is doing its job, and the Build menu shows the player
the arithmetic.

#### §17.4 Named students as a lens — **PASS**

```
73 named students; fields: arrivedWeek, beats, classYear, gender, heritage,
  id, name, outcome, programId, status
numeric fields on a named student: classYear, arrivedWeek
cohorts remain the unit of simulation: 4 cohorts
```

Nothing simulates a named student. The only numbers they carry are a class
year and an arrival week, and every read of `people.named` is display.

### DD edit history

22 commits have touched `docs/UNISCHOOL_V2_DESIGN.md`. Six contain deletions:

| commit             | change  | reading                                                                                |
| ------------------ | ------- | -------------------------------------------------------------------------------------- |
| `51aca06` Phase 1  | +40 −40 | a pure Prettier reflow; identical word multiset after stripping emphasis marks         |
| `1ad2af1` Phase 6  | +3 −1   | replaced the one-line "Debt service" stub                                              |
| `5e20ae2` Phase 13 | +5 −1   | replaced "**The funnel, for now.**"                                                    |
| `2fa8b19` Phase 14 | +5 −1   | replaced "**Beauty, for now.**"                                                        |
| `81d5cd4` Phase 18 | +7 −3   | replaced Phase 17's three interim paragraphs                                           |
| `f37081a` Phase 20 | +11 −1  | the speeds paragraph, re-emitted verbatim with "and have been since Phase 20" inserted |

**No existing decision was changed.** Every deletion replaced an interim "for
now" paragraph with the built thing, which is what the rule anticipates. One
caveat on wording: four of these rewrote a paragraph in place rather than
appending, which is a slightly generous use of "additive edit".

Two honest self-reports in the Phase 20 text are worth keeping visible, since
they are DD promises the code does not keep:

- _"The DD's own example named 'protect historic' as a Facilities policy; that
  one is not built, because nothing in the state yet distinguishes a historic
  building from an old one."_
- _"§5.4's restructuring … has no action yet, so seats are one-way. A run can
  buy the suite and cannot sell it."_

The second interacts badly with §17.5: administrative share is out of band at
the ceiling and the player has no mechanism to bring it down.

---

## 4. Headless smoke run

`tools/harness.ts` runs the sim core on Node with no UI, no React and no
bundler — importing it at all is the standing proof of DD §15. It measures and
reports; it tunes nothing and draws nothing, per the plan's note that Phase 31
owns the dashboards.

```
$ npx tsx tools/smoke.ts

--- 50-year runs ---
strategy  seed  ms   Y50 enrolled  alumni  giving   endowment  admin%  rung max  exited  problems
passive   4     287  130           1279    $0.12M   $171.23M   100.0%  0         no      0
passive   11    223  131           1145    $0.08M   $83.33M    100.0%  0         no      0
passive   21    200  133           1329    $0.13M   $89.22M    100.0%  0         no      0
growth    4     472  459           2842    $0.19M   $141.44M    50.0%  5         yes     0
growth    11    359  452           2703    $0.21M   $53.89M     51.1%  5         yes     0
growth    21    345  473           2843    $0.18M   $68.67M     49.7%  5         yes     0

problems: 0
slowest 50-year run: 472ms (DD §15 target: 60000ms)
```

`problems: 0` is the output of `inspect()`, which walks every number in the
state tree once a year looking for anything non-finite, any negative count,
any cohort satisfaction or quality outside 0–100, any building condition
outside 0–1, any negative backlog, and any disagreement between the speed
gates and DD §3.2. Six runs, 300 simulated years, nothing. A stalled clock —
a hold nothing would release — is also checked for and never occurred.

**Performance: 127× inside budget.** The slowest fifty-year run is 472ms
against DD §15's 60s target.

**The ladder works both ways.** Growth reaches rung 5 on every seed and climbs
back out; passive never leaves rung 0, which is the right shape — a college
nobody is running has no ambitions to overreach on and nothing to overspend.

**Phase 16's claim holds.** A deliberate housing crunch in year 12 thins the
annual fund nearly twenty years later:

```
seed 4:  Y31 fund $0.17M vs control $0.21M (−18.6%), classes marked overcrowded: 4
seed 11: Y31 fund $0.16M vs control $0.19M (−16.7%), classes marked overcrowded: 4
seed 21: Y31 fund $0.11M vs control $0.15M (−23.6%), classes marked overcrowded: 4
```

### A1. Teaching is nearly free to abandon

**Closed in Phase 37.** Teaching is now the largest part of the college's reputation (`src/sim/reputation.ts`), which moves the applicant pool and the yield; the test is promoted to `it`.

`src/sim/audit.phase-21.test.ts > closing every classroom for 25 years is not
a way to get richer` (`it.fails`).

Twenty-five years, three seeds, identical build/found/open/hire script. The
only difference: one arm sweeps every teacher off every programme each week
while still paying all 32 salaries.

| seed  | teaching | enrolled     | quality     | satisfaction | cash      | endowment |
| ----- | -------- | ------------ | ----------- | ------------ | --------- | --------- |
| 4242  | 21/32    | 771          | 47.2        | 59.6         | $210M     | $90M      |
| 4242  | **0/32** | 755 (−2.1%)  | 45.0 (−2.2) | 58.0 (−1.6)  | $202M     | $90M      |
| 7     | 15/32    | 500          | 45.3        | 48.3         | $95M      | $104M     |
| 7     | **0/32** | 480 (−4.0%)  | 45.3 (±0)   | 43.2 (−5.1)  | **$100M** | $89M      |
| 99991 | 19/32    | 1140         | 46.4        | 61.2         | $280M     | $82M      |
| 99991 | **0/32** | 1128 (−1.1%) | 43.8 (−2.6) | 59.8 (−1.4)  | **$293M** | $82M      |

Teaching is worth something, but very little: 1–4% of enrolment, 0–2.6 quality
points out of 100, and never a distress rung. On two seeds in three a college
that teaches nobody for a quarter of a century ends up with **more cash** —
because the students it loses cost more than they brought. The direction is the
finding, not the size.

### A2. The estate is profitable to abandon

**Closed in Phase 37.** The state of the buildings is a sixth of the college's reputation, and beauty counts a landmark and a quad for their condition, so a ruin keeps only its trees; both tests are promoted to `it`.

`src/sim/audit.phase-21.test.ts > letting the campus fall down costs the
college its money or its students` and `> a campus of ruins is not still
prettier than the average campus` (both `it.fails`).

Thirty years at `maintenanceFunding: 0` against thirty years at 1:

| seed  | funding | ruined/open | backlog   | beauty | enrolled | satisfaction | cash      | rung |
| ----- | ------- | ----------- | --------- | ------ | -------- | ------------ | --------- | ---- |
| 4242  | 100%    | 0/16        | $3M       | 85     | 768      | 59.4         | $294M     | 0    |
| 4242  | **0%**  | **16/16**   | **$164M** | 62     | **937**  | 37.0         | **$377M** | 0    |
| 7     | 100%    | 5/16        | $23M      | 78     | 528      | 52.6         | $142M     | 0    |
| 7     | **0%**  | **16/16**   | **$136M** | 62     | 466      | 41.9         | $146M     | 0    |
| 99991 | 100%    | 0/16        | $1M       | 86     | 1130     | 60.7         | $385M     | 0    |
| 99991 | **0%**  | **16/16**   | **$170M** | 62     | 927      | 38.1         | $379M     | 0    |

Every building at condition zero, $136–170M of backlog, and the college is
**richer on all three seeds** and **larger on one**. Never once distressed.
Satisfaction does bite, hard — about 20 points — but nothing downstream of it
bites back.

Two mechanisms, both measurable:

1. **Condition never touches capacity.** `capacityOf()`
   (`src/sim/people.ts:183-193`) sums `buildingById(p.buildingId).capacity` for
   every placement with `status === 'open'` and never reads `p.condition`. A
   residence hall the map draws as `derelict` (`CampusMap.tsx:127`) sleeps its
   full complement. So does a ruined refectory feed, and a ruined hall teach.
2. **A ruin still scores above average on beauty.** Upkeep is one quarter of
   campus beauty (`BEAUTY_WEIGHTS` in `tuning.ts:256-261`). With upkeep at zero
   and greenery, landmarks and enclosure unchanged, the score floors at exactly
   **62 on all three seeds** — above the neutral 50 that
   `beautyPoolFactor()` measures against, so the applicant-pool effect of a
   campus of ruins is still _positive_.

This directly contradicts Phase 6's "Done when": _neglect visibly and
financially compounds_. It compounds visibly. Financially it pays.

### A3. An emergency cut outlives the emergency

`src/sim/audit.phase-21.test.ts > the first budget after the emergency
proposes maintenance again` (`it.fails`).

`applyCut(state, 'deferMaintenance')` (`src/sim/distress.ts:165-176`) sets
`maintenanceFunding: 0` on the standing level, the live budget and the pending
budget. Nothing ever raises it back. At the next Budget & Hiring,
`approveBudget` (`src/sim/treasury.ts:355`) resolves funding as
`policy?.maintenanceFunding ?? maintenanceFunding ?? t.maintenanceFunding` —
and the stated default the player is offered is `t.maintenanceFunding`, which
the cut set to zero (`src/ui/BeatScreen.tsx:134`).

So a player who takes the board's austerity medicine and then accepts the
stated budget default every year afterwards never funds maintenance again for
the rest of the run. It is recoverable — the slider at Budget & Hiring works —
but only by a player who notices, and nothing prompts them.

Receivership latches the same way from the other direction: under the interim
CFO, `approveBudget` writes `boardPolicy().maintenanceFunding`
(`BOARD_POLICY_MAINTENANCE = 0.5`) into the _standing_ level, and when
receivership ends nothing restores the college's own figure.
`12-beat-budget-hiring--1440x900.png` shows exactly this: a college out of
receivership, its maintenance slider parked at 50%.

The `mature-year-32` scenario is what this looks like after thirty years:
`maintenanceFunding: 0` standing and budgeted, 16 buildings, 8 of them at
condition `0.00`, **$98,740,339** of backlog, `scars: [6, 11, 16]` — and
`rung: 0`, `surplusRun: 27`.

---

## 5. UI and art review

84 screenshots at 1440×900 and 1920×1080, plus four magnified crops, in
`docs/audits/phase-21/screenshots/`. Captured by `tools/screenshots.mjs`
driving the real app against injected saves. **0 console errors and 0 page
errors across both viewports.**

Everything below is what is visible in a screenshot. Contrast ratios were
measured off the pixels (modal foreground against modal background, WCAG 2.1
relative luminance); scroll depths and control positions were measured in the
live DOM by `tools/density.mjs`.

**A limit of this method, stated plainly.** Every map screenshot is a paused
frame at Fall Week 1. `src/ui/map/ambient.tsx` animates walkers along real
routes and `src/ui/map/season.ts` tints four seasons, and this audit saw
neither in motion. Where a finding below concerns a still frame, it says so.

### 5a. Legibility

Measured ratios, foreground on background:

| element                                           | fg on bg                                 | ratio      | verdict                          |
| ------------------------------------------------- | ---------------------------------------- | ---------- | -------------------------------- |
| tutorial card body (`02-empty-map-siting`)        | `rgb(27,42,74)` on `rgb(255,253,248)`    | 13.99:1    | pass                             |
| motif button, unselected (`01-startup-3-choices`) | `rgb(27,42,74)` on `rgb(247,242,232)`    | 12.75:1    | pass                             |
| student-count chip (`05-midgame-y15-map`)         | `rgb(27,42,74)` on `rgb(247,242,232)`    | 12.75:1    | pass                             |
| palette name "Maroon and gold"                    | `rgb(123,30,43)` on `rgb(255,253,248)`   | 10.01:1    | pass                             |
| ticker dateline, NEXT chip, next-beat link        | `rgb(123,30,43)` on `rgb(247,242,232)`   | 9.12:1     | pass                             |
| treasury headline, positive (`04-year-01-map`)    | `rgb(247,242,232)` on `rgb(123,30,43)`   | 9.12:1     | pass                             |
| nav labels, inactive                              | `rgb(219,235,232)` on `rgb(123,30,43)`   | 8.27:1     | pass                             |
| enabled "Open the Doors"                          | `rgb(123,30,43)` on `rgb(242,193,78)`    | 6.07:1     | pass                             |
| weekly rate, HUD                                  | `rgb(242,193,78)` on `rgb(123,30,43)`    | 6.07:1     | pass                             |
| AUSTERITY chip                                    | `rgb(247,242,232)` on `rgb(161,58,58)`   | 5.92:1     | pass                             |
| treasury headline, negative                       | `rgb(255,176,166)` on `rgb(123,30,43)`   | 5.82:1     | pass                             |
| **"Chapel Green" place label**                    | `rgb(95,101,95)` on `rgb(143,161,110)`   | **2.13:1** | **fails AA, and AA-large**       |
| disabled "Open the Doors"                         | `rgb(188,140,144)` on `rgb(248,222,162)` | 2.19:1     | exempt (disabled), but see below |

**L-1 · The quad label is unreadable on grass.** 2.13:1 fails WCAG AA for
normal text (4.5:1) and even the large-text threshold (3:1). It is the only
text in the game placed directly on the map, and it lands on the most varied
background in the game.
`05-midgame-y15-map--1440x900.png`, map centre; zoomed at
`docs/audits/phase-21/screenshots/zoom-chapel-green-label.png`.

**L-2 · The weekly rate's dollar sign reads as a section sign.** At 4×
magnification the HUD's small condensed face draws `$` with hooks top and
bottom that resolve as `§`: "+§8.04k /wk", "+§966 /wk", "§0 /wk". The same
string in the Treasury strip's larger face is unambiguous ("+$136k /wk"). It
is a font-size problem, not a character problem.
`zoom-hud-weekly-rate.png`; compare `06-mature-y32-treasury--1440x900.png`.

**L-3 · The decimal point takes a digit's width.** Tabular numerals give `.`
a full advance, so the treasury headline reads "$22 . 4M", "−$7 . 49M",
"$32 . 4M" — the fractional part separates into its own number. Visible in
every HUD screenshot; magnified in `zoom-hud-weekly-rate.png`. The HUD's most
important number is the one this hurts.

**L-4 · The disabled primary button says nothing but its colour.** On the
founding card with no name typed, "Open the Doors" is rose on pale gold at
2.19:1 — technically exempt, but it is the only signal a new player has that
the button is not ready, and the card never says a name is required.
`01-startup-1-name--1440x900.png` against `01-startup-3-choices--1440x900.png`.

### 5b. Art correctness

The isometric work is strong. Depth sorting, footprint/sprite agreement and
path joins all survived magnification; the three motifs I compared at 2× are
three genuinely distinct architectural vocabularies on one footprint —
Georgian brick with a white clock cupola and gold dome, Collegiate Gothic in
grey stone with a spire and pointed arches, Classical ashlar with a colonnade
and a low drum dome.

**A-1 · A tree grows on a building's entrance steps.** In
`07-stress-dense-map--1440x900.png` around x 150–165, y 195–220 a conifer
stands _inside_ a portico — on the step platform, between the columns, in front
of the doorway. Tree scatter does not exclude building footprints or entrance
aprons. Magnified 8× at `zoom-tree-in-portico.png`.

An adjacent round tree in the same crop looked like a depth-sort failure at
1× and is not: at 8× its trunk plainly meets the lawn in front of the wall, so
occluding the brick is correct.

**A-2 · Some buildings have no entrance on any visible face.** The dark brick
block at x 265–410, y 165–270 of the same screenshot shows four storeys of
windows on both visible faces and no door, no portico and no steps — just a
small white utility box at the corner, with two walkers standing on bare grass
beside it. `zoom-no-entrance-block.png`.

**A-3 · Withdrawn.** An earlier pass of this audit read a paved rectangle
with a square-cut edge joining nothing (`07-stress-dense-map`, x 245–300,
y 240–280) as a path-generation fault. Paths are drawn tile by tile by the
player and by nothing else (`actions.ts:515-518`); that stub was painted by
`tools/scenarios.ts:123-129` building the stress fixture. My script's
draughtsmanship, not the game's.

**A-4 · The Gothic entrance is a void.** In the motif comparison
(`08-motif-gothic-map--1440x900.png`, founding hall) the pointed-arch entries
are flat black openings with no door leaf, no step and no surround, where
Georgian has a white-cased door on steps and Classical a columned portico. The
Gothic hall reads as a cave mouth at default zoom.

**A-5 · The Classical dome is unseated.** `08-motif-classical-map`: a plain
cylinder with a cap and a small finial sits directly on the roof ridge with no
drum base or pediment to receive it. It reads as a water tank.

**A-6 · Walkers are 3–4px specks in a still.** At default zoom, paused, they
read as litter on the lawn rather than people. `06-mature-y32-map--1440x900.png`.
This audit cannot say how they read in motion and does not claim to.

**A-7 · Withdrawn.** `06-mature-y32-map` has 16 buildings, 33 years and not
one metre of paving, against `07-stress-dense-map`'s full orthogonal network,
and this audit first read that as path generation being too conservative for a
spread-out campus. **Nothing generates paths.** Every path in the game is
painted by the player one tile at a time (`actions.ts:515-518`), and the dense
campus has a network only because `tools/scenarios.ts:123-129` painted one.
The mature scenario has no paths because my growth strategy never drew any.
What remains true, and is a design observation rather than a finding: the
route-finder already prefers paving and falls back to lawn
(`src/ui/map/routes.ts`), so a campus with no paths still works — it just
looks like nobody has laid one.

**Austerity dulling works.** Mean RGB over the campus at rung 4/5 is
`(144.9, 158.0, 108.5)` against `(150.8, 167.7, 102.7)` at rung 3 —
desaturated, as intended (`11-rung-3-map` … `11-rung-5-map`).

**The motif system reaches every building** — see [§2's correction](#where-the-harness-not-the-game-was-at-fault).

### 5c. New-player comprehension

Walking the captured flow as someone who has never seen the game.

**Founding works.** "Fifty years to build a university." / "Name your school",
a live facade that changes with the motif and takes the typed name on its sign,
five motifs, eight palettes with the chosen one named in words. Good.

**The siting card is the best teaching in the game.** _"One hall, seven tiles
by five, in the gothic style, for $8M of the founding gift. Click the land to
break ground; R turns it. The clock starts with the works."_ Dimensions, cost,
the verb, the keyboard shortcut, and what it costs in time. Nothing else in
the game teaches this well.

**C-1 · Two HUD chips have no labels.** The person-icon chip and the star chip
at the bottom left carry a number and an em-dash respectively, with no visible
label at any point. `src/ui/chrome.css:307-313` clips `.stat-label` to 1×1px,
so "Enrolled" and "Prestige" exist for screen readers only. The star's `—` is
honest scaffolding — `Toolbar.tsx:140` gives it `title="Prestige (Phase 24)"` —
but at Year 33 an unexplained dash beside a star has been sitting there for
half a game.

**C-2 · `T` and `R` on every faculty card are never expanded.** Two bare
capitals over two bare numbers, on all 32 cards.
`06-mature-y32-faculty--1440x900.png`.

**C-3 · `2 / 6` on every programme row is unlabelled.** Courses offered of six,
but nothing says so. `06-mature-y32-curriculum--1440x900.png`.

**C-4 · Phase numbers are shipped to the player, and several are stale.** The
plan's internal phase numbering appears in player-facing copy in six places:

| location                                                  | text                                    | state                        |
| --------------------------------------------------------- | --------------------------------------- | ---------------------------- |
| `src/content/treasury.json:18`                            | Research overhead "arrives in Phase 11" | **stale** — Phase 11 shipped |
| `src/content/treasury.json:37`                            | Maintenance "arrives in Phase 6"        | **stale** — Phase 6 shipped  |
| `src/content/treasury.json:46`                            | Debt service "arrives in Phase 6"       | **stale** — Phase 6 shipped  |
| `src/content/seats.json:164`                              | "Campaigns arrive with Phase 21."       | **stale** — Phase 21 shipped |
| `src/content/faculty.json:253`                            | "research lines arrive in Phase 12."    | **stale** — Phase 12 shipped |
| `src/ui/Toolbar.tsx:140`                                  | `title="Prestige (Phase 24)"`           | accurate, but dev vocabulary |
| `src/ui/tabs.ts` / `BeatScreen.tsx:101` / `HistoryScreen` | "Arrives in Phase 26"                   | accurate, but dev vocabulary |

Worse than stale — **actively false.** `TreasuryScreen.tsx:44` computes
`const idle = words.phase !== undefined && amount === 0`, so _any_ phase-marked
line reading zero is styled as unbuilt and labelled "arrives in Phase N". In
`06-mature-y32-treasury--1440x900.png` the Maintenance line reads **$0 ·
arrives in Phase 6** on a college with sixteen buildings and $98.7M of
deferred-maintenance backlog. A live mechanic the player has defunded tells
them it does not exist yet. This is the audit's clearest blocker.

**C-5 · Two of four visible named students repeat another's line verbatim.**
In `06-mature-y32-students--1440x900.png`, Ansel Okafor and Malachi Desai both
"asked when the teaching starts and was given a pamphlet"; Sylvie Haddad and
Cordelia Desai both "has the same professor for three of four courses, and
they are all Tuesday". With only four cards on screen the note pool is visibly
thin. (The pamphlet line is, in fairness, the sim's zero-teaching state
surfacing as flavour, which is lovely when it fires once.)

**C-6 · A tooltip covers the value it explains.** Same screenshot: the tooltip
"Students in the class this year." renders over the Class of '36 row and hides
its STUDENTS figure, in a monospace face the surrounding table does not use.

### 5d. Information density

`node tools/density.mjs` — live DOM measurement, both viewports. "screens" is
scroll height over viewport height; "ink" is the union area of leaf text and
bordered boxes inside the first viewport.

| screen                | scroll | 1440×900     | 1920×1080 | words  | ink | controls below the fold                                                   |
| --------------------- | ------ | ------------ | --------- | ------ | --- | ------------------------------------------------------------------------- |
| Curriculum            | 4274px | 5.08 screens | 4.19      | 1314   | 25% | —                                                                         |
| Faculty               | 3438px | 4.09         | 3.37      | 1696   | 14% | **Seats panel at y=2422 (2.9 screens down)**                              |
| Students              | 4972px | 5.91         | 4.87      | 2131   | 30% | Alumni ledger y=3218 (3.8); **Campaigns panel y=4442 (5.3 screens down)** |
| Treasury              | 2401px | 2.85         | 2.35      | 478    | 30% | —                                                                         |
| History               | 900px  | 1.00         | 1.00      | **29** | 8%  | —                                                                         |
| Beat: Budget & Hiring | 1785px | 2.12         | 1.75      | 361    | 23% | **Resolve button at y=1604 (1.9 screens down)**                           |
| Beat: Board Meeting   | 900px  | 1.00         | 1.00      | 106    | 21% | visible                                                                   |
| Beat: Admissions Day  | 850px  | 1.01         | 1.00      | 104    | 23% | visible                                                                   |

**D-1 · The two newest systems are the two hardest to find.** Delegation
(Phase 20) is a panel at the bottom of the Faculty screen, 2.9 screens below
the fold behind 32 faculty cards in six school sections. Campaigns (Phase 21)
is at the bottom of the Students screen, **5.3 screens down**, behind the
classes table, the named students, the placement panel and the alumni ledger.
Neither has a route in the seven-tab dock. Delegation is the mechanic that
gates 4× and 8× time; a player who never scrolls the Faculty screen to the
bottom never discovers why the clock will not go faster.

**D-2 · A mandatory blocking beat hides its only button.** Budget & Hiring
cannot be dismissed and must be resolved, and its resolve button sits at
y=1604 — 1.9 screens down at 1440×900, 1.6 at 1920×1080 — with no visible
scrollbar or fade to say so. `12-beat-budget-hiring--1440x900.png`. The other
three beats fit in one screen.

**D-3 · Overlays do not use the width they are given.** The Budget & Hiring
card is 620px wide in a 1440px viewport — 57% of the width is empty cream —
while its content scrolls two screens vertically. At 1920 the margins grow and
the scroll does not shrink proportionally. The Build menu has the inverse
problem: four building cards in a row that could hold seven, with the `place`
buttons clipped by the ticker at the fold (`14-build-menu--1440x900.png`).

**Best-designed screen: the inline event.** `13-event-inline--1440x900.png`.
It is the only surface that gets every decision affordance right at once: it
sits low over the campus without hiding it, states its deadline ("3 weeks to
decide"), prices both choices in their own subtitles ("$900k" / "Cheap; the
hole stays"), and names what happens if you ignore it — _"Left alone, this
settles as: Tarpaulin and a fundraising appeal."_ Nothing is hidden and nothing
needs scrolling. One flaw: the ticker beneath it repeats the entire 200-character
event body verbatim in ~10px type, crowding out everything else the strip
could say.

**Worst-designed screen: History.** 29 words, one screen, 8% ink, 92% empty
cream. At Year 33 it says _"What the college has promised — Nothing promised,
and nothing owed"_ and then, in a dashed box, _"Arrives in Phase 26."_ It is a
full tab in the dock, reachable in one keystroke from anywhere, that shows a
player in the thirty-third year of their university a development note.
`06-mature-y32-history--1440x900.png`.

### 5e. World logic

Things the simulation permits that the institution would not. These are not
crashes; they are places where the model and the fiction have come apart.

**W-1 · There are no bridges, and the parcel needs one.** The stream
(`src/content/terrain.json`, eight points from col 61 row 0 to col 56 row 60,
2 tiles wide) severs the east edge of the parcel. Measured:

```
buildable tiles        3782
reachable on foot      3470
cut off by the stream   312   (8.2% of the parcel: cols 56–63, rows 0–60)
```

`tileIsOpen` (`src/sim/campus.ts:108-112`) refuses paths on blocked tiles, so
**0 stream tiles can be paved**. The paint palette is exactly
`['path', 'erasePath', 'plant', 'fell']` (`src/sim/actions.ts:79`) — nothing
crosses water. No building in `src/content/buildings.json` is a bridge. And
yet the sim permits **1,507 distinct legal placements entirely inside the
severed strip**, `academic-hall` among them: a lecture hall on an island, with
students enrolled into it. Nothing anywhere models reachability.

The content already knows about both halves of this. The Civil Engineering
blurb (`src/content/schools.json:201`) reads _"**Bridges**, roads and the
buildings the college keeps losing to backlog"_, and the Environmental
programme (`:257`) reads _"Water, air, waste, and **the stream at the edge of
campus**"_. The fiction has a stream at the edge of campus and a department
that builds bridges; the map has neither crossing nor gate.

**W-2 · Faculty never age, retire, or get promoted.** Fifty years of
`played(4242, 50)`:

```
Keiko Otieno      assistant  hired Y1  49 years served  T52 R32  $65k
Emeka Kang        full       hired Y1  49 years served  T70 R86  $175k
Anika Beaumont    associate  hired Y1  49 years served  T68 R56  $112k
ranks after fifty years: {assistant: 15, associate: 11, full: 6}
longest service 49 years; shortest 44
```

Keiko Otieno is an Assistant Professor in Year 51, forty-nine years after being
hired, on the same $65,000, with the same teaching and research scores. The
whole roster was hired in the first seven years and not one person has left in
half a century. `Faculty` (`src/sim/faculty.ts:44-57`) has no age and no tenure
clock; `rank` is written at hire and never again; `hiredWeek` is recorded and
only displayed. The only exit is the Dismiss button.

This has a mechanical edge, not just a fictional one: programme advancement
requires an Associate or Full Professor assigned (`academics.ts:189-192`, and
the Curriculum screen's "Needs an Associate Professor assigned to advance"), so
the only route to a senior rank is buying one off the market. A college can
never grow its own.

**W-3 · Founders Hall can be demolished, and its school survives homeless.**
`canApply('demolish')` (`src/sim/actions.ts:203-209`) checks only that the
building exists and that the cash is there. Nothing checks whether a school
lives in it. Demolishing the hall that houses the School of Arts & Letters,
twelve years in:

```
demolish its hall   ALLOWED
school still stands true
its hall now reads  p1
schoolInHall        arts-letters
3 years later: programs 25  enrolled 770  schools 5
```

The school keeps running with `placementId` pointing at nothing;
`hallName()` (`academics.ts:367-369`) falls back to returning the raw
placement id, so the UI will print **`p1`** where a building name belongs.
Three years on, twenty-five programmes and 770 students have not noticed.

Founders Hall's own blurb calls it _"the first thing on the land and the last
thing anyone will agree to demolish."_ The sim sells it for the demolition fee.

**W-4 · Every class has the same satisfaction, always.** `Cohort`
(`src/sim/people.ts:71-76`) carries a per-cohort `satisfaction`, and
`peopleWeek` (`people.ts:543-558`) computes **one campus-wide number** and
writes it into every cohort including the incoming class. Quality, in the same
loop, is genuinely per-cohort (`driftedQuality(c.quality, teaching)`).

The Students screen therefore shows a SATISFACTION column of four identical
numbers, forever: `49, 49, 49, 49` in
`06-mature-y32-students--1440x900.png`, `44, 44, 44, 44` in the A/B runs. It
promises a comparison it cannot make. Downstream, `Alumni.satisfaction` is
documented as _"as they left"_ (`people.ts:103`) but holds the campus-wide
figure at graduation — so a class that spent four years in triples in a
crumbling college and a class that spent four golden years remember the
institution identically, and give identically.

**W-5 · A condition-zero building serves at full capacity.** Covered under
[A2](#a2-the-estate-is-profitable-to-abandon); restated here because it is the
same failure of kind. The map draws a building as `derelict`, the Treasury
prices its backlog at nine figures, and it still sleeps 200 students.

**W-6 · Flood damage is unrelated to the water.** `events.json:580` — _"The
basement of {building} took nine inches of water in the night."_ The subject is
drawn without reference to the stream, so a building on the far ridge floods as
readily as one on the bank. The map has a river and the event system has a
flood, and they have never been introduced.

**Checked and sound.** Several suspicions did not survive testing, and are
recorded so nobody re-opens them: housing, dining and teaching shortfalls _do_
penalise satisfaction proportionally (`satisfactionBreakdown`, `people.ts:406`)
and admissions closes the file early for want of beds (`people.ts:88`);
buildings _do_ fell the trees and lift the paths under their footprint
(`campus.test.ts:84`); trees _can_ return, by the `plant` tool and by event
(`events.ts:373-392`); debt is capped at 40% of endowment
(`DEBT_CAP_SHARE_OF_ENDOWMENT`).

---

## 6. Triage

### BLOCKERS — fix before Stage 5 continues

| #      | finding                                                                                                                                                                                                                             | where                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **B1** | A live mechanic the player has defunded reports itself as unbuilt: Maintenance "$0 · arrives in Phase 6" on a college with $98.7M of backlog. Four of the seven shipped phase markers are stale.                                    | [C-4](#5c-new-player-comprehension)               |
| **B2** | `deferMaintenance` and receivership both latch the standing maintenance level permanently; the stated budget default never restores it. A player who takes the board's medicine and accepts defaults never funds maintenance again. | [A3](#a3-an-emergency-cut-outlives-the-emergency) |
| **B3** | Budget & Hiring is a mandatory blocking beat whose resolve button is 1.9 screens below the fold with no scroll affordance.                                                                                                          | [D-2](#5d-information-density)                    |
| **B4** | Buildings, including lecture halls, can be placed on 312 tiles the stream cuts off, with no bridge, no crossable path tile, and no reachability model. 1,507 legal placements.                                                      | [W-1](#5e-world-logic)                            |
| **B5** | Demolishing a school's hall leaves the school running and leaks a raw placement id (`p1`) into the UI as a building name. Founders Hall is demolishable.                                                                            | [W-3](#5e-world-logic)                            |

B1 and B3 are shipping-quality defects in surfaces the player cannot avoid.
B2, B4 and B5 are states the sim permits that it should not.

### FIX BEFORE STAGE 6

- **D-1** Delegation and Campaigns are 2.9 and 5.3 screens below the fold on
  screens that do not announce them. Delegation gates the time controls.
- **W-4** Per-cohort satisfaction is a campus-wide number copied four times;
  the Students screen shows a column that can never differ, and alumni memory
  is history-free.
- **L-1** "Chapel Green" at 2.13:1 on grass — the only map-placed text, and
  the least readable.
- **L-2 / L-3** The HUD's headline money is typographically damaged: `$`
  reading as `§` in the weekly rate, and a decimal point with a digit's width
  in "$32 . 4M".
- **A-1 / A-2** A tree in a doorway, and buildings with no entrance on any
  visible face.
- **C-6** A tooltip that covers the value it explains.
- **D-3** Overlays that waste 57% of the width while scrolling two screens.
- The event ticker repeating the full event body verbatim under the event card.

### PHASE 29 (onboarding)

- **C-1** Two unlabelled HUD chips, one showing `—` for the whole run.
- **C-2** `T` / `R` on 32 faculty cards, never expanded.
- **C-3** `2 / 6` on every programme row, never explained.
- **L-4** The disabled founding button never says a name is required.
- **C-5** Repeated named-student lines: with four cards on screen the pool is
  visibly thin. Worth revisiting when §14's content targets are filled.
- **The History tab**: 29 words and a development note, in the dock from Year 1.
  Either fill it earlier or fold it away until Phase 26.
- **A-4 / A-5** The Gothic entrance void and the unseated Classical dome — the
  weakest two moments in an otherwise excellent motif system.

### PHASE 31 (balance)

- **§17.5** Admin share 49.7–51.1% against a 25–40% band, with all eight seats
  filled — and no restructuring action exists to bring it down (DD §5.4, flagged
  unbuilt in the DD itself). The passive college's 100% is a division by an
  empty denominator and should probably not report a ratio at all.
- **§17.3** 1 player-decided event per 19.3–38.6 weeks against a 1-per-2–4
  target; 1 per 6.1–7.2 with beats counted. The delegation mechanism works
  (31–36 questions taken off the desk); the dial is low.
- **A1** Teaching is nearly free to abandon: −1% to −4% enrolment, 0 to −2.6
  quality, and **more cash on two seeds in three**.
- **A2** The estate is profitable to abandon: every building ruined, $136–170M
  of backlog, richer on all three seeds and larger on one, never distressed.
  Two mechanisms to weigh: condition never touches capacity
  (`people.ts:183-193`), and a fully ruined campus still scores 62/100 on
  beauty, above the neutral 50 (`BEAUTY_WEIGHTS`, upkeep at 0.25).
- **W-2** Faculty never age, retire or get promoted; a college can never grow
  its own Associate Professor, and the roster is frozen from year 7 to year 50.
- **W-6** Flood events are drawn without reference to the stream.
- **§17.2 is fine** — worst case 73% of its own cap. No action.

### PHASE 32 (hardening)

- The 635 kB / 197 kB-gzipped single JS chunk, `buildingMotifs.tsx` its largest
  contributor, noted here so profiling starts with a known suspect.

### Proposed blocker PRs — for your approval, not yet opened

Five, deliberately small and separable. None touches `tuning.ts`.

**PR 1 — `fix/stale-phase-markers`** (B1)
Drop the four stale `phase` markers from `treasury.json`, `seats.json` and
`faculty.json`, and change `TreasuryScreen.tsx:44`'s `idle` test so a
phase-marked line is styled unbuilt only when the phase has not shipped —
not merely when the amount is zero. Content and one predicate; no sim change.
_Open question for you:_ whether the remaining player-facing "Phase N" strings
should become plain language ("not yet"), which would be a DD §13.3 decision
rather than a fix.

**PR 2 — `fix/maintenance-latch`** (B2)
Make the austerity cut and the receivership policy temporary rather than
standing: record the college's own maintenance level when either overrides it,
and restore it on exit. `distress.ts:165-176`, `treasury.ts:355`, a schema bump
with migration for the remembered level. The `it.fails` in
`audit.phase-21.test.ts` becomes `it`.

**PR 3 — `fix/beat-resolve-visible`** (B3)
Pin the beat's action bar to the bottom of the overlay so the resolve button is
always in view, and give the scrolling body a visible edge. CSS and
`BeatScreen.tsx` layout only. `tools/density.mjs` is the regression check.

**PR 4 — `feat/crossings`** (B4)
The smallest honest fix is a placement rule, not a new building: refuse a
placement that has no walkable route to the road, and say so in the refusal
text the way the terrain refusals already do. A bridge in the build menu is the
better game and a bigger change — it needs a DD §6.1 decision about whether the
parcel's far bank is meant to be reachable at all, so I would raise that in
chat before writing it rather than deciding it in a phase.

**PR 5 — `fix/demolish-occupied-hall`** (B5)
Refuse `demolish` on a hall that houses a school, with a reason; make
`hallName()` return a word rather than a placement id when the placement is
gone. `actions.ts:203-209`, `academics.ts:367-369`. Whether Founders Hall
should be undemolishable outright is a DD question — its own blurb says it is.

---

_Audit run at `audit-phase-21`. Artefacts: `tools/` (harness, smoke,
guardrails, scenarios, screenshots, density), `src/sim/invariants.test.ts`,
`src/sim/audit.phase-21.test.ts`, 88 images under
`docs/audits/phase-21/screenshots/`._
