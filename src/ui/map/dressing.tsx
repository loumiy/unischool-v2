import { memo, useMemo } from 'react';
import { buildingById } from '../../content/buildings.ts';
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  parseTileKey,
  terrainAt,
  type Campus,
  type Motif,
} from '../../sim/index.ts';
import { boxFaces, lift, polyPoints, project, type Camera, type Pt } from './iso.ts';
import { up } from './scale.ts';
import { doors, findRoute, walkGrid, type Waypoint } from './routes.ts';

// THE GROUND THE CAMPUS STANDS ON (Phase 45). The land between the
// buildings, used: desire lines worn into the lawn along the routes the
// walkers take, paved aprons at the busiest doors, lamps and benches along
// the paths, bike racks at the residences, bins at the dining halls, a car
// park by the road when the students go home at night, and a bus stop at
// the gate. All of it placed by rule from the campus and seeded per tile,
// so it is the same on every reload; drawn once per campus change, under
// the buildings, and deaf to the pointer, so a click still lands on its
// tile. Presentational only.

// A tile's own number, the same every time.
function hash(col: number, row: number, salt = 0): number {
  let h = Math.imul(col + 7919 * salt, 0x27d4eb2d) ^ Math.imul(row, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

const LAWN = 4; // routes.ts's cost for crossing grass

interface Dressing {
  wear: string; // a path through the worn tile centres
  aprons: string; // the paved squares at busy doors
  lamps: Pt[];
  benches: { at: Pt; along: boolean }[];
  racks: Pt[];
  bins: Pt[];
  parking: string;
  bays: string;
  busStop: Pt | null;
}

function build(campus: Campus, commuter: boolean): Dressing {
  const grid = walkGrid(campus);
  const idx = (c: number, r: number) => r * GRID_WIDTH + c;
  const stops = doors(campus, grid);
  const paths = new Set(campus.paths);

  // Desire lines: where the busiest routes cross grass.
  const homes = stops.filter((s) => s.weight >= 3).slice(0, 6);
  const halls = stops.filter((s) => s.weight === 2).slice(0, 6);
  const segments: Waypoint[][] = [];
  for (const a of homes) {
    for (const b of halls) {
      const route = findRoute(grid, a.door, b.door);
      if (!route) continue;
      let run: Waypoint[] = [];
      for (const w of route) {
        const c = Math.floor(w.col);
        const r = Math.floor(w.row);
        if (grid[idx(c, r)] === LAWN) {
          run.push(w);
        } else if (run.length) {
          if (run.length > 1) segments.push(run);
          run = [];
        }
      }
      if (run.length > 1) segments.push(run);
    }
  }
  const wear = segments
    .map((run) =>
      run
        .map((w, i) => {
          const p = project(w.col, w.row);
          return `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(''),
    )
    .join('');

  // Aprons: a paved square at each busy door that stands on grass.
  const aprons = stops
    .filter((s) => s.weight >= 2 && grid[idx(s.door.col, s.door.row)] === LAWN)
    .map((s) => {
      const f = boxFaces(s.door.col - 0.15, s.door.row - 0.05, 1.3, 1.1, 0, 0);
      return `M${polyPoints(f.top).replace(/ /g, 'L')}Z`;
    })
    .join('');

  // Along the paths: a lamp every so often, a bench now and then.
  const lamps: Pt[] = [];
  const benches: { at: Pt; along: boolean }[] = [];
  for (const key of paths) {
    const t = parseTileKey(key);
    if (!t) continue;
    const h = hash(t.col, t.row);
    if (h % 5 === 0) lamps.push(project(t.col + 0.12, t.row + 0.12));
    else if (h % 11 === 3) {
      const along = paths.has(`${t.col + 1},${t.row}`) || paths.has(`${t.col - 1},${t.row}`);
      benches.push({
        at: project(t.col + (along ? 0.5 : 0.1), t.row + (along ? 0.1 : 0.5)),
        along,
      });
    }
  }

  // At the doors: racks at the residences, bins at the dining halls.
  const racks: Pt[] = [];
  const bins: Pt[] = [];
  for (const s of stops) {
    const cat = buildingById(s.door.buildingId).category;
    if (cat === 'residential') racks.push(project(s.door.col + 0.8, s.door.row + 0.3));
    if (cat === 'dining') bins.push(project(s.door.col + 0.15, s.door.row + 0.7));
  }

  // A car park by the road, for a college whose students go home at night:
  // the first long run of empty grass along the roadside.
  let parking = '';
  let bays = '';
  if (commuter) {
    for (let r = GRID_HEIGHT - 1; r >= 0 && !parking; r--) {
      if (terrainAt(4, r) !== 'road') continue;
      const row = r - 2;
      let from = -1;
      for (let c = 2; c < GRID_WIDTH - 2; c++) {
        const free =
          grid[idx(c, row)] === LAWN && grid[idx(c, row + 1)] === LAWN && !paths.has(`${c},${row}`);
        if (free && from < 0) from = c;
        if (!free) from = -1;
        if (from >= 0 && c - from >= 5) {
          const f = boxFaces(from, row, 6, 2, 0, 0);
          parking = `M${polyPoints(f.top).replace(/ /g, 'L')}Z`;
          for (let k = 1; k < 6; k++) {
            const a = project(from + k, row + 0.15);
            const b = project(from + k, row + 0.85);
            const c2 = project(from + k, row + 1.15);
            const d = project(from + k, row + 1.85);
            bays += `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
            bays += `M${c2.x.toFixed(1)},${c2.y.toFixed(1)}L${d.x.toFixed(1)},${d.y.toFixed(1)}`;
          }
          break;
        }
      }
    }
  }

  // A bus stop at the gate: beside the entrance sign, if the college has one.
  const sign = campus.placements.find(
    (p) => p.buildingId === 'entrance-sign' && p.status === 'open',
  );
  const busStop = sign ? project(sign.col + sign.w + 0.6, sign.row + sign.h - 0.3) : null;

  return { wear, aprons, lamps, benches, racks, bins, parking, bays, busStop };
}

