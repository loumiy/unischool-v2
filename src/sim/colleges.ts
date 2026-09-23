import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { findProgram, PROGRAMS, SCHOOLS } from '../content/schools.ts';
import { canApply, type Action } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { dispatch, newRun, tickRunWeeks, type Run } from './run.ts';
import type { GameState } from './state.ts';

// SCRIPTED COLLEGES — the test harness Phase 18 built to prove no content
// is unreachable, shared because Phase 19's ambitions need the same thing:
// content aimed at a college that does something cannot be checked against
// a college that does nothing.
//
// Not shipped code, and not sim code: nothing outside tests imports it.

const FOUND = {
  type: 'found',
  name: 'Blackmoor',
  motif: 'georgian',
  paletteId: DEFAULT_PALETTE.id,
  colors: { primary: DEFAULT_PALETTE.primary, secondary: DEFAULT_PALETTE.secondary },
} as const;

export function opened(seed: number): Run {
  return dispatch(dispatch(newRun(seed), FOUND), {
    type: 'placeBuilding',
    buildingId: 'founders-hall',
    col: 28,
    row: 28,
    rotated: false,
  });
}

// A college somebody is actually running: it builds, founds a school,
// opens programmes, hires off every summer market, and borrows to do it.
// Half the catalogue is written for conditions only play reaches, so this
// is what the coverage test needs to reach them.
// The beats, answered with a policy rather than with the board's default:
// the draw, the sticker and the selectivity are the player's dials, and
// a third of the catalogue is written about where they get set.
export type Policy = {
  drawRate?: number;
  tuition?: number;
  selectivity?: number;
  maintenanceFunding?: number;
  // How many hires the college will carry. A college that cannot afford
  // faculty is a different college, and half a dozen readings say so.
  hireCap?: number;
  // Varsity teams fielded once they can be (Phase 23), and the sites that
  // give them venues, built after every other site.
  varsity?: string[];
  athleticsBudget?: 'lean' | 'standard' | 'ambitious';
  extraSites?: [string, number, number, boolean][];
};

export function resolveWith(policy: Policy) {
  return (state: GameState): Action | null => {
    if (state.pendingBeat === 'budget-and-hiring') {
      return {
        type: 'resolveBeat',
        beatId: 'budget-and-hiring',
        ...(policy.drawRate === undefined ? {} : { drawRate: policy.drawRate }),
        ...(policy.maintenanceFunding === undefined
          ? {}
          : { maintenanceFunding: policy.maintenanceFunding }),
      };
    }
    if (state.pendingBeat === 'admissions-day') {
      return {
        type: 'resolveBeat',
        beatId: 'admissions-day',
        ...(policy.tuition === undefined ? {} : { tuition: policy.tuition }),
        ...(policy.selectivity === undefined ? {} : { selectivity: policy.selectivity }),
      };
    }
    return defaultResolution(state);
  };
}

