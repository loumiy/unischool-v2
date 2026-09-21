// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// Imports below that were deliberately NOT exported (v1 sim/state/content logic; do not port): ../data/facilitiesData, ../data/studentLifeData, ../data/techData, ../state/actions, ../systems/techtree/techSystem.
import { useEffect, useState } from 'react';
import type { Action, CampusTool } from '../state/actions';
import type { Buildable, FacilityType, GameState } from '../state/types';
import { totalEnrolled } from '../state/types';
import { canStartDevelopment, hasFreeFacultySlot } from '../systems/techtree/techSystem';
import { canSiteRetroactively, sitingFeeOf } from '../state/campusMap';
import { FACILITY_CATEGORY_OF, type FacilityCategory, LIBRARY_TIER1_ID, nextLibraryFloor, nextVenueExpansion } from '../data/facilitiesData';
import { CHAPTER_HOUSE_CAPACITY_BONUS } from '../data/studentLifeData';
import { FOUNDERS_HALL_ID, isAcademicHall } from '../data/techData';
import HelpHint from './HelpHint';
import { ProgressBar } from './Progress';
import ToolbarPopup from './ToolbarPopup';
import {
  DrawPathIcon, EraseIcon, BuildIcon, HousingIcon, DiningIcon, LibraryIcon,
  LabIcon, HealthIcon, QuadIcon, FitnessIcon, ArtsIcon, AcademicIcon, TreeIcon,
  AthleticsIcon, StudentLifeIcon, ToolsIcon,
} from './icons';

// The build menu: every physical building the university can have —
// housing, campus-life facilities, academic buildings, and labs. It used to
// sit in a permanent side rail (C2 folded that into a compact popup), and it
// used to read as one long VERTICAL list of text rows. This lays it out the
// way a city-builder's build bar does instead: a horizontal row of category
// "menu icons" across the top, and the buildings of the picked category as a
// horizontal strip of icon TILES below — so the different things you can put
// on campus are seen side by side, at a glance, rather than scrolled past
// one line at a time. The popup deliberately stays a wide band that leaves
// the map visible above it (see ToolbarPopup's module comment for why it
// carries no backdrop): choosing a building while still seeing where it will
// go is the whole point of the one-step placement flow.
//
// This is still "what to build" to the map's "where it goes": every tile
// here arms a pickup that the map resolves into an actual PLACE_BUILDABLE
// once a tile on the map is clicked (see CampusMap.tsx's placeById), exactly
// as the old text rows did — the presentation changed, not the flow.
//
// Each category lists the Buildables of its type(s) that aren't 'locked'. A
// locked Buildable (its prereqs or a population/prestige gate unmet) is left
// off entirely rather than teased — nothing to decide about it yet.
//
// REPEATABLE types (housing, dining, fitness — the sequential chains in
// campusData.ts/facilitiesData.ts) would otherwise grow an ever-longer strip
// of finished halls with nothing to decide about. So their finished
// instances COLLAPSE into a single "Built ×N" tile — a count, the total they
// contribute, and their names one click away — leaving the developing/
// available rung on its own. Types where each instance is a distinct
// decision (labs, academic buildings) and single buildings with tier
// upgrades stay listed one tile per instance.
//
// Courses are deliberately absent: they are not places, so they live in the
// Curriculum view rather than beside the map.

const FACILITY_LABELS: Record<FacilityType, string> = {
  library: 'Library',
  studentCenter: 'Student Center',
  diningHall: 'Dining',
  grocery: 'Grocery Store',
  recCenter: 'Recreation',
  healthCenter: 'Health',
  quad: 'Quad',
  lab: 'Labs',
  gym: 'Gym',
  tennisCourts: 'Tennis Courts',
  pool: 'Pool',
  performingArtsCenter: 'Performing Arts Center',
  artGallery: 'Art Gallery',
  athleticsField: 'Multi-Sport Field',
  athleticsArena: 'Arena',
  athleticsDiamond: 'Diamond',
  athleticsNatatorium: 'Natatorium',
  footballStadium: 'Football Stadium',
  fieldHouse: 'Field House',
};

// How many finished instances a repeatable group must have before its
// built tiles collapse into one. Below this there is nothing to tidy: a
// single finished hall reads better as itself than as "1 built".
const COLLAPSE_BUILT_FROM = 2;

// FacilityCategory (facilitiesData.ts) plus 'housing' — this popup's own
// merged tab for dorm + chapterHouse (see HOUSING_GROUP_KEYS below), which
// isn't a FacilityType grouping at all (a dorm is its own Buildable kind; a
// chapter house is a facility with no facilityType), so it doesn't belong
// on FacilityCategory itself.
type BuildCategory = FacilityCategory | 'housing';

// The 'building'-kind group carries the 'academic' category alongside
// the library and labs, which FACILITY_CATEGORY_OF already assigns by type.
const ACADEMIC_GROUP_KEYS: ReadonlySet<string> = new Set(['hall']);
// Grounds ride in the Campus Tools tab rather than a tab of their own.
const GROUNDS_GROUP_KEYS: ReadonlySet<string> = new Set(['quad']);

