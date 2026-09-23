import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildingById } from '../content/buildings.ts';
import {
  campusCapacity,
  enrolled,
  siteRefusal,
  effectiveDef,
  formatMoney,
  FOUNDERS_HALL_ID,
  orientedFootprint,
  parseTileKey,
  type Financing,
  type GameState,
  type Motif,
  type Placement,
  quadAt,
  winterDepth,
} from '../sim/index.ts';
import BuildingInfoPanel from './BuildingInfoPanel.tsx';
import HelpHint from './HelpHint.tsx';
import { isTypingTarget, useHotkeys } from './hotkeys.ts';
import { KEY_GROUPS, PAN_KEYS } from './keys.ts';
import BuildingMotif, { drawnHeightOf, labelHeightOf, materialOf } from './map/buildingMotifs.tsx';
import {
  ConstructionSite,
  ProgressBar,
  ScaffoldPattern,
  Scaffolding,
  siteHeightOf,
} from './map/works.tsx';
import AmbientLayer from './map/ambient.tsx';
import QuadLayer, { QuadNameLayer } from './map/quadLabels.tsx';
import QuadPanel from './QuadPanel.tsx';
import { flakesOf, seasonOf } from './map/season.ts';
import {
  DERELICT_CONDITION,
  RENOVATION_WEEKS,
  WEATHERED_CONDITION,
  WORN_CONDITION,
} from '../tuning.ts';
import { depthOrder, type DepthBox } from './map/depthSort.ts';
import { groundGeometry, TerrainLayer } from './map/ground.tsx';
import { STOREY } from './map/scale.ts';
import {
  DEFAULT_CAMERA,
  DEFAULT_PITCH_INDEX,
  PITCHES,
  TILE_H,
  VIEWS,
  WORLD,
  boxFaces,
  lift,
  polyPoints,
  project,
  getCamera,
  setCamera,
  tileAt,
  unproject,
  type Camera,
} from './map/iso.ts';
import { castShadow } from './map/light.ts';
import PathwayLayer from './map/pathways.tsx';
import DressingLayer from './map/dressing.tsx';
import AgeMarks, { type AgeStage } from './map/age.tsx';
import Tree, { woodlandShadow } from './map/trees.tsx';
import { otherTool, type CampusTool } from './tools.ts';

// THE CAMPUS MAP (ported from v1's CampusMap.tsx): the game's base layer,
// always on screen under everything else, and the placement surface for the
// buildings the build menu lists. It computes nothing and owns no game
// state: it reads the campus and hands intents up.
//
// Pan and zoom are kept OUT of React state and applied as a transform on the
// world <g>, so a drag never re-renders the scene. The camera (a quarter
// turn, a tilt) IS React state: it changes every polygon.

const BUILDING_INSET = 0.06;
const LABEL_MIN_FONT_SIZE = 19;
const LABEL_MAX_FONT_SIZE = 34;
const LABEL_SIZE_PER_TILE = 1.8;
const LABEL_CHAR_WIDTH_RATIO = 8 / 15;
const LABEL_PLATE_PAD_X = 5;
const LABEL_PLATE_PAD_Y = 3;
const LABEL_FULL_PX = 30;
const LABEL_FADE_PX = 130;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const DEFAULT_ZOOM = 0.55;
const ZOOM_SPEED = 0.0016;
const PAN_CLICK_THRESHOLD = 4;
const KEY_PAN_SPEED = 1100;
// How long a quarter turn takes. Short, because every frame of it
// re-projects the campus (Phase 21A measured it on a full map).
const TURN_MS = 260;
// How far below the middle of the screen a turn pivots, as a share of one
// storey. A building is drawn standing up from its footprint, so a hall the
// player has centred has its base lower on screen than its mass — and the
// mass is what they mean by "this building". Pivoting about the ground
// directly under the middle therefore swings the thing they are looking at.
//
// Swept on the mature and dense-campus fixtures: at zero a centred hall
// wanders 54px and does not come back, at two storeys it over-corrects, and
// at about one and a fifth it holds within 30px through a quarter turn and
// returns to where it started after four. Not half the building's height,
// because the projection foreshortens and a roof reads higher than it stands.
const PIVOT_STOREYS = 1.2;
const MAX_PAN_FRAME_S = 0.1;
const WORLD_TOP_HEADROOM = 140;
const MAP_PADDING = 64;
const MAP_HEIGHT = WORLD.maxY - WORLD.minY + MAP_PADDING * 2 + WORLD_TOP_HEADROOM;

function drawnFootprint(p: Placement) {
  return {
    col: p.col + BUILDING_INSET,
    row: p.row + BUILDING_INSET,
    w: p.w - BUILDING_INSET * 2,
    h: p.h - BUILDING_INSET * 2,
  };
}

function labelLayout(label: string, p: Placement, motif: Motif) {
  const def = effectiveDef(p);
  const size = Math.max(
    LABEL_MIN_FONT_SIZE,
    Math.min(LABEL_MAX_FONT_SIZE, (p.w + p.h) * LABEL_SIZE_PER_TILE),
  );
  const centre = lift(project(p.col + p.w / 2, p.row + p.h / 2), labelHeightOf(def, motif));
  const textWidth = label.length * size * LABEL_CHAR_WIDTH_RATIO;
  return { size, centre, textWidth };
}

type SceneEntry = DepthBox &
  (
    | { kind: 'mass'; key: string; placement: Placement }
    | { kind: 'tree'; key: string; seed: number }
  );

