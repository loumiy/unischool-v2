import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildingById } from '../content/buildings.ts';
import {
  footprintIsClear,
  orientedFootprint,
  parseTileKey,
  type GameState,
  type Motif,
  type Placement,
} from '../sim/index.ts';
import BuildingInfoPanel from './BuildingInfoPanel.tsx';
import HelpHint from './HelpHint.tsx';
import { isTypingTarget, useHotkeys } from './hotkeys.ts';
import BuildingMotif, { drawnHeightOf, labelHeightOf, materialOf } from './map/buildingMotifs.tsx';
import { depthOrder, type DepthBox } from './map/depthSort.ts';
import { groundGeometry, TerrainLayer } from './map/ground.tsx';
import {
  DEFAULT_CAMERA,
  PITCHES,
  TILE_H,
  VIEWS,
  WORLD,
  boxFaces,
  lift,
  polyPoints,
  project,
  setCamera,
  tileAt,
  unproject,
  type Camera,
} from './map/iso.ts';
import { castShadow } from './map/light.ts';
import PathwayLayer from './map/pathways.tsx';
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
const MAX_PAN_FRAME_S = 0.1;
const WORLD_TOP_HEADROOM = 140;
const MAP_PADDING = 64;
const MAP_HEIGHT = WORLD.maxY - WORLD.minY + MAP_PADDING * 2 + WORLD_TOP_HEADROOM;

const PAN_KEYS: Record<string, readonly [number, number]> = {
  w: [0, 1],
  a: [1, 0],
  s: [0, -1],
  d: [-1, 0],
  arrowup: [0, 1],
  arrowleft: [1, 0],
  arrowdown: [0, -1],
  arrowright: [-1, 0],
};

function drawnFootprint(p: Placement) {
  return {
    col: p.col + BUILDING_INSET,
    row: p.row + BUILDING_INSET,
    w: p.w - BUILDING_INSET * 2,
    h: p.h - BUILDING_INSET * 2,
  };
}

function labelLayout(label: string, p: Placement, motif: Motif) {
  const def = buildingById(p.buildingId);
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

function PlacedBuilding({
  p,
  motif,
  onInspect,
  inspected,
  camera,
}: {
  p: Placement;
  motif: Motif;
  onInspect: () => void;
  inspected: boolean;
  camera: Camera;
}) {
  const def = buildingById(p.buildingId);
  const d = drawnFootprint(p);
  return (
    <g
      className={`campus-building ${inspected ? 'inspected' : ''}`}
      aria-label={def.name}
      role="button"
      onClick={onInspect}
    >
      <BuildingMotif
        def={def}
        p={d}
        material={materialOf(def, motif)}
        motif={motif}
        shadeSeed={p.id}
        camera={camera}
      />
      {inspected && (
        <polygon
          className="campus-building-halo"
          points={polyPoints(boxFaces(p.col, p.row, p.w, p.h, 0, 0).top)}
        />
      )}
      {def.form !== 'grounds' && <title>{`${def.name} · ${p.w}×${p.h}`}</title>}
    </g>
  );
}

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
      const height = drawnHeightOf(buildingById(p.buildingId), motif);
      if (height <= 0) continue;
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
  labelLayerRef,
  camera,
}: {
  state: GameState;
  inspectedId: string | null;
  onInspect: (id: string) => void;
  labelLayerRef: React.RefObject<SVGGElement | null>;
  camera: Camera;
}) {
  const motif = state.identity?.motif ?? 'georgian';
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
  return (
    <>
      <polygon className="campus-ground" points={ground.plate} />
      <path className="campus-grid" d={ground.grid} />
      <TerrainLayer camera={camera} />
      <PathwayLayer paths={state.campus.paths} camera={camera} />
      <CastShadows placements={placements} scene={scene} motif={motif} camera={camera} />
      {groundPlaced.map((p) => (
        <PlacedBuilding
          key={p.id}
          p={p}
          motif={motif}
          onInspect={() => onInspect(p.id)}
          inspected={p.id === inspectedId}
          camera={camera}
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
              onInspect={() => onInspect(entry.placement.id)}
              inspected={entry.placement.id === inspectedId}
              camera={camera}
            />
          </g>
        ),
      )}
      <g ref={labelLayerRef}>
        {placements.map((p) => (
          <BuildingLabel
            key={`label-${p.id}`}
            p={p}
            label={buildingById(p.buildingId).name}
            pinned={p.id === inspectedId}
            motif={motif}
          />
        ))}
      </g>
    </>
  );
});

