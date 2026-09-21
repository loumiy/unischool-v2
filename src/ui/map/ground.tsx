import { useMemo } from 'react';
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

// A marked pitch on open ground: turf, a touchline, a halfway line, two
// boxes and two goals, set out along the plot's long axis.
export function GroundField({
  col,
  row,
  w,
  h,
}: {
  col: number;
  row: number;
  w: number;
  h: number;
}) {
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
