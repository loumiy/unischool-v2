import { buildingById } from '../content/buildings.ts';
import type { CharterId } from '../content/charters.ts';
import { DEFAULT_PALETTE } from '../content/palettes.ts';
import { findProgram, PROGRAMS, SCHOOLS } from '../content/schools.ts';
import { canApply, type Action } from './actions.ts';
import { defaultResolution } from './beats.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { dispatch, newRun, tickRunWeeks, type Run } from './run.ts';
import { facultyOf, staffingNeed } from './faculty.ts';
import { siteRefusal } from './reach.ts';
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

export function opened(seed: number, charter?: CharterId): Run {
  const found = charter ? { ...FOUND, charter } : FOUND;
  return dispatch(dispatch(newRun(seed), found), {
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
  // The board's sweep of idle reserves (Phase 36). Off unless asked for:
  // a scripted college with twenty sites queued is saving for buildings,
  // which is exactly when the game tells a player to turn it off.
  sweep?: boolean;
  // Mends what has worn below half its value, once a year, while the cash
  // allows (Phase 37: a hall that has fallen down teaches nobody, and the
  // families notice). On unless the college funds no maintenance at all.
  renovate?: boolean;
  // The 1.1 systems (Phase 51): the charter it was founded under, the
  // capital projects it raises one at a time as they come within reach,
  // and whether it covers an understaffed programme with an adjunct.
  charter?: CharterId;
  projects?: string[];
  adjuncts?: boolean;
};

// The first site, spiralling out from the middle of the campus, where the
// sim will let the building go, on whatever financing will pay for it.
function placeNear(run: Run, buildingId: string): Run {
  const def = buildingById(buildingId);
  const { w, h } = def.footprint;
  for (let r = 0; r < 32; r++) {
    for (let d = -r; d <= r; d++) {
      for (const [c, rr] of [
        [30 + d, 30 - r],
        [30 + d, 30 + r],
        [30 - r, 30 + d],
        [30 + r, 30 + d],
      ] as const) {
        // A lane between buildings: every site steps by two.
        if (c % 2 !== 0 || rr % 2 !== 0) continue;
        if (siteRefusal(run.state.campus, def, c, rr, w, h) !== null) continue;
        for (const financing of ['gift', 'cash', 'debt', 'endowment'] as const) {
          const action = {
            type: 'placeBuilding',
            buildingId,
            col: c,
            row: rr,
            rotated: false,
            financing,
          } as const;
          if (canApply(run.state, action).ok) return dispatch(run, action);
        }
        return run;
      }
    }
  }
  return run;
}

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
  let run = opened(seed, policy.charter);
  run = dispatch(run, { type: 'setSweep', on: policy.sweep ?? false });
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
        // The thinnest programme in the candidate's school that still
        // wants staff (Phase 37: a college is now known for the teaching it
        // gives, and a roster piled into one programme, or hired into none,
        // leaves the rest teaching nothing).
        const fit = run.state.academics.programs
          .filter(
            (open) =>
              findProgram(open.programId)?.schoolId === candidate.schoolId &&
              facultyOf(run.state, open.programId).length < staffingNeed(open),
          )
          .sort(
            (a, b) =>
              facultyOf(run.state, a.programId).length - facultyOf(run.state, b.programId).length,
          )[0];
        if (!fit) continue;
        const action = {
          type: 'hire',
          candidateId: candidate.id,
          programId: fit.programId,
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
      if (policy.renovate ?? policy.maintenanceFunding !== 0) {
        const worn = run.state.campus.placements
          .filter((p) => p.status === 'open' && p.condition < 0.5)
          .sort((a, b) => a.condition - b.condition);
        for (const p of worn) {
          const action = { type: 'renovate', placementId: p.id, financing: 'cash' } as const;
          if (canApply(run.state, action).ok) run = dispatch(run, action);
        }
      }
      for (const program of PROGRAMS) {
        // No more programmes than the roster can nearly staff.
        const { programs } = run.state.academics;
        const need = programs.reduce((t, p) => t + staffingNeed(p), 0);
        if (programs.length >= 3 && need >= run.state.faculty.roster.length + 4) break;
        const action = { type: 'openProgram', programId: program.id } as const;
        if (canApply(run.state, action).ok) run = dispatch(run, action);
      }
      // One capital project at a time, the next on the list whose year
      // has come, once the one going up has opened.
      const underway = run.state.campus.placements.some(
        (p) => p.status === 'building' && buildingById(p.buildingId).project,
      );
      const project = (policy.projects ?? []).find(
        (id) =>
          !run.state.campus.placements.some((p) => p.buildingId === id) &&
          (buildingById(id).project?.fromYear ?? 99) <= run.state.clock.year,
      );
      if (!underway && project) run = placeNear(run, project);
      if (policy.athleticsBudget && run.state.athletics.budget !== policy.athleticsBudget) {
        const action = { type: 'setAthleticsBudget', budget: policy.athleticsBudget } as const;
        if (canApply(run.state, action).ok) run = dispatch(run, action);
      }
      for (const sportId of policy.varsity ?? []) {
        const action = { type: 'setVarsity', sportId, on: true } as const;
        if (canApply(run.state, action).ok) run = dispatch(run, action);
      }
    }
    // An adjunct for a programme the market left short, once a term.
    if (policy.adjuncts && week % (WEEKS_PER_YEAR / 2) === 2) {
      for (const open of run.state.academics.programs) {
        if (facultyOf(run.state, open.programId).length >= staffingNeed(open)) continue;
        const action = { type: 'hireAdjunct', programId: open.programId } as const;
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
