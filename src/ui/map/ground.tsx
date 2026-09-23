import { useMemo } from 'react';
import type { Ground } from '../../content/buildings.ts';
import { GRID_HEIGHT, GRID_WIDTH, TERRAIN } from '../../sim/index.ts';
import { boxFaces, polyPoints, project, type Camera, type Pt } from './iso.ts';
import { across } from './scale.ts';

// Flat ground: the terrain frame the parcel comes with, and the one
// open-ground form in the seed catalogue. Flat ground has no height, so it
// can never occlude anything and is drawn under every mass.

function sub(pts: Pt[]): string {
  return `M${polyPoints(pts).replace(/ /g, 'L')}Z`;
}

// The plate and its grid lines: one polygon and one <path>.
export function groundGeometry(): { plate: string; grid: string } {
  const plate = polyPoints(boxFaces(0, 0, GRID_WIDTH, GRID_HEIGHT, 0, 0).top);
  const seg: string[] = [];
  for (let r = 0; r <= GRID_HEIGHT; r++) {
    const a = project(0, r);
    const b = project(GRID_WIDTH, r);
    seg.push(`M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  }
  for (let c = 0; c <= GRID_WIDTH; c++) {
    const a = project(c, 0);
    const b = project(c, GRID_HEIGHT);
    seg.push(`M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  }
  return { plate, grid: seg.join('') };
}

// THE FRAME (DD §6.1): the stream and the road, as two filled paths of tile
// subpaths, plus the road's centre line and the stream's lighter bank.
export function TerrainLayer({ camera }: { camera: Camera }) {
  const d = useMemo(() => {
    const water = TERRAIN.stream.map((t) => sub(boxFaces(t.col, t.row, 1, 1, 0, 0).top)).join('');
    const road = TERRAIN.road.map((t) => sub(boxFaces(t.col, t.row, 1, 1, 0, 0).top)).join('');
    // The centre line runs down the middle row of the road.
    const rows = TERRAIN.road.map((t) => t.row);
    const mid = rows.length ? Math.floor((Math.min(...rows) + Math.max(...rows)) / 2) + 0.5 : 0;
    const a = project(0, mid);
    const b = project(GRID_WIDTH, mid);
    const line = rows.length
      ? `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`
      : '';
    return { water, road, line };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);
  return (
    <g className="campus-terrain" aria-hidden="true">
      {d.water && <path className="terrain-water" d={d.water} />}
      {d.road && <path className="terrain-road" d={d.road} />}
      {d.line && <path className="terrain-road-line" d={d.line} />}
    </g>
  );
}

// Open ground, by what it is marked out as (Phase 21J): a pitch, a pair of
// courts, a running track round a pitch, or a formal garden.
export function GroundField({
  col,
  row,
  w,
  h,
  ground = 'pitch',
}: {
  col: number;
  row: number;
  w: number;
  h: number;
  ground?: Ground;
}) {
  if (ground === 'courts') return <GroundCourts col={col} row={row} w={w} h={h} />;
  if (ground === 'track') return <GroundTrack col={col} row={row} w={w} h={h} />;
  if (ground === 'garden') return <GroundGarden col={col} row={row} w={w} h={h} />;
  return <GroundPitch col={col} row={row} w={w} h={h} />;
}

interface Plot {
  col: number;
  row: number;
  w: number;
  h: number;
}

// The plot's own (u, v): u along its long axis, v across it, both 0–1.
function plotFrame({ col, row, w, h }: Plot) {
  const alongW = w >= h;
  const at = (u: number, v: number) =>
    alongW ? project(col + w * u, row + h * v) : project(col + w * v, row + h * u);
  const quad = (a: number, b: number, c: number, d: number) =>
    polyPoints([at(a, c), at(b, c), at(b, d), at(a, d)]);
  const line = (a: number, b: number, c: number, d: number) => {
    const p = at(a, c);
    const q = at(b, d);
    return `M${p.x.toFixed(2)},${p.y.toFixed(2)}L${q.x.toFixed(2)},${q.y.toFixed(2)}`;
  };
  // A stadium oval in (u, v): two straights and two semicircular ends,
  // sampled into a closed path.
  const oval = (u0: number, u1: number, v0: number, v1: number) => {
    const r = (v1 - v0) / 2;
    const vm = (v0 + v1) / 2;
    const long = alongW ? w : h;
    const short = alongW ? h : w;
    const ru = (r * short) / long; // the end's radius, in u
    const pts: string[] = [];
    const push = (u: number, v: number) => {
      const p = at(u, v);
      pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    };
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      push(u1 - ru + Math.cos(a) * ru, vm + Math.sin(a) * r);
    }
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI / 2 + (i / 12) * Math.PI;
      push(u0 + ru + Math.cos(a) * ru, vm + Math.sin(a) * r);
    }
    return pts.join(' ');
  };
  return { at, quad, line, oval, alongW };
}

