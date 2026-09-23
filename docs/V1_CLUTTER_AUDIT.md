# V1 clutter audit

This audits `loumiy/unischool` at `76a65e7` (the V1 base chosen in `MIGRATION_PLAN.md`). The worry was that V1 had been rewritten so many times that it had become cluttered. Everything below was measured, not estimated. The numbers come from `tsc`, `oxlint`, `knip`, the test suite and grep over `src/`, `sim/`, `tools/` and `test/`.

## Verdict

**V1 has almost no dead code. Its clutter is history written into comments.**

- Every rewrite removed the old code. What it left behind is prose describing the old code: "no longer", "used to", "Plan 15's PR G".
- 38% of V1's lines are comments. V2 is at 9%.
- The files read as long and layered because they narrate their own history, not because old code is buried in them.
- This is cheap to fix and doesn't change the decision to use V1 as the base.
- The code-level problems that do matter are few and specific:
  - tests that no longer match the types;
  - duplicated formatting helpers;
  - two dead fields in the save;
  - a reducer holding game logic and a side effect;
  - randomness outside any seed.
- The randomness and the reducer side effect were already in Phase A. The rest are added to it below.

## What's clean

| Check | Result |
| --- | --- |
| Typecheck (`tsc -b`) | Clean. |
| Typecheck under `--strict` (not enabled in the config) | Also clean, with zero errors in `src/`, `sim/` and `tools/`. |
| Unused locals and parameters | Enforced by `noUnusedLocals` and `noUnusedParameters`. No unreferenced private function or variable can exist in any file. |
| Lint (`oxlint`) | Zero warnings. |
| Unused files (`knip`) | None. |
| Commented-out code | None found. Every `// const …` style match is prose. |
| `TODO` / `FIXME` / `HACK` | Zero. |
| CSS classes never referenced in code | None found among 898. |
| Test wiring | All 55 test files are in `npm test`, and every script points at a file that exists. |
| Test suite | All 55 suites pass. |
| Retired features | Removed, not disabled. There's no private/public fork, no Pace, no development slots, no gen-ed core. Nothing is behind a dead flag. |
| Plan documents | Plans 10–13 sit beside 15–17 with the same names, but `docs/plans/README.md` marks each as "Superseded by Plan N". It's an archive, not confusion. |

**Unused exports.** `knip` flags 79 exported values and 40 exported types that nothing outside their own file imports. All but 11 values are used inside their own file, so they're only needlessly `export`ed. The 11 genuinely dead values are:

- `TreasuryIcon` (`src/components/icons.tsx`)
- `getCamera` (`src/components/isoProjection.ts`)
- `gradeFraction` (`src/data/courseQuality.ts`)
- `heritageForId` (`src/data/facultyData.ts`)
- `RESEARCH_OUTPUT_COOLDOWN_WEEKS`, `researchOutputWeeklyChance`, `CHEAPEST_OUTPUT_COST`, `initiativeOutputChance` (`src/data/researchData.ts`): the remains of an older research-output model
- `describeFinish`, `playerSportStrength` (`src/systems/athletics/playoffs.ts`)
- `instructorOf` (`src/systems/faculty/facultyAssignment.ts`)

That is about 11 dead symbols in 51,000 lines of source.

## Where the clutter is real

### 1. Comments that tell the history instead of the code

| | V1 | V2 |
| --- | --- | --- |
| Source lines (`src`, `sim`, `tools`) | 51,361 | 45,296 (`src`) |
| Comment lines | 19,651 (38%) | 3,863 (9%) |

The heaviest files by comment share:

| File | Lines | Comments |
| --- | --- | --- |
| `src/state/types.ts` | 1,721 | 66% |
| `src/state/actions.ts` | 877 | 61% |
| `sim/balanceSim.ts` | 2,376 | 50% |
| `src/components/buildingSpec.ts` | 1,751 | 50% |
| `src/systems/prestige/prestigeSystem.ts` | 1,063 | 49% |
| `src/data/studentLifeData.ts` | 1,646 | 47% |

What fills them:

- **594 references to plans and PRs** ("Plan 17's PR A", "Plan 07's PR B retired…").
- **About 280 history notes** ("used to", "previously", "the old", "in the prior four-input version").
- **About 120 "no longer / retired" notes.** One example is `prestigeSystem.ts:118-123`, which explains the weight of an input that was removed.

Comments like these rot. `types.ts:1612` introduces the badge state as "Three independent slices" and then lists four. The fourth is the dead one, which is described 20 lines later.

This is almost certainly where the "rewritten and overwritten" feel comes from. The rewrites were clean, but each one left an account of itself in the files.

**The fix:**
- Move the history into git and the plan documents, where it already lives.
- Cut each comment to what the code does now and why.
- Aim for roughly V2's density.
- This is mechanical, safe and reviewable file by file. It touches no behaviour, so the tests prove it.

### 2. Tests that have drifted from the types

`tsconfig` covers `src`, `sim` and `tools`, but not `test`. The tests are bundled by rolldown, which strips types without checking them. Typechecking `test/` finds **22 errors in 11 files**, several of them from retired features:

- **The retired `'private'` founding type:**
  - `faculty-capacity.test.ts:52, 84, 114, 132`
  - `sport-standings.test.ts:43`
- **A `'inProgress'` status that no longer exists:** `tab-gates.test.ts:75`.
- **A fourth argument to a three-argument function:** `cohorts.test.ts:66, 110, 115`.
- **A `SportDefinition.name` field that is gone:** `sport-standings.test.ts:109`.
- **Six `Property 'type' does not exist on type 'never'`**, where a narrowing now proves the branch unreachable:
  - `athletic-director.test.ts:102, 110`
  - `playoffs.test.ts:156`
  - `research-completion.test.ts:165, 175, 186`

