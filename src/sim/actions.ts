import { buildingById, findBuilding } from '../content/buildings.ts';
import { RENOVATION_WEEKS } from '../tuning.ts';
import { emit } from './bus.ts';
import {
  FOUNDERS_HALL_ID,
  footprintIsClear,
  footprintTiles,
  hasFoundersHall,
  orientedFootprint,
  tileIsOpen,
  type Placement,
} from './campus.ts';
import { isValidName, MOTIFS, type Motif, type SchoolColors } from './identity.ts';
import { Rng } from './rng.ts';
import type { GameState } from './state.ts';
import { tileKey, TREE_SEED_RANGE } from './terrain.ts';
import {
  canPay,
  demolitionCost,
  FINANCINGS,
  pay,
  renovationCost,
  type Financing,
} from './estate.ts';
import { findProgram, findSchool } from '../content/schools.ts';
import {
  advancementCost,
  advanceVerdict,
  beginAdvancement,
  closeProgramIn,
  dropSignature,
  foundedSchool,
  nameSignature,
  signatureRoom,
  foundSchool,
  isHall,
  openProgram,
  openProgramIn,
  programOpeningCost,
  schoolFoundingCost,
  schoolInHall,
} from './academics.ts';
import {
  borrowingAllowed,
  constructionAllowed,
  frozen,
  imposeCuts,
  readLetter,
  type AusterityCut,
} from './distress.ts';
import {
  assignFaculty,
  candidate,
  canTeach,
  closeMarket,
  dismissFaculty,
  facultyById,
  hireCandidate,
  severanceFor,
} from './faculty.ts';
import { closeAdmissions } from './people.ts';
import { quadAt } from './quads.ts';
import { eventById, findEvent } from '../content/events.ts';
import { fireEvent, resolveEvent } from './events.ts';
import { holdReunion, reunionCost, reunionRoom } from './alumni.ts';
import { approveBudget } from './treasury.ts';

// Player (and debug) intent, as data. Actions are what the action log
// records; the sim replays a run from its seed and this log alone (DD §15),
// so an action must carry everything the reducer needs and nothing that
// depends on the UI.

export const PAINT_TOOLS = ['path', 'erasePath', 'plant', 'fell'] as const;
export type PaintTool = (typeof PAINT_TOOLS)[number];

export type Action =
  | { type: 'found'; name: string; motif: Motif; paletteId: string; colors: SchoolColors }
  // Ground is broken, paid in cash or borrowed (DD §5.2); absent, cash.
  | {
      type: 'placeBuilding';
      buildingId: string;
      col: number;
      row: number;
      rotated: boolean;
      financing?: Financing;
    }
  | { type: 'demolish'; placementId: string }
  // Pays the backlog off and closes the building for the works (DD §6.4).
  | { type: 'renovate'; placementId: string; financing?: Financing }
  | { type: 'paint'; tool: PaintTool; col: number; row: number }
  // A quad the buildings enclose, renamed (DD §6.2); an empty name gives it
  // back the name the game chose.
  | { type: 'nameQuad'; key: string; name: string }
  // A class brought back for a reunion (DD §8.4): it costs, and it warms
  // them a little, and only so far.
  | { type: 'holdReunion'; classYear: number }
  // An event answered (DD §10.1). Unanswered, it settles into its stated
  // default after its few weeks, which the engine does on its own.
  | { type: 'resolveEvent'; instanceId: string; choiceId: string }
  // Resolves the calendar beat holding the clock (beats.ts), carrying the
  // beat's decision. Every field is optional: absent, the beat resolves to
  // its stated default (DD §3.3). Budget & Hiring: the endowment draw rate
  // for next year's budget (DD §5.1).
  // Admissions Day: the sticker and the selectivity (DD §8.2).
  | {
      type: 'resolveBeat';
      beatId: string;
      drawRate?: number;
      maintenanceFunding?: number;
      tuition?: number;
      selectivity?: number;
      // Board Meeting under austerity: the cuts chosen from the board's
      // list (DD §5.5); absent, the board chooses.
      cuts?: AusterityCut[];
    }
  // Acknowledges the board's letter (distress.ts) and lets the clock go.
  | { type: 'readLetter' }
  // Academics (DD §7.2): a school founded in a hall of its own; a program
  // opened in a founded school; a program closed.
  | { type: 'foundSchool'; schoolId: string; placementId: string; financing?: Financing }
  | { type: 'openProgram'; programId: string; financing?: Financing }
  | { type: 'closeProgram'; programId: string }
  // A tier advancement begun (DD §7.2): the money now, a lead assigned, the
  // years to come; a signature named or dropped.
  | { type: 'advanceProgram'; programId: string; financing?: Financing }
  | { type: 'designateSignature'; programId: string }
  | { type: 'revokeSignature'; programId: string }
  // Faculty (DD §7.3): a candidate hired off the summer market, to a
  // program in their field or to none yet; a hire moved between programs;
  // a hire dismissed with severance.
  | { type: 'hire'; candidateId: string; programId?: string | null }
  | { type: 'assignFaculty'; facultyId: string; programId: string | null }
  | { type: 'dismiss'; facultyId: string }
  | { type: 'debug/mark'; label: string }
  // Puts a named event on the docket now, for authoring and inspection.
  | { type: 'debug/fireEvent'; eventId: string };