interface TypeGroup {
  key: string;
  label: string;
  // Built instances collapse behind one "Built ×N" tile (see
  // COLLAPSE_BUILT_FROM). Every repeatable group is a strictly sequential
  // chain and numbers its tiles "#N" — except one that says
  // `sequential: false` (the labs), which collapses without the numbers.
  repeatable: boolean;
  sequential?: false;
  // Set for the facility types FACILITY_CATEGORY_OF (facilitiesData.ts)
  // names (the single source for "which types are athletics vs
  // recreation") plus dorm/chapterHouse (see HOUSING_GROUP_KEYS below).
  // Absent for every other group (library, labs, academic buildings, ...),
  // which render as their own standalone category tab.
  category?: BuildCategory;
  items: Buildable[];
}

// One group per type. dorm/dining are repeatable sequential chains
// (see campusData.ts/facilitiesData.ts) — several finish over a run, so
// their built tiles collapse. library/studentCenter/healthCenter/quad are
// single buildings with tier upgrades: at most two tiles ever, each a
// genuinely different building. performingArtsCenter/artGallery are also
// single-instance, but one-off (no tier field, no upgrade) — exactly one
// tile each, forever, each hidden until its own major clears its tier-2
// coursework (Music for the Performing Arts Center, Studio Art for the Art
// Gallery — see facilitiesData.ts's MUSIC_TIER2_IDS/STUDIO_ART_TIER2_IDS).
// recCenter
// now covers a FIFTH shape: a repeatable, strictly sequential chain like
// housing/dining, but of distinctly-named one-off facilities (Recreation
// Center, Gym & Fitness Center, Swimming Pool, Tennis Courts, Athletics
// Complex) rather than N copies of one generic thing — see
// facilitiesData.ts's own note above REC_CENTER_TIER1_ID. lab and academic
// building are independent multi-instance types (one per lab-gated major /
// one per school) — several can be visible at once, but each is its own
// decision, so they stay listed.
const TYPE_MATCHERS: Array<{ key: string; label: string; repeatable: boolean; sequential?: false; match: (t: Buildable) => boolean }> = [
  // THE ACADEMIC RUN. The halls — Founders Hall, standing at founding,
  // then the chain (techData.ts's ACADEMIC_HALL_SLOTS block), a strictly
  // sequential, distinctly-named chain exactly like housing — are one
  // `repeatable` group: one next hall at a time, "#N" markers, and the
  // built ones collapse. Founders Hall is #1, an ordinary hall since Plan
  // 19; in a guided founding it is 'done' but unsited, which keeps it out
  // of the collapse (see BuildGroupTiles) and ringed for the walkthrough's
  // first step. Library and labs sit in the same tab: three groups, one
  // "Academic" category (see ACADEMIC_GROUP_KEYS and FACILITY_CATEGORY_OF).
  { key: 'hall', label: 'Academic Halls', repeatable: true, match: (t) => isAcademicHall(t) },
  { key: 'library', label: FACILITY_LABELS.library, repeatable: false, match: (t) => t.facilityType === 'library' },
  // Labs collapse like the halls do once a few are standing (repeatable),
  // but they are independent — one per lab-gated major, built in any order
  // — so they carry no "#N" chain position (sequential: false).
  { key: 'lab', label: FACILITY_LABELS.lab, repeatable: true, sequential: false, match: (t) => t.facilityType === 'lab' },
  // THE SOCIAL RUN: the student center, the recreation/fitness chain, and
  // the two arts facilities — one "Social" category (FACILITY_CATEGORY_OF).
  { key: 'studentCenter', label: FACILITY_LABELS.studentCenter, repeatable: false, match: (t) => t.facilityType === 'studentCenter' },
  {
    key: 'recCenter',
    label: 'Fitness',
    repeatable: true,
    match: (t) => t.facilityType === 'recCenter' || t.facilityType === 'gym' || t.facilityType === 'tennisCourts' || t.facilityType === 'pool',
  },
  { key: 'performingArtsCenter', label: FACILITY_LABELS.performingArtsCenter, repeatable: false, match: (t) => t.facilityType === 'performingArtsCenter' },
  { key: 'artGallery', label: FACILITY_LABELS.artGallery, repeatable: false, match: (t) => t.facilityType === 'artGallery' },
  { key: 'dorm', label: 'Housing', repeatable: true, match: (t) => t.kind === 'dorm' },
  // Greek chapter houses (see types.ts's Buildable.chapterHouse and
  // eventData.ts's 'greek-housing'): merged into the same Housing tab as
  // the dorm chain above (see the HOUSING_GROUP_KEYS/buildGroups category
  // assignment below), but its own group within it — each house is a
  // distinct, one-off decision belonging to a specific chapter, not
  // another rung in the dorm chain's strict build order, so it stays
  // `repeatable: false` and never picks up a dorm-style "#N" marker or
  // collapses into a "Built xN" tile.
  { key: 'chapterHouse', label: 'Chapter Houses', repeatable: false, match: (t) => !!t.chapterHouse },
  // The grocery store folds into the same "Dining" tab as the dining
  // chain (see facilitiesData.ts's note above GROCERY_ID) — one more
  // basicNeeds option, not a category of its own.
  { key: 'diningHall', label: FACILITY_LABELS.diningHall, repeatable: true, match: (t) => t.facilityType === 'diningHall' || t.facilityType === 'grocery' },
  // The health chain is three differently-named buildings upgraded in
  // place (Health & Counseling Center -> University Clinic -> University
  // Hospital, see facilitiesData.ts), so it keeps `repeatable: false` and
  // its own tier chips — but the tab heading can no longer be one of their
  // names. "Health" is the need; the rungs name themselves.
  { key: 'healthCenter', label: FACILITY_LABELS.healthCenter, repeatable: false, match: (t) => t.facilityType === 'healthCenter' },
  // Varsity athletics venues: locked (and so invisible, per the rule above)
  // until a team needing the category is granted — see
  // facilitiesData.ts's athleticsVenueReveal and eventData.ts's
  // 'varsity-petition'. One-off, same shape as the recreational trio above.
  { key: 'athleticsField', label: FACILITY_LABELS.athleticsField, repeatable: false, match: (t) => t.facilityType === 'athleticsField' },
  { key: 'athleticsArena', label: FACILITY_LABELS.athleticsArena, repeatable: false, match: (t) => t.facilityType === 'athleticsArena' },
  { key: 'athleticsDiamond', label: FACILITY_LABELS.athleticsDiamond, repeatable: false, match: (t) => t.facilityType === 'athleticsDiamond' },
  { key: 'athleticsNatatorium', label: FACILITY_LABELS.athleticsNatatorium, repeatable: false, match: (t) => t.facilityType === 'athleticsNatatorium' },
  { key: 'footballStadium', label: FACILITY_LABELS.footballStadium, repeatable: false, match: (t) => t.facilityType === 'footballStadium' },
  { key: 'fieldHouse', label: FACILITY_LABELS.fieldHouse, repeatable: false, match: (t) => t.facilityType === 'fieldHouse' },
  // The quads are GROUNDS, not a building the campus lacks: they live in
  // the Campus Tools tab beside the path and tree tools (see
  // GROUNDS_GROUP_KEYS and CampusToolsTiles), never a tab of their own.
  { key: 'quad', label: FACILITY_LABELS.quad, repeatable: false, match: (t) => t.facilityType === 'quad' },
];

