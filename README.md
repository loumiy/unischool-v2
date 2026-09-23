# UniSchool

**One evening. Fifty years. One patch of land.**

UniSchool is a university builder you play in one sitting. You found a small college on an empty field and run it for fifty years: you build the campus, found schools, hire faculty, set tuition, answer the board and handle whatever the world sends. At Year 50 the game writes a history of what you built, grades it, and hangs it in a hall of fame next to your earlier colleges.

A full run takes three to five hours. The game saves itself as you play, so you can stop and pick up later.

## Playing

The game runs in the browser. There is nothing to install.

1. **Found the college.** Pick a name, an architectural style and your colours, then place Founders Hall anywhere the road can reach.
2. **Let the weeks run.** Space pauses and resumes, and 1–4 set the speed. The two fastest speeds unlock once you have appointed a Provost and a couple of Deans: fast time is safe only once someone else can make the routine decisions.
3. **Answer what comes.** Four fixed decisions come round every year: Admissions Day, Budget & Hiring, Convocation and the Board Meeting. Letters and questions arrive in between. Every question has a default that happens if you leave it.
4. **Build what the students need**: beds, dining seats and classrooms first, then everything else. Buildings wear down, and repair work you put off gets more expensive every year.
5. **Read the history.** At Year 50 you get a final report, and you can play on into an Epilogue.

The game introduces its own mechanics as you reach them, with a short note the first time each one matters.

### Keys

| Key              | Does                                                      |
| ---------------- | --------------------------------------------------------- |
| W A S D / arrows | move the camera; scroll to zoom, drag to pan              |
| Q E · Z X        | rotate the view a quarter turn · tilt it                  |
| B · R · P        | the Build menu · rotate the building you hold · path tool |
| C F U T G H      | Curriculum, Faculty, Students, Treasury, League, History  |
| L                | the journal                                               |
| Space · 1 2 3 4  | pause · 1×, 2×, 4×, 8×                                    |
| M                | mute                                                      |
| Escape           | put down what you hold, then back out a layer             |

The **?** in the corner lists all of these.

### Saves and settings

- Your run, settings and hall of fame are stored in this browser, and nowhere else. Clearing the site's data erases them.
- The game saves every year (or every term, if you choose), whenever you make a decision that matters, and when you switch away from the tab. It also keeps the save before the latest one, so a crash loses a year at most, never the whole run.
- Open **Settings** from the title screen or the ☰ menu to change the sound levels, text size (up to 130%), autosave frequency, and colour scheme. The colour-blind-safe scheme shows good and bad news in blue and orange instead of green and red.

## Developing

Node 22 and npm.

```sh
npm install
npm run dev        # Vite dev server
npm run check      # typecheck + lint + format check + tests
npm run build      # production build into dist/ (relative paths; runs from any folder)
npm run balance    # the Phase 31 dashboard: three archetype colleges, fifty years each
```

In the dev build, the backtick key toggles the debug panel.

- Design document: [`docs/UNISCHOOL_V2_DESIGN.md`](docs/UNISCHOOL_V2_DESIGN.md)
- Development plan: [`docs/UNISCHOOL_V2_DEV_PLAN.md`](docs/UNISCHOOL_V2_DEV_PLAN.md)
- Changes to existing design decisions: [`docs/DD_DECISIONS_LOG.md`](docs/DD_DECISIONS_LOG.md)
- Contributor rules: [`CLAUDE.md`](CLAUDE.md)

### Releasing

Pushing a `v*` tag, or running the **Release** workflow by hand, builds the game and attaches `unischool-web.zip`, the HTML5 upload itch.io expects. If the repository has a `BUTLER_API_KEY` secret and an `ITCH_TARGET` variable (for example `you/unischool:html5`), the workflow also pushes the build to itch.io with butler.

### Layout

- `src/sim/`: the simulation core. It is pure TypeScript with no React and no dependencies: `state + actions → tick(state) → state`, one seeded RNG, plus the save format and its migrations.
- `src/content/`: game content as JSON (events, buildings, programs, the soundtrack and more), validated at load time and by the test suite.
- `src/ui/`: the React interface. It subscribes to sim snapshots, drives the real-time clock, stores saves in IndexedDB and synthesises the audio.
- `src/tuning.ts`: every balance constant, tuned in Phase 31 against `npm run balance`.
- `reference/v1/`: read-only prior art from v1. It is never imported.