function GroundCourts(p: Plot) {
  const { quad, line } = plotFrame(p);
  const court = (a: number, b: number) => {
    const m = (a + b) / 2;
    return [
      line(a, b, 0.14, 0.14),
      line(a, b, 0.86, 0.86),
      line(a, b, 0.24, 0.24),
      line(a, b, 0.76, 0.76),
      line(a, a, 0.14, 0.86),
      line(b, b, 0.14, 0.86),
      line(a + (b - a) * 0.22, a + (b - a) * 0.22, 0.24, 0.76),
      line(b - (b - a) * 0.22, b - (b - a) * 0.22, 0.24, 0.76),
      line(a + (b - a) * 0.22, b - (b - a) * 0.22, 0.5, 0.5),
      line(m, m, 0.1, 0.9),
    ].join('');
  };
  return (
    <g aria-hidden="true">
      <polygon className="ground-lawn" points={quad(0, 1, 0, 1)} />
      <polygon className="ground-court-apron" points={quad(0.03, 0.97, 0.06, 0.94)} />
      <polygon className="ground-court" points={quad(0.07, 0.48, 0.12, 0.88)} />
      <polygon className="ground-court" points={quad(0.52, 0.93, 0.12, 0.88)} />
      <path className="ground-line" d={court(0.07, 0.48) + court(0.52, 0.93)} />
      <polygon className="ground-fence" points={quad(0.03, 0.97, 0.06, 0.94)} />
    </g>
  );
}

function GroundTrack(p: Plot) {
  const { quad, line, oval } = plotFrame(p);
  // The stands take the far long side; the oval the rest of the plot.
  return (
    <g aria-hidden="true">
      <polygon className="ground-lawn" points={quad(0, 1, 0, 1)} />
      <polygon className="ground-track" points={oval(0.04, 0.96, 0.05, 0.8)} />
      <polygon className="ground-turf" points={oval(0.12, 0.88, 0.16, 0.69)} />
      <path
        className="ground-lane"
        d={[0.075, 0.1]
          .map((d) => `M${oval(0.04 + d * 0.5, 0.96 - d * 0.5, 0.05 + d, 0.8 - d)}Z`)
          .join('')}
      />
      <path
        className="ground-line"
        d={[line(0.2, 0.8, 0.2, 0.2), line(0.2, 0.8, 0.65, 0.65), line(0.5, 0.5, 0.2, 0.65)].join(
          '',
        )}
      />
      {[0.84, 0.88, 0.92, 0.96].map((v, i) => (
        <polygon
          key={v}
          className={i % 2 ? 'ground-stand-riser' : 'ground-stand'}
          points={quad(0.18, 0.82, v - 0.02, v + 0.02)}
        />
      ))}
    </g>
  );
}

