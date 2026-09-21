import { buildingById } from '../content/buildings.ts';
import { RANKS, type RankId } from '../content/faculty.ts';
import { programById, schoolById, tierById, TIERS, type TierId } from '../content/schools.ts';
import {
  ADVANCEMENT,
  DECAY_AFTER_YEARS,
  NEGLECT_STAFFING_SHARE,
  PROGRAM_ANNUAL_COST,
  PROGRAM_OPENING_COST,
  SCHOOL_FOUNDING_COST,
  SIGNATURE_ADVANCE_DISCOUNT,
  SIGNATURE_DECAY_CONFIDENCE,
  SIGNATURE_LIMIT,
} from '../tuning.ts';
import { emit } from './bus.ts';
import type { Placement } from './campus.ts';
import { pay, type Financing } from './estate.ts';
import { facultyOf, staffingNeed, unassignFrom } from './faculty.ts';
import { enrolled } from './people.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import type { GameState } from './state.ts';

// ACADEMICS (DD §7.2): schools founded explicitly — a hall of their own, a
// founding cost, and a dean seat that Phase 20 fills — and programs
// opened inside them, each at a tier that sets its seats, its catalogue
// and its cost. Advancing a tier is a multi-year project — money, a senior
// hire of the tier's rank, time — and a tier not led or staffed decays; up
// to three programs are signatures, cheaper to advance and expected to
// stay advanced. Faculty and teaching quality live in faculty.ts.

export interface FoundedSchool {
  schoolId: string;
  placementId: string; // the hall it lives in
  foundedWeek: number;
  dean: null; // the seat (DD §9.1), filled in Phase 20
}

// An advancement under way: the tier it reaches, the week the works are
// due, and whether they have been waiting on a lead since then.
export interface Advancement {
  to: TierId;
  completesWeek: number;
  stalled: boolean;
}