// Every placeable Buildable id currently rendered as a tile in the build
// popup, across every category — the build-menu alert badge's definition of
// "visible" (see types.ts's SeenState). Deliberately re-derived from
// buildGroups rather than kept in step with it by hand: a tile is visible
// here exactly when buildGroups would render it, so the two can never drift.
export function visibleBuildableIds(s: GameState): string[] {
  return buildGroups(s).flatMap((g) => g.items.map((t) => t.id));
}

// dorm/chapterHouse merge into one "Housing" tab (see TYPE_MATCHERS above)
// the same way blocksFor already merges same-category facility groups —
// but FACILITY_CATEGORY_OF only maps real FacilityTypes, and neither key is
// one (a dorm is its own Buildable kind; a chapter house is a facility with
// no facilityType at all), so the pairing is named directly here rather
// than routed through that lookup.
const HOUSING_GROUP_KEYS: ReadonlySet<string> = new Set(['dorm', 'chapterHouse']);

function buildGroups(s: GameState): TypeGroup[] {
  return TYPE_MATCHERS
    .map(({ key, label, repeatable, sequential, match }) => ({
      key,
      label,
      repeatable,
      sequential,
      // Most TYPE_MATCHERS keys ARE the FacilityType they match (gym,
      // athleticsField, ...) — the lookup below is a no-op for the ones
      // that aren't (hall, lab, ...), which simply have no
      // entry in FACILITY_CATEGORY_OF and so no category.
      category: (HOUSING_GROUP_KEYS.has(key) ? 'housing'
        : ACADEMIC_GROUP_KEYS.has(key) ? 'academic'
          : FACILITY_CATEGORY_OF[key as FacilityType]) as BuildCategory | undefined,
      items: s.tech.filter((t) => match(t) && t.status !== 'locked'),
    }))
    .filter((g) => g.items.length > 0);
}

// A run of consecutive groups sharing the same category becomes one category
// tab (Athletics, Recreation); everything else becomes its own tab. This
// only ever MERGES adjacent same-category groups, so a future reordering
// degrades to more (smaller) tabs rather than breaking.
interface RenderBlock {
  category?: BuildCategory;
  groups: TypeGroup[];
}

function blocksFor(groups: TypeGroup[]): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  for (const g of groups) {
    const last = blocks[blocks.length - 1];
    if (g.category && last?.category === g.category) last.groups.push(g);
    else blocks.push({ category: g.category, groups: [g] });
  }
  return blocks;
}

const CATEGORY_LABELS: Record<BuildCategory, string> = {
  academic: 'Academic',
  social: 'Social',
  athletics: 'Athletics',
  housing: 'Housing',
};

// The build menu's category tabs (see BuildSection below): the campus-editing
// tools first (a fixed tab, always present), then one tab per RenderBlock —
// a category (Athletics/Recreation) or a standalone type. `id` is the block's
// category name or its single group's key, which is also the key SECTION_ICON
// and the initial-tab logic look up.
type BuildSection =
  // The tools tab carries the grounds groups (the quads) as tiles beside
  // the path and tree tools.
  | { id: string; label: string; kind: 'tools'; groups: TypeGroup[] }
  | { id: string; label: string; kind: 'build'; groups: TypeGroup[] };

const TOOLS_SECTION_ID = 'campus-tools';