function GroundGarden(p: Plot) {
  const { quad, at } = plotFrame(p);
  const beds: [number, number, number, number][] = [
    [0.1, 0.42, 0.1, 0.42],
    [0.58, 0.9, 0.1, 0.42],
    [0.1, 0.42, 0.58, 0.9],
    [0.58, 0.9, 0.58, 0.9],
  ];
  const ring = (r: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const q = at(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
      pts.push(`${q.x.toFixed(2)},${q.y.toFixed(2)}`);
    }
    return pts.join(' ');
  };
  return (
    <g aria-hidden="true">
      <polygon className="ground-gravel" points={quad(0, 1, 0, 1)} />
      {beds.map(([a, b, c, d]) => (
        <g key={`${a}${c}`}>
          <polygon className="ground-hedge" points={quad(a, b, c, d)} />
          <polygon className="ground-bed" points={quad(a + 0.04, b - 0.04, c + 0.04, d - 0.04)} />
        </g>
      ))}
      <polygon className="ground-hedge" points={ring(0.12)} />
      <polygon className="ground-basin" points={ring(0.06)} />
    </g>
  );
}

// A marked pitch on open ground: turf, a touchline, a halfway line, two
// boxes and two goals, set out along the plot's long axis.
function GroundPitch({ col, row, w, h }: Plot) {
  const alongW = w >= h;
  const inset = 0.08;
  // The pitch, as a fraction of the plot on each axis.
  const u0 = inset;
  const u1 = 1 - inset;
  const v0 = inset * 1.4;
  const v1 = 1 - inset * 1.4;
  const at = (u: number, v: number) =>
    alongW ? project(col + w * u, row + h * v) : project(col + w * v, row + h * u);
  const quad = (a: number, b: number, c: number, d: number) =>
    polyPoints([at(a, c), at(b, c), at(b, d), at(a, d)]);
  const line = (a: number, b: number, c: number, d: number) => {
    const p = at(a, c);
    const q = at(b, d);
    return `M${p.x.toFixed(2)},${p.y.toFixed(2)}L${q.x.toFixed(2)},${q.y.toFixed(2)}`;
  };
  const boxDepth = (u1 - u0) * 0.16;
  const boxHalf = (v1 - v0) * 0.3;
  const vm = (v0 + v1) / 2;
  const goalHalf = (v1 - v0) * 0.11;
  const goalDepth = across(1.0) / (alongW ? w : h);
  const post = (u: number) => {
    const p0 = at(u, vm - goalHalf);
    const p1 = at(u, vm + goalHalf);
    return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}L${p0.x.toFixed(2)},${(p0.y - 10).toFixed(2)}L${p1.x.toFixed(2)},${(p1.y - 10).toFixed(2)}L${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  };
  return (
    <g aria-hidden="true">
      <polygon className="ground-lawn" points={polyPoints(boxFaces(col, row, w, h, 0, 0).top)} />
      <polygon className="ground-turf" points={quad(u0, u1, v0, v1)} />
      {[0.2, 0.4, 0.6, 0.8].map((v) => (
        <polygon
          key={v}
          className="ground-mow"
          points={quad(u0, u1, v0 + (v1 - v0) * (v - 0.05), v0 + (v1 - v0) * (v + 0.05))}
        />
      ))}
      <path
        className="ground-line"
        d={[
          line(u0, u1, v0, v0),
          line(u0, u1, v1, v1),
          line(u0, u0, v0, v1),
          line(u1, u1, v0, v1),
          line((u0 + u1) / 2, (u0 + u1) / 2, v0, v1),
          line(u0, u0 + boxDepth, vm - boxHalf, vm - boxHalf),
          line(u0, u0 + boxDepth, vm + boxHalf, vm + boxHalf),
          line(u0 + boxDepth, u0 + boxDepth, vm - boxHalf, vm + boxHalf),
          line(u1 - boxDepth, u1, vm - boxHalf, vm - boxHalf),
          line(u1 - boxDepth, u1, vm + boxHalf, vm + boxHalf),
          line(u1 - boxDepth, u1 - boxDepth, vm - boxHalf, vm + boxHalf),
        ].join('')}
      />
      <path className="ground-goal" d={post(u0 - goalDepth) + post(u1 + goalDepth)} />
    </g>
  );
}