export type ActionType = Action['type'];

type Verdict = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Verdict => ({ ok: false, reason });
const YES: Verdict = { ok: true };

// Whether the reducer would accept this action in this state, with the
// reason when it would not. The UI asks before dispatching so that the log
// only ever holds actions that were applied; the reducer asks again so a
// replayed or hand-edited log cannot smuggle one through.
export function canApply(state: GameState, action: Action): Verdict {
  switch (action.type) {
    case 'found': {
      if (state.phase !== 'founding') return no('already founded');
      if (!isValidName(action.name)) return no('name is empty or too long');
      if (!MOTIFS.includes(action.motif)) return no(`unknown motif ${action.motif}`);
      return YES;
    }
    case 'placeBuilding': {
      if (state.phase === 'founding') return no('not founded yet');
      const def = findBuilding(action.buildingId);
      if (!def) return no(`unknown building ${action.buildingId}`);
      const isFounders = def.id === FOUNDERS_HALL_ID;
      // The founding moment (DD §2.4): Founders Hall is the first thing on
      // the land, and there is only ever one.
      if (state.phase === 'siting' && !isFounders) return no('place Founders Hall first');
      if (isFounders && hasFoundersHall(state.campus)) return no('Founders Hall already stands');
      const { w, h } = orientedFootprint(def.footprint, action.rotated);
      if (!footprintIsClear(state.campus, action.col, action.row, w, h)) {
        return no('footprint is off the parcel, on water or road, or occupied');
      }
      const financing = action.financing ?? 'cash';
      if (!FINANCINGS.includes(financing)) return no(`unknown financing ${financing}`);
      // The freeze (DD §5.5): nothing new is built; the interim CFO does
      // not borrow.
      const allowed = constructionAllowed(state);
      if (!allowed.ok) return no(allowed.reason);
      if (financing === 'debt' && !borrowingAllowed(state)) return no('the board is not borrowing');
      if (!canPay(state, def.cost, financing)) {
        return no(financing === 'cash' ? 'not enough cash' : 'the board will not borrow that much');
      }
      return YES;
    }
    case 'demolish': {
      if (state.phase !== 'running') return no('nothing to demolish yet');
      const p = state.campus.placements.find((q) => q.id === action.placementId);
      if (!p) return no('no such building');
      if (!canPay(state, demolitionCost(buildingById(p.buildingId)), 'cash'))
        return no('not enough cash to demolish');
      return YES;
    }
    case 'renovate': {
      if (state.phase !== 'running') return no('nothing to renovate yet');
      const p = state.campus.placements.find((q) => q.id === action.placementId);
      if (!p) return no('no such building');
      if (p.status !== 'open') return no('the building is not open');
      if (p.backlog <= 0) return no('nothing to renovate');
      const financing = action.financing ?? 'cash';
      if (!FINANCINGS.includes(financing)) return no(`unknown financing ${financing}`);
      if (financing === 'debt' && !borrowingAllowed(state)) return no('the board is not borrowing');
      if (!canPay(state, renovationCost(p), financing)) {
        return no(financing === 'cash' ? 'not enough cash' : 'the board will not borrow that much');
      }
      return YES;
    }
    case 'paint': {
      if (state.phase !== 'running') return no('the campus is not open yet');
      const { col, row, tool } = action;
      const key = tileKey(col, row);
      const isPath = state.campus.paths.includes(key);
      const hasTree = key in state.campus.trees;
      switch (tool) {
        case 'path':
          if (!tileIsOpen(state.campus, col, row)) return no('cannot pave here');
          if (isPath) return no('already paved');
          return YES;
        case 'erasePath':
          return isPath ? YES : no('no path here');
        case 'plant':
          if (!tileIsOpen(state.campus, col, row)) return no('cannot plant here');
          if (isPath) return no('paved');
          if (hasTree) return no('a tree already stands here');
          return YES;
        case 'fell':
          return hasTree ? YES : no('no tree here');
      }
      return no('unknown tool');
    }
    case 'nameQuad': {
      if (state.phase !== 'running') return no('the campus is not open yet');
      if (action.name.length > 48) return no('that name is too long');
      if (!quadAt(state.campus, action.key)) return no('no quad there');
      return YES;
    }
    case 'holdReunion': {
      if (state.phase !== 'running') return no('the college is not open yet');
      const alumni = state.people.alumni.find((a) => a.classYear === action.classYear);
      if (!alumni) return no('no such class has graduated');
      if (alumni.lastReunion === state.clock.year) return no('they came back this year already');
      if (reunionRoom(alumni) <= 0) return no('they are as warm as they will get');
      if (!canPay(state, reunionCost(alumni), 'cash')) return no('not enough cash');
      return YES;
    }
    case 'resolveEvent': {
      if (state.phase !== 'running') return no('the college is not open yet');
      const pending = state.events.pending.find((p) => p.instanceId === action.instanceId);
      if (!pending) return no('no such event is waiting');
      const def = eventById(pending.eventId);
      if (!def.choices.some((c) => c.id === action.choiceId))
        return no(`${action.choiceId} is not one of its choices`);
      return YES;
    }
    case 'resolveBeat':
      if (state.distress.pendingLetter !== null) return no('a letter from the board is waiting');
      if (state.pendingBeat === null) return no('no beat is waiting');
      if (state.pendingBeat !== action.beatId)
        return no(`${action.beatId} is not the pending beat`);
      return YES;
    case 'readLetter':
      return state.distress.pendingLetter === null ? no('no letter is waiting') : YES;
    case 'foundSchool': {
      if (state.phase !== 'running') return no('the college is not open yet');
      if (frozen(state)) return no('the board has frozen new programs');
      if (!findSchool(action.schoolId)) return no(`unknown school ${action.schoolId}`);
      if (foundedSchool(state, action.schoolId)) return no('the school is already founded');
      const hall = state.campus.placements.find((p) => p.id === action.placementId);
      if (!hall) return no('no such building');
      if (!isHall(hall)) return no('a school needs a hall');
      if (hall.status !== 'open') return no('the hall is not open');
      if (schoolInHall(state, hall.id)) return no('the hall already houses a school');
      const financing = action.financing ?? 'cash';
      if (financing === 'debt' && !borrowingAllowed(state)) return no('the board is not borrowing');
      if (!canPay(state, schoolFoundingCost(), financing)) return no('not enough cash');
      return YES;
    }
    case 'openProgram': {
      if (state.phase !== 'running') return no('the college is not open yet');
      if (frozen(state)) return no('the board has frozen new programs');
      const def = findProgram(action.programId);
      if (!def) return no(`unknown program ${action.programId}`);
      if (!foundedSchool(state, def.schoolId)) return no('its school is not founded');
      if (openProgram(state, def.id)) return no('the program is already open');
      const financing = action.financing ?? 'cash';
      if (financing === 'debt' && !borrowingAllowed(state)) return no('the board is not borrowing');
      if (!canPay(state, programOpeningCost(), financing)) return no('not enough cash');
      return YES;
    }
    case 'closeProgram':
      if (state.phase !== 'running') return no('the college is not open yet');
      if (!openProgram(state, action.programId)) return no('the program is not open');
      return YES;
    case 'advanceProgram': {
      if (state.phase !== 'running') return no('the college is not open yet');
      if (frozen(state)) return no('the board has frozen new programs');
      const verdict = advanceVerdict(state, action.programId);
      if (!verdict.ok) return no(verdict.reason);
      const financing = action.financing ?? 'cash';
      if (financing === 'debt' && !borrowingAllowed(state)) return no('the board is not borrowing');
      if (!canPay(state, advancementCost(openProgram(state, action.programId)!), financing))
        return no('not enough cash');
      return YES;
    }
    case 'designateSignature': {
      if (state.phase !== 'running') return no('the college is not open yet');
      const p = openProgram(state, action.programId);
      if (!p) return no('the program is not open');
      if (p.signature) return no('already a signature');
      if (!signatureRoom(state)) return no('three signatures already named');
      return YES;
    }
    case 'revokeSignature': {
      if (state.phase !== 'running') return no('the college is not open yet');
      const p = openProgram(state, action.programId);
      if (!p) return no('the program is not open');
      if (!p.signature) return no('not a signature');
      return YES;
    }
    case 'hire': {
      if (state.phase !== 'running') return no('the college is not open yet');
      // The freeze (DD §5.5) is a hiring freeze first of all.
      if (frozen(state)) return no('the board has frozen hiring');
      if (!state.faculty.marketOpen) return no('the market is closed');
      const c = candidate(state, action.candidateId);
      if (!c) return no('no such candidate');
      if (action.programId && !canTeach(state, c, action.programId))
        return no('the program is not open in their field');
      return YES;
    }
    case 'assignFaculty': {
      if (state.phase !== 'running') return no('the college is not open yet');
      const f = facultyById(state, action.facultyId);
      if (!f) return no('no such hire');
      if (action.programId !== null && !canTeach(state, f, action.programId))
        return no('the program is not open in their field');
      return YES;
    }
    case 'dismiss': {
      if (state.phase !== 'running') return no('the college is not open yet');
      const f = facultyById(state, action.facultyId);
      if (!f) return no('no such hire');
      if (!canPay(state, severanceFor(f), 'cash')) return no('not enough cash for severance');
      return YES;
    }
    case 'debug/mark':
      return YES;
    case 'debug/fireEvent':
      if (state.phase !== 'running') return no('the college is not open yet');
      if (findEvent(action.eventId) === undefined) return no('no such event');
      if (state.events.pending.some((p) => p.eventId === action.eventId))
        return no('that one is already waiting');
      return YES;
  }
}