// The weathering class a condition earns (DD §6.4).
function ageStage(p: Placement): AgeStage {
  if (p.status !== 'open') return null;
  if (p.condition < DERELICT_CONDITION) return 'derelict';
  if (p.condition < WEATHERED_CONDITION) return 'weathered';
  if (p.condition < WORN_CONDITION) return 'worn';
  return null;
}

function conditionClass(p: Placement): string {
  return ageStage(p) ?? '';
}

// How far the ivy has climbed a historic building (Phase 46): from the
// year it was declared, over twenty years. The year arrives in fives, so a
// building redraws a handful of times a run, not every week.
function ivyOf(p: Placement, year: number): number {
  if (!p.historic || p.status !== 'open') return 0;
  const since = p.historicSince ?? year;
  return Math.max(0.15, Math.min(1, (year - since) / 20));
}

// How far along a site or a renovation is, 0–1.
function progressOf(p: Placement, week: number): number {
  if (p.completesWeek === null) return 1;
  const total = p.status === 'building' ? buildingById(p.buildingId).buildWeeks : RENOVATION_WEEKS;
  return total <= 0 ? 1 : 1 - (p.completesWeek - week) / total;
}

// Memoised (Phase 33): a week's tick used to redraw every building on the
// campus, and at 8× that was the map's whole cost. A building whose
// placement did not change, under the same season, draws nothing new: the
// week reaches only the ones with works on, and the inspect handler takes
// the id so it can be one function for all of them.
const PlacedBuilding = memo(function PlacedBuilding({
  p,
  motif,
  week,
  onInspect,
  inspected,
  camera,
  schoolName,
  snow,
  era,
}: {
  p: Placement;
  motif: Motif;
  week: number;
  // The year, in fives (Phase 46): enough for the ivy to climb.
  era: number;
  onInspect: (id: string) => void;
  inspected: boolean;
  camera: Camera;
  // Only the entrance sign uses it, and only to write it on the board.
  schoolName: string;
  snow: number;
}) {
  // As it stands: the storeys the late game added are drawn (Phase 25).
  const def = effectiveDef(p);
  const d = drawnFootprint(p);
  const site = p.status === 'building';
  const works = p.status !== 'open';
  const title = site
    ? `${def.name} · under construction`
    : p.status === 'renovating'
      ? `${def.name} · renovating`
      : `${def.name} · ${p.w}×${p.h}`;
  return (
    <g
      className={`campus-building ${inspected ? 'inspected' : ''} ${p.status} ${conditionClass(p)}`}
      aria-label={def.name}
      data-status={p.status}
      role="button"
      onClick={() => onInspect(p.id)}
    >
      {site ? (
        <ConstructionSite def={def} motif={motif} col={d.col} row={d.row} w={d.w} h={d.h} />
      ) : (
        <g className="building-mass">
          <BuildingMotif
            def={def}
            p={d}
            material={materialOf(def, motif)}
            motif={motif}
            shadeSeed={p.id}
            camera={camera}
            schoolName={schoolName}
            snow={snow}
          />
          {/* Age, drawn (Phase 46): the same stage the filter reads. */}
          <AgeMarks
            id={p.id}
            def={def}
            p={d}
            motif={motif}
            stage={ageStage(p)}
            ivy={ivyOf(p, era)}
          />
        </g>
      )}
      {p.status === 'renovating' && def.form !== 'grounds' && (
        <Scaffolding col={d.col} row={d.row} w={d.w} h={d.h} height={drawnHeightOf(def, motif)} />
      )}
      {works && (
        <ProgressBar col={p.col} row={p.row} w={p.w} h={p.h} fraction={progressOf(p, week)} />
      )}
      {inspected && (
        <polygon
          className="campus-building-halo"
          points={polyPoints(boxFaces(p.col, p.row, p.w, p.h, 0, 0).top)}
        />
      )}
      {(def.form !== 'grounds' || works) && <title>{title}</title>}
    </g>
  );
});

