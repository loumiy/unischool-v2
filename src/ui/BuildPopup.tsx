import { useState } from 'react';
import {
  BUILDING_CATEGORIES,
  BUILDINGS,
  type BuildingCategory,
  type BuildingDef,
  type BuildingIcon,
} from '../content/buildings.ts';
import { PEOPLE_READINGS } from '../content/people.ts';
import { PLACEMENT_READINGS } from '../content/placement.ts';
import { ESTATE_WORDS } from '../content/treasury.ts';
import {
  beautyTerms,
  borrowingRoom,
  canPay,
  type Financing,
  FINANCINGS,
  formatMoney,
  formatPercent,
  FOUNDERS_HALL_ID,
  type GameState,
  hasFoundersHall,
  detectQuads,
  placementSatisfaction,
} from '../sim/index.ts';
import HelpHint from './HelpHint.tsx';
import {
  AcademicIcon,
  AthleticsIcon,
  BuildIcon,
  DemolishIcon,
  DiningIcon,
  DrawPathIcon,
  EraseIcon,
  FitnessIcon,
  HealthIcon,
  HousingIcon,
  LabIcon,
  LibraryIcon,
  StudentLifeIcon,
  ToolsIcon,
  TreeIcon,
} from './icons.tsx';
import ToolbarPopup from './ToolbarPopup.tsx';
import type { CampusTool } from './tools.ts';

// THE BUILD MENU (DD §6.6 says it reorients under scarcity; that is Phase
// 25). A row of category tabs across the top and the buildings of the picked
// category as a strip of tiles below, the way a city-builder's build bar
// does it. Clicking a tile picks the building up; the map sets it down.
// Every tile carries its price and its build time (DD §6.4); the pay-by
// toggle in the head decides whether the next placement is cash or
// borrowed against the board's line (DD §5.2).

const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  academic: 'Academic',
  residential: 'Housing',
  dining: 'Dining',
  life: 'Student Life',
  athletics: 'Athletics',
  admin: 'Admin',
  landmark: 'Landmarks',
};

const CATEGORY_ICONS: Record<BuildingCategory, () => React.JSX.Element> = {
  academic: AcademicIcon,
  residential: HousingIcon,
  dining: DiningIcon,
  life: StudentLifeIcon,
  athletics: AthleticsIcon,
  admin: BuildIcon,
  landmark: BuildIcon,
};

const TILE_ICONS: Record<BuildingIcon, () => React.JSX.Element> = {
  academic: AcademicIcon,
  library: LibraryIcon,
  lab: LabIcon,
  housing: HousingIcon,
  dining: DiningIcon,
  life: StudentLifeIcon,
  health: HealthIcon,
  fitness: FitnessIcon,
  athletics: AthleticsIcon,
  admin: BuildIcon,
};

const TOOLS_ID = 'campus-tools';

const TOOL_TILES: {
  tool: CampusTool;
  label: string;
  foot: string;
  title: string;
  Icon: () => React.JSX.Element;
}[] = [
  {
    tool: 'path',
    label: 'Draw path',
    foot: 'fills in tiles · P',
    title:
      'Draw a walkway by filling in tiles. The right mouse button erases while a path tool is armed.',
    Icon: DrawPathIcon,
  },
  {
    tool: 'erasePath',
    label: 'Erase path',
    foot: 'lifts paving',
    title: 'Lift a walkway. A tree under it comes back.',
    Icon: EraseIcon,
  },
  {
    tool: 'plant',
    label: 'Plant trees',
    foot: 'fills in tiles',
    title: 'Plant a tree per tile. The right mouse button fells while a tree tool is armed.',
    Icon: TreeIcon,
  },
  {
    tool: 'fell',
    label: 'Fell trees',
    foot: 'clears a wood',
    title: 'Fell trees, a tile at a time.',
    Icon: EraseIcon,
  },
  {
    tool: 'demolish',
    label: 'Demolish',
    foot: 'click a building',
    title: 'Take a building down. There is no undo.',
    Icon: DemolishIcon,
  },
];

function BuildTile({
  def,
  state,
  financing,
  armed,
  onArm,
}: {
  def: BuildingDef;
  state: GameState;
  financing: Financing;
  armed: boolean;
  onArm: () => void;
}) {
  const Icon = TILE_ICONS[def.icon];
  const isFounders = def.id === FOUNDERS_HALL_ID;
  const placed = isFounders && hasFoundersHall(state.campus);
  const affordable = canPay(state, def.cost, financing);
  if (placed) {
    return (
      <div className="build-tile done" title={`${def.name} · standing`}>
        <span className="build-tile-icon">
          <Icon />
        </span>
        <span className="build-tile-name">{def.name}</span>
        <span className="build-tile-foot">✓ standing</span>
      </div>
    );
  }
  const ringed = isFounders && state.phase === 'siting' && !armed;
  const why = affordable
    ? null
    : financing === 'cash'
      ? `Not enough cash: ${formatMoney(def.cost)} to build.`
      : `The board will not lend ${formatMoney(def.cost)} more.`;
  return (
    <button
      type="button"
      className={`build-tile available ${armed ? 'placing' : ''} ${ringed ? 'opening-target' : ''} ${affordable ? '' : 'unaffordable'}`}
      disabled={!affordable}
      title={
        why ??
        (armed ? 'Click empty ground to break ground, or click again to put it back.' : def.blurb)
      }
      onClick={onArm}
    >
      <span className="build-tile-icon">
        <Icon />
      </span>
      <span className="build-tile-name">{def.name}</span>
      <span className="build-tile-sub">
        {def.footprint.w}×{def.footprint.h} tiles · {def.buildWeeks} wks
      </span>
      <span className="build-tile-price">{formatMoney(def.cost)}</span>
      <span className="build-tile-foot">
        {armed ? 'placing…' : affordable ? 'place' : "can't afford"}
      </span>
    </button>
  );
}