export function applyAction(state: GameState, action: Action): GameState {
  if (!canApply(state, action).ok) return state;
  switch (action.type) {
    case 'found': {
      const name = action.name.trim();
      return emit(
        {
          ...state,
          phase: 'siting',
          identity: {
            name,
            motif: action.motif,
            paletteId: action.paletteId,
            colors: { ...action.colors },
          },
        },
        { kind: 'founded', name, motif: action.motif },
      );
    }
    case 'placeBuilding': {
      const def = buildingById(action.buildingId);
      const { w, h } = orientedFootprint(def.footprint, action.rotated);
      const covered = new Set(footprintTiles(action.col, action.row, w, h));
      const trees = { ...state.campus.trees };
      for (const key of covered) delete trees[key];
      const placement: Placement = {
        id: `p${state.campus.nextPlacementId}`,
        buildingId: def.id,
        col: action.col,
        row: action.row,
        w,
        h,
        status: 'building',
        completesWeek: state.clock.absoluteWeek + def.buildWeeks,
        openedWeek: null,
        backlog: 0,
        condition: 1,
      };
      const opening = state.phase === 'siting';
      const paid = pay(state, def.cost, action.financing ?? 'cash');
      let next = emit(
        {
          ...paid,
          phase: opening ? 'running' : state.phase,
          campus: {
            ...state.campus,
            placements: [...state.campus.placements, placement],
            paths: state.campus.paths.filter((k) => !covered.has(k)),
            trees,
            nextPlacementId: state.campus.nextPlacementId + 1,
          },
        },
        { kind: 'buildingPlaced', placementId: placement.id, buildingId: def.id },
      );
      // The founding moment (DD §2.4): Founders Hall standing is what opens
      // the doors, and the clock starts with it.
      if (opening) next = emit(next, { kind: 'doorsOpened', placementId: placement.id });
      return next;
    }
    case 'demolish': {
      const gone = state.campus.placements.find((p) => p.id === action.placementId)!;
      const paid = pay(state, demolitionCost(buildingById(gone.buildingId)), 'cash');
      return emit(
        {
          ...paid,
          campus: {
            ...paid.campus,
            placements: paid.campus.placements.filter((p) => p.id !== action.placementId),
          },
        },
        { kind: 'buildingDemolished', placementId: gone.id, buildingId: gone.buildingId },
      );
    }
    case 'renovate': {
      const target = state.campus.placements.find((p) => p.id === action.placementId)!;
      const paid = pay(state, renovationCost(target), action.financing ?? 'cash');
      const renovating: Placement = {
        ...target,
        status: 'renovating',
        completesWeek: state.clock.absoluteWeek + RENOVATION_WEEKS,
        backlog: 0,
        condition: 1,
      };
      return emit(
        {
          ...paid,
          campus: {
            ...paid.campus,
            placements: paid.campus.placements.map((p) => (p.id === target.id ? renovating : p)),
          },
        },
        { kind: 'renovationBegun', placementId: target.id, buildingId: target.buildingId },
      );
    }
    case 'paint': {
      const key = tileKey(action.col, action.row);
      const campus = state.campus;
      switch (action.tool) {
        case 'path':
          return { ...state, campus: { ...campus, paths: [...campus.paths, key] } };
        case 'erasePath':
          return { ...state, campus: { ...campus, paths: campus.paths.filter((k) => k !== key) } };
        case 'plant': {
          // The seed comes off the sim's own stream, so a replay plants the
          // same tree.
          const rng = Rng.fromState(state.rng);
          const seed = rng.int(0, TREE_SEED_RANGE - 1);
          return {
            ...state,
            rng: rng.snapshot(),
            campus: { ...campus, trees: { ...campus.trees, [key]: seed } },
          };
        }
        case 'fell': {
          const trees = { ...campus.trees };
          delete trees[key];
          return { ...state, campus: { ...campus, trees } };
        }
      }
      return state;
    }
    case 'resolveBeat': {
      let next = state;
      if (action.beatId === 'budget-and-hiring') {
        next = approveBudget(next, action.drawRate, action.maintenanceFunding);
        next = closeMarket(next);
      }
      if (action.beatId === 'admissions-day')
        next = closeAdmissions(next, action.tuition, action.selectivity);
      if (action.beatId === 'board-meeting') next = imposeCuts(next, action.cuts);
      return emit({ ...next, pendingBeat: null }, { kind: 'beatResolved', beatId: action.beatId });
    }
    case 'nameQuad': {
      const quadNames = { ...state.campus.quadNames };
      const name = action.name.trim();
      if (name === '') delete quadNames[action.key];
      else quadNames[action.key] = name;
      return { ...state, campus: { ...state.campus, quadNames } };
    }
    case 'holdReunion': {
      const alumni = state.people.alumni.find((a) => a.classYear === action.classYear)!;
      const paid = pay(state, reunionCost(alumni), 'cash');
      const after = holdReunion(paid, action.classYear);
      const warmed = after.find((a) => a.classYear === action.classYear)!;
      return emit(
        { ...paid, people: { ...paid.people, alumni: after } },
        { kind: 'reunionHeld', classYear: action.classYear, warmth: warmed.warmth },
      );
    }
    case 'resolveEvent':
      return resolveEvent(state, action.instanceId, action.choiceId);
    case 'readLetter':
      return readLetter(state);
    case 'foundSchool':
      return foundSchool(state, action.schoolId, action.placementId, action.financing ?? 'cash');
    case 'openProgram':
      return openProgramIn(state, action.programId, action.financing ?? 'cash');
    case 'closeProgram':
      return closeProgramIn(state, action.programId);
    case 'advanceProgram':
      return beginAdvancement(state, action.programId, action.financing ?? 'cash');
    case 'designateSignature':
      return nameSignature(state, action.programId);
    case 'revokeSignature':
      return dropSignature(state, action.programId);
    case 'hire':
      return hireCandidate(state, action.candidateId, action.programId ?? null);
    case 'assignFaculty':
      return assignFaculty(state, action.facultyId, action.programId);
    case 'dismiss':
      return dismissFaculty(state, action.facultyId);
    case 'debug/mark':
      return emit(state, { kind: 'mark', label: action.label });
    case 'debug/fireEvent':
      return fireEvent(state, action.eventId);
  }
}