export function played(
  seed: number,
  years: number,
  onWeek?: (run: Run) => Run,
  policy: Policy = {},
): Run {
  let run = opened(seed);
  // Four of them enclose a court, because a third of the campus's own
  // readings — quads, beauty — only exist once the buildings make a shape.
  const sites: [string, number, number, boolean][] = [
    ['library', 21, 9, false],
    ['library', 22, 20, false],
    ['academic-hall', 17, 14, true],
    ['academic-hall', 28, 13, true],
    ['residence-hall', 6, 40, false],
    ['dining-hall', 16, 40, false],
    ['residence-hall', 40, 40, false],
    ['student-center', 40, 4, false],
    ['lab', 50, 20, false],
    ['admin-building', 6, 28, false],
    // Halls enough for the whole charter: a school needs one of its own
    // (academics.ts), so a college that wants six faculties builds six.
    ['academic-hall', 50, 34, false],
    ['academic-hall', 50, 46, false],
    ['academic-hall', 26, 50, false],
    ['academic-hall', 34, 24, false],
    ['academic-hall', 6, 6, false],
    ['residence-hall', 16, 52, false],
    ['residence-hall', 26, 40, false],
    ['residence-hall', 50, 52, false],
    ['residence-hall', 40, 28, false],
    ['academic-hall', 34, 4, false],
    // Last, so every earlier site keeps its week: a college this size has a
    // health centre, and the events that name one need it to (Phase 21H).
    ['health-center', 6, 18, false],
    ...(policy.extraSites ?? []),
  ];
  let next = 0;
  // Week by week, because the things a player does have windows: the
  // faculty market is open for the summer beat and shut by the next one.
  const resolve = resolveWith(policy);
  for (let week = 0; week < years * WEEKS_PER_YEAR; week++) {
    run = tickRunWeeks(run, 1, resolve);
    // One site a week, in order, on debt when the cash has run out. A site
    // the terrain refuses is skipped rather than left blocking the queue,
    // which is how the last five of these silently never got built.
    for (let i = next; i < sites.length; i++) {
      const [buildingId, col, row, rotated] = sites[i]!;
      let placed = false;
      let affordable = false;
      for (const financing of ['cash', 'debt'] as const) {
        const action = {
          type: 'placeBuilding',
          buildingId,
          col,
          row,
          rotated,
          financing,
        } as const;
        const verdict = canApply(run.state, action);
        if (verdict.ok) {
          run = dispatch(run, action);
          placed = true;
          break;
        }
        if (!/parcel|water|road|occupied/.test(verdict.reason)) affordable = true;
      }
      if (placed) {
        if (i === next) next++;
        break;
      }
      // Cannot afford it yet: wait for it rather than skipping ahead.
      if (affordable) break;
      if (i === next) next++;
    }
    // Hiring into a programme, not into the air: an unassigned hire teaches
    // nothing, and every reading of teaching stays at zero.
    if (run.state.faculty.marketOpen && run.state.faculty.roster.length < (policy.hireCap ?? 30)) {
      for (const candidate of [...run.state.faculty.market]) {
        const fit = run.state.academics.programs.find(
          (open) => findProgram(open.programId)?.schoolId === candidate.schoolId,
        );
        const action = {
          type: 'hire',
          candidateId: candidate.id,
          programId: fit?.programId ?? null,
        } as const;
        if (canApply(run.state, action).ok) run = dispatch(run, action);
      }
    }
    if (week % WEEKS_PER_YEAR === 0) {
      for (const school of SCHOOLS) {
        for (const p of run.state.campus.placements) {
          const action = { type: 'foundSchool', schoolId: school.id, placementId: p.id } as const;
          if (canApply(run.state, action).ok) {
            run = dispatch(run, action);
            break;
          }
        }
      }
      for (const program of PROGRAMS) {
        const action = { type: 'openProgram', programId: program.id } as const;
        if (canApply(run.state, action).ok) run = dispatch(run, action);
      }
      if (policy.athleticsBudget && run.state.athletics.budget !== policy.athleticsBudget) {
        const action = { type: 'setAthleticsBudget', budget: policy.athleticsBudget } as const;
        if (canApply(run.state, action).ok) run = dispatch(run, action);
      }
      for (const sportId of policy.varsity ?? []) {
        const action = { type: 'setVarsity', sportId, on: true } as const;
        if (canApply(run.state, action).ok) run = dispatch(run, action);
      }
    }
    if (onWeek) run = onWeek(run);
  }
  return run;
}

export function neglected(seed: number, years: number): Run {
  let run = tickRunWeeks(opened(seed), 31, defaultResolution);
  run = dispatch(run, {
    type: 'resolveBeat',
    beatId: 'budget-and-hiring',
    maintenanceFunding: 0,
  });
  return tickRunWeeks(run, WEEKS_PER_YEAR * years, defaultResolution);
}
