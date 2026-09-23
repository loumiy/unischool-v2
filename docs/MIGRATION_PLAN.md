# UniSchool: merging V2 into V1

A migration plan built from the owner's feature-by-feature decisions in [`V1_ADOPTION_LIST.md`](V1_ADOPTION_LIST.md): 60 V2 features and 40 V1 features, each kept, modified, merged or scrapped. Draft for the owner's review.

## The decision: V1 is the base

**Build on V1's codebase (`loumiy/unischool`) and port V2's features into it.** This reverses the recommendation given before V1's code had been read. It was made on V2's feature count alone. Once both codebases were in hand, the decisions pointed the other way:

- **The core loop you chose is V1's.** The systems at the centre of the game, and the ones most entangled with everything else, are V1's:
  - the curriculum (halls, slots, offers, tiers, grades);
  - the faculty market;
  - commissioned research and graduate programs;
  - the admissions decision and the seats cap;
  - the served-population satisfaction model that scales to 40,000;
  - the graded prestige stock;
  - the athletics department;
  - clubs and Greek life;
  - the 126-tile map;
  - the tab shell;
  - the summer stop.

  Rebuilding all of that inside V2 would be the larger job.

- **Most of what V2 contributes is layered on top of that core, not woven into it**:
  - the treasury and the distress ladder;
  - delegation;
  - alumni, reunions and campaigns;
  - ambitions and capital projects;
  - identity tags and the rival;
  - the estate's ageing;
  - events;
  - the ending;
  - audio;
  - map life and building art.

  V2's sim is pure TypeScript with its content in data files, so these port as modules.

- **V1 already follows the architecture you wanted from V2**: one state, pure weekly tick functions, no UI in the engine, a headless simulator. It is missing four things: seeded randomness in the state, an action log for replay, validated content files, and (later) save migrations. Each can be added to V1 in place, without a rewrite.
- **The two maps share their projection math** (the same 64×32 tile, `project`, `lift` and `boxFaces`). V2's map layers port with a thin adapter from V1's placements, paths and trees, not a redraw.

What does not port as code is V2's shell, its curriculum, its calendar beats, its charters and its adjuncts. You scrapped all of those anyway.

## Rules for the merged codebase

- **V1's existing rules stand**:
  - one `GameState`;
  - each system a pure `(state) => void` tick in a fixed order;
  - the UI dispatches actions and systems never do;
  - all tunables as named constants;
  - the single Buildable model (V1-37).
