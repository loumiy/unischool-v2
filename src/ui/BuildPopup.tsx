import { useState } from 'react';
import {
  BUILDING_CATEGORIES,
  BUILDINGS,
  type BuildingCategory,
  type BuildingDef,
  type BuildingIcon,
  buildingById,
} from '../content/buildings.ts';
import { fillWords, PEOPLE_READINGS } from '../content/people.ts';
import { PLACEMENT_READINGS } from '../content/placement.ts';
import { ESTATE_WORDS, providesLine } from '../content/treasury.ts';
import {
  beautyTerms,
  borrowingRoom,
  canPay,
  type Financing,
  FINANCINGS,
  formatMoney,
  formatPercent,
  builtCount,
  FOUNDERS_HALL_ID,
  type GameState,
  hasFoundersHall,
  detectQuads,
  placementSatisfaction,
  landScarce,
  type Species,
} from '../sim/index.ts';
import HelpHint from './HelpHint.tsx';
import {
  AcademicIcon,
  ArtsIcon,
  BridgeIcon,
  AthleticsIcon,
  CafeIcon,
  ChapelIcon,
  FountainIcon,
  GardenIcon,
  GateIcon,
  MuseumIcon,
  ObservatoryIcon,
  PoolIcon,
  StatueIcon,
  TowerIcon,
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
  SignIcon,
  StudentLifeIcon,
  ToolsIcon,
  TreeIcon,
} from './icons.tsx';
import ToolbarPopup from './ToolbarPopup.tsx';
import RebuildTray from './RebuildTray.tsx';
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
  landmark: StatueIcon,
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
  sign: SignIcon,
  arts: ArtsIcon,
  observatory: ObservatoryIcon,
  cafe: CafeIcon,
  chapel: ChapelIcon,
  museum: MuseumIcon,
  pool: PoolIcon,
  statue: StatueIcon,
  fountain: FountainIcon,
  gate: GateIcon,
  tower: TowerIcon,
  garden: GardenIcon,
  bridge: BridgeIcon,
};

const TOOLS_ID = 'campus-tools';
const REBUILD_ID = 'rebuild';

// What the plant tool puts down. "Whatever grows" is the founding
// behaviour — a seed straight off the run's dice — and the three named
// kinds ask the sim for a seed that means that kind (sim/trees.ts).
const SPECIES_TILES: { id: Species | null; label: string }[] = [
  { id: null, label: 'Whatever grows' },
  { id: 'canopy', label: 'Broadleaf' },
  { id: 'conifer', label: 'Conifer' },
  { id: 'ornamental', label: 'Ornamental' },
];

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
  // Enough of a thing (Phase 21I): a type at its limit says so, as Founders
  // Hall always has, instead of offering a second of something no
  // university has two of.
  const count = builtCount(state.campus, def.id);
  const placed =
    (isFounders && hasFoundersHall(state.campus)) ||
    (def.limit !== undefined && count >= def.limit);
  const affordable = canPay(state, def.cost, financing);
  if (placed) {
    return (
      <div
        className="build-tile done"
        title={
          def.limit === 1 ? `${def.name} · the college has one` : `${def.name} · ${count} standing`
        }
      >
        <span className="build-tile-icon">
          <Icon />
        </span>
        <span className="build-tile-name">{def.name}</span>
        <span className="build-tile-foot">
          {def.limit && def.limit > 1 ? `✓ ${count} standing` : '✓ standing'}
        </span>
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
        (armed
          ? 'Click empty ground to break ground, or click again to put it back.'
          : `${def.blurb ?? ''}\n\n${providesLine(def)}`)
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
      <span className="build-tile-gives">{providesLine(def)}</span>
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
  species,
  onSetSpecies,
  financing,
  onSetFinancing,
  onRenovate,
  onExtend,
  onClose,
}: {
  state: GameState;
  placingId: string | null;
  onArmPlacement: (id: string | null) => void;
  tool: CampusTool | null;
  onSetTool: (tool: CampusTool) => void;
  species: Species | null;
  onSetSpecies: (s: Species | null) => void;
  financing: Financing;
  onSetFinancing: (f: Financing) => void;
  onRenovate: (placementId: string) => void;
  onExtend: (placementId: string) => void;
  onClose: () => void;
}) {
  // Landmarks sat with Campus Tools while there was one of them (Phase
  // 21D); with six they are a category of their own again (Phase 21J).
  const categories = BUILDING_CATEGORIES.filter((c) => BUILDINGS.some((b) => b.category === c));
  // When the land is nearly full the menu opens on the estate, not the
  // catalogue (DD §6.6, Phase 25).
  const [activeId, setActiveId] = useState<string>(
    landScarce(state.campus) ? REBUILD_ID : (categories[0] ?? TOOLS_ID),
  );
  const active =
    activeId === TOOLS_ID || activeId === REBUILD_ID
      ? null
      : (categories.find((c) => c === activeId) ?? categories[0] ?? null);
  // A building in hand (Phase 40): the menu folds to a strip along the
  // toolbar, so the ghost and the ground it is going on are never under it.
  if (placingId) {
    const def = buildingById(placingId);
    return (
      <ToolbarPopup title="Build" onClose={onClose} className="build-popup holding">
        <div className="build-holding">
          <span className="build-holding-name">
            {fillWords(ESTATE_WORDS.holding, {
              building: def.name,
              cost: formatMoney(def.cost),
              pay: ESTATE_WORDS.pay[financing],
            })}
          </span>
          <span className="build-holding-keys">{ESTATE_WORDS.holdingKeys}</span>
          <button type="button" className="newgame-btn" onClick={() => onArmPlacement(null)}>
            {ESTATE_WORDS.putDown}
          </button>
        </div>
      </ToolbarPopup>
    );
  }
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
          {landScarce(state.campus) && (
            <button
              type="button"
              className={`build-cat-tab ${activeId === REBUILD_ID ? 'active' : ''}`}
              aria-pressed={activeId === REBUILD_ID}
              onClick={() => setActiveId(REBUILD_ID)}
            >
              <DemolishIcon />
              <span className="build-cat-label">Rebuild</span>
            </button>
          )}
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
          {activeId === REBUILD_ID ? (
            <RebuildTray
              state={state}
              financing={financing}
              onRenovate={onRenovate}
              onExtend={onExtend}
            />
          ) : (
            <div className="build-tile-row">
              {activeId === TOOLS_ID
                ? [
                    ...TOOL_TILES.map(({ tool: t, label, foot, title, Icon }) => (
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
                    )),
                  ]
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
          )}
          {activeId === TOOLS_ID && tool === 'plant' && (
            <div className="tool-species" role="group" aria-label="What to plant">
              {SPECIES_TILES.map(({ id, label }) => (
                <button
                  key={id ?? 'any'}
                  type="button"
                  className={`species-chip ${(species ?? null) === id ? 'active' : ''}`}
                  aria-pressed={(species ?? null) === id}
                  onClick={() => onSetSpecies(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </ToolbarPopup>
  );
}