The tests still pass, but some of them are exercising a shape the game no longer has. They may be checking less than they appear to.

**The fix:**
- Add `test/` to the sim `tsconfig`.
- Fix the 22 errors, each one by asking what the test meant.
- Move the runner to Vitest, as V2 uses. Today each suite bundles separately, 55 suites are chained with `&&`, and the first failure hides every later result. The full run takes **26 minutes 40 seconds**, most of it in the balance suites, each of which runs the whole 40-year simulation. Nobody will run that before every commit. Split them into a fast suite and a slow balance suite, as V2 does.
- The repository has **no CI** (there's no `.github/`), so none of this ran automatically. Add the same workflow V2 has.

### 3. Duplicated helpers, with visible inconsistency

- **`money()` is defined 7 times:**
  - `moneyScale.ts:35`
  - `InterruptModal.tsx:49`
  - `DebugPanel.tsx:43`
  - `TreasuryTab.tsx:37`
  - `StudentLifeTab.tsx:42`
  - `AthleticsTab.tsx:30`
  - `yearInReview.ts:71`
- **The copies render a negative figure three different ways:** `$-5,000` (Athletics, the event modal), `-$5,000` (Treasury) and `−$5,000` (the year in review). A player can see all three.
- **`clamp()` is defined 6 times:**
  - `prestigeSystem.ts:178`
  - `demandSystem.ts:77`
  - `rivalsSystem.ts:268`
  - `satisfactionSystem.ts:207`
  - `admissionsSystem.ts:331`
  - `eventData.ts:80`
- **Other duplicates:** `surnameOf` (Curriculum and Faculty tabs), `ordinal` (`InterruptModal.tsx`, `season.ts`) and `pct` (three files).
- **Two different functions share the name `teachingQualityScore`:** `satisfactionSystem.ts:277` and `courseQuality.ts:271`.

**The fix:** one `format.ts` and one `math.ts`, a single negative-money style, and the duplicate name renamed.

### 4. Dead state in the save

These fields are kept in the saved shape only to avoid writing a migration:

- **`ResearchState.points`** (`types.ts:946`), which is written by nothing and read by nothing.
- **`SeenState.candidateIds`** (`types.ts:1632`), for the retired faculty badge. Nothing writes it and nothing reads it.

Saves are discarded until release (V1-38), so both can simply go.

### 5. The reducer holds game logic and a side effect

- **`reducer.ts` has 56 cases in 1,339 lines.** Several are systems in their own right: `RESOLVE_ADMISSIONS` is 205 lines, `START_INITIATIVE` 77 and `PLACE_BUILDABLE` 66.
- **It calls `saveGame()`** (`reducer.ts:936, 1319`). It says so honestly at `:113`, but it's still a side effect.
- **It `structuredClone`s the whole state on every action** (`:237`).

**The fix:**
- Move the long cases into their systems, so the reducer only dispatches.
- Move saving out. This is already in Phase A.
- Leave the clone until profiling says otherwise.

### 6. Randomness outside any seed

- **`Math.random`: 65 calls in 17 files.**
- **`crypto.randomUUID`: 8 calls.** Three of them are in data files, so building a candidate or a coach has a side effect:
  - `demandSystem.ts`
  - `studentLifeData.ts`
  - `facultyData.ts`
- The balance harness and the invariants test make runs repeatable by monkey-patching `Math.random` (`sim/balanceSim.ts:86-90`, `test/invariants.test.ts:40`).

This was already Phase A's first item. The audit only confirms the count.

### 7. A live path with one remaining user

- **`needsSiting`, `sitingFeeOf` and `RETROACTIVE_SITING_COST`** (`campusMap.ts:370-401`, plus branches in `BuildPopup`, `CampusMap` and the reducer) exist to site a building that is already `done` but has no place on the map.
- **The comment explains that Greek housing no longer reaches this path.** The only remaining user is Founders Hall in the guided opening, which is charged nothing.
- **It's live, so it's not dead code, but it is a general mechanism kept for one case.** Replace it with the opening placing Founders Hall as an ordinary free build.

### 8. Large files

| File | Lines | Comments | Code |
| --- | --- | --- | --- |
| `buildingMotifs.tsx` | 3,703 | 24% | Real drawing code, one function per building look. Phase D replaces much of it with V2's catalogue art. |
| `balanceSim.ts` | 2,376 | 50% | Half comment. It becomes the merged harness in Phase A. |
| `types.ts` | 1,721 | 66% | Under 600 lines of actual types. |
| `CurriculumTab.tsx` | 1,689 | | |
| `InterruptModal.tsx` | 1,597 | | Holds every beat and every event body in one component. It shrinks when events move to V2's panel (V1-16, Phase K) and the Standing beat goes (V1-1). |

After the comment trim, most of these are ordinary sizes. Don't split them for their own sake. The phases that touch them will split them where they change.

## Added to Migration Phase A

Phase A gains a clean-up pass before any V2 system arrives. It's one PR per item, and each is testable on its own.

1. **Tests typechecked and on Vitest, split into fast and slow suites, with CI.** This goes first, so every later step is checked.
2. **Comment trim**, file by file: history out, the what and why in. It ships with no behaviour change, and the tests prove it.
3. **Shared `format.ts` and `math.ts`**, with one negative-money style.
4. **Dead exports and dead save fields removed:** the 11 symbols above, plus `research.points` and `seen.candidateIds`.
5. **Long reducer cases moved into their systems**, and saving moved out of the reducer.
6. **Retroactive siting replaced** by an ordinary free build for Founders Hall.

After that, Phase A continues as already planned with the seeded random generator, the action log, content validation, the merged harness and tooling.
