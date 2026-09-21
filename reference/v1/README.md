# v1 reference export

**Source repo:** `loumiy/unischool` (https://github.com/loumiy/unischool)
**Exported from commit:** `76a65e7e0d734d2c69fc786105a9d95166409ea2` ("Re-shoot the README and docs screenshots, and add one per tab (#132)", 2026-09-21)
**Exported on:** 2026-09-21
**Why it exists:** DD §13.1 says v2 carries v1's visual identity forward and evolves it rather than replacing it. This folder is the curated prior art that porting phases read from.

## The rule

**Read-only prior art.** Port and adapt visuals and assets into `src/` as phases require them. Never import from `reference/v1/` at runtime. Never port architecture: `docs/UNISCHOOL_V2_DESIGN.md` §15 governs v2's sim/UI split, state tree, and content-as-data, and v1's reducer, actions, systems, and data models are not exported here on purpose.

`reference/v1/` is inert source, not a package. It is excluded from the v2 build, typecheck, lint, format, and test globs (see the root `CLAUDE.md`). Its `.ts`/`.tsx` files will not compile in isolation: imports of v1 logic that was deliberately left behind are listed in a header comment at the top of each file.

## Layout

The tree mirrors the v1 app root (`unischool/` in the source repo) so relative imports between exported files still resolve: `index.html`, `public/`, `src/`. Screenshots come from the source repo's `docs/images/` and live in `screenshots/`.

## Manifest: the six surfaces

### 1. Startup flow ("Open the Doors": name, motif, palette)

| Path | What it is |
|---|---|
| `src/components/StartupScreen.tsx` | The founding screen: name field, the five vernaculars, the eight colour pairs, the facade preview |
| `src/data/schoolColors.ts` | The eight authored colour pairs and the contrast rule they pass |
| `src/data/foundingData.ts` | `FOUNDING_VERNACULAR`; the starting preset numbers are v1 tuning, not startup UI |
| `src/components/theme.ts` | Writes the chosen pair onto `:root` as `--school-primary` / `--school-secondary` |
| `src/state/types.ts` | `Vernacular` (the five motifs: georgian, gothic, classical, mission, modern) and `SchoolColors` |

The startup screen's styles are in `src/styles.css` (search `.startup-`). The motif definitions it previews (`VERNACULARS`, `VERNACULAR_CHOICES`) live in `src/components/buildingSpec.ts` under surface 3.

### 2. Design tokens (the cream/maroon/gold register)

| Path | What it is |
|---|---|
| `src/styles.css` | The single global stylesheet. `:root` at the top holds every token: school pair, cream tints, outline ink, the derived chrome tones, grass and turf, type scale, radii, hard shadows, status colours, font stacks, chrome heights |
| `src/main.tsx` | The three self-hosted typefaces, imported via fontsource: Bricolage Grotesque Variable (display), Archivo 400/500/600/700 (text), Azeret Mono Variable (figures) |
| `index.html` | The document shell and favicon links |
| `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png` | The mark |
| `src/components/theme.ts`, `src/components/tint.ts`, `src/components/light.ts` | Theme application, hex shading, and the map's light model |

Fonts are npm packages, not files in the repo: `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/azeret-mono`, `@fontsource/archivo` (all `^5.3.0` in v1).

### 3. Map rendering (the isometric campus)

| Path | What it is |
|---|---|
| `src/components/CampusMap.tsx` | The renderer and its camera: pan, zoom, placement mode, path drawing, hit testing |
| `src/components/isoProjection.ts` | Tile-to-screen projection and grid geometry |
| `src/components/campusScale.ts` | Metres per tile, storey height, the `across`/`up` helpers |
| `src/components/depthSort.ts` | Painter's-order sorting for placed objects |
| `src/components/buildingSpec.ts` | The five vernaculars as data: materials, roofs, bays, doors, storey rules per building motif |
| `src/components/buildingMotifs.tsx` | Turns a spec into SVG polygons: every wall, roof, window, and shadow |
| `src/components/groundMarkings.tsx` | Fields, courts, stands, quads, and other ground-level marks |
| `src/components/trees.tsx` | Tree sprites |
| `src/components/pathways.tsx` | Path tiles and their joins |
| `src/components/light.ts`, `src/components/tint.ts` | Shared shading |
| `src/components/BuildingInfoPanel.tsx` | The popover for a placed building (visual shell only; its hall-slot mechanics are v1 curriculum logic) |
| `src/state/campusMap.ts` | Grid constants and footprint helpers the renderer leans on (placement rules are v1 logic) |
| `src/data/treeData.ts` | The founding-woodland generator (reference for how groves read; v2 authors terrain as data) |

Map styles are in `src/styles.css` (search `.campus-`, `--grass`, `--turf`).

### 4. UI chrome (bottom bar, ticker, identity chip, date/speed, stat chips)

| Path | What it is |
|---|---|
| `src/App.tsx` | Root composition: where the pennant, toolbar, ticker, overlays, and map sit relative to each other |
| `src/components/Toolbar.tsx` | The bottom band: left stats, tab dock, right clock and speeds |
| `src/components/StatusHeader.tsx` | The stat chips (funds, weekly net) and the clock/speed controls the toolbar composes |
| `src/components/DayTicker.tsx` | The seven day squares beside the clock showing progress through the week |
| `src/components/AnimatedNumber.tsx` | Counting numbers for the stat chips |
| `src/components/TabNav.tsx` | The bottom-bar tab dock |
| `src/components/TabOverlay.tsx` | The full-bleed screen frame every tab renders inside |
| `src/components/Pennant.tsx` | The identity chip: the school's name hung top-left in its colours |
| `src/components/LogTicker.tsx`, `src/components/LogStrip.tsx` | The bottom ticker and its NEXT prompt slot |
| `src/components/ToolbarPopup.tsx` | The popup band that opens above the toolbar |
| `src/components/BuildPopup.tsx` | The build menu as a city-builder style icon bar (visual shell; its catalogue is v1 content) |
| `src/components/MainMenu.tsx` | The top-right menu overlay (save, new game, credits) |
| `src/components/icons.tsx` | The full icon set |
| `src/components/Toasts.tsx`, `src/components/toasts.ts` | The notice layer |
| `src/components/HelpHint.tsx`, `src/components/Progress.tsx` | Shared primitives: the tooltip hint and the progress bar |
| `src/components/hotkeys.ts`, `src/components/useCssHeightVar.ts`, `src/components/playtest.ts` | Hooks and gates the chrome leans on |

The speed table the controls reference lives in v1's `engine/useGame.ts`, which is not exported. For the record it was, in milliseconds per week: paused 0 · real 5000 · double 2500 · quad 1250 · fast 150 (sandbox only). v2's equivalent is `WEEK_DURATION_MS_AT_1X` in `tuning.ts`.

### 5. Curriculum screen (visual language only)

| Path | What it is |
|---|---|
| `src/tabs/CurriculumTab.tsx` | The card rows, development states, grade chips, and the wall of empty slots. Its content model (courses, instructors, offers) is superseded by DD §7 |
| `src/data/schoolPalette.ts` | One hue and one glyph per school, used to mark rows |
| `src/components/FacultyPortrait.tsx` | Procedural portraits drawn from a hashed id |
| `src/components/HelpHint.tsx`, `src/components/Progress.tsx` | Shared primitives (listed under surface 4) |

Curriculum styles are in `src/styles.css` (search `.curriculum-`, `.course-`).

### 6. Screenshots

`screenshots/` holds all fourteen images from the v1 repo's `docs/images/`. Captions from the v1 README:

- `campus.png`: the campus map in year 51: the Grand Quad and the South Quad, the science court and Greek Row, the union and the residential quarter, the medical campus, and the venues along the north edge under the stadium
- `campus-classical.png`, `campus-gothic.png`, `campus-mission.png`, `campus-modern.png`: the same campus in four of the five vernaculars (Georgian is `campus.png`)
- `summer-admissions.png`: the summer admissions decision
- `tab-curriculum.png`, `tab-faculty.png`, `tab-research.png`, `tab-studentlife.png`, `tab-athletics.png`, `tab-enrollment.png`, `tab-history.png`, `tab-treasury.png`: one per tab

## Deliberately not exported

Everything under v1's `state/actions.ts`, `state/persistence.ts`, `engine/`, `systems/`, `sim/`, `test/`, `tools/`, configs, and the content data models (`techData.ts`, `facilitiesData.ts`, `campusData.ts`, `studentLifeData.ts`, `eventData.ts`, `researchData.ts`, `facultyData.ts`, `courseQuality.ts`). The other tabs, `DebugPanel`, `InterruptModal`, and `OpeningCoach` are v1 features v2 redesigns rather than ports. The v1 design and architecture notes under `docs/` in the source repo were left out as well; they describe v1's systems, and DD is canon for v2.
