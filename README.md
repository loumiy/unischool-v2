# UniSchool v2

One evening. Fifty years. One patch of land.

A one-sitting university builder: found a small college, grow it for fifty years, and hang the result in the hall of fame. React + TypeScript + Vite.

- Design document: [`docs/UNISCHOOL_V2_DESIGN.md`](docs/UNISCHOOL_V2_DESIGN.md)
- Development plan: [`docs/UNISCHOOL_V2_DEV_PLAN.md`](docs/UNISCHOOL_V2_DEV_PLAN.md)
- Contributor rules: [`CLAUDE.md`](CLAUDE.md)

## Develop

Node 22 and npm.

```sh
npm install
npm run dev        # Vite dev server
npm run check      # typecheck + lint + format check + tests
npm run build      # production build into dist/
```

In the app, the backtick key toggles the debug panel and the space bar toggles pause.

## Layout

- `src/sim/` — the simulation core: pure TypeScript, no React, no dependencies. `state + actions → tick(state) → state`, one seeded RNG, the save format and its migrations.
- `src/content/` — game content as JSON, validated by `src/content/schema.ts` at load time and by the test suite.
- `src/ui/` — React. Subscribes to sim snapshots; owns the real-time driver and IndexedDB saves.
- `src/tuning.ts` — every first-guess constant, until the Phase 31 pacing pass.
- `reference/v1/` — read-only prior art from v1; never imported.
