import {
  CAMPAIGNS,
  campaignById,
  type CampaignDef,
  type CampaignKind,
} from '../content/campaigns.ts';
import {
  CAMPAIGN_ASK_COOLING,
  CAMPAIGN_PULL,
  CAMPAIGN_RESONANCE_PULL,
  GIVING_PER_ALUM,
} from '../tuning.ts';
import { maturityOf } from './alumni.ts';
import { emit } from './bus.ts';
import { WEEKS_PER_YEAR } from './calendar.ts';
import { conditionsOf } from './events.ts';
import { seatFilled } from './seats.ts';
import type { AlumniClass } from './people.ts';
import type { GameState } from './state.ts';

// ADVANCEMENT (DD §9.3). A campaign is the ledger's payoff surface: a
// multi-year drive whose weekly take is computed class by class from the
// warmth their four years earned, the means their outcomes gave them, and
// whether the case for support is about them.
//
// Asking works, and it cools the ledger. A campaign spends the warmth the
// college banked in §8.4 rather than earning more of it, which is what
// stops it being free money.

export interface Campaign {
  campaignId: string;
  startedYear: number;
  dueYear: number;
  raised: number;
}

export interface AdvancementState {
  running: Campaign | null;
  closed: { campaignId: string; year: number; raised: number; met: boolean }[];
  // Money raised for one purpose and spendable on nothing else (DD §5.1).
  restricted: Record<CampaignKind, number>;
}

export function foundingAdvancement(): AdvancementState {
  return { running: null, closed: [], restricted: { building: 0, endowment: 0, aid: 0 } };
}

// ---------- who answers, and how loudly ----------

// How personally a class takes the case for support: a class whose own
// memory is what the campaign is about gives like it (DD §9.3, §8.4).
export function resonanceOf(alumni: AlumniClass, def: CampaignDef): number {
  const hits = def.resonates.filter((clause) => alumni.memory.includes(clause)).length;
  return hits === 0 ? 1 : 1 + hits * CAMPAIGN_RESONANCE_PULL;
}

// A class's answer to this year's ask. The same three terms the annual
// fund uses (warmth, means, maturity) times the campaign's pull and what
// the case is worth to them.
export function classResponse(alumni: AlumniClass, def: CampaignDef, year: number): number {
  const warmth = alumni.warmth / 50;
  const means = 0.5 + alumni.quality / 100;
  const maturity = maturityOf(Math.max(0, year - alumni.classYear));
  return Math.round(
    alumni.size *
      GIVING_PER_ALUM *
      warmth *
      means *
      maturity *
      CAMPAIGN_PULL *
      resonanceOf(alumni, def),
  );
}

// What the whole ledger would give this campaign in a year, as the screen
// shows it before the player commits to asking.
export function yearlyResponse(state: GameState, def: CampaignDef): number {
  return state.people.alumni.reduce((t, a) => t + classResponse(a, def, state.clock.year), 0);
}

// The classes who will carry it, loudest first — the ledger's payoff made
// legible, so the player can see WHICH four years are paying for this.
export function respondingClasses(state: GameState, def: CampaignDef) {
  return state.people.alumni
    .map((a) => ({
      alumni: a,
      gives: classResponse(a, def, state.clock.year),
      resonance: resonanceOf(a, def),
    }))
    .filter((r) => r.gives > 0)
    .sort((a, b) => b.gives - a.gives);
}

// ---------- launching ----------

export function advancementAppointed(state: GameState): boolean {
  return seatFilled(state, 'advancement', null);
}

// What the college could run now: nothing without the VP (DD §9.3), never
// one it has already run, and only those whose terms its own state meets.
export function launchable(state: GameState): CampaignDef[] {
  if (!advancementAppointed(state)) return [];
  if (state.advancement.running !== null) return [];
  const done = new Set(state.advancement.closed.map((c) => c.campaignId));
  return CAMPAIGNS.filter((def) => !done.has(def.id) && conditionsOf(state, def.when));
}

export function launchCampaign(state: GameState, campaignId: string): GameState {
  const def = campaignById(campaignId);
  const running: Campaign = {
    campaignId,
    startedYear: state.clock.year,
    dueYear: state.clock.year + def.years,
    raised: 0,
  };
  return emit(
    { ...state, advancement: { ...state.advancement, running } },
    { kind: 'campaignLaunched', campaignId },
  );
}

// ---------- the week ----------

// A campaign raises week by week, like the annual fund it sits beside,
// and cools the ledger as it goes. It closes at its date — met or short —
// and what it raised is restricted either way.
export function advancementWeek(state: GameState): GameState {
  const running = state.advancement.running;
  if (!running) return state;
  const def = campaignById(running.campaignId);
  const yearly = yearlyResponse(state, def);
  const week = Math.round(yearly / WEEKS_PER_YEAR);
  let s = state;
  if (week > 0) {
    // Asking cools them: the warmth is spent, not earned (DD §8.4's
    // "nudged, never rewritten" runs the other way too).
    const alumni = s.people.alumni.map((a) =>
      resonanceOf(a, def) > 1
        ? { ...a, warmth: Number(Math.max(0, a.warmth - CAMPAIGN_ASK_COOLING).toFixed(3)) }
        : a,
    );
    s = {
      ...s,
      people: { ...s.people, alumni },
      advancement: {
        ...s.advancement,
        running: { ...running, raised: running.raised + week },
      },
    };
  }
  return closeIfDue(s);
}

function closeIfDue(state: GameState): GameState {
  const running = state.advancement.running;
  if (!running) return state;
  const def = campaignById(running.campaignId);
  const met = running.raised >= def.target;
  if (!met && state.clock.year < running.dueYear) return state;
  // Endowment money goes straight into the fund; building and aid money
  // waits in its own pot until something is built or somebody is aided.
  const restricted = { ...state.advancement.restricted };
  let treasury = state.treasury;
  if (def.kind === 'endowment')
    treasury = { ...treasury, endowment: treasury.endowment + running.raised };
  else restricted[def.kind] = restricted[def.kind] + running.raised;
  return emit(
    {
      ...state,
      treasury,
      advancement: {
        running: null,
        closed: [
          ...state.advancement.closed,
          { campaignId: def.id, year: state.clock.year, raised: running.raised, met },
        ],
        restricted,
      },
    },
    { kind: 'campaignClosed', campaignId: def.id, raised: running.raised, met },
  );
}

// ---------- spending what was raised ----------

export function restrictedFor(state: GameState, kind: CampaignKind): number {
  return state.advancement.restricted[kind];
}

export function spendRestricted(state: GameState, kind: CampaignKind, amount: number): GameState {
  const have = restrictedFor(state, kind);
  const drawn = Math.min(have, amount);
  return {
    ...state,
    advancement: {
      ...state.advancement,
      restricted: { ...state.advancement.restricted, [kind]: have - drawn },
    },
  };
}