export interface OpenProgram {
  programId: string;
  tier: TierId;
  openedWeek: number;
  advancing: Advancement | null;
  signature: boolean;
  // Years running the program was neglected (no lead of its rank, or under
  // half its staff); at DECAY_AFTER_YEARS the tier drops.
  neglectYears: number;
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
    advancing: null,
    signature: false,
    neglectYears: 0,
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

// ---------- advancement (DD §7.2) ----------

export function nextTier(tier: TierId): TierId | null {
  const i = TIERS.findIndex((t) => t.id === tier);
  return TIERS[i + 1]?.id ?? null;
}

export function rankAtLeast(rank: RankId, needed: RankId | null): boolean {
  if (needed === null) return true;
  return RANKS.findIndex((r) => r.id === rank) >= RANKS.findIndex((r) => r.id === needed);
}

// Whether a hire of the tier's lead rank is assigned to the program.
export function hasLead(state: GameState, program: OpenProgram, tier: TierId): boolean {
  const needed = tierById(tier).leadRank;
  return facultyOf(state, program.programId).some((f) => rankAtLeast(f.rank, needed));
}

export function advancementCost(program: OpenProgram): number {
  const to = nextTier(program.tier);
  if (!to) return 0;
  const base = ADVANCEMENT[to as keyof typeof ADVANCEMENT].cost;
  return Math.round(base * (program.signature ? SIGNATURE_ADVANCE_DISCOUNT : 1));
}

export function advancementYears(to: TierId): number {
  return ADVANCEMENT[to as keyof typeof ADVANCEMENT]?.years ?? 0;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

// Whether the program could begin advancing now, money aside.
export function advanceVerdict(state: GameState, programId: string): Verdict {
  const program = openProgram(state, programId);
  if (!program) return { ok: false, reason: 'the program is not open' };
  if (program.advancing) return { ok: false, reason: 'already advancing' };
  const to = nextTier(program.tier);
  if (!to) return { ok: false, reason: 'at the top tier' };
  if (!hasLead(state, program, to)) return { ok: false, reason: 'needs a senior hire assigned' };
  return { ok: true };
}

export function beginAdvancement(
  state: GameState,
  programId: string,
  financing: Financing,
): GameState {
  const program = openProgram(state, programId)!;
  const to = nextTier(program.tier)!;
  const paid = pay(state, advancementCost(program), financing);
  const advancing: Advancement = {
    to,
    completesWeek: state.clock.absoluteWeek + advancementYears(to) * WEEKS_PER_YEAR,
    stalled: false,
  };
  return emit(updateProgram(paid, programId, { advancing }), {
    kind: 'advancementBegun',
    programId,
    tier: to,
  });
}

function updateProgram(
  state: GameState,
  programId: string,
  changes: Partial<OpenProgram>,
): GameState {
  return {
    ...state,
    academics: {
      ...state.academics,
      programs: state.academics.programs.map((p) =>
        p.programId === programId ? { ...p, ...changes } : p,
      ),
    },
  };
}

// ---------- signatures (DD §7.2) ----------

export function signatures(state: GameState): OpenProgram[] {
  return state.academics.programs.filter((p) => p.signature);
}

export function signatureRoom(state: GameState): boolean {
  return signatures(state).length < SIGNATURE_LIMIT;
}

export function nameSignature(state: GameState, programId: string): GameState {
  return emit(updateProgram(state, programId, { signature: true }), {
    kind: 'signatureNamed',
    programId,
  });
}

export function dropSignature(state: GameState, programId: string): GameState {
  return emit(updateProgram(state, programId, { signature: false }), {
    kind: 'signatureDropped',
    programId,
  });
}

// ---------- overcrowding (DD §7.4) ----------

// Students enrolled against the seats every open program offers, as a
// ratio; the cohorts are not yet by program, so every program fills alike.
export function programCrowding(state: GameState): number {
  const seats = programSeats(state);
  return seats > 0 ? enrolled(state) / seats : 0;
}

// The damping on program quality: none until the seats run out.
export function crowdingFactor(state: GameState): number {
  const crowding = programCrowding(state);
  return crowding > 1 ? 1 / crowding : 1;
}

// ---------- the year (DD §7.2) ----------

// The academics system, weekly: advancements complete on their week if the
// lead is still in place (else they wait, once noted), and at Convocation a
// tier not led or staffed for DECAY_AFTER_YEARS running drops.
export function academicsWeek(state: GameState): GameState {
  let s = state;
  const week = s.clock.absoluteWeek;
  for (const program of s.academics.programs) {
    const a = program.advancing;
    if (!a || a.completesWeek > week) continue;
    if (hasLead(s, program, a.to)) {
      s = emit(updateProgram(s, program.programId, { tier: a.to, advancing: null }), {
        kind: 'programAdvanced',
        programId: program.programId,
        tier: a.to,
      });
    } else if (!a.stalled) {
      s = emit(updateProgram(s, program.programId, { advancing: { ...a, stalled: true } }), {
        kind: 'advancementStalled',
        programId: program.programId,
        tier: a.to,
      });
    }
  }
  if (s.clock.term === 'fall' && s.clock.week === 1) s = decayYear(s);
  return s;
}

export function neglected(state: GameState, program: OpenProgram): boolean {
  if (program.tier === 'founded') return false;
  const staff = facultyOf(state, program.programId).length;
  return (
    !hasLead(state, program, program.tier) || staff < staffingNeed(program) * NEGLECT_STAFFING_SHARE
  );
}

function decayYear(state: GameState): GameState {
  let s = state;
  for (const program of s.academics.programs) {
    if (program.tier === 'founded' || program.advancing) continue;
    if (!neglected(s, program)) {
      if (program.neglectYears > 0) s = updateProgram(s, program.programId, { neglectYears: 0 });
      continue;
    }
    const years = program.neglectYears + 1;
    if (years < DECAY_AFTER_YEARS) {
      s = updateProgram(s, program.programId, { neglectYears: years });
      continue;
    }
    const i = TIERS.findIndex((t) => t.id === program.tier);
    const to = TIERS[i - 1]!.id;
    s = emit(updateProgram(s, program.programId, { tier: to, neglectYears: 0 }), {
      kind: 'programDecayed',
      programId: program.programId,
      tier: to,
      signature: program.signature,
    });
    // A signature decaying is a public embarrassment (DD §7.2): the board
    // notices, until the events that will make it a scene (Ph.17).
    if (program.signature) {
      s = {
        ...s,
        distress: {
          ...s.distress,
          confidence: Math.max(0, s.distress.confidence - SIGNATURE_DECAY_CONFIDENCE),
        },
      };
    }
  }
  return s;
}

export function hallName(state: GameState, placementId: string): string {
  const p = state.campus.placements.find((q) => q.id === placementId);
  return p ? buildingById(p.buildingId).name : placementId;
}