export default function BuildPopup({
  state,
  placingId,
  onArmPlacement,
  tool,
  onSetTool,
  financing,
  onSetFinancing,
  onClose,
}: {
  state: GameState;
  placingId: string | null;
  onArmPlacement: (id: string | null) => void;
  tool: CampusTool | null;
  onSetTool: (tool: CampusTool) => void;
  financing: Financing;
  onSetFinancing: (f: Financing) => void;
  onClose: () => void;
}) {
  const categories = BUILDING_CATEGORIES.filter((c) => BUILDINGS.some((b) => b.category === c));
  const [activeId, setActiveId] = useState<string>(categories[0] ?? TOOLS_ID);
  const active =
    activeId === TOOLS_ID
      ? null
      : (categories.find((c) => c === activeId) ?? categories[0] ?? null);
  return (
    <ToolbarPopup
      title="Build"
      onClose={onClose}
      className="build-popup"
      headExtra={
        <>
          <HelpHint text="Pick a category, then a building: click a tile to pick it up, then click empty ground on the map to break ground. R turns it a quarter turn. Construction is paid in cash or borrowed against the board's line; the toggle here decides which. The stream and the road are never buildable; trees under a new building are felled. Campus Tools lays walkways, plants and fells trees, and demolishes." />
          <span className="pay-toggle" role="group" aria-label="Pay for construction with">
            {FINANCINGS.map((f) => (
              <button
                key={f}
                type="button"
                className={financing === f ? 'active' : ''}
                aria-pressed={financing === f}
                title={
                  f === 'cash'
                    ? `Operating funds: ${formatMoney(state.treasury.cash)}`
                    : `Borrowing room: ${formatMoney(borrowingRoom(state))}`
                }
                onClick={() => onSetFinancing(f)}
              >
                {ESTATE_WORDS.pay[f]}
              </button>
            ))}
          </span>
        </>
      }
    >
      <div className="build-mode">
        <nav className="build-mode-tabs" aria-label="Build categories">
          {categories.map((c) => {
            const Icon = CATEGORY_ICONS[c];
            return (
              <button
                key={c}
                type="button"
                className={`build-cat-tab ${active === c ? 'active' : ''}`}
                aria-pressed={active === c}
                onClick={() => setActiveId(c)}
              >
                <Icon />
                <span className="build-cat-label">{CATEGORY_LABELS[c]}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`build-cat-tab ${activeId === TOOLS_ID ? 'active' : ''}`}
            aria-pressed={activeId === TOOLS_ID}
            onClick={() => setActiveId(TOOLS_ID)}
          >
            <ToolsIcon />
            <span className="build-cat-label">Campus Tools</span>
          </button>
        </nav>
        <div className="build-placement">
          <span className="build-beauty figure" tabIndex={0}>
            <span className="build-beauty-label">Beauty</span>
            <span className="build-beauty-value">{beautyTerms(state).score.toFixed(0)}</span>
            <span className="build-beauty-terms">
              greenery {formatPercent(beautyTerms(state).greenery, 0)} · landmarks{' '}
              {formatPercent(beautyTerms(state).landmarks, 0)} · upkeep{' '}
              {formatPercent(beautyTerms(state).upkeep, 0)} · quads{' '}
              {formatPercent(beautyTerms(state).enclosure, 0)}
            </span>
            <span className="figure-hint" role="tooltip">
              {PEOPLE_READINGS.campusBeauty}
            </span>
          </span>
          <span className="build-beauty figure" tabIndex={0}>
            <span className="build-beauty-label">Quads</span>
            <span className="build-beauty-value">{detectQuads(state.campus).length}</span>
            <span className="figure-hint" role="tooltip">
              {PLACEMENT_READINGS.quads}
            </span>
          </span>
          <span className="build-beauty figure" tabIndex={0}>
            <span className="build-beauty-label">Layout</span>
            <span className="build-beauty-value">
              {placementSatisfaction(state).applied > 0 ? '+' : ''}
              {placementSatisfaction(state).applied.toFixed(1)}
            </span>
            <span className="build-beauty-terms">
              of {placementSatisfaction(state).limit} allowed · the Students screen shows the
              arithmetic
            </span>
            <span className="figure-hint" role="tooltip">
              {PLACEMENT_READINGS.placement}
            </span>
          </span>
        </div>
        <div className="build-mode-tray">
          <div className="build-tile-row">
            {activeId === TOOLS_ID
              ? TOOL_TILES.map(({ tool: t, label, foot, title, Icon }) => (
                  <button
                    key={t}
                    type="button"
                    className={`build-tile tool ${tool === t ? 'placing' : ''}`}
                    aria-pressed={tool === t}
                    onClick={() => onSetTool(t)}
                    title={title}
                  >
                    <span className="build-tile-icon">
                      <Icon />
                    </span>
                    <span className="build-tile-name">{label}</span>
                    <span className="build-tile-foot">{foot}</span>
                  </button>
                ))
              : BUILDINGS.filter((b) => b.category === active).map((def) => (
                  <BuildTile
                    key={def.id}
                    def={def}
                    state={state}
                    financing={financing}
                    armed={placingId === def.id}
                    onArm={() => onArmPlacement(placingId === def.id ? null : def.id)}
                  />
                ))}
          </div>
        </div>
      </div>
    </ToolbarPopup>
  );
}