function buildSections(s: GameState): BuildSection[] {
  const groups = buildGroups(s);
  const blocks = blocksFor(groups.filter((g) => !GROUNDS_GROUP_KEYS.has(g.key)));
  const built: BuildSection[] = blocks.map((b) => b.category
    ? { id: b.category, label: CATEGORY_LABELS[b.category], kind: 'build', groups: b.groups }
    // A non-category block is always exactly one group (blocksFor only
    // merges same-category runs), so its lone group names the tab.
    : { id: b.groups[0].key, label: b.groups[0].label, kind: 'build', groups: b.groups });
  return [
    { id: TOOLS_SECTION_ID, label: 'Campus Tools', kind: 'tools', groups: groups.filter((g) => GROUNDS_GROUP_KEYS.has(g.key)) },
    ...built,
  ];
}

// One "menu icon" per category tab, keyed by the section id (a category name
// or a group key). Falls back to the generic build glyph for anything without
// a dedicated icon, so a new type never renders iconless.
const SECTION_ICON: Record<string, () => React.JSX.Element> = {
  [TOOLS_SECTION_ID]: ToolsIcon,
  // dorm and chapterHouse both now carry the 'housing' category (see
  // HOUSING_GROUP_KEYS above), so the merged tab's id is 'housing', never
  // the bare 'dorm' key.
  housing: HousingIcon,
  library: LibraryIcon,
  studentCenter: StudentLifeIcon,
  diningHall: DiningIcon,
  healthCenter: HealthIcon,
  quad: QuadIcon,
  lab: LabIcon,
  performingArtsCenter: ArtsIcon,
  artGallery: ArtsIcon,
  academic: AcademicIcon,
  athletics: AthleticsIcon,
  social: StudentLifeIcon,
};

// The glyph shown on an individual building tile, by the Buildable's own
// kind/facilityType. Distinct from SECTION_ICON so a category holding several
// venue types (Athletics) still gives each its recognisable picture.
function iconForBuildable(t: Buildable): () => React.JSX.Element {
  if (t.kind === 'dorm' || t.chapterHouse) return HousingIcon;
  if (t.kind === 'building') return AcademicIcon;
  switch (t.facilityType) {
    case 'library': return LibraryIcon;
    case 'studentCenter': return StudentLifeIcon;
    case 'diningHall':
    case 'grocery': return DiningIcon;
    case 'healthCenter': return HealthIcon;
    case 'quad': return QuadIcon;
    case 'lab': return LabIcon;
    case 'recCenter':
    case 'gym':
    case 'tennisCourts':
    case 'pool': return FitnessIcon;
    case 'performingArtsCenter':
    case 'artGallery': return ArtsIcon;
    case 'athleticsField':
    case 'athleticsArena':
    case 'athleticsDiamond':
    case 'athleticsNatatorium':
    case 'footballStadium':
    case 'fieldHouse': return AthleticsIcon;
    default: return BuildIcon;
  }
}

// How many beds/seats one finished instance is worth — the number that
// makes a built tile worth keeping on screen at all.
function builtDetail(t: Buildable): string | undefined {
  if (t.facilityType === 'lab') return 'gates capstone coursework';
  if (t.kind === 'dorm') return `${(t.effects?.capacityBonus ?? 0).toLocaleString()} beds`;
  if (isAcademicHall(t)) return `${t.slots} program slots`;
  // Carries no `effects` of its own (see types.ts's Buildable.chapterHouse)
  // — its beds are a fixed constant applied directly to s.students.capacity
  // when the petition was approved, not something to read off this tile.
  if (t.chapterHouse) return `${CHAPTER_HOUSE_CAPACITY_BONUS.toLocaleString()} beds`;
  const flat = t.effects?.flatSatisfactionBonus;
  if (flat) return `+${flat} flat`;
  const serves = t.effects?.servesPopulation;
  if (serves) return `serves ${serves.toLocaleString()}`;
  return undefined;
}

// The same figure, summed across a collapsed group's finished instances,
// so collapsing costs the player no information about what they have.
function builtGroupDetail(kind: string, built: Buildable[]): string | undefined {
  if (kind === 'dorm') {
    const beds = built.reduce((sum, t) => sum + (t.effects?.capacityBonus ?? 0), 0);
    return `${beds.toLocaleString()} beds`;
  }
  if (kind === 'hall') {
    const slots = built.reduce((sum, t) => sum + (t.slots ?? 0), 0);
    return `${slots} program slots`;
  }
  const serves = built.reduce((sum, t) => sum + (t.effects?.servesPopulation ?? 0), 0);
  return serves > 0 ? `serves ${serves.toLocaleString()}` : undefined;
}

// The chip in a tile's corner: a tier for the upgradeable single buildings,
// an instance number for a repeatable chain (its position in that chain),
// nothing for the one-of-a-kind types whose name already says which it is.
function rowMarker(t: Buildable, group: TypeGroup, index: number): string | undefined {
  if (t.tier !== undefined) return `Tier ${t.tier}`;
  if (group.repeatable && group.sequential !== false) return `#${index + 1}`;
  return undefined;
}

