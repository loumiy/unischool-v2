import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { buildingById } from '../content/buildings.ts';
import {
  footprintIsClear,
  foundersHallFootprint,
  GRID_HEIGHT,
  GRID_WIDTH,
  type GameState,
  type Placement,
} from '../sim/index.ts';
import { boxFaces, footprintPoly, polyPoints, project, tileAt, WORLD } from './map/iso.ts';
import { MOTIF_SPECS, shade } from './motifSpec.ts';

// THE CAMPUS MAP, Phase 2 edition: the lawn, the grid, pan and zoom, a
// footprint ghost while siting, and the one building the run has. The hall
// is drawn as a plain massed block in the motif's own wall, roof and trim —
// a stand-in for Phase 3's motif renderer (reference/v1's buildingMotifs),
// which replaces PlaceholderHall wholesale. Nothing about the placement
// data changes when it does.

const STOREY = 22; // screen units per storey, at this camera
const HALL_STOREYS = 3;
const SHADOW_OFFSET = { x: 6, y: 4 };
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

interface Camera {
  x: number; // world point at the viewport's centre
  y: number;
  zoom: number;
}

function PlaceholderHall({ placement, state }: { placement: Placement; state: GameState }) {
  const motif = state.identity?.motif ?? 'georgian';
  const spec = MOTIF_SPECS[motif];
  const height = STOREY * HALL_STOREYS;
  const f = boxFaces(placement.col, placement.row, placement.w, placement.h, height);
  const trim = spec.trim ?? shade(spec.wall, 1.08);
  const shadow = f.base.map((p) => ({ x: p.x + SHADOW_OFFSET.x, y: p.y + SHADOW_OFFSET.y }));
  const name = buildingById(placement.buildingId).name;
  const label = project(placement.col + placement.w / 2, placement.row + placement.h / 2);
  return (
    <g aria-label={name}>
      <polygon className="campus-shadow" points={polyPoints(shadow)} />
      <polygon fill={shade(spec.wall, 0.78)} points={polyPoints(f.left)} />
      <polygon fill={spec.wall} points={polyPoints(f.right)} />
      <polygon fill={spec.roof} points={polyPoints(f.top)} />
      {/* A trim course where the wall meets the roof, and a plinth. */}
      <polyline
        fill="none"
        stroke={trim}
        strokeWidth="2"
        points={polyPoints([f.left[3]!, f.left[2]!, f.right[2]!])}
      />
      <polyline
        fill="none"
        stroke={shade(trim, 0.9)}
        strokeWidth="1.5"
        points={polyPoints([f.left[0]!, f.left[1]!, f.right[1]!])}
      />
      <text
        x={label.x}
        y={label.y - height - 10}
        textAnchor="middle"
        fontSize="13"
        fontWeight="800"
        fontFamily="var(--display)"
        fill="var(--outline)"
        stroke="var(--cream)"
        strokeWidth="3"
        paintOrder="stroke"
      >
        {name}
      </text>
    </g>
  );
}

export default function CampusMap({
  state,
  onPlaceFoundersHall,
  controlsEnabled,
}: {
  state: GameState;
  onPlaceFoundersHall: (col: number, row: number) => void;
  // False while a screen covers the map: the map's own input goes quiet.
  controlsEnabled: boolean;
}) {
  const siting = state.phase === 'siting';
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [camera, setCamera] = useState<Camera>(() => ({
    x: (WORLD.minX + WORLD.maxX) / 2,
    y: (WORLD.minY + WORLD.maxY) / 2,
    zoom: 0.6,
  }));
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    camX: number;
    camY: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const sync = () => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const viewBox = `${camera.x - size.w / 2 / camera.zoom} ${camera.y - size.h / 2 / camera.zoom} ${size.w / camera.zoom} ${size.h / camera.zoom}`;

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = canvasRef.current!;
      const rect = el.getBoundingClientRect();
      return {
        x: camera.x + (clientX - rect.left - rect.width / 2) / camera.zoom,
        y: camera.y + (clientY - rect.top - rect.height / 2) / camera.zoom,
      };
    },
    [camera],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!controlsEnabled || e.button !== 0) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      camX: camera.x,
      camY: camera.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!controlsEnabled) return;
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > 4) {
        d.moved = true;
        setDragging(true);
      }
      if (d.moved) setCamera((c) => ({ ...c, x: d.camX - dx / c.zoom, y: d.camY - dy / c.zoom }));
    }
    if (siting) {
      const w = toWorld(e.clientX, e.clientY);
      setHover(tileAt(w.x, w.y));
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.moved || !siting || !controlsEnabled) return;
    const w = toWorld(e.clientX, e.clientY);
    const tile = tileAt(w.x, w.y);
    if (!tile) return;
    const { col, row } = anchorFor(tile);
    const fp = foundersHallFootprint();
    if (footprintIsClear(state.campus, col, row, fp.w, fp.h)) onPlaceFoundersHall(col, row);
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!controlsEnabled) return;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setCamera((c) => ({ ...c, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor)) }));
  };
  const zoomBy = (factor: number) =>
    setCamera((c) => ({ ...c, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor)) }));

  // The ghost is anchored so the cursor sits at the footprint's centre, and
  // clamped to the parcel so the hall can always be placed at an edge.
  const fp = foundersHallFootprint();
  const anchorFor = (tile: { col: number; row: number }) => ({
    col: Math.max(0, Math.min(GRID_WIDTH - fp.w, tile.col - Math.floor(fp.w / 2))),
    row: Math.max(0, Math.min(GRID_HEIGHT - fp.h, tile.row - Math.floor(fp.h / 2))),
  });
  const ghost = siting && hover ? anchorFor(hover) : null;
  const ghostClear = ghost
    ? footprintIsClear(state.campus, ghost.col, ghost.row, fp.w, fp.h)
    : false;

  const lawn = footprintPoly(0, 0, GRID_WIDTH, GRID_HEIGHT);
  const gridLines: string[] = [];
  for (let c = 0; c <= GRID_WIDTH; c++) {
    const a = project(c, 0);
    const b = project(c, GRID_HEIGHT);
    gridLines.push(`M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  }
  for (let r = 0; r <= GRID_HEIGHT; r++) {
    const a = project(0, r);
    const b = project(GRID_WIDTH, r);
    gridLines.push(`M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  }

  return (
    <div className="campus-map">
      <div
        ref={canvasRef}
        className={`campus-map-canvas ${dragging ? 'dragging' : ''} ${siting ? 'siting' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
      >
        <svg width="100%" height="100%" viewBox={viewBox} aria-label="Campus">
          <polygon className="campus-lawn" points={polyPoints(lawn)} />
          <path className="campus-grid-line" fill="none" d={gridLines.join('')} />
          {state.campus.placements.map((p) => (
            <PlaceholderHall key={p.id} placement={p} state={state} />
          ))}
          {ghost && (
            <polygon
              className={`campus-ghost ${ghostClear ? '' : 'blocked'}`}
              points={polyPoints(footprintPoly(ghost.col, ghost.row, fp.w, fp.h))}
            />
          )}
        </svg>
      </div>
      {siting && (
        <div className="siting-card" role="status">
          <strong>Place Founders Hall</strong>
          <br />
          One hall, seven tiles by five, in the {state.identity?.motif ?? ''} style. Click the land
          to set it down. The clock starts once it stands.
        </div>
      )}
      <div className="campus-map-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
          −
        </button>
      </div>
    </div>
  );
}