- **Added from V2**:
  - one seeded random generator carried in the state (no `Math.random`, no `crypto.randomUUID`);
  - every action logged, so a run can be replayed exactly;
  - no side effects in the reducer (saving moves out of it);
  - content in data files validated at load;
  - a style guide for all writing, with jokes used sparingly (V2 #58).
- **Saves**: discarded on version change during development, as V1 does now. Migrations begin with the first public release (V1-38).
- **Every phase ends with a playable game and passes the merged balance harness.**

## Phases

Each phase is one plan, one branch and one PR (or a few), in V1's `docs/plans/` style. The sizes are relative (S, M, L, XL), not estimates.

### Phase A: foundations (M)

Make V1 ready to receive V2's systems, and able to measure them.

- **Seeded random generator in `GameState`.** Replace `Math.random` in about 15 files, and `crypto.randomUUID`, with draws from it. The harness's monkey-patch goes away.
- **Action log and replay.** Take `saveGame()` out of the reducer. A replay test proves a logged run reproduces exactly.
- **Content validation.** New content goes in data files with a loader that validates it. Existing `src/data/*.ts` moves over opportunistically, starting with anything a later phase touches.
- **Merged balance harness (V1-39).** V1's seven strategies, reference bands, scorecard and `--compare`, plus V2's seeds and guardrails: pacing minutes, sting, saturation, event variety, idle stops.
- **Tooling (V1-40).** Port V2's debug panel (+$1B, fire any event, listening bench), the scripted new-player run and the profiler, beside V1's scenario and screenshot tools.

### Phase B: the unlock track (L, the biggest design task)

A new system (V1-29) that neither game has. It is what fixes V2's overwhelming first hour.

- **Design first**, in its own document: a Cities: Skylines-style ladder of milestones.
  - The milestones come from what the college achieves: curriculum milestones (program established, school founded, school distinguished) (V1-7), enrolment, prestige, and the first graduates.
  - Each milestone unlocks a named set of buildings, tabs and systems.
  - The ladder is shown to the player.
  - V1's old gates are a reference for thresholds and are then retired.
- **The founding sequence (V2 #3)**: a short curated build list, with the curriculum first.
  - V1's walkthrough is the ladder's first rung (V1-3).
  - V2-style onboarding letters then introduce each unlock as it lands (V2 #2).
- **Tab gates fold into the ladder** (V1-33). Speed tiers follow in Phase G.

### Phase C: the campus map (L)

Port V2's map layers into V1's renderer, with an adapter from V1's placements, paths and trees.

- **Camera**: V2's ten tilt pitches in place of V1's three (V2 #45). Tab shortcuts never take a camera key (V1-33).
- **Paths and quads**:
  - quads are detected, and paths inside a quad never split it (V2 #34);
  - quads can also be designated by hand;
  - **curved and diagonal paths** (new);
  - the rule that every building must be reachable from the road (V2 #35);
  - a road edge and a founding woodland on V1's 126-tile parcel, with no stream (V2 #37, #48).
- **Life on the map**:
  - walkers, with the students-per-walker ratio rethought for 40,000 students and the rotation glitch fixed (V2 #38);
  - desire lines and bike racks;
  - lamps and benches placed by the player (V2 #39);
  - crowds in the stands on game weeks (V2 #40);
  - flags and event banners (V2 #46).
- **The estate made visible**: age marks and ivy (V2 #44), and the crane and scaffolding for construction (V2 #47).
- **Performance budget, set up front**. V2 dropped to 47 fps on a large campus, and V1's parcel is four times larger. Use a static-layer rule from the start: draw what doesn't move once into a cached layer, animate only the walkers over it, and keep layers keyed on the layout rather than the whole state. The profiler gates every map PR.

### Phase D: the building catalogue (XL: mostly art)

- **Port V2's building types** (V2 #41) as Buildables, gated by the unlock track, with every item on the Campus art list fixed:
  - rooftop features kept only where they read well (V2 #42);
  - a taller observatory;
  - no entrance aprons.
- **School halls change their look when dedicated** (V1-5, proposed): a mixed hall is generic; a founded school's hall becomes its signature building.
- **Capstone and research facilities vary by discipline** (V1-7, V1-10): labs, an observatory, a performing arts centre, a library addition. They are designed together with commissioned research.
- **Graduate halls are capital projects** (V1-11): the Medical School and the Research Park.
- **Athletics venues**: V1's ground and venue art, and a real stadium bowl (V1-32).
- **Grand landmarks** with bespoke art, built in visible stages (V2 #43).
- **Capacity per building stays logical and readable** (V1-30, proposed). Bigger variants unlock later, and storeys add capacity (V2 #36).

### Phase E: the estate and layout (M)

- **Condition, backlog, renovation, storeys** (V2 #36) and **historic status** (V2 #28). These are new to V1.
- **Campus beauty and layout effects**, capped at about 12% (V2 #33). Beauty feeds admissions (V1-13) and prestige (V1-21).

### Phase F: money (M)

- **V2's treasury in V1's finance system** (V2 #9):
  - the endowment draw rate;
  - debt financing for buildings;
  - gift-financed buildings;
  - V1's pay-up-front becomes one financing option among three.
- **The distress ladder** (V2 #10), in place of V1's "stalls, never ends".
- **The administrative ratchet**, from seats only (V2 #11).
- **Scaled event prices**; moving cash to the endowment is manual (V2 #12).
- **The late-game margin (open).** V2's review found well-run colleges end with a 42% operating margin, and the owner chose V2's costs (V1-25). Decide the fix here, measured on the merged harness. V1's per-section instruction and prestige-rated salaries are the candidate.

### Phase G: delegation and time (M)

- **The seats** (V2 #24): Provost, a Dean per school, Facilities, Dean of Students, VP Advancement, each answering its domain's routine events by policy. Deans map onto V1's founded schools.
- **Speed tiers earned by seats** (V2 #5, V1-2), on V1's 52-week year and speed values.

### Phase H: people (L)

- **Faculty** (V1-9, V2 #16):
  - V2's quirks on V1's market;
  - retirement, and poaching with counter-offers;
  - a Faculty tab that shows only developed fields.
- **Admissions** (V1-13, V1-14): V1's decision and caps, with tags, beauty and reputation feeding the pool, plus a projection line. The cohorts feed identity tags.
- **Satisfaction** (V1-15): V1's six attributes, with V2's rising expectations and diminishing returns.
- **The Students tab** (V1-33): V1's Student Life and Enrollment merged into V2's Students screen.
- **Clubs and Greek life** tied to tags and warmth (V1-17, V1-18).
- **Demands** delivered through the event panel (V1-16).

### Phase I: alumni and advancement (M)

- **Class memories, warmth and the annual fund, reunions, campaigns** with resonance and restricted gifts (V2 #21–23). These replace V1's endowment campaign.

### Phase J: the world (M)

- **Prestige**: V1's graded stock stays the engine, with V2's reputation inputs and beauty folded in (V1-21, V2 #20).
- **Six standings in the league** (V1-22).
- **The field and the report**: V1's 100-school field and the top-50 reveal, with the report charted on screen (V1-23). History is proposed as the home for the league table (open, V1-33).
- **Identity tags** (V2 #30).
- **One rival**, who is also the rival in the college's main sport (V2 #31, V1-20).
- **Athletics**: V1's department, with V2's climbing schedule (V1-19).
- **The defend era**, paired with a late tier of capital projects (V1-24, V2 #27).

### Phase K: events (M: mostly writing)

- **The event system**: V1's interrupt engine (pacing, queue, never dropping) drives V2's event panel and seismic letters (V1-4, V2 #6, #7, #50).
  - Events are held back in the first year, and the cadence scales with the college's size.
  - Only V1's celebratory interrupts stay: milestones, prizes, championships, the rankings entry.
- **Port V2's catalogue** and rewrite it for the merged systems:
  - drop charter and adjunct events and "the loss";
  - retarget events at V1 concepts (courses, halls, cohorts);
  - apply the style guide.
- **V1's own decision events are scrapped** (V1-26).

### Phase L: goals and the ending (M)

- **Ambitions and decade ambitions** (V2 #25, #26) replace V1's achievements (V1-27).
- **Capital projects**, including the late tier and the graduate halls (V2 #27).
- **The summer**: Admissions and the Students digest stay. Review is rebuilt from V2's material (class memories, warmth, eras, the year's events), and Standing is dropped (V1-1).
- **The ending**:
  - the chronicle (V2 #53);
  - the Final Report (V2 #54), replacing V1's legacy (V1-28);
  - the Epilogue (V2 #55);
  - the hall of fame, without unlockable palettes (V2 #56, V1-35).

### Phase M: presentation (M)

- **Shell and screens**:
  - V1's shell and startup screen, with V2's title screen and main menu (V1-35);
  - V2's ticker strip and NEXT slot in place of V1's toasts (V1-34);
  - V2's build menu, with V1's hall panel (V1-36);
  - the history charts (V2 #51).
- **The one-tooltip rule and accessibility settings** (V2 #52).
- **Audio**: port it, then tune the levels by ear (V2 #57).

### Phase N: balance and playtest (L)

- **Refit the economy**, prestige and pacing on the merged harness: seven strategies plus V2's guardrails.
- **Playtest the first hour** with a person, not only the script.
- **Write a review** in the shape of the V2 reviews, so the merged game can be compared with both.

## Order and dependencies

- **Phase A comes first**, because every later phase is measured by its harness and relies on its seeded random generator.
- **Phase B (the unlock track) blocks Phases D and M's onboarding.** Its design document can be written while A is built.
- **Phases C and D can run alongside E–J**, since they are mostly presentation.
- **Phase F before Phase G**: the seats' costs need the admin ratchet.
- **Phase H before Phase J**: tags read the cohorts, clubs and satisfaction.
- **Phase K after the systems its events name**: F, G, H, I and J.
- **Phase N last**, with a light balance pass at the end of every phase.

## Still open

These are from the decision list. None of them blocks Phase A.

1. **Seasons on the map** (V2 #8): one subtle cue, off by default, or none.
2. **Named students** (V2 #19): 3–5 per class, 1–2, or none.
3. **Halls changing their look when dedicated** (V1-5): proposed, and waiting for confirmation.
4. **Logical per-building capacities instead of tiered chains** (V1-30): proposed, and waiting for confirmation.
5. **The fix for the late-game margin** (V1-25), in Phase F.
6. **Where the league table and its charts live** (V1-33): History is proposed.

## Risks

- **Map performance at V1's scale.** The parcel is four times V2's and aims at 40,000 students. The static-layer rule and per-PR profiling in Phase C are the mitigation. Don't defer them.
- **Porting V2's writing.** About 190 events name V2 concepts (programs, beats, charters, adjuncts). Retargeting them is real work, but it's writing, not engineering. The reachability test ports with them.
- **Rebalancing from scratch.** Merging V2's money, delegation and alumni into V1's economy invalidates V1's reference bands. The merged harness should re-derive them in Phase N, not force old numbers.
- **Scope.** This is a large merge. The ladder in Phase B and the art in Phase D decide whether the first hour and the campus land. If time is short, those two outrank the rest.