// One building, as a tile. Four shapes, one for each status the Buildable can
// be in — an interactive button for anything the player can still act on
// (arm a pickup), a plain div for the settled 'done, placed' case. The
// arm/site flow is unchanged from the old text rows: click (or drag onto the
// map) arms a pickup, and PLACE_BUILDABLE fires on the map once a tile is
// chosen (see CampusMap.tsx's placeById). `act` is otherwise unused here —
// every OTHER tile is a placeable kind, and arming is pure local UI state —
// except for the one 'done, placed' exception below: the library's "add a
// floor" renovation, which dispatches directly rather than arming a pickup,
// since it never needs a map click (see facilitiesData.ts's
// LIBRARY_TIER1_ID for why that one Buildable is the exception).
function BuildTile({
  s, t, marker, placingId, onArmPlacement, act,
}: {
  s: GameState; t: Buildable; marker?: string;
  placingId: string | null; onArmPlacement: (id: string | null) => void;
  act: (a: Action) => void;
}) {
  const Icon = iconForBuildable(t);
  const missingFaculty = !!(t.requiresFaculty && !hasFreeFacultySlot(s, t.requiresFaculty));

  // done + already placed on the map: nothing left to decide, so a plain
  // (non-interactive) tile that just records what stands there — UNLESS
  // this is the tier-1 library and it still has a renovation left (see
  // nextLibraryFloor), in which case it gets its own interactive tile
  // offering to renovate it in place instead of the usual static one.
  if (t.status === 'done' && t.id in s.placements) {
    const detail = builtDetail(t);
    const floorPlan = t.id === LIBRARY_TIER1_ID ? nextLibraryFloor(t) : null;
    // A venue rung (Plan 21's PR Q): the same in-place offer for a done
    // venue, up to its expansions cap.
    const rung = t.athleticsVenueReveal ? nextVenueExpansion(t) : null;
    if (rung) {
      const shortfall = rung.cost - s.finance.cash;
      return (
        <button
          type="button"
          className="build-tile available"
          disabled={shortfall > 0}
          title={shortfall > 0
            ? `$${Math.ceil(shortfall).toLocaleString()} short.`
            : `Expands the ${t.name} in place — no new building. Adds ${rung.seatsGain.toLocaleString()} seats for the gate and ${rung.servesGain.toLocaleString()} of social capacity over ${rung.weeks} weeks; the teams keep playing while the work is underway.`}
          onClick={() => act({ type: 'EXPAND_VENUE', venueId: t.id })}
        >
          {marker && <span className="kind-tag">{marker}</span>}
          <span className="build-tile-icon"><Icon /></span>
          <span className="build-tile-name">{t.name}</span>
          {detail && <span className="build-tile-sub">{detail}</span>}
          <span className="build-tile-foot">expand · ${rung.cost.toLocaleString()} · {rung.weeks}w</span>
        </button>
      );
    }
    if (floorPlan) {
      const shortfall = floorPlan.cost - s.finance.cash;
      return (
        <button
          type="button"
          className="build-tile available"
          disabled={shortfall > 0}
          title={shortfall > 0
            ? `$${Math.ceil(shortfall).toLocaleString()} short.`
            : `Renovates the existing library in place — no new building. Adds ${floorPlan.servesGain.toLocaleString()} seats over ${floorPlan.weeks} weeks; the library serves no one while the work is underway.`}
          onClick={() => act({ type: 'RENOVATE_LIBRARY' })}
        >
          {marker && <span className="kind-tag">{marker}</span>}
          <span className="build-tile-icon"><Icon /></span>
          <span className="build-tile-name">{t.name}</span>
          {detail && <span className="build-tile-sub">{detail}</span>}
          <span className="build-tile-foot">add a floor · ${floorPlan.cost.toLocaleString()} · {floorPlan.weeks}w</span>
        </button>
      );
    }
    return (
      <div className="build-tile done" title={detail ? `${t.name} · ${detail}` : t.name}>
        {marker && <span className="kind-tag">{marker}</span>}
        <span className="build-tile-icon"><Icon /></span>
        <span className="build-tile-name">{t.name}</span>
        <span className="build-tile-foot">✓ built{detail ? ` · ${detail}` : ''}</span>
      </div>
    );
  }

  // done but never sited (a founding / event-granted Buildable — see
  // campusMap.ts's needsSiting). Gated on the flat RETROACTIVE_SITING_COST
  // rather than the Buildable's own cost, since there's no construction left
  // to start, only a spot to mark.
  if (t.status === 'done') {
    const detail = builtDetail(t);
    const armed = placingId === t.id;
    const sitable = canSiteRetroactively(s, t);
    // Founders Hall sites for nothing (see campusMap.ts's sitingFeeOf):
    // it is the opening walkthrough's first step, and the step rings this
    // tile until the hall is picked up (see state/opening.ts).
    const fee = sitingFeeOf(t);
    const shortfall = fee - s.finance.cash;
    const ringed = t.id === FOUNDERS_HALL_ID && s.events.opening.stage === 'site-hall' && !armed;
    return (
      <button
        type="button"
        className={`build-tile available ${armed ? 'placing' : ''} ${ringed ? 'opening-target' : ''}`}
        disabled={!sitable}
        title={armed
          ? 'Click an empty tile on the map to site here, or click this again to cancel.'
          : shortfall > 0 ? `$${Math.ceil(shortfall).toLocaleString()} short.`
            : fee > 0 ? `Already built — $${fee.toLocaleString()} to mark a spot on campus`
              : 'The founding hall — pick it up, then click where it stands. No charge.'}
        draggable={sitable}
        onDragStart={(e) => {
          onArmPlacement(t.id);
          e.dataTransfer.setData('text/plain', t.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onArmPlacement(armed ? null : t.id)}
      >
        {marker && <span className="kind-tag">{marker}</span>}
        <span className="build-tile-icon"><Icon /></span>
        <span className="build-tile-name">{t.name}</span>
        {detail && <span className="build-tile-sub">{detail}</span>}
        <span className="build-tile-foot">{armed ? 'placing…' : fee > 0 ? `site · $${fee.toLocaleString()}` : 'site · no charge'}</span>
      </button>
    );
  }

  if (t.status === 'developing') {
    const weeksLeft = s.developing[t.id] ?? 0;
    const elapsed = t.duration > 0 ? (t.duration - weeksLeft) / t.duration : 1;
    return (
      <div className="build-tile developing" title={`${t.name} · ${t.duration - weeksLeft} of ${t.duration} weeks built`}>
        {marker && <span className="kind-tag">{marker}</span>}
        <span className="build-tile-icon"><Icon /></span>
        <span className="build-tile-name">{t.name}</span>
        <span className="build-tile-progress">
          <ProgressBar
            fraction={elapsed}
            label={`${weeksLeft}w`}
            title={`${t.duration - weeksLeft} of ${t.duration} weeks built`}
          />
        </span>
      </div>
    );
  }

  // available. The enabled/disabled state is canStartDevelopment itself — the
  // same function the reducer gates PLACE_BUILDABLE with — so a tile is never
  // offered for something the engine would refuse, and never withheld for
  // something it would allow. Clicking only ARMS the pickup (or cancels it);
  // the actual PLACE_BUILDABLE dispatch happens on the map once a tile is
  // chosen. Dragging the tile straight onto the map does the same arm-then-
  // drop in one gesture.
  const shortfall = t.cost - s.finance.cash;
  const disabledReason = shortfall > 0
    ? `$${Math.ceil(shortfall).toLocaleString()} short.`
    : missingFaculty
      ? `No free ${t.requiresFaculty} slot.`
      : undefined;
  const startable = canStartDevelopment(s, t);
  const armed = placingId === t.id;
  const detail = builtDetail(t);
  return (
    <button
      type="button"
      className={`build-tile available ${armed ? 'placing' : ''}`}
      disabled={!startable}
      title={armed ? 'Click an empty tile on the map to build here, or click this again to cancel.' : disabledReason}
      draggable={startable}
      onDragStart={(e) => {
        onArmPlacement(t.id);
        e.dataTransfer.setData('text/plain', t.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onArmPlacement(armed ? null : t.id)}
    >
      {marker && <span className="kind-tag">{marker}</span>}
      <span className="build-tile-icon"><Icon /></span>
      <span className="build-tile-name">{t.name}</span>
      {detail && <span className="build-tile-sub">{detail}</span>}
      <span className="build-tile-foot">
        {armed
          ? 'placing…'
          // A chapter house is already paid for (see types.ts's
          // Buildable.chapterHouse) — cost and duration are both 0, so it
          // reads as "already built, just needs a spot" rather than the
          // misleading "0w" a bare duration would show.
          : t.cost === 0 && t.duration === 0
            ? 'already paid · place it'
            : <>{t.cost > 0 ? `$${t.cost.toLocaleString()} · ` : ''}{t.duration}w</>}
      </span>
      {t.requiresFaculty && <span className="build-tile-note">needs {t.requiresFaculty}</span>}
    </button>
  );
}

// The collapsed stand-in for a repeatable group's finished instances: one
// tile carrying the count and the total they add, clicking to expand the
// individual built tiles inline beside it (open state lives in the parent).
function BuiltSummaryTile({ group, built, open, onToggle }: {
  group: TypeGroup; built: Buildable[]; open: boolean; onToggle: () => void;
}) {
  const detail = builtGroupDetail(group.key, built);
  const Icon = iconForBuildable(built[0]);
  return (
    <button
      type="button"
      className="build-tile done built-summary"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? `Hide the ${group.label.toLowerCase()} already built` : `List the ${group.label.toLowerCase()} already built`}
      title={detail ? `${built.length} built · ${detail}` : `${built.length} built`}
    >
      <span className="kind-tag">×{built.length}</span>
      <span className="build-tile-icon"><Icon /></span>
      <span className="build-tile-name">Built</span>
      {detail && <span className="build-tile-sub">{detail}</span>}
      <span className="build-tile-foot">{open ? 'hide ▾' : 'show ▸'}</span>
    </button>
  );
}

// One group's worth of tiles, flowed into the section's horizontal strip.
// Same built/awaiting/rest split the old vertical list used — a 'done' item
// with nowhere on the map yet is kept OUT of the collapse (it's the one that
// still has something to decide), the rest of a repeatable group's finished
// instances collapse behind BuiltSummaryTile once there are COLLAPSE_BUILT_FROM
// of them.
function BuildGroupTiles({ s, group, placingId, onArmPlacement, act }: {
  s: GameState; group: TypeGroup; placingId: string | null; onArmPlacement: (id: string | null) => void;
  act: (a: Action) => void;
}) {
  const [open, setOpen] = useState(false);
  // Chain position is read off the group's own order (chains are strictly
  // sequential, so the visible items are always a prefix of the chain) before
  // the built/unbuilt split, so a tile's #N never shifts as the group collapses.
  const numbered = group.items.map((t, index) => ({ t, marker: rowMarker(t, group, index) }));
  const done = numbered.filter(({ t }) => t.status === 'done');
  const awaitingSiting = done.filter(({ t }) => !(t.id in s.placements));
  const built = done.filter(({ t }) => t.id in s.placements);
  const rest = numbered.filter(({ t }) => t.status !== 'done');
  const collapseBuilt = group.repeatable && built.length >= COLLAPSE_BUILT_FROM;

  return (
    <>
      {awaitingSiting.map(({ t, marker }) => (
        <BuildTile key={t.id} s={s} t={t} marker={marker} placingId={placingId} onArmPlacement={onArmPlacement} act={act} />
      ))}
      {collapseBuilt
        ? (
          <>
            <BuiltSummaryTile group={group} built={built.map(({ t }) => t)} open={open} onToggle={() => setOpen((v) => !v)} />
            {open && built.map(({ t, marker }) => (
              <BuildTile key={t.id} s={s} t={t} marker={marker} placingId={placingId} onArmPlacement={onArmPlacement} act={act} />
            ))}
          </>
        )
        : built.map(({ t, marker }) => (
          <BuildTile key={t.id} s={s} t={t} marker={marker} placingId={placingId} onArmPlacement={onArmPlacement} act={act} />
        ))}
      {rest.map(({ t, marker }) => (
        <BuildTile key={t.id} s={s} t={t} marker={marker} placingId={placingId} onArmPlacement={onArmPlacement} act={act} />
      ))}
    </>
  );
}

// Draw path / erase path: campus-editing tools in the same family as placing
// a building, so they get their own category tab, laid out as tiles like
// everything else. `pathTool` is lifted to App.tsx (this popup and the map
// both read/drive it — see App.tsx's module comment).
function CampusToolsTiles({ s, pathTool, onSetPathTool, groups, placingId, onArmPlacement, act }: {
  s: GameState;
  pathTool: CampusTool | null;
  onSetPathTool: (mode: CampusTool) => void;
  // The grounds groups (the quads), laid out as tiles after the tools.
  groups: TypeGroup[];
  placingId: string | null; onArmPlacement: (id: string | null) => void; act: (a: Action) => void;
}) {
  return (
    <div className="build-tile-row">
      <button
        type="button"
        className={`build-tile tool ${pathTool === 'draw' ? 'placing' : ''}`}
        aria-pressed={pathTool === 'draw'}
        onClick={() => onSetPathTool('draw')}
        title="Draw a pathway by filling in tiles — P on the map does the same, and the right mouse button erases while either tool is armed"
      >
        <span className="build-tile-icon"><DrawPathIcon /></span>
        <span className="build-tile-name">Draw path</span>
        <span className="build-tile-foot">fills in tiles · P</span>
      </button>
      <button
        type="button"
        className={`build-tile tool ${pathTool === 'erase' ? 'placing' : ''}`}
        aria-pressed={pathTool === 'erase'}
        onClick={() => onSetPathTool('erase')}
        title="Erase a drawn pathway — with either tool armed the right mouse button erases too, so this is for a long clearing pass rather than a correction"
      >
        <span className="build-tile-icon"><EraseIcon /></span>
        <span className="build-tile-name">Erase path</span>
        <span className="build-tile-foot">remove a path</span>
      </button>
      {/* Trees: planted and felled by tile, the same stroke the path tools
          paint with, and the same right-button opposite. Free, like a
          path — the woodland is ground cover, not a building. */}
      <button
        type="button"
        className={`build-tile tool ${pathTool === 'plant' ? 'placing' : ''}`}
        aria-pressed={pathTool === 'plant'}
        onClick={() => onSetPathTool('plant')}
        title="Plant trees by filling in tiles — the right mouse button fells while either tree tool is armed. Nothing is planted under a building or a path."
      >
        <span className="build-tile-icon"><TreeIcon /></span>
        <span className="build-tile-name">Plant trees</span>
        <span className="build-tile-foot">fills in tiles</span>
      </button>
      <button
        type="button"
        className={`build-tile tool ${pathTool === 'fell' ? 'placing' : ''}`}
        aria-pressed={pathTool === 'fell'}
        onClick={() => onSetPathTool('fell')}
        title="Fell trees — with either tree tool armed the right mouse button fells too, so this is for clearing a wood rather than a correction"
      >
        <span className="build-tile-icon"><EraseIcon /></span>
        <span className="build-tile-name">Fell trees</span>
        <span className="build-tile-foot">clear a wood</span>
      </button>
      {groups.map((group) => (
        <BuildGroupTiles key={group.key} s={s} group={group} placingId={placingId} onArmPlacement={onArmPlacement} act={act} />
      ))}
    </div>
  );
}

export default function BuildPopup({
  s, act, placingId, onArmPlacement, pathTool, onSetPathTool, onClose,
}: {
  s: GameState;
  // Mostly used to report which buildable ids the player has now seen (see
  // types.ts's SeenState) — PLACE_BUILDABLE is still the map's own job (see
  // CampusMap.tsx's placeById). The one exception is threaded down to
  // BuildTile: the tier-1 library's "add a floor" renovation, which
  // dispatches RENOVATE_LIBRARY straight from its own tile rather than
  // arming a pickup, since it never needs a map click.
  act: (a: Action) => void;
  // Which placeable Buildable is currently picked up for siting on the map,
  // and how to change it — lifted to App.tsx (see CampusMap.tsx's module
  // comment). Every tile here starts through PLACE_BUILDABLE, dispatched once
  // a tile is chosen on the map (see CampusMap.tsx's placeById), not from a
  // click inside this popup — so the popup stays open across that click.
  placingId: string | null;
  onArmPlacement: (id: string | null) => void;
  pathTool: CampusTool | null;
  onSetPathTool: (mode: CampusTool) => void;
  onClose: () => void;
}) {
  const sections = buildSections(s);
  // Default to the first real building category (not the tools tab) so opening
  // Build lands on something to place. Sections are recomputed every render,
  // so the active id is resolved against the current list below — if the tab
  // it named has vanished (its last item built out), we fall back to the
  // first tab rather than showing an empty strip.
  const [activeId, setActiveId] = useState<string>(() => {
    const firstBuild = buildSections(s).find((sec) => sec.kind === 'build');
    return firstBuild?.id ?? TOOLS_SECTION_ID;
  });
  const active = sections.find((sec) => sec.id === activeId) ?? sections[0];

  // The build alert badge's other half (see types.ts's SeenState and
  // visibleBuildableIds above): every unseen tile in the ACTIVE tab only —
  // switching tabs is what "seeing" a category means here, so a fresh
  // building in a tab the player hasn't switched to stays unseen (and the
  // build button's badge stays lit) even while this popup is open on
  // another tab. Re-fires on any change to the exact unseen set, the same
  // pattern the Curriculum/Faculty tabs use. The tools tab counts too: its
  // quads are visible tiles like any other, and skipping them here is what
  // left the Build button's dot lit for good once the second quad unlocked.
  const activeUnseenIds = active.groups.flatMap((g) => g.items.filter((t) => !s.seen.buildableIds[t.id]).map((t) => t.id));
  const activeUnseenKey = activeUnseenIds.join('|');
  useEffect(() => {
    if (activeUnseenIds.length > 0) act({ type: 'MARK_SEEN', kind: 'buildable', ids: activeUnseenIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnseenKey]);

  return (
    <ToolbarPopup
      title="Build"
      onClose={onClose}
      className="build-popup"
      headExtra={<HelpHint text="Every building the university can have, grouped into categories along the top — pick a category to see its buildings as a row of tiles. Each tile shows what's built, what's under construction, and what's next available. Repeatable types (housing, dining, fitness) collapse what's already finished into one 'Built ×N' tile — click it for the individual halls. A facility serves a fixed share of the enrolled student body, so a bigger class raises the bar for campus life whether or not you've built it any beds — most students commute, and housing itself is its own need (see the Student Life tab's Housing attribute), not an admissions requirement. Anything not yet unlockable is left off rather than teased. Click a tile (or drag it onto the map) to pick a building up, then click an empty tile on the map to build it there; that's the moment the cost is charged and the countdown begins. A tile priced at a flat, small fee instead of a real construction cost is already-built and just needs a spot marked on the map — the university's founding buildings, mainly. The map stays visible behind this bar, so you can see where a building will land before you commit it." />}
    >
      <div className="build-mode">
        <div className="build-mode-topline">
          <span className="stat">{s.students.capacity.toLocaleString()} beds · {totalEnrolled(s.students).toLocaleString()} enrolled</span>
          <span className="stat">satisfaction {Math.round(s.students.satisfaction)}</span>
        </div>

        {s.finance.cash < 0 && (
          <p className="stall-note">Cash is negative — the school is running an operating deficit, so nothing can be started until the balance recovers.</p>
        )}

        <nav className="build-mode-tabs" aria-label="Build categories">
          {sections.map((sec) => {
            const Icon = SECTION_ICON[sec.id] ?? BuildIcon;
            const isActive = sec.id === active.id;
            // A category carries the alert dot when it holds a buildable
            // tile this player hasn't switched to this tab to see yet (see
            // activeUnseenIds above) — computed independently per tab, not
            // just read off activeUnseenIds, since every OTHER tab's unseen
            // items still need their own dot while one tab is active.
            const hasUnseen = sec.groups.some(
              (g) => g.items.some((t) => !s.seen.buildableIds[t.id]),
            );
            return (
              <button
                key={sec.id}
                type="button"
                className={`build-cat-tab ${isActive ? 'active' : ''}`}
                aria-pressed={isActive}
                title={sec.label}
                onClick={() => setActiveId(sec.id)}
              >
                <Icon />
                <span className="build-cat-label">{sec.label}</span>
                {hasUnseen && <span className="alert-badge" aria-hidden="true">!</span>}
              </button>
            );
          })}
        </nav>

        <div className="build-mode-tray">
          {active.kind === 'tools'
            ? <CampusToolsTiles s={s} pathTool={pathTool} onSetPathTool={onSetPathTool} groups={active.groups} placingId={placingId} onArmPlacement={onArmPlacement} act={act} />
            : (
              <div className="build-tile-row">
                {active.groups.map((group) => (
                  <BuildGroupTiles key={group.key} s={s} group={group} placingId={placingId} onArmPlacement={onArmPlacement} act={act} />
                ))}
              </div>
            )}
        </div>
      </div>
    </ToolbarPopup>
  );
}
