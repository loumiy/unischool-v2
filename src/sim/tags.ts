import { TAG_IDS, tagById, type TagId, type TagLever } from '../content/identityTags.ts';
import { buildingById } from '../content/buildings.ts';
import { programById } from '../content/schools.ts';
import { MARKET_TUITION, TAG_EARN_AT, TAG_LIMIT, TAG_SHED_AT, TAG_YEARS } from '../tuning.ts';
import { emit } from './bus.ts';
import { campusBeauty } from './beauty.ts';
import { charterTagNudge } from './charter.ts';
import { openPlacements } from './estate.ts';
import { teachingQuality } from './faculty.ts';
import { campusCapacity, enrolled, marketNetTuition, netTuition } from './people.ts';
import type { GameState } from './state.ts';

// PERCEIVED IDENTITY (DD §11.2): what the guidebooks say, earned and shed
// from how the college is run. Each tag has an INDICATOR, 0–1, read from
// the state at the turn of the year; a tag held two years running above
// the line is earned, and one held two years under the lower line is shed
// — so an identity is a reputation, not this year's numbers. It shapes the
// applicant pool: how many apply, and how good the class is (content/
// identity-tags.json says by how much).

export interface Perception {
  tags: TagId[];
  // Consecutive years each tag has been over the line (not yet held) or
  // under it (held), toward earning or shedding it.
  earning: Partial<Record<TagId, number>>;
  shedding: Partial<Record<TagId, number>>;
}

export function foundingPerception(): Perception {
  return { tags: [], earning: {}, shedding: {} };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);

const ARTS_BUILDINGS = ['arts-building', 'conservatory', 'museum', 'performing-arts'];

// How far the college is, this year, toward being each thing.
export function tagIndicators(state: GameState): Record<TagId, number> {
  const axes = state.prestige.axes;
  const cohorts = state.people.cohorts;
  const quality = mean(cohorts.map((c) => c.quality));
  const satisfaction = mean(cohorts.map((c) => c.satisfaction));
  const students = enrolled(state);
  const beds = campusCapacity(state).beds;
  const programs = state.academics.programs;
  const arts = programs.filter((p) => programById(p.programId).schoolId === 'arts-letters').length;
  const artsBuildings = openPlacements(state).filter((p) =>
    ARTS_BUILDINGS.includes(p.buildingId),
  ).length;
  const net = netTuition(state.people.terms.tuition, state.people.aidRate);
  const market = marketNetTuition();
  const selectivity = state.people.terms.selectivity;
  const started = state.clock.year >= 3 && students > 0;
  const venues = openPlacements(state).filter(
    (p) => buildingById(p.buildingId).category === 'athletics',
  ).length;
  const teaching = teachingQuality(state);
  const out: Record<TagId, number> = {
    'research-powerhouse':
      clamp01((axes.research - 45) / 25) * (axes.research >= axes.academics ? 1 : 0.5),
    'teaching-college': clamp01((teaching - 50) / 20) * (axes.academics > axes.research ? 1 : 0.4),
    'party-school': clamp01((satisfaction - 62) / 15) * clamp01((60 - quality) / 15),
    'jock-school': clamp01(
      (state.athletics.varsity.length / 4) * 0.6 +
        (venues / 4) * 0.2 +
        (axes.athletics / 100) * 0.4,
    ),
    // A college of three arts programmes is not "artsy", and neither is one
    // that opened Arts & Letters first because it opens in Founders Hall
    // (Phase 43). Artsy is a large arts catalogue — two in five of eight or
    // more programmes — with the buildings the arts live in.
    artsy:
      clamp01(((programs.length ? arts / programs.length : 0) - 0.3) / 0.15) *
      clamp01((programs.length - 6) / 4) *
      clamp01(artsBuildings / 2),
    commuter: students > 0 ? clamp01((students - beds) / Math.max(1, students) / 0.3) : 0,
    'country-club': clamp01(
      ((state.people.terms.tuition / MARKET_TUITION - 1.05) / 0.25) *
        ((campusBeauty(state) - 55) / 20),
    ),
    'pressure-cooker': clamp01((selectivity - 0.45) / 0.25) * clamp01((58 - satisfaction) / 12),
    'the-bargain': clamp01((1 - net / market - 0.1) / 0.25) * (quality >= 45 ? 1 : 0.4),
    'old-money':
      clamp01((state.treasury.endowment / 1e6 - 400) / 400) * clamp01(state.clock.year / 25),
  };
  // The founders' intent (Phase 43): the charter's own tag is nearer.
  for (const id of TAG_IDS) out[id] = clamp01(out[id] + charterTagNudge(state, id));
  if (!started) for (const id of TAG_IDS) out[id] = 0;
  for (const id of TAG_IDS) out[id] = Number(out[id].toFixed(3));
  return out;
}

// The turn of the year: two years over the line earns a tag, two years
// under the lower line sheds one. No college is more than three things.
export function turnPerception(state: GameState): GameState {
  const ind = tagIndicators(state);
  const p = state.perception;
  let tags = [...p.tags];
  const earning: Perception['earning'] = {};
  const shedding: Perception['shedding'] = {};
  const earned: TagId[] = [];
  const shed: TagId[] = [];
  for (const id of TAG_IDS) {
    if (tags.includes(id)) {
      const n = ind[id] < TAG_SHED_AT ? (p.shedding[id] ?? 0) + 1 : 0;
      if (n >= TAG_YEARS) shed.push(id);
      else if (n > 0) shedding[id] = n;
    } else {
      const n = ind[id] >= TAG_EARN_AT ? (p.earning[id] ?? 0) + 1 : 0;
      if (n >= TAG_YEARS) earned.push(id);
      else if (n > 0) earning[id] = n;
    }
  }
  tags = tags.filter((t) => !shed.includes(t));
  // The strongest of the newly earned, while there is room.
  const room = Math.max(0, TAG_LIMIT - tags.length);
  const taken = [...earned].sort((a, b) => ind[b] - ind[a]).slice(0, room);
  for (const id of earned) if (!taken.includes(id)) earning[id] = TAG_YEARS - 1;
  tags = [...tags, ...taken];
  let s: GameState = { ...state, perception: { tags, earning, shedding } };
  for (const id of shed) s = emit(s, { kind: 'tagShed', tag: id });
  for (const id of taken) s = emit(s, { kind: 'tagEarned', tag: id });
  return s;
}

export function hasTag(state: GameState, id: TagId): boolean {
  return state.perception.tags.includes(id);
}

// The applicant pool's size, as a factor, and the admitted class's quality
// shift, from what the guidebooks say.
export function tagPoolFactor(state: GameState): number {
  return 1 + state.perception.tags.reduce((t, id) => t + tagById(id).size, 0);
}

// What the tags the college holds do beyond the pool (Phase 43), summed
// by lever.
export function tagTeeth(state: GameState, lever: TagLever): number {
  // An old save being migrated is read before it has any perception.
  const tags = (state.perception as GameState['perception'] | undefined)?.tags ?? [];
  return tags.reduce((t, id) => {
    const teeth = tagById(id).teeth;
    return teeth.lever === lever ? t + teeth.amount : t;
  }, 0);
}

export function tagQualityShift(state: GameState): number {
  return state.perception.tags.reduce((t, id) => t + tagById(id).quality, 0);
}