export default function CampusMap({
  state,
  placingId,
  onArmPlacement,
  tool,
  onSetTool,
  onPlace,
  onPaint,
  onDemolish,
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
  onPaint: (tool: Exclude<CampusTool, 'demolish'>, col: number, row: number) => void;
  onDemolish: (placementId: string) => void;
  backOutEnabled: boolean;
  controlsEnabled: boolean;
}) {
  const [rotated, setRotated] = useState(false);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [camera, setCameraState] = useState<Camera>(DEFAULT_CAMERA);
  setCamera(camera);
  const stanceRef = useRef({ view: 0, pitch: 0 });

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

  function applyCamera(next: Camera) {
    const rect = svgRef.current?.getBoundingClientRect();
    const px = rect ? rect.width / 2 : 0;
    const py = rect ? rect.height / 2 : 0;
    const v = viewRef.current;
    const g = unproject((px - v.x) / v.zoom, (py - v.y) / v.zoom);
    const applied = setCamera(next);
    const w = project(g.col, g.row);
    applyView({ x: px - w.x * v.zoom, y: py - w.y * v.zoom, zoom: v.zoom });
    setCameraState(applied);
  }
  function turnBy(steps: number) {
    const st = stanceRef.current;
    st.view = (((st.view + steps) % VIEWS.length) + VIEWS.length) % VIEWS.length;
    applyCamera({ azimuth: VIEWS[st.view]!, pitch: PITCHES[st.pitch]! });
  }
  function tiltBy(steps: number) {
    const st = stanceRef.current;
    const next = Math.min(PITCHES.length - 1, Math.max(0, st.pitch + steps));
    if (next === st.pitch) return;
    st.pitch = next;
    applyCamera({ azimuth: VIEWS[st.view]!, pitch: PITCHES[st.pitch]! });
  }
  function resetCamera() {
    stanceRef.current = { view: 0, pitch: 0 };
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
    if (key === 'q') turnBy(1);
    if (key === 'e') turnBy(-1);
    if (key === 'z') tiltBy(-1);
    if (key === 'x') tiltBy(1);
    if (key === 'home') resetCamera();
  }, controlsEnabled);

  useHotkeys((e) => {
    if (e.key !== 'Escape') return;
    if (tool) onSetTool(tool);
    else if (selected) onArmPlacement(null);
    else if (inspectedId) setInspectedId(null);
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
        footprintIsClear(state.campus, at.col, at.row, selectedFootprint.w, selectedFootprint.h)
      ) {
        if (onPlace(selected.id, at.col, at.row, rotated)) {
          onArmPlacement(null);
          setHover(null);
        }
      }
      return;
    }
    if (inspectedId) setInspectedId(null);
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

  const inspected = inspectedId
    ? (state.campus.placements.find((p) => p.id === inspectedId) ?? null)
    : null;
  const preview =
    selected && hover && selectedFootprint
      ? (() => {
          const at = anchorFor(hover, selectedFootprint);
          return {
            ...at,
            ...selectedFootprint,
            ok: footprintIsClear(
              state.campus,
              at.col,
              at.row,
              selectedFootprint.w,
              selectedFootprint.h,
            ),
          };
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
    <section className="campus-map">
      <div className="campus-map-canvas">
        <svg
          ref={svgRef}
          className={`campus-map-svg ${selected ? 'placing' : ''} ${paintTool ? `path-${paintTool}` : ''} ${tool === 'demolish' ? 'demolishing' : ''} ${inspectedId ? 'inspecting' : ''}`}
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
        {inspected && (
          <BuildingInfoPanel
            placement={inspected}
            onClose={() => setInspectedId(null)}
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
            One hall, seven tiles by five, in the {state.identity?.motif ?? ''} style. Click the
            land to set it down; R turns it. The clock starts once it stands.
          </div>
        )}
        <div className="campus-map-zoom-controls">
          <HelpHint
            align="end"
            text="Where the university physically grows. Open Build to pick a building up, then click empty ground to set it down; R turns it a quarter turn. Campus Tools draws walkways (P) and plants trees, a tile at a time — drag to paint, right button for the opposite. Drag the map to pan, scroll to zoom, W/A/S/D to glide. Q/E turn the view a quarter turn round the campus, Z/X tilt it, Home brings back the opening view. Escape backs out one layer at a time."
          />
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
