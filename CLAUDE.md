# UniSchool v2

A one-sitting university builder: fifty years in one evening. React + TypeScript + Vite.

## Canon

- `docs/UNISCHOOL_V2_DESIGN.md` is the design document (DD). It wins every conflict.
- `docs/UNISCHOOL_V2_DEV_PLAN.md` is the phased plan. One branch and one PR per phase into `main`, named `phase-NN-...`.
- Where the DD is silent, the phase decides and writes the decision back into the DD as an additive edit in the same PR, flagged in the PR body. Anything that would change an existing DD decision is raised in chat first.

## Architecture rules (DD §15)

- `src/sim/` is pure TypeScript with no React imports and no third-party dependencies: `state + actions → tick(state) → state`, one seeded RNG owned by the sim. The Phase 31 headless harness must run on Node alone.
- UI subscribes to sim snapshots via `useSyncExternalStore`. No state library.
- Content (events, ambitions, programs, buildings, quirks, era templates) lives in data files under `src/content/`, validated at build time. Writing lives in content files, not code.
- Tuning constants live in `src/tuning.ts` until Phase 31. Do not hand-balance before then.
- Save schema is versioned with migrations from day one. Bump the version whenever the state shape changes.

## Porting from v1

`reference/v1/` is a curated, read-only export of v1's visual surfaces (startup flow, design tokens, map renderer and assets, UI chrome, curriculum screen, screenshots) taken from `loumiy/unischool` at the commit recorded in `reference/v1/README.md`.

- Port and adapt visuals and assets from `reference/v1/` into `src/` as phases require them (DD §13.1: evolve, don't replace).
- Never import from `reference/v1/` at runtime, in tests, or in tooling. It is inert source, not a package.
- Never port architecture from it. Each exported file's header lists the v1 logic it leaned on that was deliberately left behind.
- `reference/` must stay excluded from `tsconfig` `include`, ESLint, Prettier, and Vitest globs. Phase 1 adds those configs and must add the exclusions with them; `.prettierignore` already carries it.

## Definition of done, every phase

Typechecks clean · sim core React-free and dependency-free · new content in data files · schema version bumped with migration if state shape changed · a runnable game at the end of the phase.
