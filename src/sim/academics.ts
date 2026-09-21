import { buildingById } from '../content/buildings.ts';
import { programById, schoolById, tierById, type TierId } from '../content/schools.ts';
import { PROGRAM_ANNUAL_COST, PROGRAM_OPENING_COST, SCHOOL_FOUNDING_COST } from '../tuning.ts';
import { emit } from './bus.ts';
import type { Placement } from './campus.ts';
import { pay, type Financing } from './estate.ts';
import { unassignFrom } from './faculty.ts';
import type { GameState } from './state.ts';

// ACADEMICS (DD §7.2): schools founded explicitly — a hall of their own, a
// founding cost, and a dean seat that Phase 20 fills — and programs
// opened inside them, each at a tier that sets its seats, its catalogue
// and its cost. Advancement and signatures are Phase 11's; faculty and
// teaching quality live in faculty.ts.

export interface FoundedSchool {
  schoolId: string;
  placementId: string; // the hall it lives in
  foundedWeek: number;
  dean: null; // the seat (DD §9.1), filled in Phase 20
}

export interface OpenProgram {
  programId: string;
  tier: TierId;
  openedWeek: number;
}

export interface Academics {
  schools: FoundedSchool[];
  programs: OpenProgram[];
}

export function foundingAcademics(): Academics {
  return { schools: [], programs: [] };
}

// Buildings that can house a school: Founders Hall, the multi-purpose
// hall (DD §2.4), and every Academic Hall.
export const HALL_BUILDINGS: readonly string[] = ['founders-hall', 'academic-hall'];

export function isHall(p: Placement): boolean {
  return HALL_BUILDINGS.includes(p.buildingId);
}

export function schoolInHall(state: GameState, placementId: string): FoundedSchool | null {
  return state.academics.schools.find((s) => s.placementId === placementId) ?? null;
}

// Open halls with no school in them: where the next school can be founded.
export function hallsAvailable(state: GameState): Placement[] {
  return state.campus.placements.filter(
    (p) => p.status === 'open' && isHall(p) && schoolInHall(state, p.id) === null,
  );
}

export function foundedSchool(state: GameState, schoolId: string): FoundedSchool | null {
  return state.academics.schools.find((s) => s.schoolId === schoolId) ?? null;
}

export function openProgram(state: GameState, programId: string): OpenProgram | null {
  return state.academics.programs.find((p) => p.programId === programId) ?? null;
}

export function schoolFoundingCost(): number {
  return SCHOOL_FOUNDING_COST;
}

export function programOpeningCost(): number {
  return PROGRAM_OPENING_COST;
}

export function annualProgramCost(program: OpenProgram): number {
  return Math.round(PROGRAM_ANNUAL_COST * tierById(program.tier).costFactor);
}

// The programs line (DD §5.2), for the year.
export function annualProgramCosts(state: GameState): number {
  return state.academics.programs.reduce((t, p) => t + annualProgramCost(p), 0);
}

// Teaching seats the programs offer at their tiers; Phase 11 sets them
// against enrollment.
export function programSeats(state: GameState): number {
  return state.academics.programs.reduce((t, p) => t + tierById(p.tier).seats, 0);
}

export function foundSchool(
  state: GameState,
  schoolId: string,
  placementId: string,
  financing: Financing,
): GameState {
  const school = schoolById(schoolId);
  const hall = state.campus.placements.find((p) => p.id === placementId)!;
  const paid = pay(state, SCHOOL_FOUNDING_COST, financing);
  const founded: FoundedSchool = {
    schoolId: school.id,
    placementId,
    foundedWeek: state.clock.absoluteWeek,
    dean: null,
  };
  return emit(
    { ...paid, academics: { ...paid.academics, schools: [...paid.academics.schools, founded] } },
    { kind: 'schoolFounded', schoolId: school.id, buildingId: hall.buildingId, placementId },
  );
}

export function openProgramIn(
  state: GameState,
  programId: string,
  financing: Financing,
): GameState {
  const program = programById(programId);
  const paid = pay(state, PROGRAM_OPENING_COST, financing);
  const opened: OpenProgram = {
    programId: program.id,
    tier: 'founded',
    openedWeek: state.clock.absoluteWeek,
  };
  return emit(
    { ...paid, academics: { ...paid.academics, programs: [...paid.academics.programs, opened] } },
    { kind: 'programOpened', programId: program.id },
  );
}

export function closeProgramIn(state: GameState, programId: string): GameState {
  const freed = unassignFrom(state, programId);
  return emit(
    {
      ...freed,
      academics: {
        ...freed.academics,
        programs: freed.academics.programs.filter((p) => p.programId !== programId),
      },
    },
    { kind: 'programClosed', programId },
  );
}

// The board's austerity cut (DD §5.5): the newest program goes.
export function newestProgram(state: GameState): OpenProgram | null {
  return [...state.academics.programs].sort((a, b) => b.openedWeek - a.openedWeek)[0] ?? null;
}

export function hallName(state: GameState, placementId: string): string {
  const p = state.campus.placements.find((q) => q.id === placementId);
  return p ? buildingById(p.buildingId).name : placementId;
}