// SNOWFALL (Phase 21E): a fixed budget of flakes over the map, each an
// absolutely positioned dot on a CSS animation the compositor runs, so the
// weather costs the map nothing per frame beyond painting them. Placed by a
// fixed sequence rather than the dice, so the same count always falls the
// same way and a heavier week is the lighter one with more flakes in it.
const Snowfall = memo(function Snowfall({ flakes }: { flakes: number }) {
  if (flakes <= 0) return null;
  const spots = Array.from({ length: flakes }, (_, i) => {
    const a = (i * 0.618034) % 1; // spread across the width without clumping
    const b = (i * 0.414214 + 0.13) % 1;
    const c = (i * 0.732051 + 0.29) % 1;
    return {
      left: `${(a * 100).toFixed(2)}%`,
      size: (2 + c * 3).toFixed(1),
      duration: (7 + b * 7).toFixed(2),
      delay: (-b * 14).toFixed(2),
      drift: ((c - 0.5) * 60).toFixed(0),
    };
  });
  return (
    <div className="campus-snowfall" aria-hidden="true">
      {spots.map((f, i) => (
        <span
          key={i}
          className="campus-flake"
          style={
            {
              left: f.left,
              width: `${f.size}px`,
              height: `${f.size}px`,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              '--drift': `${f.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});

// Every cast shadow, in one pass, under everything that stands.
function CastShadows({
  placements,
  scene,
  motif,
  camera,
}: {
  placements: readonly Placement[];
  scene: readonly SceneEntry[];
  motif: Motif;
  camera: Camera;
}) {
  const d = useMemo(() => {
    const sub = (pts: { x: number; y: number }[]) => `M${polyPoints(pts).replace(/ /g, 'L')}Z`;
    const buildings: string[] = [];
    for (const p of placements) {
      const def = effectiveDef(p);
      const height = p.status === 'building' ? siteHeightOf(def) : drawnHeightOf(def, motif);
      if (height <= 0) continue;
      // A sign's plot is two tiles so it can be turned to face the road, but
      // the sign in the middle of it is five metres of board: the footprint
      // would cast the shadow of a wall (Phase 21D).
      // The same for the statue and the fountain (Phase 21J): a figure on a
      // plinth does not shade a nine-metre square of lawn.
      if (
        (def.form === 'sign' || def.form === 'statue' || def.form === 'fountain') &&
        p.status !== 'building'
      )
        continue;
      const f = drawnFootprint(p);
      buildings.push(sub(castShadow(f.col, f.row, f.w, f.h, height)));
    }
    const trees: string[] = [];
    for (const e of scene)
      if (e.kind === 'tree') trees.push(sub(woodlandShadow(e.col, e.row, e.seed)));
    return { buildings: buildings.join(''), trees: trees.join('') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, scene, motif, camera]);
  return (
    <g className="campus-shadows" aria-hidden="true">
      {d.buildings && <path className="campus-building-shadow" d={d.buildings} />}
      {d.trees && <path className="campus-tree-shadow" d={d.trees} />}
    </g>
  );
}

function BuildingLabel({
  p,
  label,
  pinned,
  motif,
}: {
  p: Placement;
  label: string;
  pinned: boolean;
  motif: Motif;
}) {
  const { size, centre, textWidth } = labelLayout(label, p, motif);
  const textRef = useRef<SVGTextElement>(null);
  const [box, setBox] = useState<{ dx: number; dy: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const b = el.getBBox();
    const cx = Number(el.getAttribute('x'));
    const cy = Number(el.getAttribute('y'));
    const next = { dx: b.x - cx, dy: b.y - cy, w: b.width, h: b.height };
    setBox((prev) =>
      prev && prev.dx === next.dx && prev.dy === next.dy && prev.w === next.w && prev.h === next.h
        ? prev
        : next,
    );
  }, [label, size]);
  const plate = box
    ? { x: centre.x + box.dx, y: centre.y + box.dy, w: box.w, h: box.h }
    : { x: centre.x - textWidth / 2, y: centre.y - size * 0.475, w: textWidth, h: size * 0.95 };
  return (
    <g
      className="campus-label"
      aria-hidden="true"
      data-col={p.col}
      data-row={p.row}
      data-w={p.w}
      data-h={p.h}
      data-pinned={pinned ? '1' : undefined}
    >
      <rect
        className="campus-label-plate"
        x={plate.x - LABEL_PLATE_PAD_X}
        y={plate.y - LABEL_PLATE_PAD_Y}
        width={plate.w + LABEL_PLATE_PAD_X * 2}
        height={plate.h + LABEL_PLATE_PAD_Y * 2}
        rx={3}
      />
      <text ref={textRef} className="campus-label-text" x={centre.x} y={centre.y} fontSize={size}>
        {label}
      </text>
    </g>
  );
}

// EVERYTHING THAT STANDS ON THE GROUND, memoised: a hover renders the ghost
// and nothing else; a tick renders the whole scene, as it must.
const CampusScene = memo(function CampusScene({
  state,
  inspectedId,
  onInspect,
  inspectedQuad,
  onInspectQuad,
  hoveredQuad,
  onHoverQuad,
  showQuadNames,
  labelLayerRef,
  camera,
}: {
  state: GameState;
  inspectedId: string | null;
  onInspect: (id: string) => void;
  inspectedQuad: string | null;
  onInspectQuad: (key: string) => void;
  hoveredQuad: string | null;
  onHoverQuad: (key: string | null) => void;
  showQuadNames: boolean;
  labelLayerRef: React.RefObject<SVGGElement | null>;
  camera: Camera;
}) {
  const motif = state.identity?.motif ?? 'georgian';
  const schoolName = state.identity?.name ?? '';
  const snow = winterDepth(state.clock);
  const placements = state.campus.placements;
  const groundPlaced = placements.filter((p) => buildingById(p.buildingId).form === 'grounds');
  const scene = useMemo(() => {
    const entries: SceneEntry[] = [];
    for (const p of placements) {
      if (buildingById(p.buildingId).form === 'grounds') continue;
      entries.push({
        kind: 'mass',
        key: `b-${p.id}`,
        placement: p,
        col: p.col,
        row: p.row,
        w: p.w,
        h: p.h,
      });
    }
    const paved = new Set(state.campus.paths);
    for (const [key, seed] of Object.entries(state.campus.trees)) {
      if (paved.has(key)) continue;
      const tile = parseTileKey(key);
      if (!tile) continue;
      entries.push({
        kind: 'tree',
        key: `t-${key}`,
        seed,
        col: tile.col,
        row: tile.row,
        w: 1,
        h: 1,
      });
    }
    return depthOrder(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, state.campus.trees, state.campus.paths, camera]);
  // The camera is read by the projection, not here; it is what changes the grid.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ground = useMemo(() => groundGeometry(), [camera]);
  const week = state.clock.absoluteWeek;
  // What a building needs of the calendar: the week only while it has
  // works on, and the snow in tenths, so a winter's slow drift redraws the
  // roofs a handful of times rather than every week.
  const weekFor = (p: Placement) => (p.status === 'open' ? 0 : week);
  const roofSnow = Math.round(snow * 10) / 10;
  const era = Math.floor(state.clock.year / 5) * 5;
  return (
    <>
      <defs>
        <ScaffoldPattern />
      </defs>
      <polygon className="campus-ground" points={ground.plate} />
      <path className="campus-grid" d={ground.grid} />
      <TerrainLayer camera={camera} />
      <QuadLayer
        campus={state.campus}
        selectedKey={inspectedQuad}
        onSelect={onInspectQuad}
        onHover={onHoverQuad}
        camera={camera}
      />
      <PathwayLayer paths={state.campus.paths} camera={camera} />
      {/* The ground, used (Phase 45): wear, aprons, lamps, benches. */}
      <DressingLayer
        campus={state.campus}
        motif={motif}
        commuter={
          state.perception.tags.includes('commuter') ||
          enrolled(state) > campusCapacity(state).beds * 1.1
        }
        years={state.clock.year}
        evening={
          state.clock.term === 'spring'
            ? state.clock.week < 6
            : state.clock.term === 'fall' && state.clock.week > 8
        }
        camera={camera}
      />
      <CastShadows placements={placements} scene={scene} motif={motif} camera={camera} />
      {groundPlaced.map((p) => (
        <PlacedBuilding
          key={p.id}
          p={p}
          motif={motif}
          week={weekFor(p)}
          onInspect={onInspect}
          inspected={p.id === inspectedId}
          camera={camera}
          schoolName={schoolName}
          snow={roofSnow}
          era={era}
        />
      ))}
      {scene.map((entry) =>
        entry.kind === 'tree' ? (
          <Tree key={entry.key} col={entry.col} row={entry.row} seed={entry.seed} camera={camera} />
        ) : (
          <g key={entry.key}>
            <PlacedBuilding
              p={entry.placement}
              motif={motif}
              week={weekFor(entry.placement)}
              onInspect={onInspect}
              inspected={entry.placement.id === inspectedId}
              camera={camera}
              schoolName={schoolName}
              snow={roofSnow}
              era={era}
            />
          </g>
        ),
      )}
      <AmbientLayer state={state} camera={camera} />
      <QuadNameLayer
        campus={state.campus}
        selectedKey={inspectedQuad}
        hoveredKey={hoveredQuad}
        showAll={showQuadNames}
        onSelect={onInspectQuad}
        camera={camera}
      />
      <g ref={labelLayerRef}>
        {/* The entrance sign carries the school's name on its own board, so
            a plate over it saying "Entrance Sign" is the map talking over
            itself (Phase 21D). */}
        {placements
          .filter((p) => buildingById(p.buildingId).form !== 'sign')
          .map((p) => (
            <BuildingLabel
              key={`label-${p.id}`}
              p={p}
              label={
                p.historic
                  ? `${buildingById(p.buildingId).name} · Historic`
                  : buildingById(p.buildingId).name
              }
              pinned={p.id === inspectedId}
              motif={motif}
            />
          ))}
      </g>
    </>
  );
});

// The reason a ghost is red, under it (Phase 21L): a red footprint said
// no without saying why, and "no way to walk to it" is not something a
// player can see from the colour.
function PreviewRefusal({
  preview,
}: {
  preview: { col: number; row: number; w: number; h: number; refusal: string | null };
}) {
  const at = project(preview.col + preview.w / 2, preview.row + preview.h);
  const text = preview.refusal ?? '';
  const width = text.length * 6.4 + 16;
  return (
    <g
      className="campus-refusal"
      transform={`translate(${at.x.toFixed(1)}, ${(at.y + 34).toFixed(1)})`}
    >
      <rect x={-width / 2} y={-11} width={width} height={22} rx={11} />
      <text textAnchor="middle" dominantBaseline="central">
        {text.charAt(0).toUpperCase() + text.slice(1)}
      </text>
    </g>
  );
}

export default function CampusMap({
  state,
  placingId,
  onArmPlacement,
  tool,
  onSetTool,
  onPlace,
  onRenovate,
  onExtend,
  financing,
  onPaint,
  onDemolish,
  onNameQuad,
  backOutEnabled,
  controlsEnabled,
}: {
  state: GameState;
  placingId: string | null;
  onArmPlacement: (id: string | null) => void;
  tool: CampusTool | null;
  onSetTool: (tool: CampusTool) => void;
  // Returns whether the sim accepted the placement.
  onPlace: (buildingId: string, col: number, row: number, rotated: boolean) => boolean;
  onRenovate: (placementId: string, financing: Financing) => void;
  onExtend: (placementId: string, financing: Financing) => void;
  // How construction is being paid for, chosen in the build menu.
  financing: Financing;
  onPaint: (tool: Exclude<CampusTool, 'demolish'>, col: number, row: number) => void;
  onDemolish: (placementId: string) => void;
  onNameQuad: (key: string, name: string) => void;
  backOutEnabled: boolean;
  controlsEnabled: boolean;
}) {
  const [rotated, setRotated] = useState(false);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [inspectedQuad, setInspectedQuad] = useState<string | null>(null);
  // Which quad the cursor is on, and whether every name is up at once
  // (Phase 21C): a name answers a question rather than captioning the
  // ground at all times.
  const [hoveredQuad, setHoveredQuad] = useState<string | null>(null);
  const [showQuadNames, setShowQuadNames] = useState(false);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [camera, setCameraState] = useState<Camera>(DEFAULT_CAMERA);
  setCamera(camera);
  const stanceRef = useRef({ view: 0, pitch: DEFAULT_PITCH_INDEX });
  // The quarter turn in flight, if there is one, and the point it is going
  // round.
  const turnRef = useRef<{
    frame: number;
    to: number;
    anchor: { col: number; row: number };
  } | null>(null);
  const anchorRef = useRef<{ col: number; row: number } | null>(null);

  // A fresh pickup starts unrotated, and entering or leaving a tool closes
  // the inspector and drops the ghost — resets keyed on the prop itself,
  // during render, rather than an effect that lags a frame.
  const [prevPlacingId, setPrevPlacingId] = useState(placingId);
  if (prevPlacingId !== placingId) {
    setPrevPlacingId(placingId);
    setRotated(false);
  }
  const [prevTool, setPrevTool] = useState(tool);
  if (prevTool !== tool) {
    setPrevTool(tool);
    setInspectedId(null);
    setHover(null);
    // The quads stop taking the pointer while a tool is out, so the last
    // hover would otherwise stick.
    setHoveredQuad(null);
  }

  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const ghostSvgRef = useRef<SVGSVGElement>(null);
  const ghostWorldRef = useRef<SVGGElement>(null);
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 });
  const labelLayerRef = useRef<SVGGElement>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    button: number;
    startX: number;
    startY: number;
    startView: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const justPannedRef = useRef(false);
  const paintDragRef = useRef<CampusTool | null>(null);
  const paintLastRef = useRef<{ x: number; y: number } | null>(null);

  function paintLabels(cursor: { x: number; y: number } | null) {
    const layer = labelLayerRef.current;
    if (!layer) return;
    const zoom = viewRef.current.zoom;
    const at = cursor ? unproject(cursor.x, cursor.y) : null;
    for (const node of Array.from(layer.children)) {
      const el = node as SVGGElement;
      if (el.dataset.pinned === '1') {
        el.style.opacity = '1';
        continue;
      }
      if (!at) {
        el.style.opacity = '0';
        continue;
      }
      const c0 = Number(el.dataset.col);
      const r0 = Number(el.dataset.row);
      const c1 = c0 + Number(el.dataset.w);
      const r1 = r0 + Number(el.dataset.h);
      const dc = at.col < c0 ? c0 - at.col : at.col > c1 ? at.col - c1 : 0;
      const dr = at.row < r0 ? r0 - at.row : at.row > r1 ? at.row - r1 : 0;
      const d = project(dc, dr);
      const px = Math.hypot(d.x, d.y) * zoom;
      const t = (px - LABEL_FULL_PX) / (LABEL_FADE_PX - LABEL_FULL_PX);
      el.style.opacity = String(Math.max(0, Math.min(1, 1 - t)));
    }
  }
  useEffect(() => {
    paintLabels(cursorRef.current);
  });

  function applyView(next: { x: number; y: number; zoom: number }) {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.zoom));
    viewRef.current = { x: next.x, y: next.y, zoom };
    const transform = `translate(${next.x} ${next.y}) scale(${zoom})`;
    worldRef.current?.setAttribute('transform', transform);
    ghostWorldRef.current?.setAttribute('transform', transform);
    paintLabels(cursorRef.current);
  }

  // THE PIVOT. Turning and tilting hold one point still: whatever the
  // player has in the middle of the screen. The point is found once, when
  // the movement starts, and put back under the middle after every step of
  // it, so a building the player is looking at is the thing the camera
  // goes round rather than something that swings past.
  function centreOfScreen() {
    const rect = svgRef.current?.getBoundingClientRect();
    const lift = PIVOT_STOREYS * STOREY * (viewRef.current?.zoom ?? 1);
    return { px: rect ? rect.width / 2 : 0, py: (rect ? rect.height / 2 : 0) + lift };
  }

  function groundUnderCentre(): { col: number; row: number } {
    const { px, py } = centreOfScreen();
    const v = viewRef.current;
    return unproject((px - v.x) / v.zoom, (py - v.y) / v.zoom);
  }

  // Slide the view so `anchor` sits under the middle again. Reads the
  // projection as it stands, so it must run AFTER the polygons for this
  // camera are in the DOM — see the layout effect below.
  function holdAnchor(anchor: { col: number; row: number }) {
    const { px, py } = centreOfScreen();
    const v = viewRef.current;
    const w = project(anchor.col, anchor.row);
    applyView({ x: px - w.x * v.zoom, y: py - w.y * v.zoom, zoom: v.zoom });
  }

  function applyCamera(next: Camera, anchor?: { col: number; row: number }) {
    anchorRef.current = anchor ?? groundUnderCentre();
    setCameraState(setCamera(next));
  }
  // The polygons are projected from `camera` during render (setCamera above),
  // so the transform that holds the pivot still cannot be written until that
  // render is in the DOM. Written from the frame's own rAF callback it was a
  // frame ahead of the geometry, and the campus leapt — measured at 1,233px
  // off centre mid-turn before this moved here.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (anchor) holdAnchor(anchor);
    // holdAnchor reads refs only; the camera is what makes it stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);
  // A quarter turn, taken as a turn rather than a cut. The camera's azimuth
  // is React state because it changes every polygon, so this re-renders the
  // map each frame it runs — hence TURN_MS is short and the easing does the
  // work of making it read as one movement. A turn asked for mid-turn picks
  // up from wherever the view has got to, so holding Q does not stutter.
  function turnBy(steps: number) {
    const st = stanceRef.current;
    st.view = (((st.view + steps) % VIEWS.length) + VIEWS.length) % VIEWS.length;
    const live = turnRef.current;
    // One pivot for the whole turn, and for a turn asked for mid-turn: the
    // point that was in the middle when the player started turning, not a
    // fresh one each frame, which would let the campus wander.
    const anchor = live?.anchor ?? groundUnderCentre();
    const from = live?.to ?? getCamera().azimuth;
    const to = from + steps * (Math.PI / 2);
    if (live) cancelAnimationFrame(live.frame);
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / TURN_MS);
      // Ease in and out, so the turn starts and lands softly.
      const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      applyCamera({ azimuth: from + (to - from) * k, pitch: PITCHES[st.pitch]! }, anchor);
      if (t < 1) {
        turnRef.current = { frame: requestAnimationFrame(step), to, anchor };
        return;
      }
      turnRef.current = null;
    };
    turnRef.current = { frame: requestAnimationFrame(step), to, anchor };
  }
  function tiltBy(steps: number) {
    const st = stanceRef.current;
    const next = Math.min(PITCHES.length - 1, Math.max(0, st.pitch + steps));
    if (next === st.pitch) return;
    st.pitch = next;
    applyCamera({ azimuth: VIEWS[st.view]!, pitch: PITCHES[st.pitch]! });
  }
  function resetCamera() {
    if (turnRef.current) cancelAnimationFrame(turnRef.current.frame);
    turnRef.current = null;
    stanceRef.current = { view: 0, pitch: DEFAULT_PITCH_INDEX };
    applyCamera(DEFAULT_CAMERA);
  }

  function defaultView(rect: { width: number; height: number }) {
    const zoom = Math.max(DEFAULT_ZOOM, (rect.height * 1.15) / MAP_HEIGHT);
    const midX = (WORLD.minX + WORLD.maxX) / 2;
    const midY = (WORLD.minY + WORLD.maxY) / 2;
    return { x: rect.width / 2 - midX * zoom, y: rect.height / 2 - midY * zoom, zoom };
  }
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    applyView(defaultView(svg.getBoundingClientRect()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > PAN_CLICK_THRESHOLD) {
        d.moved = true;
        svgRef.current?.classList.add('panning');
      }
      if (d.moved)
        applyView({ x: d.startView.x + dx, y: d.startView.y + dy, zoom: viewRef.current.zoom });
    }
    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;
      if (d?.moved) {
        if (d.button === 0) justPannedRef.current = true;
        svgRef.current?.classList.remove('panning');
      }
      paintDragRef.current = null;
      paintLastRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // W/A/S/D and the arrows glide the camera for as long as a key is held.
  useEffect(() => {
    if (!controlsEnabled) return;
    const held = new Set<string>();
    let frame: number | null = null;
    let prevTs = 0;
    function step(ts: number) {
      if (held.size === 0) {
        frame = null;
        return;
      }
      const dt = prevTs === 0 ? 0 : Math.min(MAX_PAN_FRAME_S, (ts - prevTs) / 1000);
      prevTs = ts;
      let dx = 0;
      let dy = 0;
      for (const key of held) {
        const k = PAN_KEYS[key]!;
        dx += k[0];
        dy += k[1];
      }
      const len = Math.hypot(dx, dy);
      if (len > 0 && dt > 0) {
        const view = viewRef.current;
        applyView({
          x: view.x + (dx / len) * KEY_PAN_SPEED * dt,
          y: view.y + (dy / len) * KEY_PAN_SPEED * dt,
          zoom: view.zoom,
        });
      }
      frame = requestAnimationFrame(step);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (!(key in PAN_KEYS)) return;
      e.preventDefault();
      if (held.has(key)) return;
      held.add(key);
      if (frame === null) {
        prevTs = 0;
        frame = requestAnimationFrame(step);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      held.delete(e.key.toLowerCase());
    }
    function onBlur() {
      held.clear();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (frame !== null) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlsEnabled]);

  function worldFromEvent(e: {
    clientX: number;
    clientY: number;
  }): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - rect.left - v.x) / v.zoom, y: (e.clientY - rect.top - v.y) / v.zoom };
  }
  function tileFromEvent(e: { clientX: number; clientY: number }) {
    const w = worldFromEvent(e);
    return w ? tileAt(w.x, w.y) : null;
  }

  const selected = placingId ? buildingById(placingId) : null;
  const paintTool = tool && tool !== 'demolish' ? tool : null;
  const selectedFootprint = selected ? orientedFootprint(selected.footprint, rotated) : null;
  const canRotateSelected = !!selectedFootprint && selectedFootprint.w !== selectedFootprint.h;

  function onMapMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    cursorRef.current = worldFromEvent(e);
    paintLabels(cursorRef.current);
    if (dragRef.current?.moved) return;
    if (selected || paintTool) {
      const tile = tileFromEvent(e);
      setHover((cur) => (cur && tile && cur.row === tile.row && cur.col === tile.col ? cur : tile));
    }
    if (paintDragRef.current && paintDragRef.current !== 'demolish')
      paintStroke(e, paintDragRef.current);
  }
  function paintStroke(e: { clientX: number; clientY: number }, t: CampusTool) {
    if (t === 'demolish') return;
    const here = worldFromEvent(e);
    if (!here) return;
    const from = paintLastRef.current ?? here;
    paintLastRef.current = here;
    const dist = Math.hypot(here.x - from.x, here.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (TILE_H / 2)));
    let last = '';
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const tile = tileAt(from.x + (here.x - from.x) * k, from.y + (here.y - from.y) * k);
      if (!tile) continue;
      const key = `${tile.col},${tile.row}`;
      if (key === last) continue;
      last = key;
      onPaint(t, tile.col, tile.row);
    }
  }
  function leaveMap() {
    setHover(null);
    cursorRef.current = null;
    paintLabels(null);
  }
  function onMapMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button === 1) {
      e.preventDefault();
      startPanDrag(e);
      return;
    }
    if (paintTool && (e.button === 0 || e.button === 2)) {
      const t = e.button === 0 ? paintTool : otherTool(paintTool);
      if (tileFromEvent(e)) {
        paintDragRef.current = t;
        paintLastRef.current = null;
        paintStroke(e, t);
        return;
      }
    }
    if (e.button !== 0) return;
    justPannedRef.current = false;
    startPanDrag(e);
  }
  function startPanDrag(e: React.MouseEvent<SVGSVGElement>) {
    dragRef.current = {
      button: e.button,
      startX: e.clientX,
      startY: e.clientY,
      startView: { x: viewRef.current.x, y: viewRef.current.y },
      moved: false,
    };
  }
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cur = viewRef.current;
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, cur.zoom * Math.exp(-e.deltaY * ZOOM_SPEED)),
    );
    if (nextZoom === cur.zoom) return;
    const worldX = (px - cur.x) / cur.zoom;
    const worldY = (py - cur.y) / cur.zoom;
    applyView({ x: px - worldX * nextZoom, y: py - worldY * nextZoom, zoom: nextZoom });
  }
  function zoomBy(factor: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const cur = viewRef.current;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.zoom * factor));
    const worldX = (cx - cur.x) / cur.zoom;
    const worldY = (cy - cur.y) / cur.zoom;
    applyView({ x: cx - worldX * nextZoom, y: cy - worldY * nextZoom, zoom: nextZoom });
  }

  useHotkeys((e) => {
    const key = e.key.toLowerCase();
    if (key === 'r' && canRotateSelected) setRotated((r) => !r);
    if (key === 'p') onSetTool('path');
    // E turns the view one way and Q the other, the way a hand on the
    // left of the keyboard expects it (Phase 21A; they were the other way
    // round and read as backwards).
    if (key === 'q') turnBy(-1);
    if (key === 'e') turnBy(1);
    if (key === 'z') tiltBy(-1);
    if (key === 'x') tiltBy(1);
    if (key === 'n') setShowQuadNames((on) => !on);
    if (key === 'home') resetCamera();
  }, controlsEnabled);

  useHotkeys((e) => {
    if (e.key !== 'Escape') return;
    if (tool) onSetTool(tool);
    else if (selected) onArmPlacement(null);
    else if (inspectedId) setInspectedId(null);
    else if (inspectedQuad) setInspectedQuad(null);
  }, backOutEnabled);

  const consumePanClick = () => {
    if (justPannedRef.current) {
      justPannedRef.current = false;
      return true;
    }
    return false;
  };
  // The ghost is anchored so the cursor sits at the footprint's centre.
  const anchorFor = (tile: { col: number; row: number }, fp: { w: number; h: number }) => ({
    col: tile.col - Math.floor(fp.w / 2),
    row: tile.row - Math.floor(fp.h / 2),
  });
  function onMapClick(e: React.MouseEvent<SVGSVGElement>) {
    if (consumePanClick()) return;
    const tile = tileFromEvent(e);
    if (!tile) return;
    if (selected && selectedFootprint) {
      const at = anchorFor(tile, selectedFootprint);
      if (
        siteRefusal(
          state.campus,
          selected,
          at.col,
          at.row,
          selectedFootprint.w,
          selectedFootprint.h,
        ) === null
      ) {
        if (onPlace(selected.id, at.col, at.row, rotated)) {
          onArmPlacement(null);
          setHover(null);
        }
      }
      return;
    }
    if (inspectedId) setInspectedId(null);
    if (inspectedQuad) setInspectedQuad(null);
  }
  const inspectBuilding = (id: string) => {
    if (consumePanClick()) return;
    if (tool === 'demolish') {
      onDemolish(id);
      return;
    }
    if (selected || paintTool) return;
    setInspectedId((cur) => (cur === id ? null : id));
  };
  // One identity for the life of the component, reading the current
  // inspectBuilding through a ref updated after each render: a fresh closure
  // per render is exactly what would defeat CampusScene's memo.
  const inspectRef = useRef(inspectBuilding);
  useEffect(() => {
    inspectRef.current = inspectBuilding;
  });
  const onInspect = useCallback((id: string) => inspectRef.current(id), []);

  const onInspectQuad = useCallback((key: string) => {
    setInspectedQuad(key);
    setInspectedId(null);
  }, []);
  const inspectedQuadObj = inspectedQuad ? quadAt(state.campus, inspectedQuad) : null;
  const inspected = inspectedId
    ? (state.campus.placements.find((p) => p.id === inspectedId) ?? null)
    : null;
  const preview =
    selected && hover && selectedFootprint
      ? (() => {
          const at = anchorFor(hover, selectedFootprint);
          // Why not, from the sim itself (Phase 21L): the ground, the walk
          // to it, and what it would wall off.
          const refusal = siteRefusal(
            state.campus,
            selected,
            at.col,
            at.row,
            selectedFootprint.w,
            selectedFootprint.h,
          );
          return { ...at, ...selectedFootprint, ok: refusal === null, refusal };
        })()
      : null;
  const paintGhost = paintTool && hover ? { ...hover, tool: paintTool } : null;
  const rotateAt = preview ? project(preview.col + preview.w, preview.row) : null;
  // Going from the rotate control back onto the map is not a leave.
  const onRotateLeave = (e: React.MouseEvent) => {
    if (e.relatedTarget instanceof Node && svgRef.current?.contains(e.relatedTarget)) return;
    leaveMap();
  };

  return (
    <section
      className={`campus-map season-${seasonOf(state.clock)}`}
      style={{ '--snow': winterDepth(state.clock).toFixed(2) } as React.CSSProperties}
    >
      <div className="campus-map-canvas">
        <svg
          ref={svgRef}
          className={`campus-map-svg ${selected ? 'placing' : ''} ${paintTool ? `path-${paintTool}` : ''} ${tool === 'demolish' ? 'demolishing' : ''} ${inspectedId ? 'inspecting' : ''} ${selected || tool ? 'working' : ''}`}
          width="100%"
          height="100%"
          role="group"
          aria-label="Campus map"
          onMouseLeave={(e) => {
            if (e.relatedTarget instanceof Node && ghostSvgRef.current?.contains(e.relatedTarget))
              return;
            leaveMap();
          }}
          onMouseMove={onMapMouseMove}
          onMouseDown={onMapMouseDown}
          onClick={onMapClick}
          onContextMenu={(e) => {
            if (paintTool) e.preventDefault();
          }}
          onWheel={onWheel}
        >
          <g ref={worldRef}>
            <CampusScene
              state={state}
              inspectedId={inspectedId}
              onInspect={onInspect}
              inspectedQuad={inspectedQuad}
              onInspectQuad={onInspectQuad}
              hoveredQuad={hoveredQuad}
              onHoverQuad={setHoveredQuad}
              showQuadNames={showQuadNames}
              labelLayerRef={labelLayerRef}
              camera={camera}
            />
          </g>
        </svg>
        <svg
          ref={ghostSvgRef}
          className="campus-map-ghost"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <g ref={ghostWorldRef}>
            {preview && (
              <>
                <polygon
                  className={`campus-preview ${preview.ok ? 'ok' : 'blocked'}`}
                  points={polyPoints(
                    boxFaces(preview.col, preview.row, preview.w, preview.h, 0, 0).top,
                  )}
                />
                {preview.refusal && <PreviewRefusal preview={preview} />}
                {canRotateSelected && rotateAt && (
                  <g
                    className="campus-rotate-btn"
                    transform={`translate(${rotateAt.x.toFixed(1)}, ${rotateAt.y.toFixed(1)})`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRotated((r) => !r);
                    }}
                    onMouseLeave={onRotateLeave}
                    role="button"
                    aria-label="Rotate building 90 degrees"
                  >
                    <circle r={13} />
                    <text textAnchor="middle" dominantBaseline="central">
                      ⟳
                    </text>
                    <title>Rotate (R)</title>
                  </g>
                )}
              </>
            )}
            {paintGhost && (
              <polygon
                className={`campus-path-ghost ${paintGhost.tool}`}
                points={polyPoints(boxFaces(paintGhost.col, paintGhost.row, 1, 1, 0, 0).top)}
              />
            )}
          </g>
        </svg>
        <Snowfall flakes={flakesOf(state.clock)} />
        {inspectedQuadObj && (
          <QuadPanel
            quad={inspectedQuadObj}
            onRename={(name) => onNameQuad(inspectedQuadObj.key, name)}
            onClose={() => setInspectedQuad(null)}
          />
        )}
        {inspected && (
          <BuildingInfoPanel
            placement={inspected}
            state={state}
            financing={financing}
            onClose={() => setInspectedId(null)}
            onRenovate={(f) => onRenovate(inspected.id, f)}
            onExtend={(f) => onExtend(inspected.id, f)}
            onDemolish={() => {
              onDemolish(inspected.id);
              setInspectedId(null);
            }}
          />
        )}
        {state.phase === 'siting' && (
          <div className="siting-card" role="status">
            <strong>Place Founders Hall</strong>
            <br />
            One hall, seven tiles by five, in the {state.identity?.motif ?? ''} style, for{' '}
            {formatMoney(buildingById(FOUNDERS_HALL_ID).cost)} of the founding gift. Click the land
            to break ground; R turns it. The clock starts with the works.
          </div>
        )}
        <div className="campus-map-zoom-controls">
          <HelpHint
            align="end"
            label="Keys and controls"
            text="Where the university physically grows. Open Build to pick a building up, then click empty ground to set it down. Campus Tools draws walkways and plants trees a tile at a time — drag to paint, the right button does the opposite."
          >
            <dl className="key-map">
              {KEY_GROUPS.map((group) => (
                <div key={group.title} className="key-map-group">
                  <p className="key-map-title">{group.title}</p>
                  {group.bindings.map((b) => (
                    <div key={b.keys.join()} className="key-map-row">
                      <dt>
                        {b.keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </dt>
                      <dd>{b.does}</dd>
                    </div>
                  ))}
                </div>
              ))}
            </dl>
          </HelpHint>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
            −
          </button>
        </div>
      </div>
    </section>
  );
}