function Lamp({
  at,
  motif,
  lit,
  festive,
}: {
  at: Pt;
  motif: Motif;
  lit: boolean;
  festive: boolean;
}) {
  const top = lift(at, up(4.2));
  const post = motif === 'modern' ? '#9aa0a6' : '#2f3437';
  return (
    <g>
      <line x1={at.x} y1={at.y} x2={top.x} y2={top.y} stroke={post} strokeWidth={1.1} />
      {/* Convocation and Commencement (Phase 47): a banner on every post. */}
      {festive && (
        <rect
          x={top.x + 0.6}
          y={top.y + 2}
          width={3.4}
          height={6}
          fill="var(--school-primary)"
          stroke="var(--school-secondary)"
          strokeWidth={0.5}
        />
      )}
      <circle
        cx={top.x}
        cy={top.y - 1}
        r={1.8}
        fill={lit ? '#ffe7a3' : '#e9e4d6'}
        stroke={post}
        strokeWidth={0.6}
      />
    </g>
  );
}

function Bench({ at, along }: { at: Pt; along: boolean }) {
  const dx = along ? 4 : -4;
  const dy = 2;
  return (
    <polygon
      points={polyPoints([
        { x: at.x - dx, y: at.y - dy - 1.5 },
        { x: at.x + dx, y: at.y + dy - 1.5 },
        { x: at.x + dx, y: at.y + dy },
        { x: at.x - dx, y: at.y - dy },
      ])}
      fill="#8a6a4a"
    />
  );
}

function DressingLayer({
  campus,
  motif,
  commuter,
  years,
  evening,
  festive,
  camera,
}: {
  campus: Campus;
  motif: Motif;
  commuter: boolean;
  // How long the lawns have been walked on, which is how worn they are.
  years: number;
  // The lamps are lit in the dark half of the year.
  evening: boolean;
  // The weeks of Convocation and Commencement, when the posts wear banners.
  festive: boolean;
  camera: Camera;
}) {
  const d = useMemo(
    () => build(campus, commuter),
    // The camera changes the projection; the campus changes the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campus.placements, campus.paths, commuter, camera],
  );
  const wear = Math.min(0.55, 0.1 + years / 40);
  return (
    <g className="campus-dressing" aria-hidden="true">
      {d.parking && <path className="dressing-parking" d={d.parking} />}
      {d.bays && <path className="dressing-bays" d={d.bays} />}
      {d.aprons && <path className="dressing-apron" d={d.aprons} />}
      {d.wear && <path className="dressing-wear" d={d.wear} style={{ opacity: wear }} />}
      {d.racks.map((p, i) => (
        <path
          key={`r${i}`}
          className="dressing-rack"
          d={`M${p.x - 4},${p.y}l0,-3M${p.x - 1.5},${p.y + 1.2}l0,-3M${p.x + 1},${p.y + 2.4}l0,-3`}
        />
      ))}
      {d.bins.map((p, i) => (
        <rect
          key={`b${i}`}
          className="dressing-bin"
          x={p.x - 1.4}
          y={p.y - 3.5}
          width={2.8}
          height={3.5}
          rx={0.6}
        />
      ))}
      {d.benches.map((b, i) => (
        <Bench key={`s${i}`} at={b.at} along={b.along} />
      ))}
      {d.lamps.map((p, i) => (
        <Lamp key={`l${i}`} at={p} motif={motif} lit={evening} festive={festive} />
      ))}
      {d.busStop && (
        <g className="dressing-bus-stop">
          <rect x={d.busStop.x - 5} y={d.busStop.y - 9} width={10} height={7} rx={1} />
          <line x1={d.busStop.x + 7} y1={d.busStop.y} x2={d.busStop.x + 7} y2={d.busStop.y - 12} />
        </g>
      )}
    </g>
  );
}

export default memo(DressingLayer);
